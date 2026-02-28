import axios from 'axios';
import { LLMMessage, ModelProvider, ProviderOptions } from './base';
import { IdentityManager } from '../../identity_manager';

export class GeminiProvider implements ModelProvider {
    public id = 'google';
    private identityManager: IdentityManager;
    private defaultModel = 'gemini-2.5-pro';

    constructor(identityManager: IdentityManager) {
        this.identityManager = identityManager;
    }

    async chat(messages: LLMMessage[], model: string = this.defaultModel, options?: ProviderOptions): Promise<string> {
        const key = await this.identityManager.getKey('google');
        if (!key) throw new Error(`API Key for Google Gemini not found.`);

        // Gemini expects a specialized JSON format: { contents: [{ role, parts: [{ text }] }] }
        // System instructions are passed separately in { systemInstruction: { parts: [{ text }] } }
        let systemPrompt = '';

        const geminiContents = messages.map(m => {
            if (m.role === 'system') {
                systemPrompt += m.content + '\n';
                return null;
            }
            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            };
        }).filter(m => m !== null);

        try {
            const payload: any = {
                contents: geminiContents,
                generationConfig: {
                    maxOutputTokens: options?.max_tokens ?? 2048,
                    temperature: options?.temperature ?? 0.7
                }
            };

            if (systemPrompt.trim()) {
                payload.systemInstruction = {
                    parts: [{ text: systemPrompt.trim() }]
                };
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: options?.signal
            });

            const candidates = response.data.candidates;
            if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts.length > 0) {
                return candidates[0].content.parts[0].text;
            } else {
                return '';
            }

        } catch (error: any) {
            const msg = error.response?.data?.error?.message || error.message;
            console.error(`[GeminiProvider] Error:`, error.response?.data || error.message);
            throw new Error(`Google Error: ${msg}`);
        }
    }
}
