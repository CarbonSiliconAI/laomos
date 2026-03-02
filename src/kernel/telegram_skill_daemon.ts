import { ModelRouter } from './router';
import { TaskAnalyzer, AnalyzedTask } from './analyzer';
import { SkillLoader, OpenClawSkill } from './skill_loader';
import * as util from 'util';

export interface DaemonLogEntry {
    timestamp: number;
    type: 'info' | 'match' | 'execute' | 'reply' | 'error';
    message: string;
}

export interface DaemonChatMessage {
    id: number;
    text: string;
    isSelf: boolean;
    date: number;
    sender: string;
}

const SKILL_MATCHER_PROMPT = `
You are a skill-routing engine for an AI Operating System.
Given a user request and a list of available skills, pick the SINGLE best matching skill.

You MUST respond with purely valid JSON. Do NOT wrap it in markdown code blocks.
The JSON must have the following exact structure:
{
  "skillName": "exact name of the best matching skill, or 'none' if no skill matches",
  "reasoning": "one sentence explaining why this skill was chosen"
}
`.trim();

export class TelegramSkillDaemon {
    private modelRouter: ModelRouter;
    private taskAnalyzer: TaskAnalyzer;
    private skillLoader: SkillLoader;

    private running = false;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private token = '';
    private chatId = '';
    private offset: number | undefined;
    private log: DaemonLogEntry[] = [];
    private chatMessages: DaemonChatMessage[] = [];
    private maxLogSize = 50;
    private storageRoot = '';

    constructor(
        modelRouter: ModelRouter,
        taskAnalyzer: TaskAnalyzer,
        skillLoader: SkillLoader,
        storageRoot: string
    ) {
        this.modelRouter = modelRouter;
        this.taskAnalyzer = taskAnalyzer;
        this.skillLoader = skillLoader;
        this.storageRoot = storageRoot;
    }

    start(token: string, chatId: string) {
        if (this.running) return;
        this.token = token;
        this.chatId = chatId;
        this.running = true;
        this.addLog('info', `Daemon started. Listening to chat ${chatId}...`);
        this.poll();
    }

    stop() {
        this.running = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.addLog('info', 'Daemon stopped.');
    }

    isRunning(): boolean {
        return this.running;
    }

    getLog(): DaemonLogEntry[] {
        return [...this.log];
    }

    getMessages(): DaemonChatMessage[] {
        return [...this.chatMessages];
    }

    private addLog(type: DaemonLogEntry['type'], message: string) {
        this.log.push({ timestamp: Date.now(), type, message });
        if (this.log.length > this.maxLogSize) this.log.shift();
        console.log(`[TelegramSkillDaemon] [${type}] ${message}`);
    }

