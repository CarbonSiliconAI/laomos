
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import os from 'os';
import path from 'path';

const execAsync = util.promisify(exec);

export class OllamaManager {
    private baseUrl: string = 'http://127.0.0.1:11434';

    async checkStatus(): Promise<boolean> {
        try {
            await axios.get(`${this.baseUrl}/`);
            return true;
        } catch (error) {
            return false;
        }
    }

    async ensureService(): Promise<void> {
        const isRunning = await this.checkStatus();
        if (isRunning) {
            console.log('[Ollama] Service is already running.');
            return;
        }

        console.log('[Ollama] Starting service...');
        try {
            // Include common brew/local bin paths in case the app doesn't inherit the full shell shell PATH
            let envPath = process.env.PATH || '';
            if (os.platform() === 'win32') {
                // Windows typically has Ollama in AppData\Local\Programs\Ollama
                const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
                const winOllamaPath = path.join(localAppData, 'Programs', 'Ollama');
                envPath = `${envPath};${winOllamaPath}`;
            } else {
                // macOS/Linux: append common brew/local paths
                envPath = `${envPath}:/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/bin:/usr/bin`;
            }

            const env = { ...process.env, PATH: envPath };

            let executable = 'ollama';
            let args = ['serve'];

            if (os.platform() === 'win32') {
                executable = 'cmd.exe';
                args = ['/c', 'start', '/B', 'ollama', 'serve'];
            }

            const child = spawn(executable, args, {
                env,
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
            });

            child.unref();
            // Give it a moment to potentially start
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (await this.checkStatus()) {
                console.log('[Ollama] Service started successfully.');
            } else {
                console.error('[Ollama] Failed to start service automatically. Please ensure "ollama" is installed and in your PATH.');
            }
        } catch (error) {
            console.error('[Ollama] Error starting service:', error);
        }
    }

    async listModels(): Promise<string[]> {
        let isRunning = await this.checkStatus();
        if (!isRunning) {
            console.warn('[Ollama] Service not running. Attempting to start...');
            await this.ensureService();
            isRunning = await this.checkStatus();
            if (!isRunning) {
                return [];
            }
        }

        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`);
            if (response.data && response.data.models) {
                return response.data.models.map((m: any) => m.name);
            }
            return [];
        } catch (error) {
            console.error('[Ollama] Error listing models:', error);
            return [];
        }
    }

    async chat(model: string, messages: any[], signal?: AbortSignal): Promise<any> {
        let isRunning = await this.checkStatus();
        if (!isRunning) {
            console.log('[Ollama] Service is not running. Attempting to start...');
            await this.ensureService();
            isRunning = await this.checkStatus();
            if (!isRunning) {
                throw new Error('Ollama service failed to start automatically.');
            }
        }

        try {
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                model: model,
                messages: messages,
                stream: false
            }, { signal });
            return response.data;
        } catch (error) {
            console.error('[Ollama] Error during chat:', error);
            throw error;
        }
    }

    async pullModel(model: string): Promise<any> {
        console.log(`[Ollama] Pulling model '${model}' via CLI...`);

        // Include common brew/local bin paths
        let envPath = process.env.PATH || '';
        if (os.platform() === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
            envPath = `${envPath};${path.join(localAppData, 'Programs', 'Ollama')}`;
        } else {
            envPath = `${envPath}:/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/bin:/usr/bin`;
        }

        try {
            const { stdout, stderr } = await execAsync(`ollama run ${model} --keepalive 1s <<< ""`, {
                env: { ...process.env, PATH: envPath },
                timeout: 600000 // 10 minute timeout for large model downloads
            });
            console.log(`[Ollama] Model '${model}' pulled successfully.`);
            return { status: 'success', model, log: (stdout || '') + (stderr || '') };
        } catch (error: any) {
            const msg = error.stderr || error.message;
            console.error('[Ollama] Error pulling model:', msg);
            throw new Error(`Ollama pull failed: ${msg}`);
        }
    }

    getSystemSpecs(): any {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const cpus = os.cpus();
        const platform = os.platform();

        // Simple recommendation logic
        const totalMemGB = Math.round(totalMem / (1024 * 1024 * 1024));
        let recommendedModels = [];

        if (totalMemGB < 8) {
            recommendedModels = ['qwen3.5:0.8b', 'phi4-mini', 'gemma3'];
        } else if (totalMemGB < 16) {
            recommendedModels = ['qwen3.5:4b', 'llama3.1', 'gemma3', 'deepseek-r1:8b'];
        } else {
            recommendedModels = ['qwen3.5:9b', 'llama4-scout', 'deepseek-r1:14b'];
        }

        return {
            totalMem: totalMemGB + ' GB',
            freeMem: Math.round(freeMem / (1024 * 1024 * 1024)) + ' GB',
            cpuModel: cpus[0].model,
            cpuCores: cpus.length,
            platform,
            recommendedModels
        };
    }
}
