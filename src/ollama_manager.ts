
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import os from 'os';
import path from 'path';

const execAsync = util.promisify(exec);

export class OllamaManager {
    private baseUrl: string = 'http://localhost:11434';

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
            let command = 'ollama serve > /dev/null 2>&1 &';

            if (os.platform() === 'win32') {
                // Windows: Use start /B to run in background without blocking, and throw output to NUL
                command = 'start /B ollama serve > NUL 2>&1';
                // Windows typically has Ollama in AppData\Local\Programs\Ollama
                const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
                const winOllamaPath = path.join(localAppData, 'Programs', 'Ollama');
                envPath = `${envPath};${winOllamaPath}`;
            } else {
                // macOS/Linux: append common brew/local paths
                envPath = `${envPath}:/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/bin:/usr/bin`;
            }

            const env = { ...process.env, PATH: envPath };
            const { stdout, stderr } = await execAsync(command, { env });
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

    async chat(model: string, messages: any[]): Promise<any> {
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
            });
            return response.data;
        } catch (error) {
            console.error('[Ollama] Error during chat:', error);
            throw error;
        }
    }

    async pullModel(model: string): Promise<any> {
        // We use axios to trigger the pull via API if possible, or exec CLI
        // Ollama API has a /api/pull endpoint
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
            const response = await axios.post(`${this.baseUrl}/api/pull`, {
                name: model,
                stream: false // For simplicity, wait for full pull (might timeout for large models)
            });
            return response.data;
        } catch (error) {
            console.error('[Ollama] Error pulling model:', error);
            throw error;
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
            recommendedModels = ['tinyllama', 'qwen:0.5b', 'gemma:2b'];
        } else if (totalMemGB < 16) {
            recommendedModels = ['llama3', 'mistral', 'gemma:7b'];
        } else {
            recommendedModels = ['llama3:70b', 'mixtral'];
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
