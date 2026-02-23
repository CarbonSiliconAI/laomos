
import axios from 'axios';
import { exec, spawn } from 'child_process';
import util from 'util';
import os from 'os';

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
            // This is a basic attempt to start ollama. It assumes 'ollama' is in the PATH.
            // Using nohup to keep it running might be needed, or just spawning it.
            // For a simulation, we'll try a simple spawn.
            const { stdout, stderr } = await execAsync('ollama serve > /dev/null 2>&1 &');
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
        if (!await this.checkStatus()) {
            console.warn('[Ollama] Service not running. Cannot list models.');
            return [];
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
        if (!await this.checkStatus()) {
            throw new Error('Ollama service not running');
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
        if (!await this.checkStatus()) {
            throw new Error('Ollama service not running');
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
