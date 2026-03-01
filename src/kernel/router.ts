import { IdentityManager } from '../identity_manager';
import { OllamaManager } from '../ollama_manager';
import { LLMMessage, ModelProvider } from './providers/base';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { v4 as uuidv4 } from 'uuid';

export interface AIJob {
    id: string;
    description: string;
    provider: string;
    startTime: number;
    abortController: AbortController;
}

export class ModelRouter {
    private providers: Map<string, ModelProvider> = new Map();
    private localProvider: OllamaProvider;
    private activeJobs: Map<string, AIJob> = new Map();

    private getFallbackPref: () => string;

    constructor(identityManager: IdentityManager, ollamaManager: OllamaManager, getFallbackPref: () => string = () => 'local') {
        this.localProvider = new OllamaProvider(ollamaManager);
        this.getFallbackPref = getFallbackPref;
        this.providers.set('local', this.localProvider);
        this.providers.set('openai', new OpenAIProvider(identityManager));
        this.providers.set('anthropic', new AnthropicProvider(identityManager));
        this.providers.set('google', new GeminiProvider(identityManager));
    }

    getActiveJobs(): AIJob[] {
        return Array.from(this.activeJobs.values());
    }

    abortJob(jobId: string): boolean {
        const job = this.activeJobs.get(jobId);
        if (job) {
            job.abortController.abort();
            this.activeJobs.delete(jobId);
            return true;
        }
        return false;
    }

