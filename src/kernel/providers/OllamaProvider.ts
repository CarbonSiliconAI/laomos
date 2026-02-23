import axios from 'axios';
import { LLMMessage, ModelProvider, ProviderOptions } from './base';
import { OllamaManager } from '../../ollama_manager';

export class OllamaProvider implements ModelProvider {
    public id = 'ollama';
    private manager: OllamaManager;
    private defaultModel = 'llama3.1'; // Can be configured centrally later
    private baseUrl = 'http://localhost:11434';

    constructor(manager: OllamaManager) {
        this.manager = manager;
    }

    async chat(messages: LLMMessage[], model: string = this.defaultModel, options?: ProviderOptions): Promise<string> {
        const isRunning = await this.manager.checkStatus();
        if (!isRunning) {
            throw new Error('Ollama service is not running.');
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
            });
            return response.data.message.content;
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message;
            console.error(`[OllamaProvider] Error:`, error.response?.data || error.message);
            throw new Error(`Ollama Error: ${msg}`);
        }
    }
}
