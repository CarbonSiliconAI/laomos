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
        const messages: LLMMessage[] = [];

        // Extract system prompts from the formatted string and move them into a system message
        const systemRegex = /<Register_SystemPrompt>([\s\S]*?)<\/Register_SystemPrompt>/;
        const systemMatch = prompt.match(systemRegex);
        let systemContent = "";

        if (systemMatch) {
            systemContent += systemMatch[1].trim() + "\n\n";
            prompt = prompt.replace(systemMatch[0], '').trim();
        }

        const activeSkillsRegex = /\[Active OpenClaw Skills\]:([\s\S]*)/;
        const activeSkillsMatch = prompt.match(activeSkillsRegex);
        if (activeSkillsMatch) {
            // Extract everything until "Respond ONLY to the last message" (if present)
            let skillsText = activeSkillsMatch[1];
            const stopIndex = skillsText.indexOf('Respond ONLY to the last message');
            if (stopIndex !== -1) {
                skillsText = skillsText.substring(0, stopIndex);
            }
            systemContent += "[Active OpenClaw Skills]:" + skillsText.trim() + "\n\n";
            // Remove the matched text from the user prompt
            prompt = prompt.replace(/\[Active OpenClaw Skills\]:[\s\S]*?(?=Respond ONLY to the last message|$)/, '').trim();
        }

        if (systemContent.trim()) {
            messages.push({ role: 'system', content: systemContent.trim() });
        }

        messages.push({ role: 'user', content: prompt });

        console.log(`[ModelRouter] Extracted System Prompt:`, systemContent.substring(0, 500) + '...');
        console.log(`[ModelRouter] Forwarded User Prompt:`, prompt.substring(0, 500) + '...');


        let pAnthropic = this.providers.get('anthropic');
        let pOpenAI = this.providers.get('openai');

        // Use IdentityManager to see if user actually added a key before we blindly send requests
        let hasAnthropic = false;
        let hasOpenAI = false;

        if (pAnthropic && (pAnthropic as any).identityManager) {
            hasAnthropic = !!await (pAnthropic as any).identityManager.getKey('anthropic');
        }
        if (pOpenAI && (pOpenAI as any).identityManager) {
            hasOpenAI = !!await (pOpenAI as any).identityManager.getKey('openai');
        }

        if (preferredProvider === 'cloud') {
            if (hasAnthropic) {
                try {
                    return {
                        response: await pAnthropic!.chat(messages),
                        level: 'cloud-preferred',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    console.warn('Anthropic failed for cloud-preferred, falling back to OpenAI...', e.message);
                }
            }
            if (hasOpenAI) {
                try {
                    return {
                        response: await pOpenAI!.chat(messages),
                        level: 'cloud-preferred (fallback)',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    console.warn('OpenAI failed for cloud-preferred, falling back to Local...', e.message);
                }
            }
            console.warn('No valid cloud providers available or all failed. Falling back to Local...');
            return {
                response: await this.localProvider.chat(messages),
                level: 'cloud-preferred (local fallback)',
                providerUsed: 'local'
            };
        }

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
        // Try the best available provider for the level



        if (level === '1') {
            return {
                response: await this.localProvider.chat(messages),
                level: '1',
                providerUsed: 'local'
            };
        } else if (level === '2') {
            if (hasAnthropic) {
                try {
                    return {
                        response: await pAnthropic!.chat(messages),
                        level: '2',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    console.warn('Anthropic failed, falling back to OpenAI...', e.message);
                }
            }
            if (hasOpenAI) {
                try {
                    return {
                        response: await pOpenAI!.chat(messages),
                        level: '2 (fallback)',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    console.warn('OpenAI failed, falling back to Local...', e.message);
                }
            }
            // Ultimate fallback
            return {
                response: await this.localProvider.chat(messages),
                level: '2 (local fallback)',
                providerUsed: 'local'
            };
        } else {
            // Level 3
            if (hasOpenAI) {
                try {
                    return {
                        response: await pOpenAI!.chat(messages),
                        level: '3',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    console.warn('OpenAI failed for level 3, falling back to Anthropic...', e.message);
                }
            }
            if (hasAnthropic) {
                try {
                    return {
                        response: await pAnthropic!.chat(messages),
                        level: '3 (fallback)',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    console.warn('Anthropic failed for level 3, falling back to Local...', e.message);
                }
            }
            // Ultimate fallback
            return {
                response: await this.localProvider.chat(messages),
                level: '3 (local fallback)',
                providerUsed: 'local'
            };
        }
    }
}
