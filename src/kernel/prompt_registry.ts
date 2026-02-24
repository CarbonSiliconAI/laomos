export interface PromptConfig {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    [key: string]: any;
}

export interface ModelMetadata {
    adaptedTo: string; // e.g., 'pro-v1-llama3'
    params?: Record<string, any>;
}

export interface PromptTemplate {
    role: string;
    functionName: string;
    template: string;
    params: string[];
    config: PromptConfig;
    version: string;
    modelMetadata: ModelMetadata;
}

export class PromptRegistry {
    private templates: Map<string, PromptTemplate> = new Map();

    constructor() {
        console.log(`[PromptRegistry] Initialized abstraction layer.`);
        this.registerDefaults();
    }

    private getCacheKey(role: string, functionName: string, version?: string): string {
        return `${role}::${functionName}${version ? `::${version}` : ''}`;
    }

    public register(template: PromptTemplate) {
        // Register specifically by version
        this.templates.set(this.getCacheKey(template.role, template.functionName, template.version), template);
        // Also register as the default latest for this role/function
        this.templates.set(this.getCacheKey(template.role, template.functionName), template);
        console.log(`[PromptRegistry] Registered template: ${template.role}/${template.functionName} (v${template.version})`);
    }

    public getTemplate(role: string, functionName: string, version?: string): PromptTemplate | undefined {
        return this.templates.get(this.getCacheKey(role, functionName, version));
    }

    public format(role: string, functionName: string, variables: Record<string, string>, version?: string): { prompt: string, config: PromptConfig, metadata: ModelMetadata } {
        const tpl = this.getTemplate(role, functionName, version);
        if (!tpl) {
            throw new Error(`[PromptRegistry] Template not found for ${role}/${functionName}`);
        }

        let formatted = tpl.template;
        for (const param of tpl.params) {
            const val = variables[param];
            if (val === undefined) {
                console.warn(`[PromptRegistry] Missing variable '${param}' for ${role}/${functionName}`);
            }
            formatted = formatted.replace(new RegExp(`{{${param}}}`, 'g'), val || '');
        }

        return {
            prompt: formatted,
            config: tpl.config,
            metadata: tpl.modelMetadata
        };
    }

    private registerDefaults() {
        // 1. Context Manager Summarization Prompt
        this.register({
            role: 'kernel_memory',
            functionName: 'summarize_context',
            template: `You are a memory manager. Summarize the following intermediate dialogue. 
Combine it intelligently with the existing summary so that context isn't lost. Keep it extremely concise.

[Existing Summary]:
{{existingSummary}}

[Intermediate Dialogue to Compress]:
{{textToCompress}}

[Output Requirements]:
Respond WITH THE SUMMARY TEXT ONLY. No intros, no greetings.`,
            params: ['existingSummary', 'textToCompress'],
            config: {
                temperature: 0.1, // low temp for deterministic summarization
                max_tokens: 500
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'any_fast_local', // Typically we want a fast cheap model for this
                params: {}
            }
        });

        // 2. Default Chat Prompt
        this.register({
            role: 'agent_chat',
            functionName: 'default_response',
            template: `{{retrievedContext}}

{{memoryContext}}

{{activeSkills}}

Respond ONLY to the last message in the <L1_Cache_ActiveWindow>.`,
            params: ['retrievedContext', 'memoryContext', 'activeSkills'],
            config: {
                temperature: 0.7
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'general_instruct',
                params: {}
            }
        });

        // 3. Store App: DALLE-3 Vision
        this.register({
            role: 'agent_app_dalle',
            functionName: 'image_generation',
            template: `You are an expert prompt engineer for an image generation AI (like Midjourney or DALL-E 3).
The user wants an image based on the following idea:
"{{userInput}}"

Flesh out this idea into a highly detailed, descriptive prompt focusing on subject, lighting, composition, and style.
Respond ONLY with the final expanded prompt. Do not include any conversational filler.`,
            params: ['userInput'],
            config: {
                temperature: 0.8,
                max_tokens: 200
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'creative_writer',
                params: {}
            }
        });

        // 4. Store App: Weather Agent
        this.register({
            role: 'agent_app_weather',
            functionName: 'weather_summary',
            template: `You are a helpful meteorologist AI. You have been given raw JSON data representing the weather for {{location}}.

[Raw Data]:
{{weatherData}}

Please provide a friendly, easy-to-read summary of this weather data. Highlight the current temperature, conditions, and any notable warnings.`,
            params: ['location', 'weatherData'],
            config: {
                temperature: 0.3
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'general_instruct',
                params: {}
            }
        });

        // 5. Store App: Code Reviewer
        this.register({
            role: 'agent_app_code',
            functionName: 'code_analysis',
            template: `You are a Principal Software Engineer conducting a thorough code review.

[Code to Review]:
\`\`\`
{{codeSnippet}}
\`\`\`

Analyze the code for:
1. Potential bugs or edge cases
2. Security vulnerabilities
3. Performance optimizations
4. Readability and style improvements

Provide your feedback in well-formatted Markdown. Be constructive but rigorous.`,
            params: ['codeSnippet'],
            config: {
                temperature: 0.2, // precise, analytical
                max_tokens: 1500
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'coding_expert', // Router should ideally route this to a coding model
                params: {}
            }
        });

        // 6. Store App: Deep Scraper
        this.register({
            role: 'agent_app_scrape',
            functionName: 'web_extraction',
            template: `You are an AI data extractor. You have been provided with the raw text/HTML contents scraped from a webpage.

[URL]: {{url}}
[Raw Content]:
{{rawHtml}}

Extract the main article text, clear away navbars/footers/ads, and summarize the core points in Markdown format. Keep the summary under 3 paragraphs.`,
            params: ['url', 'rawHtml'],
            config: {
                temperature: 0.1,
                max_tokens: 1000
            },
            version: '1.0.0',
            modelMetadata: {
                adaptedTo: 'long_context_reader',
                params: {}
            }
        });
    }
}
