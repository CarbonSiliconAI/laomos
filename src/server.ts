
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { GraphManager } from './graph_manager';
import os from 'os';

import { FileSystemManager } from './fs_manager';

import { OllamaManager } from './ollama_manager';

import { IdentityManager } from './identity_manager';
import { ExternalAPIManager } from './external_api';
import { ModelRouter } from './kernel/router';
import { ContextManager } from './kernel/memory';
import { AgentScheduler } from './kernel/scheduler';
import { TaskAnalyzer } from './kernel/analyzer';
import { PromptRegistry } from './kernel/prompt_registry';
import { ToolRegistry } from './kernel/tool_registry';
import { SkillLoader } from './kernel/skill_loader';
import { TelegramSkillDaemon } from './kernel/telegram_skill_daemon';
import { WhatsAppSkillDaemon } from './kernel/whatsapp_skill_daemon';
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
import { CalendarManager, ScheduledJob } from './kernel/calendar';

export interface RequestManager {
    [requestId: string]: AbortController;
}

// In-memory budget state (initialized with defaults)
export let currentBudget: BudgetConstraint = {
    maxCostUsdPerRun: 0.50,
    maxLatencyMs: 30_000,
    qualityFloor: 0.6,
    preferredModels: [],
    fallbackModels: ['local'],
    fallbackLocalModel: 'qwen3.5:9b',
};

