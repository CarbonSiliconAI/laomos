import axios from 'axios';
import { LLMMessage, ModelProvider, ProviderOptions } from './base';
import { OllamaManager } from '../../ollama_manager';

export class OllamaProvider implements ModelProvider {
    public id = 'ollama';
    private manager: OllamaManager;
    private defaultModel = 'llama3.1'; // Can be configured centrally later
    private baseUrl = 'http://127.0.0.1:11434';

    constructor(manager: OllamaManager) {
        this.manager = manager;
    }

    async isAvailable(): Promise<boolean> {
        return await this.manager.checkStatus();
    }

    async chat(messages: LLMMessage[], model: string = this.defaultModel, options?: ProviderOptions): Promise<string> {
        let isRunning = await this.manager.checkStatus();
        if (!isRunning) {
            console.log('[OllamaProvider] Service is not running. Attempting to start...');
            await this.manager.ensureService();
            isRunning = await this.manager.checkStatus();
            if (!isRunning) {
                throw new Error('Ollama service failed to start automatically.');
            }
        }

        try {
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                model: model,
                messages: messages,
                stream: false,
                options: {
                    temperature: options?.temperature,
                    num_predict: options?.max_tokens
                }
            }, {
                signal: options?.signal
            });
            return response.data.message.content;
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'canceled') {
                throw new Error('canceled');
            }
            const msg = error.response?.data?.error || error.message;
            console.error(`[OllamaProvider] Error:`, error.response?.data || error.message);
            throw new Error(`Ollama Error: ${msg}`);
        }
    }
}
