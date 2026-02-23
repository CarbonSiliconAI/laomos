
import express from 'express';
import path from 'path';
import { GraphManager } from './graph_manager';

import { FileSystemManager } from './fs_manager';

import { OllamaManager } from './ollama_manager';

import { IdentityManager } from './identity_manager';
import { ExternalAPIManager } from './external_api';
import { ModelRouter } from './kernel/router';
import { ContextManager } from './kernel/memory';
import { AgentScheduler } from './kernel/scheduler';
import { PromptRegistry } from './kernel/prompt_registry';
import { ToolRegistry } from './kernel/tool_registry';
import axios from 'axios';
import * as lancedb from 'vectordb';

export class Server {
    private app: express.Application;
    private port: number;
    private graphManager: GraphManager;
    private fsManager: FileSystemManager;
    private ollamaManager: OllamaManager;
    private identityManager: IdentityManager;
    private externalApiManager: ExternalAPIManager;
    private modelRouter: ModelRouter;
    private memory: ContextManager;
    private scheduler: AgentScheduler;
    private registry: PromptRegistry;
    private tools: ToolRegistry;

    constructor(graphManager: GraphManager, fsManager: FileSystemManager, ollamaManager: OllamaManager, identityManager: IdentityManager, externalApiManager: ExternalAPIManager, modelRouter: ModelRouter, memory: ContextManager, scheduler: AgentScheduler, registry: PromptRegistry, tools: ToolRegistry, port: number = 3000) {
        this.app = express();
        this.port = port;
        this.graphManager = graphManager;
        this.fsManager = fsManager;
        this.ollamaManager = ollamaManager;
        this.identityManager = identityManager;
        this.externalApiManager = externalApiManager;
        this.modelRouter = modelRouter;
        this.memory = memory;
        this.scheduler = scheduler;
        this.registry = registry;
        this.tools = tools;
        this.configureRoutes();
    }

