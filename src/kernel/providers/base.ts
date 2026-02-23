export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ProviderOptions {
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
}

export interface ModelProvider {
    /**
     * Unique identifier for the provider (e.g., 'openai', 'anthropic', 'ollama')
     */
    id: string;

    /**
     * Generates a response from the LLM based on the conversation history.
     * @param messages The conversation history and instructions
     * @param model An optional specific model string to use for this provider
     * @param options Generation config (temperature, tokens, etc.)
     */
    chat(messages: LLMMessage[], model?: string, options?: ProviderOptions): Promise<string>;
}
