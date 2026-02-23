import { IdentityManager } from '../identity_manager';
import { OllamaManager } from '../ollama_manager';
import { LLMMessage, ModelProvider } from './providers/base';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { OllamaProvider } from './providers/OllamaProvider';

export class ModelRouter {
    private providers: Map<string, ModelProvider> = new Map();
    private localProvider: OllamaProvider;

    constructor(identityManager: IdentityManager, ollamaManager: OllamaManager) {
        this.localProvider = new OllamaProvider(ollamaManager);
        this.providers.set('local', this.localProvider);
        this.providers.set('openai', new OpenAIProvider(identityManager));
        this.providers.set('anthropic', new AnthropicProvider(identityManager));
    }

    /**
     * Evaluates the complexity of a prompt using a fast local model.
     * Returns a strictly formatted number string: "1", "2", or "3".
     */
    async evaluateComplexity(prompt: string): Promise<string> {
        try {
            const response = await this.localProvider.chat([
                {
                    role: 'system', content: `You are a strict task evaluator. 
Rate the following task's complexity on a scale of 1 to 3:
1 (Simple): Chatting, formatting, simple extraction, summarizing.
2 (Medium): Logical transformation, retrieval, multi-step planning, coding.
3 (Complex): High-level math, deep reasoning, massive code generation, agent conflict resolution.

Respond WITH ONLY A SINGLE DIGIT (1, 2, or 3) and absolutely nothing else.`},
                { role: 'user', content: prompt }
            ]);

            const rawText = response.trim();
            const match = rawText.match(/[123]/);
            if (match) {
                return match[0];
            }
            return "1";
        } catch (error) {
            console.error('Pre-flight evaluation failed, defaulting to Level 1.', error);
            return "1";
        }
    }

    /**
     * Routes the chat request to the optimal provider based on complexity or explicit model provider.
     */
    async routeChat(prompt: string, preferredProvider?: string): Promise<{ response: string, level: string, providerUsed: string }> {
        const messages: LLMMessage[] = [{ role: 'user', content: prompt }];

        if (preferredProvider && this.providers.has(preferredProvider)) {
            try {
                const provider = this.providers.get(preferredProvider)!;
                return {
                    response: await provider.chat(messages),
                    level: 'explicit',
                    providerUsed: preferredProvider
                };
            } catch (err: any) {
                console.warn(`${preferredProvider} failed explicitly, falling back to local...`, err.message);
                return {
                    response: await this.localProvider.chat(messages),
                    level: 'explicit (local fallback)',
                    providerUsed: 'local'
                };
            }
        }

        const level = await this.evaluateComplexity(prompt);

        if (level === '1') {
            return {
                response: await this.localProvider.chat(messages),
                level: '1',
                providerUsed: 'local'
            };
        } else if (level === '2') {
            try {
                return {
                    response: await this.providers.get('anthropic')!.chat(messages),
                    level: '2',
                    providerUsed: 'anthropic'
                };
            } catch (e: any) {
                console.warn('Anthropic failed/missing key, falling back to OpenAI...', e.message);
                try {
                    return {
                        response: await this.providers.get('openai')!.chat(messages),
                        level: '2 (fallback)',
                        providerUsed: 'openai'
                    };
                } catch (err: any) {
                    console.warn('OpenAI failed/missing key, falling back to Local...', err.message);
                    return {
                        response: await this.localProvider.chat(messages),
                        level: '2 (local fallback)',
                        providerUsed: 'local'
                    };
                }
            }
        } else {
            // Level 3
            try {
                return {
                    response: await this.providers.get('openai')!.chat(messages),
                    level: '3',
                    providerUsed: 'openai'
                };
            } catch (e: any) {
                console.warn('OpenAI failed/missing key for level 3, falling back to Local...', e.message);
                return {
                    response: await this.localProvider.chat(messages),
                    level: '3 (local fallback)',
                    providerUsed: 'local'
                };
            }
        }
    }
}
