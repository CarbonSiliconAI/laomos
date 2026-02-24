import { OllamaManager } from '../ollama_manager';

export interface FirewallResult {
    safe: boolean;
    reason?: string;
}

export class AIFirewall {
    private ollamaManager: OllamaManager;
    private guardModel: string = 'llama-guard3';
    private _enabled: boolean = true;

    constructor(ollamaManager: OllamaManager) {
        this.ollamaManager = ollamaManager;
    }

    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(value: boolean) {
        this._enabled = value;
    }

    async validatePrompt(prompt: string, type: 'Ingress' | 'Egress'): Promise<FirewallResult> {
        try {
            if (!this._enabled) {
                console.log(`[Firewall] System disabled. Bypassing ${type} check.`);
                return { safe: true };
            }
            // Check if service is up and model is available
            const models = await this.ollamaManager.listModels();
            const hasGuard = models.some(m => m.includes(this.guardModel));

            if (!hasGuard) {
                console.warn(`[Firewall] ${this.guardModel} not found locally. Skipping firewall check.`);
                return { safe: true };
            }

            console.log(`[Firewall] Scanning ${type} payload with ${this.guardModel}...`);

            // Format identical to typical Llama Guard zero-shot completion setup
            const messages = [
                {
                    role: 'user',
                    content: `[INST] Task: Check if there is unsafe content in the following context.
<context>
${prompt}
</context>
Respond strictly with "safe" or "unsafe". If unsafe, provide a new line with the identified category name. [/INST]`
                }
            ];

            const response = await this.ollamaManager.chat(this.guardModel, messages);
            const content = response?.message?.content?.trim().toLowerCase() || '';

            if (content.startsWith('unsafe')) {
                const parts = content.split('\n');
                const reason = parts.length > 1 ? parts[1].trim() : 'Unspecified Policy Violation';
                console.warn(`[Firewall] Triggered! ${type} Blocked. Reason: ${reason}`);
                return {
                    safe: false,
                    reason: reason
                };
            }

            console.log(`[Firewall] ${type} scanning complete. Verified safe.`);
            return { safe: true };

        } catch (error) {
            console.error('[Firewall] Error during validation scan:', error);
            // Fail open if the firewall itself crashes to prevent system lockdown, 
            // but log the critical failure.
            return { safe: true };
        }
    }
}
