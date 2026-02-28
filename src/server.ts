
import express from 'express';
import path from 'path';
import { GraphManager } from './graph_manager';

import { FileSystemManager } from './fs_manager';

import { OllamaManager } from './ollama_manager';

import { IdentityManager } from './identity_manager';
import { ExternalAPIManager } from './external_api';
import { ModelRouter } from './kernel/router';
import { ContextManager } from './kernel/memory';
import { AgentScheduler } from './kernel/scheduler';
import { PromptRegistry } from './kernel/prompt_registry';
import { ToolRegistry } from './kernel/tool_registry';
import { SkillLoader } from './kernel/skill_loader';
import { CronManager } from './kernel/cron_manager';
import { ExecutionJournal } from './telemetry/journal';
import { computeDiff } from './telemetry/diff';
import { telemetryBus } from './telemetry/bus';
import { ExecutionEvent, BudgetConstraint } from './telemetry/types';
import { OpenAIProvider } from './kernel/providers/OpenAIProvider';
import { AnthropicProvider } from './kernel/providers/AnthropicProvider';
import axios from 'axios';
import * as lancedb from 'vectordb';
import * as yauzl from 'yauzl';
import * as util from 'util';
import { AIFirewall } from './kernel/firewall';
import { GameManager } from './game_manager';
import { MailManager } from './mail_manager';
import { google } from 'googleapis';

export interface RequestManager {
    [requestId: string]: AbortController;
}

// In-memory budget state (resets on restart — mock per spec)
let currentBudget: BudgetConstraint = {
    maxCostUsdPerRun: 0.50,
    maxLatencyMs: 30_000,
    qualityFloor: 0.6,
    preferredModels: [],
    fallbackModels: ['local'],
};

export class Server {
    private app: express.Application;
    private port: number;
    private graphManager: GraphManager;
    private fsManager: FileSystemManager;
    private ollamaManager: OllamaManager;
    private identityManager: IdentityManager;
    private externalApiManager: ExternalAPIManager;
    private modelRouter: ModelRouter;
    private memory: ContextManager;
    private scheduler: AgentScheduler;
    private registry: PromptRegistry;
    private tools: ToolRegistry;
    private firewall: AIFirewall;
    private skillLoader: SkillLoader;
    private journal?: ExecutionJournal;
    private gameManager: GameManager;
    private mailManager: MailManager;
    private cronManager: CronManager;
    private activeRequests: RequestManager = {};

    constructor(graphManager: GraphManager, fsManager: FileSystemManager, ollamaManager: OllamaManager, identityManager: IdentityManager, externalApiManager: ExternalAPIManager, modelRouter: ModelRouter, memory: ContextManager, scheduler: AgentScheduler, registry: PromptRegistry, tools: ToolRegistry, firewall: AIFirewall, port: number = 3000, journal?: ExecutionJournal) {
        this.app = express();
        this.port = port;
        this.graphManager = graphManager;
        this.fsManager = fsManager;
        this.ollamaManager = ollamaManager;
        this.identityManager = identityManager;
        this.externalApiManager = externalApiManager;
        this.modelRouter = modelRouter;
        this.memory = memory;
        this.scheduler = scheduler;
        this.registry = registry;
        this.tools = tools;
        this.firewall = firewall;
        this.skillLoader = new SkillLoader(this.fsManager.getRootDir());
        this.journal = journal;
        this.gameManager = new GameManager();

        const systemDir = path.join(this.fsManager.getRootDir(), 'system');
        this.mailManager = new MailManager(systemDir, this.modelRouter, this.identityManager);
        this.cronManager = new CronManager(systemDir, this.scheduler);

        this.configureRoutes();
    }

