import axios from 'axios';
import { LLMMessage, ModelProvider, ProviderOptions } from './base';
import { IdentityManager } from '../../identity_manager';

export class OpenAIProvider implements ModelProvider {
    public id = 'openai';
    private identityManager: IdentityManager;
    private defaultModel = 'gpt-4o';

    constructor(identityManager: IdentityManager) {
        this.identityManager = identityManager;
    }

    async isAvailable(): Promise<boolean> {
        const key = await this.identityManager.getKey('openai');
        return !!key;
    }

    async chat(messages: LLMMessage[], model: string = this.defaultModel, options?: ProviderOptions): Promise<string> {
        const key = await this.identityManager.getKey('openai');
        if (!key) throw new Error(`API Key for OpenAI not found.`);

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: model,
                messages: messages,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.max_tokens,
            }, {
                headers: { 'Authorization': `Bearer ${key}` },
                signal: options?.signal
            });

            return response.data.choices[0].message.content;
        } catch (error: any) {
            const msg = error.response?.data?.error?.message || error.message;
            console.error(`[OpenAIProvider] Error:`, error.response?.data || error.message);
            throw new Error(`OpenAI Error: ${msg}`);
        }
    }
}
