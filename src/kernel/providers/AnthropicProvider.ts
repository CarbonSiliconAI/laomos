import axios from 'axios';
import { LLMMessage, ModelProvider, ProviderOptions } from './base';
import { IdentityManager } from '../../identity_manager';

export class AnthropicProvider implements ModelProvider {
    public id = 'anthropic';
    private identityManager: IdentityManager;
    private defaultModel = 'claude-3-5-sonnet-20241022';

    constructor(identityManager: IdentityManager) {
        this.identityManager = identityManager;
    }

    async isAvailable(): Promise<boolean> {
        const key = await this.identityManager.getKey('anthropic');
        return !!key;
    }

    async chat(messages: LLMMessage[], model: string = this.defaultModel, options?: ProviderOptions): Promise<string> {
        const key = await this.identityManager.getKey('anthropic');
        if (!key) throw new Error(`API Key for Anthropic not found.`);

        // Anthropic expects system prompts at top level, not in messages array
        let systemPrompt = '';
        const anthropicMessages = messages.filter(m => {
            if (m.role === 'system') {
                systemPrompt += m.content + '\n';
                return false;
            }
            return true;
        });

        try {
            const payload: any = {
                model: model,
                max_tokens: options?.max_tokens ?? 1024,
                messages: anthropicMessages,
                temperature: options?.temperature ?? 0.7
            };

            if (systemPrompt) {
                payload.system = systemPrompt.trim();
            }

            const response = await axios.post('https://api.anthropic.com/v1/messages', payload, {
                headers: {
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                signal: options?.signal
            });

            return response.data.content[0].text;
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'canceled') {
                throw new Error('canceled');
            }
            const msg = error.response?.data?.error?.message || error.message;
            console.error(`[AnthropicProvider] Error:`, error.response?.data || error.message);
            throw new Error(`Anthropic Error: ${msg}`);
        }
    }
}