    private configureRoutes() {
        // middleware — use APP_ROOT when running inside packaged Electron (cwd is Resources, not app dir)
        const appRoot = process.env.APP_ROOT || process.cwd();

        this.app.use(express.static(path.join(appRoot, 'public')));
        this.app.use(express.json({ limit: '50mb' }));

        // API Endpoint to proxy Ollama models
        this.app.get('/api/ollama/models', async (req, res) => {
            try {
                const models = await this.ollamaManager.listModels();
                res.json({ models });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // AI Job Management
        this.app.get('/api/ai/jobs', (req, res) => {
            // Strip out the non-serializable abortController
            const activeJobs = this.modelRouter.getActiveJobs().map(job => {
                const { abortController, ...safeJob } = job;
                return safeJob;
            });
            res.json({ jobs: activeJobs });
        });

        this.app.post('/api/ai/stop', (req, res) => {
            const { jobId } = req.body;
            if (!jobId) {
                return res.status(400).json({ error: 'jobId is required' });
            }
            const success = this.modelRouter.abortJob(jobId);
            if (success) {
                res.json({ success: true, message: `Job ${jobId} aborted.` });
            } else {
                res.status(404).json({ error: `Job ${jobId} not found.` });
            }
        });

        // API Endpoint to proxy chat
        this.app.post('/api/ollama/chat', async (req, res) => {
            try {
                const { model, messages } = req.body;
                if (!model || !messages) {
                    return res.status(400).json({ error: 'Model and messages are required' });
                }

                // AI Firewall Ingress Scan
                const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
                if (lastUserMessage && lastUserMessage.content) {
                    const ingressCheck = await this.firewall.validatePrompt(lastUserMessage.content, 'Ingress');
                    if (!ingressCheck.safe) {
                        return res.status(403).json({
                            error: `Firewall Triggered: Unsafe Ingress Prompt blocked.\nReason: ${ingressCheck.reason}`
                        });
                    }
                }

                let responseContent = '';
                let finalResponseObj: any = {};

                if (model.startsWith('gpt')) {
                    const provider = new OpenAIProvider(this.identityManager);
                    responseContent = await provider.chat(messages, model);
                    finalResponseObj = { message: { role: 'assistant', content: responseContent } };
                } else if (model.startsWith('claude')) {
                    const provider = new AnthropicProvider(this.identityManager);
                    responseContent = await provider.chat(messages, model);
                    finalResponseObj = { message: { role: 'assistant', content: responseContent } };
                } else if (model.startsWith('gemini') || model.startsWith('grok')) {
                    return res.status(501).json({ error: `Provider for model ${model} is not yet implemented.` });
                } else {
                    const response = await this.ollamaManager.chat(model, messages);
                    responseContent = response?.message?.content || '';
                    finalResponseObj = response;
                }

                // AI Firewall Egress Scan
                if (responseContent) {
                    const egressCheck = await this.firewall.validatePrompt(responseContent, 'Egress');
                    if (!egressCheck.safe) {
                        return res.status(403).json({
                            error: `Firewall Triggered: Unsafe Egress Response blocked.\nReason: ${egressCheck.reason}`
                        });
                    }
                }

                res.json(finalResponseObj);
            } catch (error) {
                console.error('[Server] Chat error:', error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to pull model
        this.app.post('/api/ollama/pull', async (req, res) => {
            try {
                const { model } = req.body;
                if (!model) {
                    return res.status(400).json({ error: 'Model name is required' });
                }
                // This might take a while, so we might need to handle timeouts or async status
                // For now, simple await
                const response = await this.ollamaManager.pullModel(model);
                res.json(response);
            } catch (error) {
                console.error('[Server] Pull error:', error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to check Firewall state
        this.app.get('/api/system/firewall', (req, res) => {
            res.json({ enabled: this.firewall.enabled });
        });

        // --- Game API Endpoints ---
        this.app.get('/api/game/state', (req, res) => {
            res.json(this.gameManager.getState());
        });

        this.app.post('/api/game/chat', async (req, res) => {
            try {
                const { action } = req.body;
                if (!action) return res.status(400).json({ error: 'Action is required' });

                const state = this.gameManager.getState();

                // Format prompt via registry
                const { prompt } = this.registry.format('agent_game', 'dungeon_master', {
                    context: state.context,
                    inventory: state.inventory,
                    action: action
                });

                // Save user action to history
                this.gameManager.appendUserAction(action);

                // Re-fetch state for updated history length
                const updatedState = this.gameManager.getState();

                // Build context for the router from the full prompt configuration
                // Router extracts <Register_SystemPrompt>

                const responseObj = await this.modelRouter.routeChat(prompt, 'cloud');
                let responseContent = responseObj.response;

                let newContext = "";
                let newInventory = "";

                // Parse XML tags if the model returned them
                const contextMatch = responseContent.match(/<Context>([\s\S]*?)<\/Context>/i);
                if (contextMatch) {
                    newContext = contextMatch[1].trim();
                    responseContent = responseContent.replace(contextMatch[0], '');
                }

                const invMatch = responseContent.match(/<Inventory>([\s\S]*?)<\/Inventory>/i);
                if (invMatch) {
                    newInventory = invMatch[1].trim();
                    responseContent = responseContent.replace(invMatch[0], '');
                }

                // Clean up string
                responseContent = responseContent.trim();

                // Append assistant message and potentially update context/inventory
                this.gameManager.updateState(
                    newContext,
                    newInventory,
                    { role: 'assistant', content: responseContent }
                );

                res.json({ state: this.gameManager.getState() });
            } catch (error) {
                console.error('[Server] Game chat error:', error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // --- Mail API Endpoints ---
        this.app.get('/api/mail/inbox', async (req, res) => {
            try {
                const folder = req.query.folder as string || 'inbox';
                const sync = req.query.sync === 'true';
                const emails = await this.mailManager.getInbox(folder, sync);
                res.json({ emails });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/config', async (req, res) => {
            try {
                const { clientId, clientSecret, emailAddress, appPassword } = req.body;

                if (emailAddress && appPassword) {
                    await this.identityManager.addKey('gmail_address', emailAddress);
                    await this.identityManager.addKey('gmail_app_password', appPassword.replace(/\s+/g, ''));
                    return res.json({ success: true, message: 'App Password cached securely' });
                }

                if (clientId && clientSecret) {
                    await this.identityManager.addKey('gmail_client_id', clientId);
                    await this.identityManager.addKey('gmail_client_secret', clientSecret);
                    return res.json({ success: true, message: 'Google Client Secret cached securely' });
                }

                return res.status(400).json({ error: 'Either Client Credentials or App Password/Email are required' });
            } catch (err: any) {
                console.error('[Mail] Config Error:', err);
                res.status(500).json({ error: err.message });
            }
        });

        this.app.get('/api/mail/auth-url', async (req, res) => {
            const GOOGLE_CLIENT_ID = await this.identityManager.getKey('gmail_client_id') || process.env.GOOGLE_CLIENT_ID || '';
            const GOOGLE_CLIENT_SECRET = await this.identityManager.getKey('gmail_client_secret') || process.env.GOOGLE_CLIENT_SECRET || '';
            const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3123/oauth-callback.html';

            const oauth2Client = new google.auth.OAuth2(
                GOOGLE_CLIENT_ID,
                GOOGLE_CLIENT_SECRET,
                GOOGLE_REDIRECT_URI
            );

            const scopes = [
                'https://mail.google.com/',
                'https://www.googleapis.com/auth/userinfo.email'
            ];

            const url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: scopes,
                prompt: 'consent'
            });

            res.json({ url });
        });

        this.app.get('/api/mail/status', async (req, res) => {
            try {
                const address = await this.identityManager.getKey('gmail_address');
                const refreshToken = await this.identityManager.getKey('gmail_refresh_token');

                if (address && refreshToken) {
                    res.json({ configured: true, address });
                } else {
                    res.json({ configured: false });
                }
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/token', async (req, res) => {
            try {
                const { code } = req.body;
                if (!code) return res.status(400).json({ error: 'Auth code is required' });

                const GOOGLE_CLIENT_ID = await this.identityManager.getKey('gmail_client_id') || process.env.GOOGLE_CLIENT_ID || '';
                const GOOGLE_CLIENT_SECRET = await this.identityManager.getKey('gmail_client_secret') || process.env.GOOGLE_CLIENT_SECRET || '';
                const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3123/oauth-callback.html';

                const oauth2Client = new google.auth.OAuth2(
                    GOOGLE_CLIENT_ID,
                    GOOGLE_CLIENT_SECRET,
                    GOOGLE_REDIRECT_URI
                );

                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);

                let emailAddress = 'user@gmail.com';
                try {
                    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
                    const userInfo = await oauth2.userinfo.get();
                    if (userInfo.data.email) emailAddress = userInfo.data.email;
                } catch (e) { console.warn('Could not fetch email address:', e); }

                await this.identityManager.addKey('gmail_address', emailAddress);
                if (tokens.refresh_token) {
                    await this.identityManager.addKey('gmail_refresh_token', tokens.refresh_token);
                }
                if (tokens.access_token) {
                    await this.identityManager.addKey('gmail_access_token', tokens.access_token);
                }

                res.json({ success: true, message: 'OAuth credentials securely cached.' });
            } catch (err: any) {
                console.error('[Mail] Token Error:', err);
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/send', async (req, res) => {
            try {
                const { recipient, subject, body } = req.body;
                if (!recipient || !subject) return res.status(400).json({ error: 'Recipient and subject required.' });
                const result = await this.mailManager.sendEmail(recipient, subject, body);
                res.json(result);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/delete', (req, res) => {
            try {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: 'Email ID required.' });
                const success = this.mailManager.deleteEmail(id);
                if (!success) return res.status(404).json({ error: 'Email not found.' });
                res.json({ success: true });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/read', (req, res) => {
            try {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: 'Email ID required.' });
                this.mailManager.markRead(id);
                res.json({ success: true });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/summarize', async (req, res) => {
            try {
                const result = await this.mailManager.summarizeInbox();
                res.json(result);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/mail/draft', async (req, res) => {
            try {
                const { id, instruction } = req.body;
                if (!id) return res.status(400).json({ error: 'Email ID required.' });
                const draft = await this.mailManager.draftReply(id, instruction);
                res.json(draft);
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/game/reset', (req, res) => {
            const emptyState = this.gameManager.resetState();
            res.json(emptyState);
        });
        // -----------------------

        // API Endpoint to update Firewall state
        this.app.post('/api/system/firewall', (req, res) => {
            const { enabled } = req.body;
            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'Body must contain boolean "enabled" property.' });
            }
            this.firewall.enabled = enabled;
            console.log(`[Server] Firewall state updated to: ${enabled}`);
            res.json({ success: true, enabled: this.firewall.enabled });
        });

        // API Endpoint to get system specs
        this.app.get('/api/system/specs', async (req, res) => {
            try {
                const specs = this.ollamaManager.getSystemSpecs();
                res.json(specs);
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to get graph data
        this.app.get('/api/graph', async (req, res) => {
            try {
                const data = await this.graphManager.getGraph();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve graph data' });
            }
        });

        // API Endpoint to list files
        this.app.get('/api/files/list', async (req, res) => {
            const dirPath = req.query.path as string || this.fsManager.getRootDir();
            console.log(`[Server] Listing files for path: ${dirPath}`);
            try {
                const files = await this.fsManager.listFiles(dirPath);
                res.json({
                    files,
                    path: dirPath,
                    root: this.fsManager.getRootDir()
                });
            } catch (error) {
                console.error(`[Server] Error listing files:`, error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to read file
        this.app.get('/api/files/read', async (req, res) => {
            const filePath = req.query.path as string;
            if (!filePath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            try {
                const content = await this.fsManager.readFile(filePath);
                res.json({ content });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to serve raw files (Images/PDFs)
        this.app.get('/api/files/raw', async (req, res) => {
            const filePath = req.query.path as string;
            if (!filePath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            try {
                const safePath = this.fsManager.resolvePath(filePath);
                res.sendFile(safePath);
            } catch (error) {
                res.status(403).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to create file
        // express.json() is already applied at top
        this.app.post('/api/files/create', async (req, res) => {
            try {
                const { path: filePath, content } = req.body;
                if (!filePath || content === undefined) {
                    return res.status(400).json({ error: 'Path and content are required' });
                }
                await this.fsManager.createFile(filePath, content);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });
        // API Endpoint to manage keys
        this.app.get('/api/keys', async (req, res) => {
            try {
                const keys = await this.identityManager.getAllKeys();
                res.json(keys);
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        this.app.post('/api/keys', async (req, res) => {
            try {
                const { provider, key } = req.body;
                if (!provider || !key) return res.status(400).json({ error: 'Provider and key are required' });
                await this.identityManager.addKey(provider, key);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        this.app.delete('/api/keys/:provider', async (req, res) => {
            try {
                const { provider } = req.params;
                await this.identityManager.deleteKey(provider);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // Tool Registry Endpoint
        this.app.get('/api/kernel/tools', (req, res) => {
            const declarations = this.tools.listTools();
            res.json(declarations);
        });

        // OpenClaw Skills Endpoint (Local)
        this.app.get('/api/skills', (req, res) => {
            try {
                // Return structured SkillLoader data to frontend
                const activeSkills = this.skillLoader.loadSkills();
                res.json(activeSkills);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // OpenClaw Skill Execution Endpoint
        this.app.post('/api/skills/execute', async (req, res) => {
            try {
                const { skillContext, userInput } = req.body;

                if (!skillContext || !userInput) {
                    return res.status(400).json({ error: 'skillContext and userInput are required' });
                }

                const systemInstruction = `<Register_SystemPrompt>
You are an advanced OpenClaw AI agent running inside the AiOS environment on the user's local machine.
You have been granted access to the following skills:
${skillContext}

To execute these skills, you have access to the following XML tools. You MUST use these exact formats. 
Do NOT wrap the XML tags in markdown code blocks.

1. Execute a shell command:
<bash>
your command here
</bash>

2. Read a file from the file system:
<read_file>
/absolute/path/or/relative/path/to/file.txt
</read_file>

3. Save content to a file in the user's personal directory:
<save_file path="output.txt">
File content here
</save_file>

When you output a <bash> or <read_file> tag, the system will execute it and reply with the results. 
You can use tools multiple times in a row. Once you have fully completed the user's request, provide a final conversational response summarizing what you did, without any tool tags.
</Register_SystemPrompt>`;

                let messages: any[] = [
                    { role: 'user', content: `${systemInstruction}\nUser Input: ${userInput}` }
                ];

                let finalResponse = '';
                let iterations = 0;
                const maxIterations = 10;
                let levelUsed = '1';
                let providerUsed = 'local';

                const execAsync = util.promisify(require('child_process').exec);

                while (iterations < maxIterations) {
                    iterations++;
                    console.log(`[Skill Execution] Loop Iteration ${iterations}...`);

                    const chatString = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\\n');
                    const result = await this.modelRouter.routeChat(chatString);
                    const aiMessage = result.response;
                    levelUsed = result.level;
                    providerUsed = result.providerUsed;

                    messages.push({ role: 'assistant', content: aiMessage });
                    console.log(`\n\n[Skill Execution] ========== AI RESPONSE START ==========\n${aiMessage}\n========== AI RESPONSE END ==========\n\n`);

                    let requiresNextTurn = false;
                    let nextUserMessage = '';

                    // 1. Process <bash> tools
                    const bashRegex = /<bash>([\s\S]*?)<\/bash>/g;
                    let bashMatch;
                    while ((bashMatch = bashRegex.exec(aiMessage)) !== null) {
                        const command = bashMatch[1].trim();
                        try {
                            console.log(`[Skill Execution] Executing bash: ${command}`);
                            // We execute from the app root or a safe dir
                            const { stdout, stderr } = await execAsync(command, { cwd: this.fsManager.getRootDir() });
                            const output = (stdout || '') + (stderr || '');
                            nextUserMessage += `\n[Result of bash command: ${command}]\n${output.substring(0, 4000)}\n`;
                        } catch (error: any) {
                            console.error(`[Skill Execution] Bash error:`, error.message);
                            nextUserMessage += `\n[Error executing bash command: ${command}]\n${error.message}\n`;
                        }
                        requiresNextTurn = true;
                    }

                    // 2. Process <read_file> tools
                    const readRegex = /<read_file>([\s\S]*?)<\/read_file>/g;
                    let readMatch;
                    while ((readMatch = readRegex.exec(aiMessage)) !== null) {
                        const filePath = readMatch[1].trim();
                        try {
                            console.log(`[Skill Execution] Reading file: ${filePath}`);
                            // Safely resolve against root
                            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(this.fsManager.getRootDir(), filePath);
                            const content = require('fs').readFileSync(resolvedPath, 'utf8');
                            nextUserMessage += `\n[Content of file: ${filePath}]\n${content.substring(0, 8000)}\n`;
                        } catch (error: any) {
                            console.error(`[Skill Execution] Read file error:`, error.message);
                            nextUserMessage += `\n[Error reading file: ${filePath}]\n${error.message}\n`;
                        }
                        requiresNextTurn = true;
                    }

                    // 3. Process <save_file> tools (We do this on every turn just in case they save intermediately)
                    const saveFileRegex = /<save_file\s+path="([^"]+)">([\s\S]*?)<\/save_file>/g;
                    let saveMatch;
                    let finalResponseModified = aiMessage;
                    while ((saveMatch = saveFileRegex.exec(aiMessage)) !== null) {
                        const filePath = saveMatch[1];
                        const content = saveMatch[2];
                        const fullPath = `personal/${filePath}`;
                        try {
                            await this.fsManager.createFile(fullPath, content.trim());
                            console.log(`[Skill Execution] Intercepted file save to: ${fullPath}`);
                            finalResponseModified = finalResponseModified.replace(saveMatch[0], `\n*[Skill executed file save: ${fullPath}]*\n`);
                        } catch (error: any) {
                            console.error(`[Skill Execution] Save file error:`, error.message);
                        }
                    }

                    if (requiresNextTurn) {
                        messages.push({ role: 'user', content: nextUserMessage });
                    } else {
                        // Exit loop, task complete
                        finalResponse = finalResponseModified;
                        break;
                    }
                }

                if (iterations >= maxIterations) {
                    finalResponse += "\n\n*(Note: Agent reached maximum iterations and stopped automatically)*";
                }

                res.json({
                    response: finalResponse,
                    level: levelUsed,
                    providerUsed: providerUsed
                });
            } catch (error: any) {
                console.error('[Skill Execution] Error:', error);
                res.status(500).json({ error: error.message || 'Skill execution failed.' });
            }
        });

        // Helper function to extract SKILL.md from a zip buffer
        const extractSkillMdFromZip = (buffer: Buffer): Promise<string> => {
            return new Promise((resolve, reject) => {
                let foundSkill = false;
                yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: any, zipfile: any) => {
                    if (err) return resolve(''); // Fail silently to not break catalog

                    zipfile.readEntry();
                    zipfile.on('entry', (entry: any) => {
                        // Check if the file is SKILL.md (case-insensitive to be safe)
                        if (/\/SKILL\.md$/i.test(entry.fileName) || entry.fileName.toLowerCase() === 'skill.md') {
                            foundSkill = true;
                            zipfile.openReadStream(entry, (err: any, readStream: any) => {
                                if (err) return resolve('');
                                let content = '';
                                readStream.on('data', (chunk: any) => content += chunk.toString('utf8'));
                                readStream.on('end', () => resolve(content));
                            });
                        } else {
                            zipfile.readEntry();
                        }
                    });

                    zipfile.on('end', () => {
                        if (!foundSkill) resolve('');
                    });
                });
            });
        };

        // OpenClaw ClawHub Search Endpoint (Official Registry)
        this.app.get('/api/clawhub/search', async (req, res) => {
            try {
                const query = req.query.q as string || '';

                // Fetch skills from the official ClawHub registry
                const apiResponse = await fetch(`https://clawhub.ai/api/v1/skills?sort=downloads&search=${encodeURIComponent(query)}`);

                if (!apiResponse.ok) {
                    throw new Error(`ClawHub API returned ${apiResponse.status}: ${apiResponse.statusText}`);
                }

                const data = await apiResponse.json();

                // Map the ClawHub payload and concurrently fetch the SKILL.md contents
                const formattedSkills = await Promise.all((data.items || []).map(async (skillInfo: any) => {
                    let markdownContent = '';
                    const version = skillInfo.tags?.latest;
                    const slug = skillInfo.slug;

                    if (version && slug) {
                        try {
                            const zipUrl = `https://registry.clawhub.ai/${slug}/${version}.zip`;
                            const zipResponse = await fetch(zipUrl);
                            if (zipResponse.ok) {
                                const buffer = Buffer.from(await zipResponse.arrayBuffer());
                                markdownContent = await extractSkillMdFromZip(buffer);
                            }
                        } catch (e) {
                            console.error(`[ClawHub] Failed to fetch zip for ${slug}:`, e);
                        }
                    }

                    return {
                        name: skillInfo.displayName || skillInfo.slug,
                        description: skillInfo.summary || 'No description provided.',
                        skill_markdown: markdownContent, // Attached raw Markdown text
                        metadata: {
                            author: `@clawhub`,
                            downloads: skillInfo.stats?.downloads || 0,
                            repo_url: `https://clawhub.ai/skills/${skillInfo.slug}`
                        }
                    };
                }));

                res.json({ results: formattedSkills });
            } catch (error: any) {
                console.error('[ClawHub Search Error]', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Smart Search App Endpoint (SSE)
        this.app.get('/api/apps/search', async (req, res) => {
            const query = req.query.q as string;
            const sessionId = (req.query.sessionId as string) || 'default-os-session';

            if (!query) return res.status(400).json({ error: 'Query parameter "q" is required' });

            const searchTool = this.tools.getTool('smart_search');
            if (!searchTool) {
                return res.status(500).json({ error: 'Smart Search tool not registered in Kernel.' });
            }

            // Set headers for Server-Sent Events
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const result = await searchTool.execute({ query, sessionId }, (event) => {
                    sendEvent('trace', event);
                });

                sendEvent('result', result);
            } catch (error: any) {
                console.error('[Server] Search error:', error);
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // RAG Converter App Endpoint (SSE)
        this.app.get('/api/apps/rag-convert', async (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const docsDir = path.join(this.fsManager.getRootDir(), 'Docs');
                const ragsDir = path.join(this.fsManager.getRootDir(), 'Rags');

                sendEvent('trace', { step: 'Initialization', status: 'RUNNING', details: `Connecting to LanceDB at ${ragsDir}...` });
                const db = await lancedb.connect(ragsDir);
                sendEvent('trace', { step: 'Initialization', status: 'DONE', details: `Connected to LanceDB.` });

                sendEvent('trace', { step: 'Scanning Docs', status: 'RUNNING', details: `Scanning ${docsDir} for files...` });
                const files = await this.fsManager.listFiles(docsDir);
                const textFiles = files.filter(f => !f.isDirectory && (f.name.endsWith('.txt') || f.name.endsWith('.md')));

                if (textFiles.length === 0) {
                    sendEvent('trace', { step: 'Scanning Docs', status: 'DONE', details: `No text or markdown files found in Docs.` });
                    sendEvent('result', { message: 'No files to process.' });
                    return res.end();
                }

                sendEvent('trace', { step: 'Scanning Docs', status: 'DONE', details: `Found ${textFiles.length} files.` });

                const tableNames = await db.tableNames();

                for (const file of textFiles) {
                    sendEvent('trace', { step: `Processing ${file.name}`, status: 'RUNNING', details: `Reading and chunking file...` });

                    // Create a safe table name from the file name
                    const tableName = `doc_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

                    if (tableNames.includes(tableName)) {
                        sendEvent('trace', { step: `Processing ${file.name}`, status: 'DONE', details: `Table ${tableName} already exists. Skipping.` });
                        continue;
                    }

                    const content = await this.fsManager.readFile(file.path);

                    // Simple chunking (e.g., split by paragraphs or 1000 chars)
                    const chunks = content.match(/[\s\S]{1,1000}/g) || [];

                    // Generate dummy vectors for simulation
                    const records = chunks.map((chunk, i) => ({
                        id: `${file.name}_chunk_${i}`,
                        vector: new Array(128).fill(0).map(() => Math.random()),
                        text: chunk,
                        source: file.name
                    }));

                    if (records.length > 0) {
                        sendEvent('trace', { step: `Embedding ${file.name}`, status: 'RUNNING', details: `Creating LanceDB table with ${records.length} chunks...` });
                        await db.createTable(tableName, records);
                        sendEvent('trace', { step: `Embedding ${file.name}`, status: 'DONE', details: `Saved to table: ${tableName}` });
                    }
                    sendEvent('trace', { step: `Processing ${file.name}`, status: 'DONE', details: `Finished processing.` });
                }

                sendEvent('result', { message: 'Conversion completed successfully.' });
            } catch (error: any) {
                console.error('[Server] RAG Convert error:', error);
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // AI Generation Endpoints
        this.app.post('/api/ai/chat', async (req, res) => {
            try {
                const { prompt, sessionId = 'default-os-session' } = req.body;
                if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

                // 1. Add user message
                await this.memory.addMessage(sessionId, 'user', prompt);

                // 2. Build super-prompt from Virtual Memory
                const context = this.memory.getContext(sessionId);
                const retrieved = await this.memory.retrieveContext(sessionId, prompt, 2);
                const retrievedRags = await this.memory.retrieveFromRags(prompt, 2);

                const superContext = [retrieved, retrievedRags].filter(c => c.trim().length > 0).join('\n');

                const openClawSkills = this.skillLoader.getFormattedSkillContext();

                const promptData = this.registry.format('agent_chat', 'default_response', {
                    retrievedContext: superContext,
                    memoryContext: context,
                    activeSkills: openClawSkills
                });

                // 3. Route
                const result = await this.modelRouter.routeChat(promptData.prompt);

                // 4. Commit assistant reply
                if (result.response) {
                    await this.memory.addMessage(sessionId, 'assistant', result.response);
                }

                res.json(result);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ai/generate-image', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'openai' && provider !== 'mock' && provider !== 'google' && provider !== 'pollinations') return res.status(400).json({ error: 'Only OpenAI, Google, Pollinations, and Mock supported for image generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const imageUrl = await this.externalApiManager.generateImage(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { url: imageUrl });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        this.app.get('/api/ai/generate-graph', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'openai' && provider !== 'google' && provider !== 'mock') return res.status(400).json({ error: 'Only OpenAI, Google, and Mock supported for graph generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const graphCode = await this.externalApiManager.generateGraph(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { code: graphCode });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        this.app.get('/api/ai/generate-video', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'google' && provider !== 'openai' && provider !== 'mock') return res.status(400).json({ error: 'Only Google, OpenAI, and Mock supported for video generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const videoUrl = await this.externalApiManager.generateVideo(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { url: videoUrl });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // Kernel Scheduler Endpoints
        this.app.post('/api/kernel/run', async (req, res) => {
            try {
                const { nodes, edges } = req.body;
                if (!nodes || !edges) return res.status(400).json({ error: 'Graph data required' });
                const jobId = await this.scheduler.submitJob(nodes, edges);
                const runId = this.scheduler.getRunId(jobId);
                res.json({ jobId, runId });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // Cron Endpoints
        this.app.get('/api/cron', (req, res) => {
            try {
                const jobs = this.cronManager.getJobs();
                res.json(jobs);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/cron', (req, res) => {
            try {
                const { name, nodes, edges, intervalValue } = req.body;
                if (!name || !nodes || !edges || !intervalValue) {
                    return res.status(400).json({ error: 'Name, nodes, edges, and intervalValue are required' });
                }
                const jobId = this.cronManager.addJob(name, nodes, edges, intervalValue);
                res.json({ success: true, jobId });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/cron/:id', (req, res) => {
            try {
                this.cronManager.deleteJob(req.params.id);
                res.json({ success: true });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/kernel/status/:jobId', (req, res) => {
            const state = this.scheduler.getJobStatus(req.params.jobId);
            if (!state) return res.status(404).json({ error: 'Job not found' });
            res.json(state);
        });

        // Mock Search API Endpoint for AI Flow Testing
        this.app.post('/api/ai/search', async (req, res) => {
            try {
                const { query } = req.body;
                if (!query) return res.status(400).json({ error: 'Query required' });

                // Simulate network delay
                await new Promise(resolve => setTimeout(resolve, 800));

                res.json({
                    results: [
                        { title: `Search Result for: ${query}`, snippet: `This is a simulated search result containing information about ${query}.`, url: 'https://example.com' },
                        { title: `Related info: ${query} architecture`, snippet: `Deep dive into the structural components of ${query}.`, url: 'https://example.com/arch' }
                    ]
                });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // Proxy route for authenticated media fetching
        this.app.get('/api/media/fetch', async (req, res) => {
            try {
                const uri = req.query.uri as string;
                if (!uri) return res.status(400).send('URI required');

                // VERY rudimentary security check: ensure it's a googleapis domain
                if (!uri.startsWith('https://generativelanguage.googleapis.com')) {
                    return res.status(403).send('Forbidden URI');
                }

                const googleKey = await this.identityManager.getKey('google');
                if (!googleKey) return res.status(401).send('Google API key required');

                // Append key if not present (Veo returns uris without the key usually)
                const fetchUrl = uri.includes('key=') ? uri : `${uri}&key=${googleKey}`;
                console.log(`[Media Proxy] Requesting: ${uri.split('?')[0]}`);

                try {
                    // Fetch as arraybuffer to have full control over headers and sending
                    const response = await axios({
                        method: 'GET',
                        url: fetchUrl,
                        responseType: 'arraybuffer',
                        headers: {
                            'Range': req.headers.range || ''
                        }
                    });

                    const contentType = response.headers['content-type'] || 'video/mp4';
                    console.log(`[Media Proxy] Response status: ${response.status}, Content-Type: ${contentType}, Content-Length: ${response.headers['content-length']}`);

                    if (contentType.includes('text/html') || contentType.includes('application/json')) {
                        const textData = Buffer.from(response.data).toString('utf-8');
                        console.error(`[Media Proxy] Expected video but got text:`, textData.substring(0, 500));
                        return res.status(500).send('Received non-video content from API');
                    }

                    // Forward relevant headers for video streaming
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Permissive CORS for media

                    if (response.headers['content-length']) {
                        res.setHeader('Content-Length', response.headers['content-length']);
                    }
                    if (response.headers['content-range']) {
                        res.setHeader('Content-Range', response.headers['content-range']);
                        res.status(206); // Partial content
                    } else {
                        res.status(200);
                    }

                    res.send(response.data);

                } catch (e: any) {
                    console.error('[Media Proxy] Axios Fetch Error:', e.message);
                    if (e.response) {
                        console.error(`[Media Proxy] Status: ${e.response.status}`);
                        console.error(`[Media Proxy] Body:`, Buffer.from(e.response.data || '').toString('utf-8').substring(0, 500));
                    }
                    res.status(500).send('Failed to fetch media');
                }
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        // ── Telemetry / Execution History ──────────────────────────────────────

        // Live SSE stream — subscribe to telemetryBus for a specific run
        this.app.get('/api/telemetry/stream', (req, res) => {
            const runId = req.query.runId as string;
            if (!runId) return res.status(400).json({ error: 'runId required' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            // Replay any events already persisted (handles race between submit and SSE connect)
            if (this.journal) {
                const existing = this.journal.getRun(runId);
                if (existing) {
                    for (const ev of (existing.events ?? [])) {
                        res.write(`data: ${JSON.stringify(ev)}\n\n`);
                    }
                    if (existing.status !== 'running') {
                        res.end();
                        return;
                    }
                }
            }

            const handler = (ev: ExecutionEvent) => {
                if (ev.run_id !== runId) return;
                res.write(`data: ${JSON.stringify(ev)}\n\n`);
            };

            telemetryBus.subscribe(handler);
            req.on('close', () => telemetryBus.unsubscribe(handler));
        });

        this.app.get('/api/telemetry/stats', (req, res) => {
            if (!this.journal) return res.json({ total_runs: 0, total_cost_usd: 0, avg_latency_ms: 0, avg_rating: 0 });
            res.json(this.journal.getStats());
        });

        this.app.get('/api/telemetry/usage-per-hour', (req, res) => {
            if (!this.journal) return res.json([]);
            const limit = parseInt(req.query.limit as string) || 24;
            res.json(this.journal.getApiUsagePerHour(limit));
        });

        this.app.get('/api/telemetry/provider-usage', (req, res) => {
            if (!this.journal) return res.json([]);
            const hours = parseInt(req.query.hours as string) || 24;
            res.json(this.journal.getProviderUsage(hours));
        });

        this.app.get('/api/telemetry/runs', (req, res) => {
            if (!this.journal) return res.json([]);
            const limit = parseInt(req.query.limit as string) || 50;
            res.json(this.journal.listRuns(limit));
        });

        this.app.get('/api/telemetry/runs/:runId', (req, res) => {
            if (!this.journal) return res.status(503).json({ error: 'Journal not initialized' });
            const record = this.journal.getRun(req.params.runId);
            if (!record) return res.status(404).json({ error: 'Run not found' });
            res.json(record);
        });

        this.app.post('/api/telemetry/runs/:runId/rating', (req, res) => {
            if (!this.journal) return res.status(503).json({ error: 'Journal not initialized' });
            const { rating, outcome } = req.body;
            if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });
            this.journal.rateRun(req.params.runId, rating, outcome);
            res.json({ success: true });
        });

        this.app.get('/api/telemetry/diff', (req, res) => {
            if (!this.journal) return res.status(503).json({ error: 'Journal not initialized' });
            const { runA, runB } = req.query as { runA: string; runB: string };
            if (!runA || !runB) return res.status(400).json({ error: 'runA and runB required' });
            const a = this.journal.getRun(runA);
            const b = this.journal.getRun(runB);
            if (!a || !b) return res.status(404).json({ error: 'One or both runs not found' });
            res.json(computeDiff(a, b));
        });

        this.app.post('/api/telemetry/replay/:runId', async (req, res) => {
            if (!this.journal) return res.status(503).json({ error: 'Journal not initialized' });
            const record = this.journal.getRun(req.params.runId);
            if (!record) return res.status(404).json({ error: 'Run not found' });
            try {
                const { nodes, edges } = (record.flow_snapshot ?? record.snapshot)!;
                const jobId = await this.scheduler.submitJob(nodes, edges);
                res.json({ jobId, message: 'Replay started' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ───────────────────────────────────────────────────────────────────────

        // ── Budget & Semantic Cache (Phase 2) ─────────────────────────────────

        this.app.get('/api/budget', (_req, res) => {
            res.json(currentBudget);
        });

        this.app.post('/api/budget', (req, res) => {
            currentBudget = { ...currentBudget, ...req.body };
            res.json(currentBudget);
        });

        this.app.get('/api/cache/stats', (_req, res) => {
            res.json(this.journal?.getCacheStats() ?? { total_entries: 0, total_hits: 0, hit_rate_pct: 0 });
        });

        this.app.delete('/api/cache', (_req, res) => {
            this.journal?.cacheClear();
            res.json({ ok: true });
        });

        // ─────────────────────────────────────────────────────────────────────

        this.app.post('/api/keys/verify', async (req, res) => {
            try {
                const { provider } = req.body;
                if (!provider) return res.status(400).json({ error: 'Provider required' });

                const isValid = await this.externalApiManager.verifyKey(provider);
                res.json({ valid: isValid });
            } catch (error: any) {
                // If the key is missing or provider unsupported, it throws.
                // If axios fails, verifyKey returns false (caught internally), unless it throws for unsupported provider.
                // We'll return success: false and the error message if it was a "system" error, 
                // but verifyKey currently returns boolean for "api" check.
                // Let's wrap verifyKey's throw for "unsupported" vs "invalid".
                res.status(500).json({ error: error.message });
            }
        });
    }

    public start() {
        this.app.listen(this.port, '127.0.0.1', () => {
            console.log(`[Server] Web Interface running at http://127.0.0.1:${this.port}`);
        });
    }
}