    private async executeUltimateFallback(messages: LLMMessage[], levelStr: string, abortSignal: AbortSignal, trackJob: (provider: string) => void, cleanupJob: () => void): Promise<{ response: string, level: string, providerUsed: string }> {
        const pref = this.getFallbackPref();
        if (pref === 'online') {
            const hasAnthropic = await this.providers.get('anthropic')!.isAvailable();
            const hasOpenAI = await this.providers.get('openai')!.isAvailable();
            const hasGoogle = await this.providers.get('google')!.isAvailable();
            if (hasAnthropic) {
                try {
                    trackJob('anthropic');
                    const res = await this.providers.get('anthropic')!.chat(messages, undefined, { signal: abortSignal });
                    cleanupJob();
                    return { response: res, level: `${levelStr} (online fallback)`, providerUsed: 'anthropic' };
                } catch (e: any) { cleanupJob(); if (e.name === 'AbortError' || e.message === 'canceled') throw e; }
            }
            if (hasOpenAI) {
                try {
                    trackJob('openai');
                    const res = await this.providers.get('openai')!.chat(messages, undefined, { signal: abortSignal });
                    cleanupJob();
                    return { response: res, level: `${levelStr} (online fallback)`, providerUsed: 'openai' };
                } catch (e: any) { cleanupJob(); if (e.name === 'AbortError' || e.message === 'canceled') throw e; }
            }
            if (hasGoogle) {
                try {
                    trackJob('google');
                    const res = await this.providers.get('google')!.chat(messages, undefined, { signal: abortSignal });
                    cleanupJob();
                    return { response: res, level: `${levelStr} (online fallback)`, providerUsed: 'google' };
                } catch (e: any) { cleanupJob(); if (e.name === 'AbortError' || e.message === 'canceled') throw e; }
            }
            // If online fails or no keys exist, safely cascade to local
        }

        try {
            trackJob('local');
            const res = await this.localProvider.chat(messages, undefined, { signal: abortSignal });
            cleanupJob();
            return { response: res, level: `${levelStr} (local fallback)`, providerUsed: 'local' };
        } catch (e: any) {
            cleanupJob();
            throw e;
        }
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
    async routeChat(prompt: string, preferredProvider?: string, jobDescription?: string, externalSignal?: AbortSignal): Promise<{ response: string, level: string, providerUsed: string }> {
        const messages: LLMMessage[] = [];
        const jobId = uuidv4();
        const abortController = new AbortController();

        // Listen for external aborts and propagate to internal controller
        if (externalSignal) {
            externalSignal.addEventListener('abort', () => abortController.abort());
        }

        const trackJob = (provider: string) => {
            this.activeJobs.set(jobId, {
                id: jobId,
                description: jobDescription || (prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt),
                provider: provider,
                startTime: Date.now(),
                abortController
            });
        };
        const cleanupJob = () => {
            this.activeJobs.delete(jobId);
        };

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
        let pGoogle = this.providers.get('google');

        // Use IdentityManager to see if user actually added a key before we blindly send requests
        let hasAnthropic = false;
        let hasOpenAI = false;
        let hasGoogle = false;

        if (pAnthropic && (pAnthropic as any).identityManager) {
            hasAnthropic = !!await (pAnthropic as any).identityManager.getKey('anthropic');
        }
        if (pOpenAI && (pOpenAI as any).identityManager) {
            hasOpenAI = !!await (pOpenAI as any).identityManager.getKey('openai');
        }
        if (pGoogle && (pGoogle as any).identityManager) {
            hasGoogle = !!await (pGoogle as any).identityManager.getKey('google');
        }

        if (preferredProvider === 'cloud') {
            if (hasAnthropic) {
                try {
                    trackJob('anthropic');
                    const response = await pAnthropic!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: 'cloud-preferred',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Anthropic failed for cloud-preferred, falling back to OpenAI...', e.message);
                }
            }
            if (hasOpenAI) {
                try {
                    trackJob('openai');
                    const response = await pOpenAI!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: 'cloud-preferred (fallback)',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('OpenAI failed for cloud-preferred, falling back to Local...', e.message);
                }
            }
            if (hasGoogle) {
                try {
                    trackJob('google');
                    const response = await pGoogle!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: 'cloud-preferred (fallback)',
                        providerUsed: 'google'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Google failed for cloud-preferred, falling back to Local...', e.message);
                }
            }
            console.warn('No valid cloud providers available or all failed. Executing ultimate fallback...');
            return this.executeUltimateFallback(messages, 'cloud-preferred', abortController.signal, trackJob, cleanupJob);
        }

        if (preferredProvider && this.providers.has(preferredProvider)) {
            try {
                const provider = this.providers.get(preferredProvider)!;
                trackJob(preferredProvider);
                const response = await provider.chat(messages, undefined, { signal: abortController.signal });
                cleanupJob();
                return {
                    response: response,
                    level: 'explicit',
                    providerUsed: preferredProvider
                };
            } catch (err: any) {
                cleanupJob();
                if (err.name === 'AbortError' || err.message === 'canceled') throw err;
                console.warn(`${preferredProvider} failed explicitly, executing ultimate fallback...`, err.message);
                return this.executeUltimateFallback(messages, 'explicit', abortController.signal, trackJob, cleanupJob);
            }
        }

        const level = await this.evaluateComplexity(prompt);
        // Try the best available provider for the level



        if (level === '1') {
            if (hasGoogle || hasOpenAI || hasAnthropic) {
                try {
                    let cloudProv = pGoogle;
                    let pUsed = 'google';
                    if (!hasGoogle && hasOpenAI) { cloudProv = pOpenAI; pUsed = 'openai'; }
                    else if (!hasGoogle && hasAnthropic) { cloudProv = pAnthropic; pUsed = 'anthropic'; }

                    trackJob(pUsed);
                    const response = await cloudProv!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '1',
                        providerUsed: pUsed
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Cloud failed for level 1, executing ultimate fallback...', e.message);
                }
            }
            // Ultimate fallback
            return this.executeUltimateFallback(messages, '1', abortController.signal, trackJob, cleanupJob);
        } else if (level === '2') {
            if (hasAnthropic) {
                try {
                    trackJob('anthropic');
                    const response = await pAnthropic!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '2',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Anthropic failed for level 2, falling back to OpenAI...', e.message);
                }
            }
            if (hasOpenAI) {
                try {
                    trackJob('openai');
                    const response = await pOpenAI!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '2 (fallback)',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('OpenAI failed for level 2, falling back to Google...', e.message);
                }
            }
            if (hasGoogle) {
                try {
                    trackJob('google');
                    const response = await pGoogle!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '2 (fallback)',
                        providerUsed: 'google'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Google failed for level 2, executing ultimate fallback...', e.message);
                }
            }
            // Ultimate fallback
            return this.executeUltimateFallback(messages, '2', abortController.signal, trackJob, cleanupJob);
        } else {
            // Level 3
            if (hasOpenAI) {
                try {
                    trackJob('openai');
                    const response = await pOpenAI!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '3',
                        providerUsed: 'openai'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('OpenAI failed for level 3, falling back to Anthropic...', e.message);
                }
            }
            if (hasAnthropic) {
                try {
                    trackJob('anthropic');
                    const response = await pAnthropic!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '3 (fallback)',
                        providerUsed: 'anthropic'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Anthropic failed for level 3, falling back to Google...', e.message);
                }
            }
            if (hasGoogle) {
                try {
                    trackJob('google');
                    const response = await pGoogle!.chat(messages, undefined, { signal: abortController.signal });
                    cleanupJob();
                    return {
                        response: response,
                        level: '3 (fallback)',
                        providerUsed: 'google'
                    };
                } catch (e: any) {
                    cleanupJob();
                    if (e.name === 'AbortError' || e.message === 'canceled') throw e;
                    console.warn('Google failed for level 3, executing ultimate fallback...', e.message);
                }
            }
            // Ultimate fallback
            return this.executeUltimateFallback(messages, '3', abortController.signal, trackJob, cleanupJob);
        }
    }
}
