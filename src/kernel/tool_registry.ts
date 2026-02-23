import { ModelRouter } from './router';
import { ContextManager } from './memory';

export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON schema for parameters
    uiMetadata?: {
        icon: string;
        label: string;
        publisher: string;
        category: string;
    };
}

export interface ToolPermissions {
    requiresFileSystem?: boolean;
    requiresInternet?: boolean;
    authTier?: number; // OS-level authorization tier mapped to this tool
}

export type TraceEvent = {
    step: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
    durationMs?: number;
};

export interface AgentTool {
    declaration: ToolDeclaration;
    permissions: ToolPermissions;
    execute: (params: Record<string, any>, onProgress?: (event: TraceEvent) => void) => Promise<any>;
}

export class ToolRegistry {
    private tools: Map<string, AgentTool> = new Map();
    private router?: ModelRouter;
    private memory?: ContextManager;

    constructor(router?: ModelRouter, memory?: ContextManager) {
        this.router = router;
        this.memory = memory;
        console.log(`[ToolRegistry] Initialized dynamic tool abstraction.`);
        this.registerDefaults();
    }

    public register(tool: AgentTool) {
        if (this.tools.has(tool.declaration.name)) {
            console.warn(`[ToolRegistry] Tool '${tool.declaration.name}' is already registered. Overwriting.`);
        }
        this.tools.set(tool.declaration.name, tool);
        console.log(`[ToolRegistry] Registered tool: ${tool.declaration.name}`);
    }

    public getTool(name: string): AgentTool | undefined {
        return this.tools.get(name);
    }

    public listTools(): ToolDeclaration[] {
        const declarations: ToolDeclaration[] = [];
        this.tools.forEach(tool => declarations.push(tool.declaration));
        return declarations;
    }