    private configureRoutes() {
        // middleware
        this.app.use(express.static(path.join(process.cwd(), 'public')));
        this.app.use(express.json());

        // API Endpoint to proxy Ollama models
        this.app.get('/api/ollama/models', async (req, res) => {
            try {
                const models = await this.ollamaManager.listModels();
                res.json({ models });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to proxy chat
        this.app.post('/api/ollama/chat', async (req, res) => {
            try {
                const { model, messages } = req.body;
                if (!model || !messages) {
                    return res.status(400).json({ error: 'Model and messages are required' });
                }
                const response = await this.ollamaManager.chat(model, messages);
                res.json(response);
            } catch (error) {
                console.error('[Server] Chat error:', error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to pull model
        this.app.post('/api/ollama/pull', async (req, res) => {
            try {
                const { model } = req.body;
                if (!model) {
                    return res.status(400).json({ error: 'Model name is required' });
                }
                // This might take a while, so we might need to handle timeouts or async status
                // For now, simple await
                const response = await this.ollamaManager.pullModel(model);
                res.json(response);
            } catch (error) {
                console.error('[Server] Pull error:', error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to get system specs
        this.app.get('/api/system/specs', (req, res) => {
            try {
                const specs = this.ollamaManager.getSystemSpecs();
                res.json(specs);
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to get graph data
        this.app.get('/api/graph', async (req, res) => {
            try {
                const data = await this.graphManager.getGraph();
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: 'Failed to retrieve graph data' });
            }
        });

        // API Endpoint to list files
        this.app.get('/api/files/list', async (req, res) => {
            const dirPath = req.query.path as string || this.fsManager.getRootDir();
            console.log(`[Server] Listing files for path: ${dirPath}`);
            try {
                const files = await this.fsManager.listFiles(dirPath);
                res.json({
                    files,
                    path: dirPath,
                    root: this.fsManager.getRootDir()
                });
            } catch (error) {
                console.error(`[Server] Error listing files:`, error);
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to read file
        this.app.get('/api/files/read', async (req, res) => {
            const filePath = req.query.path as string;
            if (!filePath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            try {
                const content = await this.fsManager.readFile(filePath);
                res.json({ content });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // API Endpoint to create file
        // express.json() is already applied at top
        this.app.post('/api/files/create', async (req, res) => {
            try {
                const { path: filePath, content } = req.body;
                if (!filePath || content === undefined) {
                    return res.status(400).json({ error: 'Path and content are required' });
                }
                await this.fsManager.createFile(filePath, content);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });
        // API Endpoint to manage keys
        this.app.get('/api/keys', async (req, res) => {
            try {
                const keys = await this.identityManager.getAllKeys();
                res.json(keys);
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        this.app.post('/api/keys', async (req, res) => {
            try {
                const { provider, key } = req.body;
                if (!provider || !key) return res.status(400).json({ error: 'Provider and key are required' });
                await this.identityManager.addKey(provider, key);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        this.app.delete('/api/keys/:provider', async (req, res) => {
            try {
                const { provider } = req.params;
                await this.identityManager.deleteKey(provider);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: (error as Error).message });
            }
        });

        // Tool Registry Endpoint
        this.app.get('/api/kernel/tools', (req, res) => {
            const declarations = this.tools.listTools();
            res.json(declarations);
        });

        // Smart Search App Endpoint (SSE)
        this.app.get('/api/apps/search', async (req, res) => {
            const query = req.query.q as string;
            const sessionId = (req.query.sessionId as string) || 'default-os-session';

            if (!query) return res.status(400).json({ error: 'Query parameter "q" is required' });

            const searchTool = this.tools.getTool('smart_search');
            if (!searchTool) {
                return res.status(500).json({ error: 'Smart Search tool not registered in Kernel.' });
            }

            // Set headers for Server-Sent Events
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const result = await searchTool.execute({ query, sessionId }, (event) => {
                    sendEvent('trace', event);
                });

                sendEvent('result', result);
            } catch (error: any) {
                console.error('[Server] Search error:', error);
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // RAG Converter App Endpoint (SSE)
        this.app.get('/api/apps/rag-convert', async (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const docsDir = path.join(this.fsManager.getRootDir(), 'Docs');
                const ragsDir = path.join(this.fsManager.getRootDir(), 'Rags');

                sendEvent('trace', { step: 'Initialization', status: 'RUNNING', details: `Connecting to LanceDB at ${ragsDir}...` });
                const db = await lancedb.connect(ragsDir);
                sendEvent('trace', { step: 'Initialization', status: 'DONE', details: `Connected to LanceDB.` });

                sendEvent('trace', { step: 'Scanning Docs', status: 'RUNNING', details: `Scanning ${docsDir} for files...` });
                const files = await this.fsManager.listFiles(docsDir);
                const textFiles = files.filter(f => !f.isDirectory && (f.name.endsWith('.txt') || f.name.endsWith('.md')));

                if (textFiles.length === 0) {
                    sendEvent('trace', { step: 'Scanning Docs', status: 'DONE', details: `No text or markdown files found in Docs.` });
                    sendEvent('result', { message: 'No files to process.' });
                    return res.end();
                }

                sendEvent('trace', { step: 'Scanning Docs', status: 'DONE', details: `Found ${textFiles.length} files.` });

                const tableNames = await db.tableNames();

                for (const file of textFiles) {
                    sendEvent('trace', { step: `Processing ${file.name}`, status: 'RUNNING', details: `Reading and chunking file...` });

                    // Create a safe table name from the file name
                    const tableName = `doc_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

                    if (tableNames.includes(tableName)) {
                        sendEvent('trace', { step: `Processing ${file.name}`, status: 'DONE', details: `Table ${tableName} already exists. Skipping.` });
                        continue;
                    }

                    const content = await this.fsManager.readFile(file.path);

                    // Simple chunking (e.g., split by paragraphs or 1000 chars)
                    const chunks = content.match(/[\s\S]{1,1000}/g) || [];

                    // Generate dummy vectors for simulation
                    const records = chunks.map((chunk, i) => ({
                        id: `${file.name}_chunk_${i}`,
                        vector: new Array(128).fill(0).map(() => Math.random()),
                        text: chunk,
                        source: file.name
                    }));

                    if (records.length > 0) {
                        sendEvent('trace', { step: `Embedding ${file.name}`, status: 'RUNNING', details: `Creating LanceDB table with ${records.length} chunks...` });
                        await db.createTable(tableName, records);
                        sendEvent('trace', { step: `Embedding ${file.name}`, status: 'DONE', details: `Saved to table: ${tableName}` });
                    }
                    sendEvent('trace', { step: `Processing ${file.name}`, status: 'DONE', details: `Finished processing.` });
                }

                sendEvent('result', { message: 'Conversion completed successfully.' });
            } catch (error: any) {
                console.error('[Server] RAG Convert error:', error);
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // AI Generation Endpoints
        this.app.post('/api/ai/chat', async (req, res) => {
            try {
                const { prompt, sessionId = 'default-os-session' } = req.body;
                if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

                // 1. Add user message
                await this.memory.addMessage(sessionId, 'user', prompt);

                // 2. Build super-prompt from Virtual Memory
                const context = this.memory.getContext(sessionId);
                const retrieved = await this.memory.retrieveContext(sessionId, prompt, 2);
                const retrievedRags = await this.memory.retrieveFromRags(prompt, 2);

                const superContext = [retrieved, retrievedRags].filter(c => c.trim().length > 0).join('\n');

                const promptData = this.registry.format('agent_chat', 'default_response', {
                    retrievedContext: superContext,
                    memoryContext: context
                });

                // 3. Route
                const result = await this.modelRouter.routeChat(promptData.prompt);

                // 4. Commit assistant reply
                if (result.response) {
                    await this.memory.addMessage(sessionId, 'assistant', result.response);
                }

                res.json(result);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/ai/generate-image', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'openai' && provider !== 'mock' && provider !== 'google') return res.status(400).json({ error: 'Only OpenAI, Google, and Mock supported for image generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const imageUrl = await this.externalApiManager.generateImage(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { url: imageUrl });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        this.app.get('/api/ai/generate-graph', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'openai' && provider !== 'google' && provider !== 'mock') return res.status(400).json({ error: 'Only OpenAI, Google, and Mock supported for graph generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const graphCode = await this.externalApiManager.generateGraph(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { code: graphCode });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        this.app.get('/api/ai/generate-video', async (req, res) => {
            const provider = req.query.provider as string;
            const prompt = req.query.prompt as string;
            if (!provider || !prompt) return res.status(400).json({ error: 'Provider and prompt required' });

            if (provider !== 'google' && provider !== 'openai' && provider !== 'mock') return res.status(400).json({ error: 'Only Google, OpenAI, and Mock supported for video generation currently.' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (type: string, data: any) => {
                res.write(`event: ${type}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            try {
                const videoUrl = await this.externalApiManager.generateVideo(provider, prompt, (event) => {
                    sendEvent('trace', event);
                });
                sendEvent('result', { url: videoUrl });
            } catch (error: any) {
                sendEvent('error', { message: error.message });
            } finally {
                res.end();
            }
        });

        // Kernel Scheduler Endpoints
        this.app.post('/api/kernel/run', async (req, res) => {
            try {
                const { nodes, edges } = req.body;
                if (!nodes || !edges) return res.status(400).json({ error: 'Graph data required' });
                const jobId = await this.scheduler.submitJob(nodes, edges);
                res.json({ jobId });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/kernel/status/:jobId', (req, res) => {
            const state = this.scheduler.getJobStatus(req.params.jobId);
            if (!state) return res.status(404).json({ error: 'Job not found' });
            res.json(state);
        });

        // Mock Search API Endpoint for AI Flow Testing
        this.app.post('/api/ai/search', async (req, res) => {
            try {
                const { query } = req.body;
                if (!query) return res.status(400).json({ error: 'Query required' });

                // Simulate network delay
                await new Promise(resolve => setTimeout(resolve, 800));

                res.json({
                    results: [
                        { title: `Search Result for: ${query}`, snippet: `This is a simulated search result containing information about ${query}.`, url: 'https://example.com' },
                        { title: `Related info: ${query} architecture`, snippet: `Deep dive into the structural components of ${query}.`, url: 'https://example.com/arch' }
                    ]
                });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // Proxy route for authenticated media fetching
        this.app.get('/api/media/fetch', async (req, res) => {
            try {
                const uri = req.query.uri as string;
                if (!uri) return res.status(400).send('URI required');

                // VERY rudimentary security check: ensure it's a googleapis domain
                if (!uri.startsWith('https://generativelanguage.googleapis.com')) {
                    return res.status(403).send('Forbidden URI');
                }

                const googleKey = await this.identityManager.getKey('google');
                if (!googleKey) return res.status(401).send('Google API key required');

                // Append key if not present (Veo returns uris without the key usually)
                const fetchUrl = uri.includes('key=') ? uri : `${uri}&key=${googleKey}`;
                console.log(`[Media Proxy] Requesting: ${uri.split('?')[0]}`);

                try {
                    // Fetch as arraybuffer to have full control over headers and sending
                    const response = await axios({
                        method: 'GET',
                        url: fetchUrl,
                        responseType: 'arraybuffer',
                        headers: {
                            'Range': req.headers.range || ''
                        }
                    });

                    const contentType = response.headers['content-type'] || 'video/mp4';
                    console.log(`[Media Proxy] Response status: ${response.status}, Content-Type: ${contentType}, Content-Length: ${response.headers['content-length']}`);

                    if (contentType.includes('text/html') || contentType.includes('application/json')) {
                        const textData = Buffer.from(response.data).toString('utf-8');
                        console.error(`[Media Proxy] Expected video but got text:`, textData.substring(0, 500));
                        return res.status(500).send('Received non-video content from API');
                    }

                    // Forward relevant headers for video streaming
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Permissive CORS for media

                    if (response.headers['content-length']) {
                        res.setHeader('Content-Length', response.headers['content-length']);
                    }
                    if (response.headers['content-range']) {
                        res.setHeader('Content-Range', response.headers['content-range']);
                        res.status(206); // Partial content
                    } else {
                        res.status(200);
                    }

                    res.send(response.data);

                } catch (e: any) {
                    console.error('[Media Proxy] Axios Fetch Error:', e.message);
                    if (e.response) {
                        console.error(`[Media Proxy] Status: ${e.response.status}`);
                        console.error(`[Media Proxy] Body:`, Buffer.from(e.response.data || '').toString('utf-8').substring(0, 500));
                    }
                    res.status(500).send('Failed to fetch media');
                }
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        this.app.post('/api/keys/verify', async (req, res) => {
            try {
                const { provider } = req.body;
                if (!provider) return res.status(400).json({ error: 'Provider required' });

                const isValid = await this.externalApiManager.verifyKey(provider);
                res.json({ valid: isValid });
            } catch (error: any) {
                // If the key is missing or provider unsupported, it throws.
                // If axios fails, verifyKey returns false (caught internally), unless it throws for unsupported provider.
                // We'll return success: false and the error message if it was a "system" error, 
                // but verifyKey currently returns boolean for "api" check.
                // Let's wrap verifyKey's throw for "unsupported" vs "invalid".
                res.status(500).json({ error: error.message });
            }
        });
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`[Server] Web Interface running at http://localhost:${this.port}`);
        });
    }
}