export const getFallbackPreference = () => currentBudget.fallbackModels[0] || 'local';
export const getFallbackLocalPreference = () => currentBudget.fallbackLocalModel || 'qwen3.5:9b';

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
    private taskAnalyzer: TaskAnalyzer;
    private registry: PromptRegistry;
    private tools: ToolRegistry;
    private firewall: AIFirewall;
    private skillLoader: SkillLoader;
    private telegramDaemon: TelegramSkillDaemon;
    private whatsappDaemon: WhatsAppSkillDaemon;
    private journal?: ExecutionJournal;
    private gameManager: GameManager;
    private mailManager: MailManager;
    private activeRequests: RequestManager = {};
    private activeSkillExecutions = new Map<string, AbortController>();
    private calendarManager: CalendarManager;
    private httpServer: any;

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
        this.taskAnalyzer = new TaskAnalyzer(modelRouter);
        this.registry = registry;
        this.tools = tools;
        this.firewall = firewall;
        this.skillLoader = new SkillLoader(this.fsManager.getRootDir());
        this.telegramDaemon = new TelegramSkillDaemon(this.modelRouter, this.taskAnalyzer, this.skillLoader, this.fsManager.getRootDir());
        this.whatsappDaemon = new WhatsAppSkillDaemon(this.modelRouter, this.taskAnalyzer, this.skillLoader, this.fsManager.getRootDir());
        this.journal = journal;
        this.gameManager = new GameManager(this.fsManager.getPersonalDir());

        const systemDir = path.join(this.fsManager.getRootDir(), 'system');
        this.mailManager = new MailManager(systemDir, this.modelRouter, this.identityManager);

        // Hydrate budget at startup
        try {
            const stateDir = path.join(this.fsManager.getSystemDir(), '.laomos_state');
            const budgetFile = path.join(stateDir, 'budget.json');
            if (fs.existsSync(budgetFile)) {
                const savedBudget = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
                currentBudget = { ...currentBudget, ...savedBudget };
                console.log('[Server] Loaded budget settings from disk.');
            }
        } catch (err) {
            console.error('[Server] Failed to load budget on startup:', err);
        }

        this.calendarManager = new CalendarManager(
            systemDir,
            async (targetId, inputPayload) => {
                // Execute Skill background logic
                let { skillContext, userInput, preferredProvider } = inputPayload;

                if (!skillContext) {
                    const skills = this.skillLoader.loadSkills();
                    const targetSkill = skills.find(s => s.name.toLowerCase() === targetId.toLowerCase());
                    skillContext = targetSkill ? (targetSkill.instructions || '') : '';
                }

                const resultObj = await this.executeSkill(skillContext, userInput, preferredProvider || 'cloud');
                return resultObj.response;
            },
            async (targetId, inputPayload) => {
                const { nodes, edges } = inputPayload;
                const jobId = await this.scheduler.submitJob(nodes, edges);
                return `Flow Job Submitted: ${jobId}`;
            },
            async (chainName, _inputPayload) => {
                // Load the saved task chain
                const chainDir = path.join(this.fsManager.getRootDir(), 'task_chains', chainName);
                const chainFile = path.join(chainDir, 'chain.json');
                if (!await fs.pathExists(chainFile)) {
                    throw new Error(`Task chain "${chainName}" not found`);
                }
                const chainData = await fs.readJson(chainFile);
                const chainNodes = chainData.nodes || [];
                const chainEdges = chainData.edges || [];

                // Topological sort
                const inDeg = new Map<string, number>();
                const adj = new Map<string, string[]>();
                chainNodes.forEach((n: any) => { inDeg.set(n.id, 0); adj.set(n.id, []); });
                chainEdges.forEach((e: any) => {
                    adj.get(e.from)?.push(e.to);
                    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
                });
                const queue = chainNodes.filter((n: any) => (inDeg.get(n.id) || 0) === 0).map((n: any) => n.id);
                const order: string[] = [];
                while (queue.length > 0) {
                    const id = queue.shift()!;
                    order.push(id);
                    for (const next of (adj.get(id) || [])) {
                        const d = (inDeg.get(next) || 1) - 1;
                        inDeg.set(next, d);
                        if (d === 0) queue.push(next);
                    }
                }
                chainNodes.forEach((n: any) => { if (!order.includes(n.id)) order.push(n.id); });

                // Find goal
                const goalNode = chainNodes.find((n: any) => n.type === 'goal');
                const chainGoal = goalNode?.label || chainName;
                let accumulatedContext = '';
                const results: string[] = [];

                for (const nodeId of order) {
                    const node = chainNodes.find((n: any) => n.id === nodeId);
                    if (!node) continue;

                    const goalCtx = `OVERALL GOAL: ${chainGoal}\n\n`;
                    const prevCtx = accumulatedContext ? `ACCUMULATED CONTEXT FROM PREVIOUS STEPS:\n${accumulatedContext}\n\n` : '';

                    if (node.type === 'action') {
                        let output = '';
                        if (node.skill) {
                            const allSkills = this.skillLoader.loadSkills();
                            const matched = allSkills.find((s: any) => s.name === node.skill || s.name.includes(node.skill));
                            if (matched) {
                                const taskPrompt = `${goalCtx}${prevCtx}Now execute this specific step: ${node.label}`;
                                const result = await this.executeSkill(matched.instructions || matched.description || '', taskPrompt, 'cloud', null, matched.name);
                                output = result.response;
                            }
                        }
                        if (!output) {
                            const prompt = `${goalCtx}${prevCtx}Now execute this task: ${node.label}`;
                            const result = await this.modelRouter.routeChat(prompt, 'cloud');
                            output = result.response;
                        }
                        // Summarize for context
                        const sumResult = await this.modelRouter.routeChat(
                            `Provide a 2-3 sentence summary of key findings relevant to "${chainGoal}":\n\n${output.substring(0, 2000)}`, 'cloud'
                        );
                        const summary = sumResult.response || output.substring(0, 300);
                        accumulatedContext += (accumulatedContext ? '\n\n' : '') + `[${node.label}]: ${summary}`;
                        results.push(`[ACTION] ${node.label}: ${summary}`);
                    } else if (node.type === 'condition') {
                        const checkPrompt = accumulatedContext
                            ? `You are a condition evaluator. The overall goal is: "${chainGoal}".\n\nGiven:\n---\n${accumulatedContext}\n---\nDoes this satisfy: "${node.label}"?\n\nRespond YES or NO on the first line, then explain.`
                            : `You are a condition evaluator. Has this condition been met: "${node.label}"?\nRespond YES or NO.`;
                        const result = await this.modelRouter.routeChat(checkPrompt, 'cloud');
                        const passed = result.response.split('\n')[0].toUpperCase().includes('YES');
                        if (!passed) {
                            results.push(`[CONDITION FAILED] ${node.label}: ${result.response}`);
                            break;
                        }
                        results.push(`[CONDITION PASSED] ${node.label}`);
                    } else if (node.type === 'goal') {
                        const checkPrompt = accumulatedContext
                            ? `You are a goal evaluator. Given:\n---\n${accumulatedContext}\n---\nDoes it satisfy: "${node.label}"?\n\nLine 1: YES or NO\nLine 2+: Comprehensive summary.`
                            : `Has this goal been achieved: "${node.label}"?\nYES or NO.`;
                        const result = await this.modelRouter.routeChat(checkPrompt, 'cloud');
                        const passed = result.response.split('\n')[0].toUpperCase().includes('YES');
                        results.push(`[GOAL ${passed ? 'PASSED' : 'FAILED'}] ${node.label}: ${result.response}`);
                    }
                }

                // Log the run
                const runsPath = path.join(chainDir, 'runs.json');
                let runs: any[] = [];
                if (await fs.pathExists(runsPath)) {
                    try { runs = await fs.readJson(runsPath); } catch { /* ignore */ }
                }
                const hasFail = results.some(r => /FAILED/i.test(r));
                runs.push({
                    id: `run-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    status: hasFail ? 'failed' : 'success',
                    summary: `Scheduled run of ${chainName}`,
                    log: results.join('\n'),
                });
                await fs.writeJson(runsPath, runs, { spaces: 2 });

                return results.join('\n');
            }
        );

        this.configureRoutes();
    }

    private configureRoutes() {
        // middleware — use APP_ROOT when running inside packaged Electron (cwd is Resources, not app dir)
        const appRoot = process.env.APP_ROOT || process.cwd();

        this.app.use(express.json({ limit: '50mb' }));

        // Serve React app from dist-renderer/ (takes precedence for non-API routes)
        const rendererDist = path.join(appRoot, 'dist-renderer');
        this.app.use(express.static(rendererDist));

        // Legacy static files (public/) still served as fallback
        this.app.use(express.static(path.join(appRoot, 'public')));

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
            // Strip out the non-serializable abortController from ModelRouter jobs
            const activeJobs = this.modelRouter.getActiveJobs().map(job => {
                const { abortController, ...safeJob } = job;
                return safeJob;
            });

            // Map AgentScheduler jobs to the same AIJob frontend format
            const schedulerJobs = this.scheduler.getActiveJobs()
                .filter((job: any) => job.status === 'RUNNING')
                .map((job: any) => {
                    const timestamp = parseInt(job.jobId.split('-')[1]) || Date.now();
                    const activeTask = Object.values(job.tasks).find((t: any) => t.status === 'RUNNING' || t.status === 'WAITING') || Object.values(job.tasks)[0];
                    return {
                        id: job.jobId,
                        description: `Agent Flow: ${activeTask ? (activeTask as any).type : 'Background Task'}`,
                        provider: 'scheduler',
                        startTime: timestamp
                    };
                });

            res.json({ jobs: [...activeJobs, ...schedulerJobs] });
        });

        this.app.post('/api/ai/stop', async (req, res) => {
            const { jobId } = req.body;
            if (!jobId) {
                return res.status(400).json({ error: 'jobId is required' });
            }

            // Try stopping as a ModelRouter thread first
            const routerSuccess = this.modelRouter.abortJob(jobId);
            if (routerSuccess) {
                return res.json({ success: true, message: `Job ${jobId} aborted.` });
            }

            // Fallback to stopping as an AgentScheduler flow
            const schedulerSuccess = await this.scheduler.abortJob(jobId);
            if (schedulerSuccess) {
                return res.json({ success: true, message: `Flow ${jobId} aborted.` });
            }

            res.status(404).json({ error: `Job ${jobId} not found in any active queue.` });
        });

        // API Endpoint to proxy chat
        this.app.post('/api/ollama/chat', async (req, res) => {
            const abortController = new AbortController();
            req.on('close', () => {
                console.log('[Server] POST /api/ollama/chat req.on("close") fired.');
                // abortController.abort();
            });

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
                    responseContent = await provider.chat(messages, model, { signal: abortController.signal });
                    finalResponseObj = { message: { role: 'assistant', content: responseContent } };
                } else if (model.startsWith('claude')) {
                    const provider = new AnthropicProvider(this.identityManager);
                    responseContent = await provider.chat(messages, model, { signal: abortController.signal });
                    finalResponseObj = { message: { role: 'assistant', content: responseContent } };
                } else if (model.startsWith('gemini') || model.startsWith('grok')) {
                    return res.status(501).json({ error: `Provider for model ${model} is not yet implemented.` });
                } else {
                    const response = await this.ollamaManager.chat(model, messages, abortController.signal);
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

        this.app.post('/api/game/message', (req, res) => {
            try {
                const { role, content, image } = req.body;
                if (!role || !content) return res.status(400).json({ error: 'Role and content required' });

                this.gameManager.appendMessage({ role, content, image });
                res.json({ state: this.gameManager.getState() });
            } catch (error: any) {
                console.error('[Server] Game append error:', error);
                res.status(500).json({ error: error.message });
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
                const appPassword = await this.identityManager.getKey('gmail_app_password');

                if (address && (refreshToken || appPassword)) {
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

        // API Endpoint for real-time hardware performance metrics
        this.app.get('/api/system/metrics', async (req, res) => {
            try {
                const os = require('os');
                const { exec } = require('child_process');

                // CPU Load Avg (1 minute) scaled to percentage roughly
                const cpuLoadAvg = os.loadavg()[0];
                const cpuCount = os.cpus().length;
                const cpuPercent = Math.min((cpuLoadAvg / cpuCount) * 100, 100);

                // RAM
                const totalMem = os.totalmem();
                const freeMem = os.freemem();
                const usedMem = totalMem - freeMem;
                const ramPercent = (usedMem / totalMem) * 100;

                // Disk (Root vol)
                exec('df -k / | tail -1 | awk \'{print $5}\'', (error: any, stdout: string) => {
                    let diskPercent = 0;
                    if (!error && stdout) {
                        const parsed = parseInt(stdout.replace('%', '').trim());
                        if (!isNaN(parsed)) diskPercent = parsed;
                    }

                    res.json({
                        cpu: cpuPercent,
                        ram: ramPercent,
                        disk: diskPercent
                    });
                });
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve metrics' });
            }
        });

        // API Endpoint for system auto-config (install dependencies)
        this.app.post('/api/system/auto-config', async (req, res) => {
            try {
                const util = require('util');
                const os = require('os');
                const execAsync = util.promisify(require('child_process').exec);

                let command = '';
                const platform = os.platform();

                res.setHeader('Content-Type', 'application/json');

                if (platform === 'darwin') {
                    // macOS: Use Homebrew. Ensure user's path is loaded.
                    const tempScriptPath = require('path').join(os.tmpdir(), 'laomos-brew-install.sh');
                    require('fs').writeFileSync(tempScriptPath, '#!/bin/bash\n' +
                        'echo "Laomos Auto-Config"\n' +
                        'echo "Please enter your Mac password to install Homebrew."\n' +
                        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n' +
                        'echo ""\n' +
                        'echo "Done! Please close this terminal and click Auto-Config in Laomos again."\n'
                    );
                    require('fs').chmodSync(tempScriptPath, 0o755);

                    command = `
                        export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
                        if ! command -v brew &> /dev/null; then
                            osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${tempScriptPath}"'
                            echo "A Terminal window has been opened to securely ask for your Mac password."
                            echo "Please complete the Homebrew installation there, then click 'Run Auto-Config' again!"
                            exit 0
                        fi
                        echo "Installing dependencies via Homebrew..."
                        brew install node python ollama
                    `;
                } else if (platform === 'win32') {
                    // Windows: Use winget
                    command = 'winget install OpenJS.NodeJS Python.Python.3.11 Ollama.Ollama --accept-package-agreements --accept-source-agreements';
                } else if (platform === 'linux') {
                    // Linux: Assume apt-based for now (Debian/Ubuntu)
                    command = `
                        if ! sudo -n true 2>/dev/null; then
                            echo "ERROR: Laomos requires permission to install packages."
                            echo "Please run this command manually in your terminal:"
                            echo "  sudo apt-get update && sudo apt-get install -y nodejs npm python3 python3-pip curl && curl -fsSL https://ollama.com/install.sh | sh"
                            exit 1
                        fi
                        echo "Updating apt package list..."
                        sudo apt-get update
                        echo "Installing Node and Python..."
                        sudo apt-get install -y nodejs npm python3 python3-pip curl
                        echo "Installing Ollama..."
                        curl -fsSL https://ollama.com/install.sh | sh
                    `;
                } else {
                    throw new Error(`Unsupported operating system for auto-config: ${platform}`);
                }

                const { stdout, stderr } = await execAsync(command);
                res.json({ success: true, log: stdout + '\n' + stderr });
            } catch (error: any) {
                console.error('[Server] Auto-config error:', error);
                res.status(500).json({
                    error: error.message || 'Auto-config failed',
                    log: error.stdout ? (error.stdout + '\n' + error.stderr) : (error.message || '')
                });
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
            console.log(`[Server] Listing files for path: ${dirPath} `);
            try {
                const files = await this.fsManager.listFiles(dirPath);
                res.json({
                    files,
                    path: dirPath,
                    root: this.fsManager.getRootDir()
                });
            } catch (error) {
                console.error(`[Server] Error listing files: `, error);
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

        this.app.get('/api/skills', (req, res) => {
            try {
                // Return structured SkillLoader data to frontend
                const activeSkills = this.skillLoader.loadSkills();
                res.json({ skills: activeSkills });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // OpenClaw Skill Execution Endpoint
        this.app.post('/api/skills/execute', async (req, res) => {
            let passedExecutionId = req.body.executionId;
            let controller: AbortController | null = null;
            if (passedExecutionId) {
                controller = new AbortController();
                this.activeSkillExecutions.set(passedExecutionId, controller);
            }

            try {
                const { skillContext, userInput, preferredProvider, skillName } = req.body;

                if (!skillContext || !userInput) {
                    return res.status(400).json({ error: 'skillContext and userInput are required' });
                }

                // Default to cloud models for faster iteration
                const modelPreference = preferredProvider || 'cloud';

                const resultObj = await this.executeSkill(skillContext, userInput, modelPreference, controller, skillName);

                res.json({
                    response: resultObj.response,
                    level: resultObj.levelUsed,
                    providerUsed: resultObj.providerUsed
                });
            } catch (error: any) {
                console.error('[Skill Execution] Error:', error);
                res.status(500).json({ error: error.message || 'Skill execution failed.' });
            } finally {
                if (passedExecutionId) {
                    this.activeSkillExecutions.delete(passedExecutionId);
                }
            }
        });

        // OpenClaw Skill Execution Cancel Endpoint
        this.app.post('/api/skills/cancel', (req, res) => {
            const { executionId } = req.body;
            if (!executionId) {
                return res.status(400).json({ error: 'executionId is required' });
            }

            const controller = this.activeSkillExecutions.get(executionId);
            if (controller) {
                console.log(`[Skill Execution] Cancelling execution ${executionId}`);
                controller.abort();
                this.activeSkillExecutions.delete(executionId);
                return res.json({ success: true, message: 'Execution cancelled.' });
            } else {
                return res.status(404).json({ error: 'Execution ID not found or already completed.' });
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

                let apiResponse;
                let itemsList = [];

                if (query.trim() === '') {
                    // If empty query, fetch top downloaded skills (Discovery mode)
                    apiResponse = await fetch(`https://clawhub.ai/api/v1/skills?sort=downloads`, {
                        headers: { 'User-Agent': 'curl/8.7.1' }
                    });
                } else {
                    // Normal search mode
                    apiResponse = await fetch(`https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}`, {
                        headers: { 'User-Agent': 'curl/8.7.1' }
                    });
                }

                if (!apiResponse.ok) {
                    throw new Error(`ClawHub API returned ${apiResponse.status}: ${apiResponse.statusText}`);
                }

                const data = await apiResponse.json();

                // The /skills endpoint returns .items, the /search endpoint returns .results
                itemsList = query.trim() === '' ? data.items : data.results;

                // Map the ClawHub payload and concurrently fetch the SKILL.md contents
                const formattedSkills = await Promise.all((itemsList || []).map(async (skillInfo: any) => {
                    let markdownContent = '';
                    const slug = skillInfo.slug;
                    let version = skillInfo.version;

                    // The search API often returns `version: null` and NO stats. We need to resolve from the detail endpoint.
                    if ((!version || !skillInfo.stats) && slug) {
                        try {
                            const metaRes = await fetch(`https://clawhub.ai/api/v1/skills/${slug}`, {
                                headers: { 'User-Agent': 'curl/8.7.1' },
                                signal: AbortSignal.timeout(5000)
                            });
                            if (metaRes.ok) {
                                const metaData = await metaRes.json();
                                if (!version) {
                                    version = metaData.skill?.tags?.latest || metaData.latestVersion?.version;
                                }
                                // Merge stats, owner, moderation from detail endpoint
                                if (!skillInfo.stats && metaData.skill?.stats) {
                                    skillInfo.stats = metaData.skill.stats;
                                }
                                if (!skillInfo.owner && metaData.owner) {
                                    skillInfo.owner = metaData.owner;
                                }
                                if (skillInfo.moderation === undefined && metaData.moderation !== undefined) {
                                    skillInfo.moderation = metaData.moderation;
                                }
                            }
                        } catch (e: any) {
                            console.warn(`[ClawHub] Failed to resolve details for ${slug}: ${e.message}`);
                        }
                    }

                    if (version && slug) {
                        try {
                            const zipUrl = `https://clawhub.ai/api/v1/download?slug=${slug}&version=${version}`;
                            const zipResponse = await fetch(zipUrl, {
                                headers: { 'User-Agent': 'curl/8.7.1' }
                            });
                            if (zipResponse.ok) {
                                const buffer = Buffer.from(await zipResponse.arrayBuffer());
                                markdownContent = await extractSkillMdFromZip(buffer);
                            }
                        } catch (e: any) {
                            // Silently skip — registry unreachable (offline / DNS failure)
                            const code = e?.cause?.code ?? e?.code ?? '';
                            if (code !== 'ENOTFOUND' && code !== 'ECONNREFUSED') {
                                console.warn(`[ClawHub] Could not fetch zip for ${slug}: ${e.message}`);
                            }
                        }
                    }

                    return {
                        name: skillInfo.displayName || skillInfo.slug,
                        description: skillInfo.summary || 'No description provided.',
                        skill_markdown: markdownContent,
                        slug: skillInfo.slug,
                        version: version || skillInfo.tags?.latest || '',
                        stats: {
                            downloads: skillInfo.stats?.downloads || 0,
                            installs: skillInfo.stats?.installsCurrent || skillInfo.stats?.installsAllTime || 0,
                            stars: skillInfo.stats?.stars || 0,
                            versions: skillInfo.stats?.versions || 1,
                        },
                        author: skillInfo.owner?.handle || skillInfo.owner?.displayName || 'clawhub',
                        openclawVerified: skillInfo.moderation?.status === 'approved' || (skillInfo.stats?.stars > 50),
                        virusTotalClean: skillInfo.moderation?.virusTotal !== 'flagged',
                        metadata: {
                            author: `@clawhub`,
                            downloads: skillInfo.stats?.downloads || 0,
                            repo_url: `https://clawhub.ai/skills/${skillInfo.slug}`
                        }
                    };
                }));

                res.json({ apps: formattedSkills });
            } catch (error: any) {
                const code = error?.cause?.code ?? error?.code ?? '';
                if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
                    console.warn('[ClawHub] Registry unreachable (offline).');
                } else {
                    console.error('[ClawHub Search Error]', error.message);
                }
                res.status(503).json({ error: 'ClawHub registry is unavailable.' });
            }
        });

        // OpenClaw ClawHub Install Endpoint
        this.app.post('/api/clawhub/install', async (req, res) => {
            try {
                const { slug, version } = req.body;
                if (!slug || !version) {
                    return res.status(400).json({ error: 'Missing slug or version.' });
                }

                console.log(`[ClawHub] Starting download of ${slug}@${version}...`);
                const zipUrl = `https://clawhub.ai/api/v1/download?slug=${slug}&version=${version}`;

                // Retry logic for rate-limited requests
                const maxRetries = 3;
                let lastError = '';
                let buffer: Buffer | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    console.log(`[ClawHub] Download attempt ${attempt}/${maxRetries}...`);
                    const response = await fetch(zipUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                        },
                        redirect: 'follow',
                    });

                    if (response.ok) {
                        buffer = Buffer.from(await response.arrayBuffer());
                        break;
                    }

                    if (response.status === 429) {
                        const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10);
                        lastError = `Rate limited (attempt ${attempt}/${maxRetries}). Waiting ${retryAfter}s...`;
                        console.log(`[ClawHub] ${lastError}`);
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            continue;
                        }
                    }

                    lastError = `Failed to fetch skill package: ${response.statusText} (${response.status})`;
                    if (attempt >= maxRetries) break;
                }

                if (!buffer) {
                    throw new Error(lastError || 'Failed to download after all retries.');
                }

                // Save zip into storage/skills
                const skillsDir = path.join(this.fsManager.getRootDir(), 'skills');
                if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

                const zipPath = path.join(skillsDir, `${slug}-${version}.zip`);
                fs.writeFileSync(zipPath, buffer);

                console.log(`[ClawHub] Downloaded ${zipPath}. Triggering auto-extract...`);

                // Trigger the auto-extraction by forcing a skill reload from disk cache
                this.skillLoader.loadSkills(true);

                // ── Post-install: parse SKILL.md for install commands ──────────
                const installLogs: string[] = [];
                try {
                    const skillDir = path.join(skillsDir, `${slug}-${version}`);
                    const skillMdPath = path.join(skillDir, 'SKILL.md');
                    if (fs.existsSync(skillMdPath)) {
                        const skillMdContent = fs.readFileSync(skillMdPath, 'utf8');

                        // Find the ## Installation section
                        const installMatch = skillMdContent.match(/##\s*Installation\s*\n([\s\S]*?)(?=\n##\s|$)/i);
                        if (installMatch) {
                            const installSection = installMatch[1];

                            // Extract the FIRST ```bash block (primary/recommended install)
                            const bashBlockMatch = installSection.match(/```bash\n([\s\S]*?)```/);
                            if (bashBlockMatch) {
                                const commands = bashBlockMatch[1]
                                    .split('\n')
                                    .map(l => l.trim())
                                    .filter(l => l && !l.startsWith('#') && !l.startsWith('cd ') && !l.startsWith('git clone'));

                                if (commands.length > 0) {
                                    console.log(`[ClawHub] Found ${commands.length} install command(s) in SKILL.md. Running...`);
                                    const { exec } = require('child_process');
                                    const execAsync = require('util').promisify(exec);

                                    for (const cmd of commands) {
                                        console.log(`[ClawHub] Running: ${cmd}`);
                                        installLogs.push(`> ${cmd}`);
                                        try {
                                            // Use login shell to inherit user's full PATH, and prepend our laomos bin dir
                                            const laomosBinDir = path.join(os.homedir(), '.laomos', 'bin');
                                            const shellCmd = `/bin/zsh -l -c ${JSON.stringify(cmd)}`;
                                            const { stdout, stderr } = await execAsync(shellCmd, {
                                                cwd: this.fsManager.getRootDir(),
                                                timeout: 120000,
                                                env: { ...process.env, PATH: `${laomosBinDir}${path.delimiter}${process.env.PATH}` }
                                            });
                                            if (stdout) installLogs.push(stdout.substring(0, 500));
                                            if (stderr) installLogs.push(`stderr: ${stderr.substring(0, 300)}`);
                                        } catch (cmdErr: any) {
                                            const errMsg = `Command failed: ${cmdErr.message}`;
                                            console.warn(`[ClawHub] ${errMsg}`);
                                            installLogs.push(errMsg);
                                            // Don't throw — continue with remaining commands
                                        }
                                    }
                                    console.log(`[ClawHub] Post-install commands completed.`);
                                }
                            } else {
                                console.log(`[ClawHub] Installation section found but no bash block detected.`);
                            }
                        } else {
                            console.log(`[ClawHub] No ## Installation section found in SKILL.md. Skipping post-install.`);
                        }

                        // ── Auto-generate executable wrappers for scripts in the system PATH ──
                        const scriptsDir = path.join(skillDir, 'scripts');
                        if (fs.existsSync(scriptsDir)) {
                            const laomosBinDir = path.join(os.homedir(), '.laomos', 'bin');
                            fs.mkdirSync(laomosBinDir, { recursive: true });

                            const scriptFiles = fs.readdirSync(scriptsDir);
                            let wrappersCreated = 0;

                            for (const sfile of scriptFiles) {
                                const ext = path.extname(sfile).toLowerCase();
                                const commandName = path.basename(sfile, ext);
                                const scriptFullPath = path.join(scriptsDir, sfile);
                                const wrapperPath = path.join(laomosBinDir, commandName);
                                const winWrapperPath = path.join(laomosBinDir, `${commandName}.cmd`);

                                try {
                                    if (ext === '.py') {
                                        fs.writeFileSync(wrapperPath, `#!/usr/bin/env bash\npython3 "${scriptFullPath}" "$@"\n`);
                                        fs.chmodSync(wrapperPath, '755');
                                        fs.writeFileSync(winWrapperPath, `@echo off\npython "${scriptFullPath}" %*\n`);
                                        wrappersCreated++;
                                    } else if (ext === '.sh') {
                                        fs.writeFileSync(wrapperPath, `#!/usr/bin/env bash\nbash "${scriptFullPath}" "$@"\n`);
                                        fs.chmodSync(wrapperPath, '755');
                                        fs.writeFileSync(winWrapperPath, `@echo off\nbash "${scriptFullPath}" %*\n`);
                                        wrappersCreated++;
                                    } else if (ext === '.js') {
                                        fs.writeFileSync(wrapperPath, `#!/usr/bin/env bash\nnode "${scriptFullPath}" "$@"\n`);
                                        fs.chmodSync(wrapperPath, '755');
                                        fs.writeFileSync(winWrapperPath, `@echo off\nnode "${scriptFullPath}" %*\n`);
                                        wrappersCreated++;
                                    }
                                } catch (werr) {
                                    console.error(`[ClawHub] Failed to create wrapper for ${sfile}:`, werr);
                                }
                            }
                            if (wrappersCreated > 0) {
                                console.log(`[ClawHub] Created ${wrappersCreated} executable wrappers in ${laomosBinDir}`);
                                installLogs.push(`Linked ${wrappersCreated} command(s) to system PATH.`);
                            }
                        }
                    }
                } catch (postInstallErr: any) {
                    console.warn(`[ClawHub] Post-install error (non-fatal): ${postInstallErr.message}`);
                    installLogs.push(`Post-install error: ${postInstallErr.message}`);
                }

                res.json({
                    success: true,
                    message: `Installed ${slug}@${version}`,
                    installLogs: installLogs.length > 0 ? installLogs : undefined
                });
            } catch (error: any) {
                console.error(`[ClawHub Install Error] ${error.message}`);
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

        // ── Telegram Config Persistence ────────────────────────────────────
        const telegramConfigPath = path.join(this.fsManager.getRootDir(), 'system', 'telegram_config.json');

        const readTelegramConfig = async () => {
            try {
                await fs.ensureFile(telegramConfigPath);
                const raw = await fs.readFile(telegramConfigPath, 'utf-8');
                if (!raw.trim()) return { tokens: [], chatIds: [] };
                return JSON.parse(raw);
            } catch { return { tokens: [], chatIds: [] }; }
        };
        const writeTelegramConfig = async (config: any) => {
            await fs.writeJSON(telegramConfigPath, config, { spaces: 2 });
        };

        this.app.get('/api/telegram/config', async (_req, res) => {
            try { res.json(await readTelegramConfig()); }
            catch (e: any) { res.status(500).json({ error: e.message }); }
        });

        this.app.post('/api/telegram/config/token', async (req, res) => {
            try {
                const { label, token } = req.body;
                if (!label || !token) return res.status(400).json({ error: 'label and token required' });
                const cfg = await readTelegramConfig();
                if (cfg.tokens.some((t: any) => t.label === label)) return res.status(409).json({ error: 'Label already exists' });
                cfg.tokens.push({ label, token });
                await writeTelegramConfig(cfg);
                res.json({ success: true });
            } catch (e: any) { res.status(500).json({ error: e.message }); }
        });

        this.app.delete('/api/telegram/config/token', async (req, res) => {
            try {
                const label = req.query.label as string;
                if (!label) return res.status(400).json({ error: 'label required' });
                const cfg = await readTelegramConfig();
                cfg.tokens = cfg.tokens.filter((t: any) => t.label !== label);
                await writeTelegramConfig(cfg);
                res.json({ success: true });
            } catch (e: any) { res.status(500).json({ error: e.message }); }
        });

        this.app.post('/api/telegram/config/chatid', async (req, res) => {
            try {
                const { label, chatId } = req.body;
                if (!label || !chatId) return res.status(400).json({ error: 'label and chatId required' });
                const cfg = await readTelegramConfig();
                if (cfg.chatIds.some((c: any) => c.label === label)) return res.status(409).json({ error: 'Label already exists' });
                cfg.chatIds.push({ label, chatId });
                await writeTelegramConfig(cfg);
                res.json({ success: true });
            } catch (e: any) { res.status(500).json({ error: e.message }); }
        });

        this.app.delete('/api/telegram/config/chatid', async (req, res) => {
            try {
                const label = req.query.label as string;
                if (!label) return res.status(400).json({ error: 'label required' });
                const cfg = await readTelegramConfig();
                cfg.chatIds = cfg.chatIds.filter((c: any) => c.label !== label);
                await writeTelegramConfig(cfg);
                res.json({ success: true });
            } catch (e: any) { res.status(500).json({ error: e.message }); }
        });

        // Telegram Bot Endpoints (Proxied to avoid CORS on frontend)
        this.app.get('/api/telegram/updates', async (req, res) => {
            // Block frontend polling while the daemon is running or within cooldown
            if (this.telegramDaemon.isRunning()) {
                return res.json({ results: [], paused: true, reason: 'Daemon is active' });
            }
            const cooldownMs = this.telegramDaemon.msSinceStopped();
            if (cooldownMs < 5000) {
                return res.json({ results: [], paused: true, reason: 'Daemon cooldown' });
            }

            const token = req.query.token as string;
            const offset = req.query.offset as string;
            if (!token) return res.status(400).json({ error: 'Token is required' });

            try {
                let url = `https://api.telegram.org/bot${token}/getUpdates?timeout=1`;
                if (offset) url += `&offset=${offset}`;
                const response = await fetch(url);
                const data = await response.json();

                if (!data.ok) {
                    throw new Error(data.description || 'Failed to fetch updates');
                }

                let nextOffset: number | undefined;
                const messages = (data.result || []).map((update: any) => {
                    // Track the highest update_id so we can compute next offset
                    if (!nextOffset || update.update_id >= nextOffset) {
                        nextOffset = update.update_id + 1;
                    }
                    if (update.message && update.message.text) {
                        return {
                            id: update.message.message_id,
                            text: update.message.text,
                            isSelf: false,
                            date: update.message.date * 1000,
                            sender: update.message.from?.username || update.message.from?.first_name || 'User',
                            chatId: update.message.chat.id
                        };
                    }
                    return null;
                }).filter(Boolean);

                res.json({ results: messages, nextOffset });
            } catch (error: any) {
                console.error('[Server] Telegram Updates error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/telegram/send', async (req, res) => {
            const { token, chatId, text } = req.body;
            if (!token || !chatId || !text) return res.status(400).json({ error: 'Token, ChatId, and Text are required' });

            try {
                const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: text
                    })
                });

                const data = await response.json();
                if (!data.ok) {
                    throw new Error(data.description || 'Failed to send message');
                }

                res.json({ success: true, result: data.result });
            } catch (error: any) {
                console.error('[Server] Telegram Send error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ── Telegram Skill Daemon Endpoints ─────────────────────────────────
        this.app.post('/api/telegram/skill-daemon/start', async (req, res) => {
            try {
                const { token, chatId } = req.body;
                if (!token || !chatId) return res.status(400).json({ error: 'Token and chatId are required.' });
                this.telegramDaemon.start(token, chatId);
                res.json({ success: true, message: 'Telegram Skill Daemon started.' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/telegram/skill-daemon/stop', async (_req, res) => {
            try {
                this.telegramDaemon.stop();
                res.json({ success: true, message: 'Telegram Skill Daemon stopped.' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/telegram/skill-daemon/status', async (_req, res) => {
            try {
                res.json({
                    running: this.telegramDaemon.isRunning(),
                    log: this.telegramDaemon.getLog(),
                    messages: this.telegramDaemon.getMessages()
                });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ── WhatsApp Skill Daemon Endpoints ───────────────────────────
        this.app.post('/api/whatsapp/skill-daemon/start', async (_req, res) => {
            try {
                this.whatsappDaemon.start();
                res.json({ success: true, message: 'WhatsApp Skill Daemon started.' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/whatsapp/skill-daemon/stop', async (_req, res) => {
            try {
                this.whatsappDaemon.stop();
                res.json({ success: true, message: 'WhatsApp Skill Daemon stopped.' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/whatsapp/skill-daemon/status', async (_req, res) => {
            try {
                res.json({
                    running: this.whatsappDaemon.isRunning(),
                    processing: this.whatsappDaemon.isProcessing(),
                    log: this.whatsappDaemon.getLog(),
                    messages: this.whatsappDaemon.getMessages()
                });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/whatsapp/skill-daemon/process', async (req, res) => {
            try {
                const { text, sender } = req.body;
                if (!text) return res.status(400).json({ error: 'text is required.' });
                const reply = await this.whatsappDaemon.processMessage(text, sender || 'WhatsApp User');
                res.json({ success: true, reply });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // --- News Background Job Registry ---
        interface NewsJob {
            id: string;
            status: 'running' | 'completed' | 'error';
            traces: any[];
            result: any | null;
            error: string | null;
            abortController: AbortController;
            listeners: ((type: string, data: any) => void)[];
        }
        const newsRegistry = new Map<string, NewsJob>();

        function emitToJobSubscribers(jobId: string, type: string, data: any) {
            const job = newsRegistry.get(jobId);
            if (!job) return;
            job.listeners.forEach(l => l(type, data));
        }

        // 1. Trigger the background search
        this.app.get('/api/news/search', async (req, res) => {
            const topic = req.query.topic as string || '';
            const sessionId = (req.query.sessionId as string) || 'default-os-session';
            const searchQuery = topic.trim() ? topic.trim() : 'Top 10 Global News Breaking Headlines';

            const searchTool = this.tools.getTool('smart_search');
            if (!searchTool) {
                return res.status(500).json({ error: 'Smart Search tool not registered' });
            }

            const jobId = require('uuid').v4();
            const job: NewsJob = {
                id: jobId,
                status: 'running',
                traces: [],
                result: null,
                error: null,
                abortController: new AbortController(),
                listeners: []
            };
            newsRegistry.set(jobId, job);

            // Respond immediately to UI
            res.json({ jobId });

            // Run detached background analysis
            (async () => {
                try {
                    const Parser = require('rss-parser');
                    const parser = new Parser();

                    const hours = parseInt(req.query.hours as string) || 24;
                    let timeFilter = `when:${hours}h`;
                    if (hours >= 24 && hours % 24 === 0) {
                        timeFilter = `when:${hours / 24}d`;
                    }

                    emitToJobSubscribers(jobId, 'trace', { message: `Fetching real-time news (${timeFilter}) from Google News RSS...` });
                    job.traces.push({ message: `Fetching real-time news (${timeFilter}) from Google News RSS...` });

                    // We must use the search endpoint if we apply a time filter
                    let searchQuery = topic.trim();
                    if (!searchQuery) {
                        searchQuery = 'news'; // Generic fallback to get global top news within the timeframe
                    }

                    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery + ' ' + timeFilter)}`;

                    const feed = await parser.parseURL(feedUrl);
                    if (!feed || !feed.items || feed.items.length === 0) {
                        throw new Error("No news found for this topic.");
                    }

                    // Grab Top 10
                    const top10 = feed.items.slice(0, 10).map((item: any) => ({
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate,
                        source: item.source || feed.title
                    }));

                    emitToJobSubscribers(jobId, 'trace', { message: `Retrieved ${top10.length} articles. Classifying news items with AI...` });
                    job.traces.push({ message: `Retrieved ${top10.length} articles. Classifying news items with AI...` });

                    // Classify the news
                    const classifyPrompt = `You are a news classification expert. 
For each of the following 10 news headlines, provide:
1. A broad "Type" (e.g., Tech, Politics, General, Finance, Sports)
2. A specific "Tag" (e.g., AI, Elections, Space, Earnings)
3. A short "Label" summarizing the exact topic in 2-4 words.

Return the result as a raw JSON array of objects. Do not use markdown blocks. Each object must have:
{ "title": string, "type": string, "tag": string, "label": string }

Headlines:
` + top10.map((h: any) => h.title).join('\n');

                    // Make sure we get JSON out
                    const result = await this.modelRouter.routeChat(
                        classifyPrompt,
                        'cloud-preferred',
                        'News Classification',
                        job.abortController.signal
                    );

                    let classified = [];
                    try {
                        let jsonStr = result.response.replace(/```json/g, '').replace(/```/g, '').trim();
                        classified = JSON.parse(jsonStr);
                    } catch (e) {
                        console.error("Failed to parse LLM classification:", result.response);
                        // Fallback if parsing fails
                        classified = top10.map((h: any) => ({
                            title: h.title,
                            type: 'News',
                            tag: 'General',
                            label: 'Article'
                        }));
                    }

                    // Merge LLM classification with original RSS data
                    const enrichedHeadlines = top10.map((hl: any) => {
                        const cl = classified.find((c: any) => c.title === hl.title) || {};
                        return {
                            ...hl,
                            type: cl.type || 'News',
                            tag: cl.tag || 'General',
                            label: cl.label || 'Article'
                        };
                    });

                    job.result = {
                        headlines: enrichedHeadlines,
                        analysis: '' // We don't do a full analysis block anymore, just the list
                    };
                    job.status = 'completed';
                    emitToJobSubscribers(jobId, 'result', job.result);
                } catch (error: any) {
                    if (error.message === 'canceled' || error.name === 'AbortError') {
                        job.error = 'Analysis stopped by user.';
                    } else {
                        console.error('[Server] Detached News Search error:', error);
                        job.error = error.message;
                    }
                    job.status = 'error';
                    emitToJobSubscribers(jobId, 'error', { message: job.error });
                }
            })();
        });

        // 2. Stream & Sync Job Status (UI Re-attachment safe)
        this.app.get('/api/news/stream/:jobId', (req, res) => {
            const jobId = req.params.jobId;
            const job = newsRegistry.get(jobId);

            if (!job) {
                return res.status(404).json({ error: 'Job not found or expired.' });
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // 1. Immediately replay cached traces
            for (const t of job.traces) {
                sendEvent('trace', t);
            }

            // 2. See if we are already done
            if (job.status === 'completed') {
                sendEvent('result', job.result);
                return res.end();
            } else if (job.status === 'error') {
                sendEvent('error', { message: job.error });
                return res.end();
            }

            // 3. Keep the connection open and attach to the Job's listener array
            job.listeners.push(sendEvent);

            req.on('close', () => {
                // When UI disconnects, just remove the listener. DO NOT ABORT the generation!
                job.listeners = job.listeners.filter(l => l !== sendEvent);
            });
        });

        // 3. User explicit stop click
        this.app.post('/api/news/stop/:jobId', (req, res) => {
            const job = newsRegistry.get(req.params.jobId);
            if (job) {
                job.abortController.abort();
            }
            res.json({ success: true });
        });

        // 4. Summarize a specific article with Fact-Checking
        this.app.post('/api/news/summary', async (req, res) => {
            const { url, title } = req.body;
            if (!url) return res.status(400).json({ error: 'Missing article URL' });

            try {
                const axios = require('axios');
                const cheerio = require('cheerio');
                const Parser = require('rss-parser');
                const parser = new Parser();

                // 1. Scrape the primary article
                let text = '';
                try {
                    const response = await axios.get(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                        },
                        timeout: 10000
                    });
                    const $ = cheerio.load(response.data);
                    $('script, style, noscript, nav, footer, header, aside, .ad, .advertisement').remove();
                    text = $('body').text().replace(/\s+/g, ' ').trim();
                } catch (scrapeErr) {
                    console.error("Scraping direct URL failed:", scrapeErr);
                    return res.status(500).json({ error: 'Failed to access the article content. It might be behind a paywall or anti-bot protection.' });
                }

                if (text.length > 15000) text = text.substring(0, 15000); // chunk it

                // 2. Fetch Related Context / Fact-Check via RSS
                let relatedContext = "No additional context found.";
                let relatedLinks: { title: string, url: string }[] = [];
                if (title) {
                    try {
                        const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent('"' + title + '"')}`;
                        const feed = await parser.parseURL(searchUrl);
                        const topRelated = feed.items.slice(0, 4);

                        if (topRelated.length > 0) {
                            relatedContext = topRelated.map((item: any, idx: number) => `Source ${idx + 1}: ${item.source || 'News'} - ${item.title}`).join('\n');
                            relatedLinks = topRelated.map((item: any) => ({ title: item.title, url: item.link }));
                        }
                    } catch (rssErr) {
                        console.error('Failed to fetch related news:', rssErr);
                    }
                }

                // 3. Synthesize the Deep Summary
                const summaryPrompt = `You are an expert news analyst and fact-checker. 
Read the primary article text and compare it with the related news headlines to verify the story's authenticity and context.

Primary Article Text:
${text}

Related News (For Fact-Checking/Cross-referencing):
${relatedContext}

Instructions:
1. Provide a comprehensive but concise summary (3-5 sentences) of the primary article.
2. Add a brief "Fact-Check/Verification" statement acknowledging if this story is widely corroborated by the related sources provided.
3. Your output should be formatted nicely in markdown.
4. DO NOT manually add a sources list at the end. Just write the summary and the fact-check statement.`;

                const result = await this.modelRouter.routeChat(
                    summaryPrompt,
                    'cloud-preferred',
                    'News Summary',
                    new AbortController().signal
                );

                // 4. Append the source links cleanly
                let finalMarkdown = result.response.trim();
                finalMarkdown += '\n\n**Sources & Further Reading:**\n';
                finalMarkdown += `- [Original Article](${url})\n`;

                // Deduplicate links (don't link the exact same string twice)
                const uniqueLinks = Array.from(new Set(relatedLinks.map(l => l.url)));
                const safeLinks = relatedLinks.filter(l => l.url !== url && uniqueLinks.includes(l.url)).slice(0, 3);

                safeLinks.forEach(linkObj => {
                    finalMarkdown += `- [${linkObj.title}](${linkObj.url})\n`;
                });

                res.json({ summary: finalMarkdown });
            } catch (error: any) {
                console.error("[News Summary Error]", error);
                res.status(500).json({ error: error.message || 'Failed to summarize article' });
            }
        });
        // AI Browser Search Endpoint
        this.app.post('/api/apps/browser-search', async (req, res) => {
            try {
                const { query, engines } = req.body;
                if (!query || !engines || !Array.isArray(engines) || engines.length === 0) {
                    return res.status(400).json({ error: 'Query and an array of engines are required.' });
                }

                // 1. We mock querying different engines (since standard Google/Bing block raw scraping without API keys).
                // We'll use rss-parser for Google News as a proxy to get real results, 
                // and supplement by directly using the LLM's built-in knowledge to simulate "Bing" and "DuckDuckGo" results for the sake of the demo,
                // merging them together to demonstrate the AI combining sources constraint.

                let rawResults = [];

                if (engines.includes('Google')) {
                    try {
                        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
                        const Parser = require('rss-parser');
                        const parser = new Parser();
                        const feed = await parser.parseURL(rssUrl);
                        const googleHits = feed.items.slice(0, 3).map((i: any) => `- [Google] ${i.title} (${i.link})`);
                        rawResults.push(...googleHits);
                    } catch (e) {
                        console.error('Google search mock failed', e);
                    }
                }

                if (engines.includes('Bing') || engines.includes('DuckDuckGo')) {
                    // Since Bing/DDG don't have open RSS feeds for general search, we ask the LLM to generate plausible current context
                    // simulating a raw web hit for the query.
                    rawResults.push(`- [${engines.includes('Bing') ? 'Bing' : 'DuckDuckGo'}] Web results indicate various recent discussions and pages about "${query}".`);
                }

                if (rawResults.length === 0) {
                    rawResults.push(`- [System] No direct hits. LLM will rely on internal knowledge.`);
                }

                const sourcesText = rawResults.join('\n');

                // 2. Synthesize using LLM
                const synthPrompt = `You are an AI Search Browser assistant.
The user searched for: "${query}".

We queried the following selected search engines on their behalf. Here are the raw results/snippets:
${sourcesText}

Instructions:
1. Synthesize a comprehensive answer to the user's query merging the information above.
2. You MUST explicitly indicate the source of your information in your answer (e.g., "According to Google...", or "[Source: Bing]").
3. Format the final output clearly in Markdown.`;

                const result = await this.modelRouter.routeChat(
                    synthPrompt,
                    'cloud-preferred',
                    'Browser Search Synthesis',
                    new AbortController().signal
                );

                res.json({ result: result.response });

            } catch (error: any) {
                console.error("[Browser AI Search Error]", error);
                res.status(500).json({ error: error.message || 'Failed to synthesize search' });
            }
        });

        // AI Generation Endpoints
        this.app.post('/api/ai/chat', async (req, res) => {
            const abortController = new AbortController();
            req.on('close', () => {
                console.log('[Server] POST /api/ai/chat req.on("close") fired.');
                // abortController.abort();
            });

            try {
                const { prompt, sessionId = 'default-os-session', preferredProvider, model } = req.body;
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
                // Pass preferredProvider and the selected model explicitly to the router
                const result = await this.modelRouter.routeChat(promptData.prompt, preferredProvider, model, abortController.signal);

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

        this.app.get('/api/proxy/image', async (req, res) => {
            const url = req.query.url as string;
            if (!url) return res.status(400).send('URL required');
            try {
                // Fetch the image from the remote origin server side
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                const buffer = await response.arrayBuffer();

                // Allow the frontend canvas to read this
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
                res.send(Buffer.from(buffer));
            } catch (err: any) {
                res.status(500).send('Proxy error: ' + err.message);
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

        this.app.get('/api/kernel/status/:jobId', (req, res) => {
            const state = this.scheduler.getJobStatus(req.params.jobId);
            if (!state) return res.status(404).json({ error: 'Job not found' });
            res.json(state);
        });

        this.app.post('/api/kernel/analyze', async (req, res) => {
            try {
                const { prompt } = req.body;
                if (!prompt) return res.status(400).json({ error: 'Prompt required' });

                const analysis = await this.taskAnalyzer.analyzeTask(prompt);
                res.json(analysis);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ── Task Chain Decomposition ──────────────────────────
        this.app.post('/api/task-chain/decompose', async (req, res) => {
            try {
                const { goal } = req.body;
                if (!goal) return res.status(400).json({ error: 'goal is required' });

                // Fetch installed skills for context
                const activeSkills = this.skillLoader.loadSkills();
                const skillList = activeSkills.map((s: any) => `- "${s.name}": ${s.description || 'No description'}`).join('\n');

                const systemPrompt = `You are a task decomposition engine. Given a high-level goal, break it down into smaller prerequisite conditions and actionable steps using top-down reasoning. Start from the GOAL and work backwards to determine what conditions must be met.

The user has the following skills/tools installed:
${skillList || '(none)'}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "nodes": [
    { "id": "goal_1", "label": "The final goal", "type": "goal" },
    { "id": "cond_1", "label": "A prerequisite condition", "type": "condition" },
    { "id": "act_1", "label": "A concrete action step", "type": "action", "skill": "skill-name" }
  ],
  "edges": [
    { "from": "act_1", "to": "cond_1" },
    { "from": "cond_1", "to": "goal_1" }
  ]
}

Rules:
- There should be exactly ONE node with type "goal" (the final target).
- "condition" nodes are intermediate prerequisites that must be satisfied.
- "action" nodes are leaf-level concrete steps the user needs to take.
- Edges flow FROM prerequisites TO the things they enable (action → condition → goal).
- Use 4-8 total nodes for a reasonable decomposition. Do not over-decompose.
- IDs must be unique strings like goal_1, cond_1, cond_2, act_1, act_2, etc.
- Labels should be concise (under 60 characters).
- If an action node can be fulfilled by one of the installed skills, set the "skill" field to the exact skill name. Otherwise omit the "skill" field.
- Only assign skills that genuinely match the action. Do not force skill assignments.`;

                const userPrompt = `Decompose this goal: "${goal}"`;

                const result = await this.modelRouter.routeChat(
                    `${systemPrompt}\n\n${userPrompt}`,
                    'cloud'
                );

                const responseText = result.response || '';

                // Extract JSON from the response
                let parsed: any;
                try {
                    // Try direct parse first
                    parsed = JSON.parse(responseText);
                } catch {
                    // Try extracting JSON from markdown code blocks
                    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (jsonMatch) {
                        parsed = JSON.parse(jsonMatch[1].trim());
                    } else {
                        // Try finding raw JSON object
                        const braceMatch = responseText.match(/\{[\s\S]*\}/);
                        if (braceMatch) {
                            parsed = JSON.parse(braceMatch[0]);
                        } else {
                            throw new Error('Could not extract JSON from LLM response');
                        }
                    }
                }

                if (!parsed.nodes || !parsed.edges) {
                    throw new Error('Invalid decomposition structure: missing nodes or edges');
                }

                res.json(parsed);
            } catch (error: any) {
                console.error('[TaskChain] Decomposition error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ── Task Chain Step Executor ─────────────────────────────
        this.app.post('/api/task-chain/run-step', async (req, res) => {
            try {
                const { nodeId, nodeLabel, nodeType, skill, previousOutput, chainGoal, accumulatedContext } = req.body;
                if (!nodeId || !nodeLabel || !nodeType) {
                    return res.status(400).json({ error: 'nodeId, nodeLabel, and nodeType are required' });
                }

                // Build context header with goal
                const goalCtx = chainGoal ? `OVERALL GOAL: ${chainGoal}\n\n` : '';
                const prevCtx = accumulatedContext
                    ? `ACCUMULATED CONTEXT FROM PREVIOUS STEPS:\n${accumulatedContext}\n\n`
                    : (previousOutput ? `Previous step result:\n${previousOutput}\n\n` : '');

                if (nodeType === 'action') {
                    // Execute via skill or plain chat
                    if (skill) {
                        const allSkills = this.skillLoader.loadSkills();
                        const matched = allSkills.find((s: any) => s.name === skill || s.name.includes(skill));
                        if (matched) {
                            const taskPrompt = chainGoal
                                ? `${goalCtx}${prevCtx}Now execute this specific step: ${nodeLabel}\n\nIMPORTANT: Focus your output on information relevant to the overall goal.`
                                : nodeLabel;
                            const result = await this.executeSkill(matched.instructions || matched.description || '', taskPrompt, 'cloud', null, matched.name);
                            // Summarize for downstream context
                            const summaryPrompt = `Given this task output, provide a 2-3 sentence summary of the key findings relevant to the goal "${chainGoal || nodeLabel}":\n\n${(result.response || '').substring(0, 2000)}`;
                            const summaryResult = await this.modelRouter.routeChat(summaryPrompt, 'cloud');
                            return res.json({
                                output: result.response,
                                summary: summaryResult.response || result.response.substring(0, 300),
                                executionLog: result.executionLog,
                                status: 'done',
                            });
                        }
                    }
                    // Fallback to llm-chat
                    const prompt = `${goalCtx}${prevCtx}Now execute this task: ${nodeLabel}\n\nIMPORTANT: Focus your output on information relevant to the overall goal. At the end, provide a brief summary of your key findings.`;
                    const result = await this.modelRouter.routeChat(prompt, 'cloud');
                    // Extract or generate a short summary
                    const summaryPrompt = `Given this task output, provide a 2-3 sentence summary of the key findings relevant to the goal "${chainGoal || nodeLabel}":\n\n${(result.response || '').substring(0, 2000)}`;
                    const summaryResult = await this.modelRouter.routeChat(summaryPrompt, 'cloud');
                    return res.json({
                        output: result.response,
                        summary: summaryResult.response || result.response.substring(0, 300),
                        executionLog: [`[LLM Chat Fallback]\nPrompt: ${prompt.substring(0, 500)}\nResponse: ${result.response}`],
                        status: 'done',
                    });

                } else if (nodeType === 'condition') {
                    const inputData = accumulatedContext || previousOutput || '';
                    const checkPrompt = inputData
                        ? `You are a condition evaluator.${chainGoal ? ` The overall goal is: "${chainGoal}".` : ''}\n\nGiven the following accumulated data:\n---\n${inputData}\n---\nDoes this data satisfy the condition: "${nodeLabel}"?\n\nRespond with exactly "YES" or "NO" on the first line, then a one-line explanation. Do NOT summarize or restate the input data.`
                        : `You are a condition evaluator. Has this condition been met: "${nodeLabel}"?\nRespond with exactly "YES" or "NO" on the first line, then a one-line explanation.`;

                    const result = await this.modelRouter.routeChat(checkPrompt, 'cloud');
                    const text = result.response || '';
                    const firstLine = text.split('\n')[0].toUpperCase().trim();
                    const passed = firstLine.includes('YES');
                    return res.json({
                        output: text,
                        passed,
                        passthrough: passed ? inputData : undefined,
                        executionLog: [`[Condition Check]\nPrompt: ${checkPrompt.substring(0, 500)}\nResult: ${passed ? 'PASSED' : 'FAILED'}\nResponse: ${text}`],
                        status: 'done',
                    });

                } else if (nodeType === 'goal') {
                    const inputData = accumulatedContext || previousOutput || '';
                    const checkPrompt = inputData
                        ? `You are a goal evaluator. Given the following accumulated results from all previous steps:\n---\n${inputData}\n---\nDoes it satisfy this goal: "${nodeLabel}"?\n\nRespond in this exact format:\nLine 1: exactly "YES" or "NO"\nLine 2+: If YES, provide a comprehensive final answer that combines all the relevant data to fulfill the goal "${nodeLabel}". If NO, explain what is missing.`
                        : `You are a goal evaluator. Has this goal been achieved: "${nodeLabel}"?\nRespond with exactly "YES" or "NO" on the first line, then explain.`;

                    const result = await this.modelRouter.routeChat(checkPrompt, 'cloud');
                    const text = result.response || '';
                    const firstLine = text.split('\n')[0].toUpperCase().trim();
                    const passed = firstLine.includes('YES');
                    return res.json({
                        output: text,
                        passed,
                        executionLog: [`[Goal Check]\nPrompt: ${checkPrompt.substring(0, 500)}\nResult: ${passed ? 'PASSED' : 'FAILED'}\nResponse: ${text}`],
                        status: 'done',
                    });
                }

                res.status(400).json({ error: `Unknown node type: ${nodeType}` });
            } catch (error: any) {
                console.error('[TaskChain] Step execution error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ── Task Chain Persistence ──────────────────────────────
        const taskChainsDir = path.join(this.fsManager.getRootDir(), 'task_chains');

        this.app.post('/api/task-chain/save', async (req, res) => {
            try {
                const { name, nodes, edges } = req.body;
                if (!name || !nodes || !edges) return res.status(400).json({ error: 'name, nodes, and edges are required' });
                const sanitized = name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff\s]/g, '').trim();
                if (!sanitized) return res.status(400).json({ error: 'Invalid chain name' });
                const chainDir = path.join(taskChainsDir, sanitized);
                await fs.ensureDir(chainDir);
                await fs.writeFile(path.join(chainDir, 'chain.json'), JSON.stringify({ name: sanitized, nodes, edges }, null, 2));
                console.log(`[TaskChain] Saved chain "${sanitized}" to ${chainDir}`);
                res.json({ success: true, name: sanitized });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/task-chain/log', async (req, res) => {
            try {
                const { name, log, status } = req.body;
                if (!name || !log) return res.status(400).json({ error: 'name and log are required' });
                const chainDir = path.join(taskChainsDir, name);
                await fs.ensureDir(chainDir);
                const logPath = path.join(chainDir, 'experience.log');
                const timestamp = new Date().toISOString();
                await fs.appendFile(logPath, `\n[${timestamp}]\n${log}\n`);

                // Persist structured run record to runs.json
                if (status) {
                    const runsPath = path.join(chainDir, 'runs.json');
                    let runs: any[] = [];
                    if (await fs.pathExists(runsPath)) {
                        try { runs = await fs.readJson(runsPath); } catch { runs = []; }
                    }
                    // Build a short summary from the first few lines or error
                    const lines = log.split('\n').filter((l: string) => l.trim());
                    const summaryLine = status === 'failed'
                        ? (lines.find((l: string) => /error|fail|stopped/i.test(l)) || lines[lines.length - 1] || '')
                        : (lines[lines.length - 1] || '');
                    runs.push({
                        id: `run_${Date.now()}`,
                        timestamp,
                        status,  // 'success' | 'failed' | 'stopped'
                        summary: summaryLine.substring(0, 200),
                        log,
                    });
                    await fs.writeFile(runsPath, JSON.stringify(runs, null, 2));
                }

                res.json({ success: true });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/task-chain/list', async (_req, res) => {
            try {
                await fs.ensureDir(taskChainsDir);
                const dirs = await fs.readdir(taskChainsDir);
                const chains: string[] = [];
                for (const d of dirs) {
                    const stat = await fs.stat(path.join(taskChainsDir, d));
                    if (stat.isDirectory()) chains.push(d);
                }
                res.json({ chains });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/task-chain/load/:name', async (req, res) => {
            try {
                const chainDir = path.join(taskChainsDir, req.params.name);
                const chainPath = path.join(chainDir, 'chain.json');
                if (!await fs.pathExists(chainPath)) return res.status(404).json({ error: 'Chain not found' });
                const chain = JSON.parse(await fs.readFile(chainPath, 'utf-8'));
                let experience = '';
                const logPath = path.join(chainDir, 'experience.log');
                if (await fs.pathExists(logPath)) {
                    experience = await fs.readFile(logPath, 'utf-8');
                }
                let runs: any[] = [];
                const runsPath = path.join(chainDir, 'runs.json');
                if (await fs.pathExists(runsPath)) {
                    try { runs = await fs.readJson(runsPath); } catch { runs = []; }
                }
                res.json({ chain, experience, runs });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/task-chain/runs/:name', async (req, res) => {
            try {
                const chainDir = path.join(taskChainsDir, req.params.name);
                const runsPath = path.join(chainDir, 'runs.json');
                let runs: any[] = [];
                if (await fs.pathExists(runsPath)) {
                    try { runs = await fs.readJson(runsPath); } catch { runs = []; }
                }
                res.json({ runs });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/task-chain/learn', async (_req, res) => {
            try {
                await fs.ensureDir(taskChainsDir);
                const dirs = await fs.readdir(taskChainsDir);
                const allLogs: string[] = [];

                for (const d of dirs) {
                    const logPath = path.join(taskChainsDir, d, 'experience.log');
                    if (await fs.pathExists(logPath)) {
                        const content = await fs.readFile(logPath, 'utf-8');
                        if (content.trim()) {
                            allLogs.push(`=== Chain: ${d} ===\n${content.trim()}`);
                        }
                    }
                }

                if (allLogs.length === 0) {
                    return res.json({ summary: 'No experience logs found. Run some task chains first.', saved: false });
                }

                const combinedLogs = allLogs.join('\n\n').substring(0, 30000); // Cap at 30k chars

                // Read existing experience to preserve prior learnings
                const systemDir = path.join(this.fsManager.getRootDir(), 'system');
                await fs.ensureDir(systemDir);
                const experiencePath = path.join(systemDir, 'experience.md');
                let existingExperience = '';
                if (await fs.pathExists(experiencePath)) {
                    existingExperience = await fs.readFile(experiencePath, 'utf-8');
                }

                const priorKnowledge = existingExperience
                    ? `\n\nPRIOR LEARNED KNOWLEDGE (preserve and build upon this):\n---\n${existingExperience.substring(0, 10000)}\n---\n`
                    : '';

                const prompt = `You are an AI system learning from execution logs. Analyze the following task chain execution logs and extract:

1. **Common Problems** — What errors or failures occurred frequently? What commands failed?
2. **Solutions Found** — What workarounds or fixes resolved issues?
3. **Execution Patterns** — What approaches worked reliably?
4. **Improvement Suggestions** — How can future executions be more reliable?
${priorKnowledge}
IMPORTANT: If prior learned knowledge exists above, you MUST preserve all previously learned insights and merge them with any new findings from the logs below. Do NOT discard old knowledge — expand and refine it.

Format your response as a well-organized Markdown document with clear sections.

---
NEW EXECUTION LOGS:
${combinedLogs}
---

Produce a concise, actionable summary that combines prior knowledge with new learnings.`;

                const result = await this.modelRouter.routeChat(prompt, 'cloud');
                const summary = result.response || '';

                // Save to system experience file (systemDir and experiencePath already declared above)
                const timestamp = new Date().toISOString();
                const header = `# System Experience Summary\n_Last updated: ${timestamp}_\n_Analyzed ${allLogs.length} chain logs_\n\n`;
                await fs.writeFile(experiencePath, header + summary);
                console.log(`[TaskChain] Auto-learning summary saved to ${experiencePath}`);

                res.json({ summary: header + summary, saved: true });
            } catch (error: any) {
                console.error('[TaskChain] Learn error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/task-chain/experience', async (_req, res) => {
            try {
                const experiencePath = path.join(this.fsManager.getRootDir(), 'system', 'experience.md');
                if (await fs.pathExists(experiencePath)) {
                    const content = await fs.readFile(experiencePath, 'utf-8');
                    res.json({ experience: content });
                } else {
                    res.json({ experience: '' });
                }
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/task-chain/auto-improve', async (_req, res) => {
            try {
                const maxIterations = 3;
                const results: any[] = [];
                const improvedSkills = new Set<string>();

                // 1. Read system experience
                const experiencePath = path.join(this.fsManager.getRootDir(), 'system', 'experience.md');
                let systemExp = '';
                if (await fs.pathExists(experiencePath)) {
                    systemExp = await fs.readFile(experiencePath, 'utf-8');
                }

                // 2. Scan all chain logs for failures
                await fs.ensureDir(taskChainsDir);
                const dirs = await fs.readdir(taskChainsDir);
                interface FailedChain { name: string; chainData: any; log: string; skills: string[] }
                const failedChains: FailedChain[] = [];

                for (const d of dirs) {
                    const chainPath = path.join(taskChainsDir, d, 'chain.json');
                    const logPath = path.join(taskChainsDir, d, 'experience.log');
                    if (!(await fs.pathExists(chainPath)) || !(await fs.pathExists(logPath))) continue;

                    const log = await fs.readFile(logPath, 'utf-8');
                    const hasErrors = /error|fail|bash error|command not found|timeout|syntaxerror/i.test(log);
                    if (!hasErrors) continue;

                    const chainData = await fs.readJson(chainPath);
                    const skills: string[] = (chainData.nodes || [])
                        .filter((n: any) => n.skill)
                        .map((n: any) => String(n.skill));
                    const uniqueSkills: string[] = [...new Set(skills)];

                    failedChains.push({ name: d, chainData, log, skills: uniqueSkills });
                }

                if (failedChains.length === 0) {
                    return res.json({
                        iterations: 0, improved: [], results: [],
                        summary: 'No failed chains found. All chains are running successfully! 🎉',
                    });
                }

                console.log(`[AutoImprove] Found ${failedChains.length} chains with errors.`);

                // 3. Iterate improvements
                for (let iter = 1; iter <= maxIterations; iter++) {
                    console.log(`[AutoImprove] === Iteration ${iter} ===`);
                    let anyFailedThisRound = false;

                    for (const chain of failedChains) {
                        // Skip chains that already succeeded in previous iterations
                        const prevSuccess = results.find(r => r.chain === chain.name && r.status === 'success');
                        if (prevSuccess) continue;

                        // 3a. Improve each linked skill
                        for (const skillName of chain.skills) {
                            const allSkills = this.skillLoader.loadSkills();
                            const matched = allSkills.find((s: any) => s.name === skillName || s.name.includes(skillName));
                            if (!matched?.metadata?.skillDir) continue;

                            const skillMdPath = path.join(matched.metadata.skillDir, 'SKILL.md');
                            if (!(await fs.pathExists(skillMdPath))) continue;

                            const currentSkillMd = await fs.readFile(skillMdPath, 'utf-8');

                            const improvePrompt = `You are improving an OpenClaw skill definition to fix execution errors.

SYSTEM EXPERIENCE (known problems and solutions):
${systemExp.substring(0, 5000)}

EXECUTION ERRORS from chain "${chain.name}":
${chain.log.substring(0, 8000)}

CURRENT SKILL.MD:
\`\`\`
${currentSkillMd}
\`\`\`

Based on the errors above, rewrite the SKILL.md to fix the issues. Common fixes include:
- Adding timeout flags (--connect-timeout 5)
- Using more reliable API endpoints
- Adding fallback commands
- Fixing command syntax
- Adding error handling instructions

Return ONLY the complete updated SKILL.md content (including the YAML frontmatter). Do not wrap in code blocks.`;

                            const improveResult = await this.modelRouter.routeChat(improvePrompt, 'cloud');
                            let newContent = improveResult.response || '';

                            // Strip markdown code blocks if the LLM wrapped it
                            newContent = newContent.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();

                            if (newContent.length > 50 && newContent.includes('---')) {
                                await fs.writeFile(skillMdPath, newContent + '\n');
                                improvedSkills.add(skillName);
                                console.log(`[AutoImprove] Improved SKILL.md for ${skillName}`);

                                // Force skill cache reload
                                this.skillLoader.loadSkills(true);
                            }
                        }

                        // 3b. Re-run the chain's action nodes to verify
                        const actionNodes = (chain.chainData.nodes || []).filter((n: any) => n.type === 'action');
                        let chainSuccess = true;
                        const runLog: string[] = [`[AutoImprove] Iteration ${iter} - Re-running chain "${chain.name}"`];

                        for (const node of actionNodes) {
                            try {
                                if (node.skill) {
                                    const allSkills = this.skillLoader.loadSkills();
                                    const matched = allSkills.find((s: any) => s.name === node.skill || s.name.includes(node.skill));
                                    if (matched) {
                                        const result = await this.executeSkill(
                                            matched.instructions || matched.description || '',
                                            node.label, 'cloud', null, matched.name
                                        );
                                        runLog.push(`[ACTION OK] ${node.label}: ${result.response.substring(0, 200)}`);
                                        if (result.executionLog) {
                                            result.executionLog.forEach(entry => {
                                                if (/error|fail/i.test(entry)) {
                                                    chainSuccess = false;
                                                }
                                            });
                                        }
                                        continue;
                                    }
                                }
                                // Plain chat fallback
                                const chatResult = await this.modelRouter.routeChat(`Execute: ${node.label}`, 'cloud');
                                runLog.push(`[ACTION OK] ${node.label}: ${chatResult.response.substring(0, 200)}`);
                            } catch (e: any) {
                                chainSuccess = false;
                                runLog.push(`[ACTION FAIL] ${node.label}: ${e.message}`);
                            }
                        }

                        results.push({
                            chain: chain.name,
                            iteration: iter,
                            status: chainSuccess ? 'success' : 'failed',
                            skills: chain.skills,
                            log: runLog.join('\n'),
                        });

                        // Append to chain's experience.log
                        const logPath = path.join(taskChainsDir, chain.name, 'experience.log');
                        await fs.appendFile(logPath, `\n\n--- Auto-Improve Iteration ${iter} (${new Date().toISOString()}) ---\n${runLog.join('\n')}\n`);

                        if (!chainSuccess) anyFailedThisRound = true;
                    }

                    if (!anyFailedThisRound) {
                        console.log(`[AutoImprove] All chains passed on iteration ${iter}!`);
                        break;
                    }
                }

                // 4. Generate summary
                const improved = [...improvedSkills];
                const totalIter = results.length > 0 ? Math.max(...results.map(r => r.iteration)) : 0;
                const successCount = new Set(results.filter(r => r.status === 'success').map(r => r.chain)).size;
                const summary = `Auto-improvement completed in ${totalIter} iteration(s).\n` +
                    `Improved ${improved.length} skill(s): ${improved.join(', ') || 'none'}\n` +
                    `${successCount}/${failedChains.length} failed chains now passing.\n` +
                    results.map(r => `- [${r.status.toUpperCase()}] "${r.chain}" (iter ${r.iteration})`).join('\n');

                // 5. Trigger a learn cycle to update system experience
                try {
                    const dirs2 = await fs.readdir(taskChainsDir);
                    const allLogs: string[] = [];
                    for (const d of dirs2) {
                        const lp = path.join(taskChainsDir, d, 'experience.log');
                        if (await fs.pathExists(lp)) {
                            const c = await fs.readFile(lp, 'utf-8');
                            if (c.trim()) allLogs.push(`=== Chain: ${d} ===\n${c.trim()}`);
                        }
                    }
                    if (allLogs.length > 0) {
                        const learnPrompt = `You are an AI system learning from execution logs. Summarize:\n1. Common Problems\n2. Solutions Found\n3. Execution Patterns\n4. Improvement Suggestions\n\nPRIOR KNOWLEDGE:\n${systemExp.substring(0, 8000)}\n\nNEW LOGS:\n${allLogs.join('\n\n').substring(0, 20000)}`;
                        const learnResult = await this.modelRouter.routeChat(learnPrompt, 'cloud');
                        const timestamp = new Date().toISOString();
                        await fs.writeFile(experiencePath, `# System Experience Summary\n_Last updated: ${timestamp}_\n_Post auto-improvement analysis_\n\n${learnResult.response}`);
                    }
                } catch { /* ignore learn errors */ }

                res.json({ iterations: totalIter, improved, results, summary });
            } catch (error: any) {
                console.error('[AutoImprove] Error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ── Task Chain Diagnose & Fix ───────────────────────────────
        this.app.post('/api/task-chain/diagnose', async (req, res) => {
            try {
                const { chainName, nodeId, nodes: chainNodes, edges: chainEdges, nodeOutputs } = req.body;
                if (!nodeId || !chainNodes) {
                    return res.status(400).json({ error: 'nodeId and nodes are required' });
                }

                const targetNode = chainNodes.find((n: any) => n.id === nodeId);
                if (!targetNode) return res.status(400).json({ error: 'Node not found' });

                // Read run history for context
                let runLogs = '';
                if (chainName) {
                    const runsPath = path.join(taskChainsDir, chainName, 'runs.json');
                    if (await fs.pathExists(runsPath)) {
                        try {
                            const runs = await fs.readJson(runsPath);
                            // Get the last 2 failed runs for context
                            const failedRuns = runs.filter((r: any) => r.status === 'failed').slice(-2);
                            runLogs = failedRuns.map((r: any) => `[Run ${r.timestamp} - ${r.status}]\n${r.log}`).join('\n\n---\n\n');
                        } catch { /* ignore */ }
                    }
                }

                // Build context about all nodes and their outputs
                const nodesContext = chainNodes.map((n: any) => {
                    const output = nodeOutputs?.[n.id];
                    const outputStr = output ? `\n  Output: ${output.output?.substring(0, 300) || '(none)'}\n  Status: ${output.status || 'unknown'}${output.passed !== undefined ? `\n  Passed: ${output.passed}` : ''}` : '\n  (not executed yet)';
                    return `- [${n.type.toUpperCase()}] "${n.label}" (id: ${n.id})${n.skill ? ` [skill: ${n.skill}]` : ''}${outputStr}`;
                }).join('\n');

                const edgesContext = chainEdges.map((e: any) => `  ${e.from} → ${e.to}`).join('\n');

                const diagPrompt = `You are a task chain debugger. Analyze a failing task chain and suggest concrete fixes.

CHAIN GRAPH:
Nodes:
${nodesContext}

Edges (from → to):
${edgesContext}

TARGET NODE (the user wants to fix):
ID: ${targetNode.id}
Label: "${targetNode.label}"
Type: ${targetNode.type}
${targetNode.skill ? `Skill: ${targetNode.skill}` : ''}

${runLogs ? `RECENT FAILED RUN LOGS:\n${runLogs.substring(0, 8000)}` : '(no run history available)'}

INSTRUCTIONS:
1. Analyze why this node (or nodes connected to it) is failing.
2. Consider the data flow between nodes — does the right data get passed downstream?
3. Look for issues like: missing context in prompts, disconnected data flow, overly strict conditions, wrong edge connections.
4. Suggest specific fixes.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation outside the JSON):
{
  "diagnosis": "A clear explanation of the root cause in 1-3 sentences",
  "fixes": [
    { "type": "update_label", "nodeId": "id_here", "newLabel": "improved label/prompt" },
    { "type": "add_edge", "from": "node_id", "to": "node_id" },
    { "type": "remove_edge", "from": "node_id", "to": "node_id" }
  ]
}

Rules for fixes:
- "update_label": Change a node's label to be more specific. For action nodes, the label IS the prompt.
- "add_edge" / "remove_edge": Modify connections between nodes.
- Be conservative: suggest 1-3 fixes maximum.
- Fix the actual root cause, not symptoms.`;

                const result = await this.modelRouter.routeChat(diagPrompt, 'cloud');
                const responseText = result.response || '';

                let parsed: any;
                try {
                    parsed = JSON.parse(responseText);
                } catch {
                    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (jsonMatch) {
                        parsed = JSON.parse(jsonMatch[1].trim());
                    } else {
                        const braceMatch = responseText.match(/\{[\s\S]*\}/);
                        if (braceMatch) {
                            parsed = JSON.parse(braceMatch[0]);
                        } else {
                            throw new Error('Could not extract JSON from LLM diagnosis');
                        }
                    }
                }

                res.json(parsed);
            } catch (error: any) {
                console.error('[TaskChain] Diagnose error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // ── Departments ─────────────────────────────────────────────
        const departmentsFile = path.join(taskChainsDir, '..', 'departments.json');

        const loadDepts = async () => {
            if (await fs.pathExists(departmentsFile)) {
                return await fs.readJson(departmentsFile);
            }
            return { departments: [], activeDept: null };
        };
        const saveDepts = async (data: any) => {
            await fs.writeJson(departmentsFile, data, { spaces: 2 });
        };

        this.app.get('/api/departments', async (_req, res) => {
            try {
                const data = await loadDepts();
                // Also return available chains for the add-task dropdown
                const chains: string[] = [];
                if (await fs.pathExists(taskChainsDir)) {
                    const dirs = await fs.readdir(taskChainsDir);
                    for (const d of dirs) {
                        const chainFile = path.join(taskChainsDir, d, 'chain.json');
                        if (await fs.pathExists(chainFile)) chains.push(d);
                    }
                }
                res.json({ ...data, availableChains: chains });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/departments', async (req, res) => {
            try {
                const { action, id, name, task } = req.body;
                const data = await loadDepts();

                if (action === 'create') {
                    const newId = `dept-${Date.now()}`;
                    data.departments.push({ id: newId, name: name || 'New Department', tasks: [] });
                    if (!data.activeDept) data.activeDept = newId;
                    await saveDepts(data);
                    return res.json({ success: true, id: newId });
                }
                if (action === 'rename') {
                    const dept = data.departments.find((d: any) => d.id === id);
                    if (!dept) return res.status(404).json({ error: 'Department not found' });
                    dept.name = name;
                    await saveDepts(data);
                    return res.json({ success: true });
                }
                if (action === 'delete') {
                    data.departments = data.departments.filter((d: any) => d.id !== id);
                    if (data.activeDept === id) {
                        data.activeDept = data.departments.length > 0 ? data.departments[0].id : null;
                    }
                    await saveDepts(data);
                    return res.json({ success: true });
                }
                if (action === 'set-active') {
                    data.activeDept = id;
                    await saveDepts(data);
                    return res.json({ success: true });
                }
                if (action === 'add-task') {
                    const dept = data.departments.find((d: any) => d.id === id);
                    if (!dept) return res.status(404).json({ error: 'Department not found' });
                    if (!dept.tasks.includes(task)) dept.tasks.push(task);
                    await saveDepts(data);
                    return res.json({ success: true });
                }
                if (action === 'remove-task') {
                    const dept = data.departments.find((d: any) => d.id === id);
                    if (!dept) return res.status(404).json({ error: 'Department not found' });
                    dept.tasks = dept.tasks.filter((t: string) => t !== task);
                    await saveDepts(data);
                    return res.json({ success: true });
                }
                res.status(400).json({ error: `Unknown action: ${action}` });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ── Company Organization Graph ──────────────────────────────
        const companyFile = path.join(taskChainsDir, '..', 'company.json');

        const loadCompany = async () => {
            if (await fs.pathExists(companyFile)) return await fs.readJson(companyFile);
            return { departments: [], links: [] };
        };
        const saveCompany = async (data: any) => {
            await fs.writeJson(companyFile, data, { spaces: 2 });
        };

        this.app.get('/api/company', async (_req, res) => {
            try {
                const data = await loadCompany();
                // Also return saved department names for linking
                const deptData = await loadDepts();
                res.json({ ...data, savedDepartments: (deptData.departments || []).map((d: any) => d.name) });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/company', async (req, res) => {
            try {
                const { action, id, name, x, y, from, to, label } = req.body;
                const data = await loadCompany();

                if (action === 'add-dept') {
                    const newId = `org-${Date.now()}`;
                    data.departments.push({ id: newId, name: name || 'New Department', x: x || 300, y: y || 200 });
                    await saveCompany(data);
                    return res.json({ success: true, id: newId });
                }
                if (action === 'rename-dept') {
                    const dept = data.departments.find((d: any) => d.id === id);
                    if (!dept) return res.status(404).json({ error: 'Not found' });
                    dept.name = name;
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                if (action === 'remove-dept') {
                    data.departments = data.departments.filter((d: any) => d.id !== id);
                    data.links = data.links.filter((l: any) => l.from !== id && l.to !== id);
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                if (action === 'move-dept') {
                    const dept = data.departments.find((d: any) => d.id === id);
                    if (!dept) return res.status(404).json({ error: 'Not found' });
                    dept.x = x; dept.y = y;
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                if (action === 'add-link') {
                    const exists = data.links.some((l: any) =>
                        (l.from === from && l.to === to) || (l.from === to && l.to === from)
                    );
                    if (!exists) {
                        data.links.push({ from, to, label: label || '' });
                    }
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                if (action === 'remove-link') {
                    data.links = data.links.filter((l: any) => !(l.from === from && l.to === to));
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                if (action === 'update-link-label') {
                    const link = data.links.find((l: any) => l.from === from && l.to === to);
                    if (link) link.label = label;
                    await saveCompany(data);
                    return res.json({ success: true });
                }
                res.status(400).json({ error: `Unknown action: ${action}` });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
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
                        { title: `Search Result for: ${query} `, snippet: `This is a simulated search result containing information about ${query}.`, url: 'https://example.com' },
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
                const fetchUrl = uri.includes('key=') ? uri : `${uri}& key=${googleKey} `;
                console.log(`[Media Proxy]Requesting: ${uri.split('?')[0]} `);

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
                    console.log(`[Media Proxy] Response status: ${response.status}, Content - Type: ${contentType}, Content - Length: ${response.headers['content-length']} `);

                    if (contentType.includes('text/html') || contentType.includes('application/json')) {
                        const textData = Buffer.from(response.data).toString('utf-8');
                        console.error(`[Media Proxy] Expected video but got text: `, textData.substring(0, 500));
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
                        console.error(`[Media Proxy]Status: ${e.response.status} `);
                        console.error(`[Media Proxy]Body: `, Buffer.from(e.response.data || '').toString('utf-8').substring(0, 500));
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
                        res.write(`data: ${JSON.stringify(ev)} \n\n`);
                    }
                    if (existing.status !== 'running') {
                        res.end();
                        return;
                    }
                }
            }

            const handler = (ev: ExecutionEvent) => {
                if (ev.run_id !== runId) return;
                res.write(`data: ${JSON.stringify(ev)} \n\n`);
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

        this.app.post('/api/kernel/abort/:jobId', async (req, res) => {
            try {
                const success = await this.scheduler.abortJob(req.params.jobId);
                if (success) {
                    res.json({ success: true, message: 'Job aborted successfully' });
                } else {
                    res.status(404).json({ error: 'Job not found or not running' });
                }
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ───────────────────────────────────────────────────────────────────────

        // ── Budget & Semantic Cache (Phase 2) ─────────────────────────────────

        this.app.get('/api/budget', (_req, res) => {
            res.json(currentBudget);
        });

        this.app.post('/api/budget', async (req, res) => {
            currentBudget = { ...currentBudget, ...req.body };

            // Save to disk
            try {
                const stateDir = path.join(this.fsManager.getSystemDir(), '.laomos_state');
                await fs.ensureDir(stateDir);
                await fs.writeFile(path.join(stateDir, 'budget.json'), JSON.stringify(currentBudget, null, 2));
            } catch (err) {
                console.error('[Server] Failed to save budget:', err);
                return res.status(500).json({ error: 'Failed to save budget settings' });
            }

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
                const { provider, key } = req.body;
                if (!provider) return res.status(400).json({ error: 'Provider required' });

                const isValid = await this.externalApiManager.verifyKey(provider, key);
                res.json({ valid: isValid });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // ── Calendar endpoints ─────────────────────────────────────
        this.app.get('/api/calendar/jobs', (req, res) => {
            try {
                const jobs = this.calendarManager.getAllJobs();
                res.json({ jobs });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/calendar/jobs', async (req, res) => {
            try {
                const { type, targetId, inputPayload, scheduledTime } = req.body;
                if (!type || !targetId || !scheduledTime) {
                    return res.status(400).json({ error: 'type, targetId, and scheduledTime are required.' });
                }

                const parsedTime = new Date(scheduledTime).getTime();
                if (isNaN(parsedTime)) {
                    return res.status(400).json({ error: 'Invalid scheduledTime format.' });
                }

                const job = await this.calendarManager.addJob(type, targetId, inputPayload, parsedTime);
                res.json({ success: true, job });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/calendar/jobs/:id', async (req, res) => {
            try {
                const deleted = await this.calendarManager.deleteJob(req.params.id);
                if (deleted) res.json({ success: true });
                else res.status(404).json({ error: 'Job not found' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // SPA fallback — serve React index.html for any non-API route
        // Express 5 requires named wildcard: /{*path} instead of *
        const appRoot2 = process.env.APP_ROOT || process.cwd();
        this.app.get('/{*path}', (req, res, next) => {
            if (req.path.startsWith('/api/')) return next();
            const indexPath = path.join(appRoot2, 'dist-renderer', 'index.html');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    res.sendFile(path.join(appRoot2, 'public', 'index.html'));
                }
            });
        });
    }

    public async executeSkill(skillContext: string, userInput: string, modelPreference: string = 'cloud', controller: AbortController | null = null, skillName?: string): Promise<{ response: string; levelUsed: string; providerUsed: string; executionLog: string[] }> {
        // ── Resolve skill metadata & build universal runtime ─────────
        let skillDir = this.fsManager.getRootDir();
        let runtimeBlock = '';
        let matchedSkill: any = null;

        // Try to find the matching skill for richer context
        if (skillName) {
            const allSkills = this.skillLoader.loadSkills();
            matchedSkill = allSkills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
        }

        if (matchedSkill?.runtime) {
            // Use pre-built runtime from skill loader
            skillDir = matchedSkill.runtime.skillDir;
            runtimeBlock = this.skillLoader.formatRuntimeContext(matchedSkill.runtime);
        } else if (matchedSkill?.metadata?.skillDir) {
            // Fallback: build runtime on the fly
            skillDir = matchedSkill.metadata.skillDir;
            const runtime = this.skillLoader.buildRuntime(skillDir, skillContext, matchedSkill.metadata || {});
            runtimeBlock = this.skillLoader.formatRuntimeContext(runtime);
        }

        const laomosBinDir = path.join(os.homedir(), '.laomos', 'bin');
        const systemInstruction = `<Register_SystemPrompt>
You are an advanced OpenClaw AI agent running inside the AiOS environment on the user's local machine.
You have been granted access to the following skill:
${skillContext}
${runtimeBlock ? '\n--- RUNTIME ENVIRONMENT ---\n' + runtimeBlock : ''}

EXECUTION RULES:
1. Use the EXACT commands shown in the "Available Scripts", "Example Commands", or "Usage" sections above.
2. If a binary is marked ✓, it is installed and ready to use. If marked ✗, it is NOT installed.
3. The working directory for bash commands is: ${skillDir}
4. Follow the skill documentation closely — it tells you the correct commands and arguments.

To execute commands, use these XML tools (do NOT wrap in markdown code blocks):

1. Execute a shell command:
<bash>
your command here
</bash>

2. Read a file:
<read_file>
/path/to/file
</read_file>

3. Save a file:
<save_file path="filename.ext">
content
</save_file>

When you output a <bash> or <read_file> tag, the system executes it and returns results.
You can use tools multiple times. When done, provide a final summary without tool tags.
</Register_SystemPrompt>`;

        let messages: any[] = [
            { role: 'user', content: `${systemInstruction}\nUser Input: ${userInput}` }
        ];

        let finalResponse = '';
        let iterations = 0;
        const maxIterations = 20;
        let levelUsed = '1';
        let providerUsed = 'local';
        const executionLog: string[] = [];

        const execAsync = util.promisify(require('child_process').exec);

        // Build an enhanced PATH that includes ~/.laomos/bin and brew paths
        const enhancedPath = `${laomosBinDir}${path.delimiter}/opt/homebrew/bin${path.delimiter}/usr/local/bin${path.delimiter}${process.env.PATH}`;

        while (iterations < maxIterations) {
            if (controller?.signal.aborted) {
                console.log(`[Skill Execution] Loop aborted by user.`);
                executionLog.push('[ABORTED] Skill execution was cancelled by the user.');
                return { response: "Skill execution was cancelled by the user.", levelUsed, providerUsed, executionLog };
            }

            iterations++;
            console.log(`[Skill Execution] Loop Iteration ${iterations}...`);

            const chatString = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
            const result = await this.modelRouter.routeChat(chatString, modelPreference, 'Skill Execution');
            const aiMessage = result.response;
            levelUsed = result.level;
            providerUsed = result.providerUsed;

            messages.push({ role: 'assistant', content: aiMessage });
            console.log(`\n\n[Skill Execution] ========== AI RESPONSE START ==========\n${aiMessage}\n========== AI RESPONSE END ==========\n\n`);
            executionLog.push(`[LLM Response #${iterations}]\n${aiMessage}`);

            let requiresNextTurn = false;
            let nextUserMessage = '';

            // 1. Process <bash> tools
            const bashRegex = /<bash>([\s\S]*?)<\/bash>/g;
            let bashMatch;
            while ((bashMatch = bashRegex.exec(aiMessage)) !== null) {
                const command = bashMatch[1].trim();
                try {
                    console.log(`[Skill Execution] Executing bash: ${command}`);
                    const shellCmd = `/bin/zsh -l -c ${JSON.stringify(command)}`;
                    const execOpts: any = {
                        cwd: skillDir,
                        timeout: 120000,
                        env: { ...process.env, PATH: enhancedPath },
                    };
                    if (controller) { execOpts.signal = controller.signal; }
                    const { stdout, stderr } = await execAsync(shellCmd, execOpts);
                    const output = (stdout || '') + (stderr || '');
                    nextUserMessage += `\n[Result of bash command: ${command}]\n${output.substring(0, 4000)}\n`;
                    executionLog.push(`[BASH] $ ${command}\n${output.substring(0, 4000)}`);
                } catch (error: any) {
                    if (error.name === 'AbortError') throw error;
                    console.error(`[Skill Execution] Bash error:`, error.message);
                    nextUserMessage += `\n[Error executing bash command: ${command}]\n${error.message}\n`;
                    executionLog.push(`[BASH ERROR] $ ${command}\n${error.message}`);
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
                    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(skillDir, filePath);
                    const content = require('fs').readFileSync(resolvedPath, 'utf8');
                    nextUserMessage += `\n[Content of file: ${filePath}]\n${content.substring(0, 8000)}\n`;
                    executionLog.push(`[READ FILE] ${filePath}\n${content.substring(0, 2000)}`);
                } catch (error: any) {
                    console.error(`[Skill Execution] Read file error:`, error.message);
                    nextUserMessage += `\n[Error reading file: ${filePath}]\n${error.message}\n`;
                }
                requiresNextTurn = true;
            }

            // 3. Process <save_file> tools
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
                finalResponse = finalResponseModified;
                break;
            }
        }

        if (iterations >= maxIterations) {
            finalResponse += "\n\n*(Note: Agent reached maximum iterations and stopped automatically)*";
        }

        return { response: finalResponse, levelUsed, providerUsed, executionLog };
    }

    public async start() {
        this.httpServer = this.app.listen(this.port, '127.0.0.1', () => {
            console.log(`[Server] Web Interface running at http://127.0.0.1:${this.port}`);
        });
        this.httpServer.on('error', (err: any) => {
            console.error('[Server] Error:', err.message);
        });

        await this.calendarManager.init();
        this.calendarManager.start();
    }
}
