import { ModelRouter } from './router';
import { TaskAnalyzer, AnalyzedTask } from './analyzer';
import { SkillLoader, OpenClawSkill } from './skill_loader';
import * as util from 'util';

export interface WADaemonLogEntry {
    timestamp: number;
    type: 'info' | 'match' | 'execute' | 'reply' | 'error';
    message: string;
}

export interface WADaemonChatMessage {
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

export class WhatsAppSkillDaemon {
    private modelRouter: ModelRouter;
    private taskAnalyzer: TaskAnalyzer;
    private skillLoader: SkillLoader;

    private running = false;
    private log: WADaemonLogEntry[] = [];
    private chatMessages: WADaemonChatMessage[] = [];
    private maxLogSize = 50;
    private storageRoot = '';
    private processing = false;

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

    start() {
        if (this.running) return;
        this.running = true;
        this.addLog('info', 'WhatsApp AI Skill Daemon started. Listening for messages...');
    }

    stop() {
        this.running = false;
        this.addLog('info', 'WhatsApp AI Skill Daemon stopped.');
    }

    isRunning(): boolean {
        return this.running;
    }

    isProcessing(): boolean {
        return this.processing;
    }

    getLog(): WADaemonLogEntry[] {
        return [...this.log];
    }

    getMessages(): WADaemonChatMessage[] {
        return [...this.chatMessages];
    }

    private addLog(type: WADaemonLogEntry['type'], message: string) {
        this.log.push({ timestamp: Date.now(), type, message });
        if (this.log.length > this.maxLogSize) this.log.shift();
        console.log(`[WhatsAppSkillDaemon] [${type}] ${message}`);
    }

    /**
     * Called by the frontend when a new WhatsApp message is detected in the webview.
     * Processes the message through the skill pipeline and returns a reply.
     */
    async processMessage(text: string, sender: string): Promise<string> {
        if (!this.running) {
            return '';
        }

        this.processing = true;
        this.addLog('info', `New message from ${sender}: "${text.substring(0, 80)}"`);

        // Track incoming message
        this.chatMessages.push({
            id: Date.now(),
            text,
            isSelf: false,
            date: Date.now(),
            sender
        });

        try {
            // Step 1: Analyze the task
            this.addLog('info', 'Analyzing task intent...');
            const analysis = await this.taskAnalyzer.analyzeTask(text);
            this.addLog('match', `Target: ${analysis.target}`);

            // Step 2: Find the best matching skill
            const skills = this.skillLoader.loadSkills();
            if (skills.length === 0) {
                const reply = 'No OpenClaw skills are installed. Please install skills from the ClawHub first.';
                this.trackReply(reply);
                this.processing = false;
                return reply;
            }

            const matchedSkill = await this.matchSkill(analysis, skills);
            if (!matchedSkill) {
                this.addLog('info', 'No specific skill matched. Using generic AI response.');
                const { response } = await this.modelRouter.routeChat(text, 'cloud');
                this.trackReply(response);
                this.processing = false;
                return response;
            }

            this.addLog('match', `Matched skill: ${matchedSkill.name}`);

            // Step 3: Execute the skill
            this.addLog('execute', `Executing skill "${matchedSkill.name}"...`);
            const result = await this.executeSkill(matchedSkill, text);
            this.addLog('execute', `Skill execution complete. Response length: ${result.length} chars.`);

            // Step 4: Track the reply
            this.trackReply(result);
            this.addLog('reply', 'Reply ready for WhatsApp.');
            this.processing = false;
            return result;

        } catch (err: any) {
            this.addLog('error', `Pipeline error: ${err.message}`);
            const errReply = `⚠️ Error processing your request: ${err.message}`;
            this.trackReply(errReply);
            this.processing = false;
            return errReply;
        }
    }

    private trackReply(text: string) {
        this.chatMessages.push({
            id: Date.now(),
            text,
            isSelf: true,
            date: Date.now(),
            sender: '🤖 AI Skills'
        });
    }

    private async matchSkill(analysis: AnalyzedTask, skills: OpenClawSkill[]): Promise<OpenClawSkill | null> {
        const skillList = skills.map(s => `- ${s.name}: ${s.description}`).join('\n');

        const prompt = `<Register_SystemPrompt>\n${SKILL_MATCHER_PROMPT}\n</Register_SystemPrompt>

Available Skills:
${skillList}

User's Request: "${analysis.target}"
Expected Output: "${analysis.expected_output}"`;

        try {
            const { response } = await this.modelRouter.routeChat(prompt, 'cloud', 'WA Skill Matcher');

            let cleaned = response.trim();
            if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
            else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();

            const parsed = JSON.parse(cleaned);
            if (parsed.skillName === 'none' || !parsed.skillName) return null;

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
            const result = await this.modelRouter.routeChat(chatString, 'cloud', 'WA Skill Execution');
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
                    const shellCmd = `/bin/zsh -l -c ${JSON.stringify(command)}`;
                    const { stdout, stderr } = await execAsync(shellCmd, { cwd: this.storageRoot });
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
}