    private registerDefaults() {
        // 1. Web Scraper Tool
        this.register({
            declaration: {
                name: 'web_scrape',
                description: 'Extracts raw text content from a given URL.',
                parameters: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The full HTTP/HTTPS URL to scrape.'
                        }
                    },
                    required: ['url']
                },
                uiMetadata: {
                    icon: '🕷️',
                    label: 'Deep Scraper',
                    publisher: 'NetCore',
                    category: 'search'
                }
            },
            permissions: {
                requiresInternet: true,
                authTier: 1
            },
            execute: async (params: Record<string, any>) => {
                // In a true environment, this would use fetch/axios with cheerio
                console.log(`[Tool] web_scrape executing on ${params.url}`);
                // Mocking the result for OS abstraction
                return {
                    success: true,
                    content: `<html><body>Extracted data from ${params.url}</body></html>`
                };
            }
        });

        // 2. Weather API Tool
        this.register({
            declaration: {
                name: 'get_weather',
                description: 'Retrieves the current weather for a specific location.',
                parameters: {
                    type: 'object',
                    properties: {
                        location: {
                            type: 'string',
                            description: 'City and state/country, e.g., "San Francisco, CA"'
                        }
                    },
                    required: ['location']
                },
                uiMetadata: {
                    icon: '🌤️',
                    label: 'Weather Agent',
                    publisher: 'DataCorp',
                    category: 'utility'
                }
            },
            permissions: {
                requiresInternet: true,
                authTier: 1
            },
            execute: async (params: Record<string, any>) => {
                console.log(`[Tool] get_weather executing for ${params.location}`);
                return {
                    success: true,
                    data: {
                        location: params.location,
                        temperature: 72,
                        condition: 'Sunny'
                    }
                };
            }
        });

        // 3. File Browser Tool
        this.register({
            declaration: {
                name: 'read_file',
                description: 'Reads the contents of a file from the local Agent OS filesystem.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'The absolute or relative path within the OS virtual drive.'
                        }
                    },
                    required: ['path']
                },
                uiMetadata: {
                    icon: '📁',
                    label: 'File Reader',
                    publisher: 'System',
                    category: 'utility'
                }
            },
            permissions: {
                requiresFileSystem: true,
                authTier: 3 // Higher tier required to read arbitrary files
            },
            execute: async (params: Record<string, any>) => {
                console.log(`[Tool] read_file executing on ${params.path}`);
                return {
                    success: true,
                    content: `Contents of ${params.path}`
                };
            }
        });

        // 4. Smart Search Tool
        this.register({
            declaration: {
                name: 'smart_search',
                description: 'Evaluates the query and performs either a Local RAG search or a Web search based on intent.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query provided by the user.'
                        },
                        sessionId: {
                            type: 'string',
                            description: 'The active session ID for local memory retrieval.'
                        }
                    },
                    required: ['query']
                },
                uiMetadata: {
                    icon: '🔍',
                    label: 'Smart Search',
                    publisher: 'System',
                    category: 'search'
                }
            },
            permissions: {
                requiresInternet: true,
                requiresFileSystem: true,
                authTier: 2
            },
            execute: async (params: Record<string, any>, onProgress?: (event: TraceEvent) => void) => {
                if (!this.router || !this.memory) {
                    throw new Error("Smart Search requires ModelRouter and ContextManager to be linked.");
                }
                const query = params.query;
                const sessionId = params.sessionId || 'default-os-session';

                const stepTimers: Record<string, number> = {};

                const emit = (step: string, status: TraceEvent['status'], details?: string) => {
                    let durationMs: number | undefined;

                    if (status === 'running') {
                        stepTimers[step] = Date.now();
                    } else if (status === 'completed' || status === 'error') {
                        if (stepTimers[step]) {
                            durationMs = Date.now() - stepTimers[step];
                        } else {
                            durationMs = 0; // If it didn't have a 'running' phase
                        }
                    }

                    if (onProgress) onProgress({ step, status, details, durationMs });
                };

                console.log(`[Tool] smart_search evaluating query: "${query}"`);
                emit('Query Received', 'completed', `Query: "${query}"`);

                // 1. Classify Intent
                emit('Intent Classification', 'running', 'Determining execution path (Local vs Web)...');
                const classificationPrompt = `Analyze the following search query: "${query}"
Determine if the user is asking about:
A) Local system context, OS memory, personal files, or past conversations.
B) General knowledge, current events, programming help, or external data.
Respond with EXACTLY ONE WORD: "LOCAL" or "WEB".`;

                const classificationRes = await this.router.routeChat(classificationPrompt, 'openai'); // Use strong model for logic if available
                const intent = classificationRes.response.trim().toUpperCase();
                emit('Intent Classification', 'completed', `Intent recognized: ${intent}`);

                if (intent.includes('LOCAL')) {
                    emit('Local Search (RAG)', 'running', 'Searching vector database...');
                    console.log(`[Tool] smart_search intent: LOCAL. Running RAG.`);

                    const hits = await this.memory.retrieveContext(sessionId, query, 3);
                    const ragHits = await this.memory.retrieveFromRags(query, 3);

                    const combinedHits = [hits, ragHits].filter(h => h.trim().length > 0).join('\n');

                    if (!combinedHits.trim()) {
                        emit('Local Search (RAG)', 'completed', 'No relevant local context found.');
                        emit('Synthesis', 'completed', 'No results.');
                        return { success: true, source: 'local', content: "No relevant local context found." };
                    }

                    emit('Local Search (RAG)', 'completed', `Found multiple context fragments from OS and Docs.`);

                    emit('Synthesis', 'running', 'Summarizing local context...');
                    const summaryPrompt = `Synthesize an answer to "${query}" based ONLY on this context:\n${combinedHits}`;
                    const answer = await this.router.routeChat(summaryPrompt);

                    emit('Synthesis', 'completed', 'Local response generated.');
                    return { success: true, source: 'local', content: answer.response };
                } else {
                    emit('Web Search', 'running', 'Simulating real-time web execution...');
                    console.log(`[Tool] smart_search intent: WEB.`);

                    // Simulate processing time for realistic UI flow
                    await new Promise(r => setTimeout(r, 1500));
                    emit('Web Search', 'completed', 'Retrieved web sources.');

                    emit('Synthesis', 'running', 'Compiling final web summarize...');
                    const searchRes = await this.router.routeChat(`Simulate a real-time web search response to accurately answer: "${query}". Provide a concise, highly informative answer.`);

                    emit('Synthesis', 'completed', 'Web response generated.');
                    return { success: true, source: 'web', content: searchRes.response };
                }
            }
        });
    }
}
