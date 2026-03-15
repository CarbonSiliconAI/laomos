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

    public exportToolsToXML(): string {
        const tools = this.listTools();
        if (tools.length === 0) return '';
        
        let xml = '<Register_Tools>\n';
        xml += 'You have access to the following tools. To use a tool, output a <tool_call> block with a JSON payload of arguments.\n';
        xml += 'Example: <tool_call name="get_weather">{"location": "San Francisco, CA"}</tool_call>\n\n';
        
        for (const t of tools) {
            xml += `<Tool name="${t.name}">\n`;
            xml += `  <Description>${t.description}</Description>\n`;
            xml += `  <Parameters>\n${JSON.stringify(t.parameters, null, 2)}\n  </Parameters>\n`;
            xml += `</Tool>\n`;
        }
        xml += '</Register_Tools>\n';
        return xml;
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
                const signal: AbortSignal | undefined = params.signal;

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

                const classificationRes = await this.router.routeChat(classificationPrompt, 'openai', 'Local or Web Router', signal); // Use strong model for logic if available
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
                    const answer = await this.router.routeChat(summaryPrompt, undefined, 'Local Search Synthesis', signal);

                    emit('Synthesis', 'completed', 'Local response generated.');
                    return { success: true, source: 'local', content: answer.response };
                } else {
                    emit('Web Search', 'running', 'Simulating real-time web execution...');
                    console.log(`[Tool] smart_search intent: WEB.`);

                    // Simulate processing time for realistic UI flow
                    await new Promise(r => setTimeout(r, 1500));
                    emit('Web Search', 'completed', 'Retrieved web sources.');

                    emit('Synthesis', 'running', 'Compiling final web summarize...');
                    const searchRes = await this.router.routeChat(`Simulate a real-time web search response to accurately answer: "${query}". Provide a concise, highly informative answer.`, undefined, 'Web Search Synthesis', signal);

                    emit('Synthesis', 'completed', 'Web response generated.');
                    return { success: true, source: 'web', content: searchRes.response };
                }
            }
        });

        // 5. Bash Command Tool
        this.register({
            declaration: {
                name: 'bash',
                description: 'Executes a bash/zsh shell command on the local system.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'The shell command to execute.'
                        }
                    },
                    required: ['command']
                },
                uiMetadata: {
                    icon: '🐚',
                    label: 'Shell Executor',
                    publisher: 'System',
                    category: 'utility'
                }
            },
            permissions: {
                requiresFileSystem: true,
                authTier: 5 
            },
            execute: async (params: Record<string, any>) => {
                const command = params.command;
                console.log(`[Tool] bash executing: ${command}`);
                try {
                    const util = require('util');
                    const fs = require('fs');
                    const path = require('path');
                    const execAsync = util.promisify(require('child_process').exec);
                    
                    // Strip markdown wrapping if the user or LLM passed a raw codeblock
                    let safeCommand = command.trim();
                    const mdMatch = safeCommand.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
                    if (mdMatch) {
                        safeCommand = mdMatch[1].trim();
                    }

                    // Ensure user profiles (PATH) are loaded via a login shell (-l).
                    // Also, silently alias `python ` to `python3 ` because macOS doesn't typically alias it natively in non-interactive subshells.
                    if (process.platform === 'darwin') {
                        // Replace 'python ' with 'python3 ' globally but avoid matching things like 'python3'
                        safeCommand = safeCommand.replace(/\bpython\b/g, 'python3');
                    }

                    const tmpDir = path.join(process.cwd(), 'tmp');
                    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
                    const scriptPath = path.join(tmpDir, '.laomos_cmd.sh');

                    // ==========================================
                    // XML Command Registry Integration
                    // ==========================================
                    const systemDir = path.join(process.cwd(), 'storage', 'system');
                    if (!fs.existsSync(systemDir)) fs.mkdirSync(systemDir, { recursive: true });
                    const registryXmlPath = path.join(systemDir, 'command_registry.xml');

                    // 1. Ensure Registry Exists
                    if (!fs.existsSync(registryXmlPath)) {
                        const defaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<Registry>
    <Command>
        <Alias>lk</Alias>
        <Target>{HOME_DIR}/miniforge3/bin/python3 {ROOT_DIR}/storage/skills/linkedin-cli-1.0.0/scripts/lk.py</Target>
    </Command>
</Registry>`;
                        fs.writeFileSync(registryXmlPath, defaultXml);
                    }

                    // 2. Parse Registry and Apply Aliases via Text Replacement
                    try {
                        const xmlContent = fs.readFileSync(registryXmlPath, 'utf8');
                        const commandRegex = /<Command>\s*<Alias>(.*?)<\/Alias>\s*<Target>(.*?)<\/Target>\s*<\/Command>/g;
                        let match;
                        while ((match = commandRegex.exec(xmlContent)) !== null) {
                            const alias = match[1].trim();
                            const rawTarget = match[2].trim();
                            // Resolve {ROOT_DIR} and {HOME_DIR} macros
                            const os = require('os');
                            const resolvedTarget = rawTarget
                                .replace(/\{ROOT_DIR\}/g, process.cwd())
                                .replace(/\{HOME_DIR\}/g, os.homedir());
                            
                            // Prevent infinite loops or breaking commands: Replace exactly the alias keyword
                            // Regex boundary \b ensures we only replace the exact word 'lk', not 'milk' or 'lk.py'.
                            // However, since aliases are usually at the start of a command, we match the beginning of lines
                            // or following a pipe/ampersand. For robust simplicity, we'll replace the word if it's the first
                            // command on a line.
                            const aliasBoundaryRegex = new RegExp(`(^|\\n|\\||\\&\\&|\\;)\\s*${alias}\\b`, 'g');
                            safeCommand = safeCommand.replace(aliasBoundaryRegex, `$1${resolvedTarget}`);
                        }
                    } catch (e) {
                        console.error("[ToolRegistry] Failed to parse command_registry.xml. Skipping alias injection.", e);
                    }

                    // ==========================================
                    // Persistent Environment Variables
                    // ==========================================
                    const envFilePath = path.join(process.cwd(), '.env');

                    // Extract any export statements and persist them
                    const exportRegex = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm;
                    let exportMatch;
                    const newExports: { name: string; value: string; line: string }[] = [];
                    while ((exportMatch = exportRegex.exec(safeCommand)) !== null) {
                        const varName = exportMatch[1];
                        const varValue = exportMatch[2].replace(/^["']|["']$/g, ''); // strip quotes
                        newExports.push({ name: varName, value: varValue, line: `export ${varName}=${exportMatch[2]}` });
                    }
                    if (newExports.length > 0) {
                        // Read existing env file, update or append new vars
                        let existingEnv = '';
                        if (fs.existsSync(envFilePath)) {
                            existingEnv = fs.readFileSync(envFilePath, 'utf8');
                        }
                        for (const exp of newExports) {
                            // Remove old entry for same var
                            const removeRegex = new RegExp(`^export\\s+${exp.name}=.*$`, 'gm');
                            existingEnv = existingEnv.replace(removeRegex, '').trim();
                            // Also inject into Node.js process.env immediately
                            process.env[exp.name] = exp.value;
                        }
                        const lines = [existingEnv, ...newExports.map(e => e.line)].filter(l => l.trim());
                        fs.writeFileSync(envFilePath, lines.join('\n') + '\n');
                        console.log(`[Tool] bash: Persisted ${newExports.length} env var(s) to .env and process.env`);
                    }

                    // Load all .env vars into process.env before execution
                    if (fs.existsSync(envFilePath)) {
                        const envContent = fs.readFileSync(envFilePath, 'utf8');
                        const envLineRegex = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm;
                        let envLine;
                        while ((envLine = envLineRegex.exec(envContent)) !== null) {
                            const val = envLine[2].replace(/^["']|["']$/g, '');
                            if (!process.env[envLine[1]]) {
                                process.env[envLine[1]] = val;
                            }
                        }
                    }

                    fs.writeFileSync(scriptPath, safeCommand);

                    const { stdout, stderr } = await execAsync(`/bin/zsh -l "${scriptPath}"`, {
                        timeout: 60000,
                        env: { ...process.env }
                    });
                    return {
                        success: true,
                        output: (stdout || '') + (stderr || '')
                    };
                } catch (error: any) {
                    const output = (error.stdout || '') + (error.stderr || '');
                    return {
                        success: false,
                        error: output || error.message
                    };
                }
            }
        });

        // 6. Python Script Tool
        this.register({
            declaration: {
                name: 'python',
                description: 'Executes inline Python 3 code on the local system.',
                parameters: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            description: 'The Python code to execute.'
                        }
                    },
                    required: ['code']
                },
                uiMetadata: {
                    icon: '🐍',
                    label: 'Python Runtime',
                    publisher: 'System',
                    category: 'utility'
                }
            },
            permissions: {
                requiresFileSystem: true,
                authTier: 5
            },
            execute: async (params: Record<string, any>) => {
                const code = params.code;
                console.log(`[Tool] python executing code of length: ${code.length}`);
                try {
                    const util = require('util');
                    const fs = require('fs');
                    const os = require('os');
                    const path = require('path');
                    const execAsync = util.promisify(require('child_process').exec);
                    
                    const tempScriptPath = path.join(os.tmpdir(), `laomos-py-${Date.now()}.py`);
                    fs.writeFileSync(tempScriptPath, code);

                    const { stdout, stderr } = await execAsync(`python3 ${tempScriptPath}`, { timeout: 60000 });
                    
                    // Cleanup
                    try { fs.unlinkSync(tempScriptPath); } catch (e) {}
                    
                    return {
                        success: true,
                        output: (stdout || '') + (stderr || '')
                    };
                } catch (error: any) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        });
    }
}