    private async poll() {
        if (!this.running) return;

        try {
            // 1. Fetch new messages from Telegram
            let url = `https://api.telegram.org/bot${this.token}/getUpdates?timeout=1`;
            if (this.offset !== undefined) url += `&offset=${this.offset}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.ok && data.result && data.result.length > 0) {
                for (const update of data.result) {
                    // Track offset
                    this.offset = update.update_id + 1;

                    // Only process text messages from the target chat
                    if (
                        update.message &&
                        update.message.text &&
                        String(update.message.chat.id) === String(this.chatId)
                    ) {
                        const incomingText = update.message.text;
                        const sender = update.message.from?.first_name || 'User';
                        this.addLog('info', `New message from ${sender}: "${incomingText.substring(0, 80)}..."`);

                        // Track incoming message for the chat UI
                        this.chatMessages.push({
                            id: update.message.message_id,
                            text: incomingText,
                            isSelf: false,
                            date: (update.message.date || Math.floor(Date.now() / 1000)) * 1000,
                            sender
                        });

                        // Process asynchronously so polling continues
                        this.processMessage(incomingText).catch(err => {
                            this.addLog('error', `Processing failed: ${err.message}`);
                        });
                    }
                }
            }
        } catch (err: any) {
            this.addLog('error', `Poll error: ${err.message}`);
        }

        // Schedule next poll
        if (this.running) {
            this.pollTimer = setTimeout(() => this.poll(), 3000);
        }
    }

    private async processMessage(userMessage: string) {
        try {
            // Step 1: Analyze the task
            this.addLog('info', 'Analyzing task intent...');
            const analysis = await this.taskAnalyzer.analyzeTask(userMessage);
            this.addLog('match', `Target: ${analysis.target}`);

            // Step 2: Find the best matching skill
            const skills = this.skillLoader.loadSkills();
            if (skills.length === 0) {
                await this.sendReply('No OpenClaw skills are installed. Please install skills from the App Store first.');
                return;
            }

            const matchedSkill = await this.matchSkill(analysis, skills);
            if (!matchedSkill) {
                // No skill matched — just do generic AI chat
                this.addLog('info', 'No specific skill matched. Using generic AI response.');
                const { response } = await this.modelRouter.routeChat(userMessage);
                await this.sendReply(response);
                return;
            }

            this.addLog('match', `Matched skill: ${matchedSkill.name}`);

            // Step 3: Execute the skill
            this.addLog('execute', `Executing skill "${matchedSkill.name}"...`);
            const result = await this.executeSkill(matchedSkill, userMessage);
            this.addLog('execute', `Skill execution complete. Response length: ${result.length} chars.`);

            // Step 4: Reply to Telegram
            await this.sendReply(result);
            this.addLog('reply', 'Reply sent to Telegram.');

        } catch (err: any) {
            this.addLog('error', `Pipeline error: ${err.message}`);
            try {
                await this.sendReply(`⚠️ Error processing your request: ${err.message}`);
            } catch (_) { /* ignore send failures */ }
        }
    }

    private async matchSkill(analysis: AnalyzedTask, skills: OpenClawSkill[]): Promise<OpenClawSkill | null> {
        const skillList = skills.map(s => `- ${s.name}: ${s.description}`).join('\n');

        const prompt = `<Register_SystemPrompt>\n${SKILL_MATCHER_PROMPT}\n</Register_SystemPrompt>

Available Skills:
${skillList}

User's Request: "${analysis.target}"
Expected Output: "${analysis.expected_output}"`;

        try {
            const { response } = await this.modelRouter.routeChat(prompt, 'cloud-preferred', 'Skill Matcher');

            let cleaned = response.trim();
            if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
            else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();

            const parsed = JSON.parse(cleaned);
            if (parsed.skillName === 'none' || !parsed.skillName) return null;

            // Find the skill by name (case-insensitive)
            const matched = skills.find(s => s.name.toLowerCase() === parsed.skillName.toLowerCase());
            if (matched) {
                this.addLog('match', `Reasoning: ${parsed.reasoning}`);
            }
            return matched || null;
        } catch (err: any) {
            this.addLog('error', `Skill matching failed: ${err.message}`);
            return null;
        }
    }

    private async executeSkill(skill: OpenClawSkill, userInput: string): Promise<string> {
        const systemInstruction = `<Register_SystemPrompt>
You are an advanced OpenClaw AI agent running inside the AiOS environment on the user's local machine.
You have been granted access to the following skills:
${skill.instructions}

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
        const execAsync = util.promisify(require('child_process').exec);

        while (iterations < maxIterations) {
            iterations++;

            const chatString = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\\n');
            const result = await this.modelRouter.routeChat(chatString);
            const aiMessage = result.response;

            messages.push({ role: 'assistant', content: aiMessage });

            let requiresNextTurn = false;
            let nextUserMessage = '';

            // Process <bash> tools
            const bashRegex = /<bash>([\s\S]*?)<\/bash>/g;
            let bashMatch;
            while ((bashMatch = bashRegex.exec(aiMessage)) !== null) {
                const command = bashMatch[1].trim();
                try {
                    this.addLog('execute', `Running: ${command.substring(0, 100)}`);
                    const { stdout, stderr } = await execAsync(command, { cwd: this.storageRoot });
                    const output = (stdout || '') + (stderr || '');
                    nextUserMessage += `\n[Result of bash command: ${command}]\n${output.substring(0, 4000)}\n`;
                } catch (error: any) {
                    nextUserMessage += `\n[Error executing bash command: ${command}]\n${error.message}\n`;
                }
                requiresNextTurn = true;
            }

            // Process <read_file> tools
            const readRegex = /<read_file>([\s\S]*?)<\/read_file>/g;
            let readMatch;
            while ((readMatch = readRegex.exec(aiMessage)) !== null) {
                const filePath = readMatch[1].trim();
                try {
                    const fs = require('fs');
                    const content = fs.readFileSync(filePath, 'utf8');
                    nextUserMessage += `\n[Contents of ${filePath}]\n${content.substring(0, 4000)}\n`;
                } catch (error: any) {
                    nextUserMessage += `\n[Error reading file: ${filePath}]\n${error.message}\n`;
                }
                requiresNextTurn = true;
            }

            // Process <save_file> tools
            const saveRegex = /<save_file\s+path="([^"]+)">([\s\S]*?)<\/save_file>/g;
            let saveMatch;
            while ((saveMatch = saveRegex.exec(aiMessage)) !== null) {
                const savePath = saveMatch[1].trim();
                const saveContent = saveMatch[2];
                try {
                    const fs = require('fs-extra');
                    const path = require('path');
                    const fullPath = path.resolve(this.storageRoot, 'personal', savePath);
                    fs.ensureDirSync(path.dirname(fullPath));
                    fs.writeFileSync(fullPath, saveContent);
                    nextUserMessage += `\n[File saved successfully: ${fullPath}]\n`;
                } catch (error: any) {
                    nextUserMessage += `\n[Error saving file: ${savePath}]\n${error.message}\n`;
                }
                requiresNextTurn = true;
            }

            if (requiresNextTurn) {
                messages.push({ role: 'user', content: nextUserMessage.trim() });
            } else {
                finalResponse = aiMessage;
                break;
            }
        }

        return finalResponse || 'Skill execution completed but produced no output.';
    }

    private async sendReply(text: string) {
        // Telegram has a 4096 char limit per message
        const maxLen = 4000;
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += maxLen) {
            chunks.push(text.substring(i, i + maxLen));
        }

        for (const chunk of chunks) {
            await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: chunk
                })
            });
        }

        // Track outgoing message for the chat UI
        this.chatMessages.push({
            id: Date.now(),
            text,
            isSelf: true,
            date: Date.now(),
            sender: '🤖 AI Skills'
        });
    }
}
