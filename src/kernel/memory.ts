import * as lancedb from 'vectordb';
import { ModelRouter } from './router';
import { PromptRegistry } from './prompt_registry';
import path from 'path';
import fs from 'fs-extra';

export interface MemoryEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export class ContextManager {
    private dbDir: string;
    private l1Cache: Map<string, MemoryEntry[]> = new Map();
    private l2Cache: Map<string, string> = new Map();
    private registery: Map<string, string> = new Map();
    private router: ModelRouter;
    private registry: PromptRegistry;
    private db: any; // lancedb.Connection

    private readonly MAX_TOKENS = 4000;
    private readonly COMPRESSION_THRESHOLD = 0.8; // 80%
    private readonly L1_KEEP = 5; // keep last 5 messages when compressing

    constructor(systemDir: string, router: ModelRouter, registry: PromptRegistry) {
        this.dbDir = path.join(systemDir, '.aos_vectors');
        this.router = router;
        this.registry = registry;
    }

    async init() {
        await fs.ensureDir(this.dbDir);
        this.db = await lancedb.connect(this.dbDir);
        console.log(`[ContextManager] Initialized LanceDB at ${this.dbDir}`);
    }

    setSystemPrompt(sessionId: string, prompt: string) {
        this.registery.set(sessionId, prompt);
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
        if (!this.l1Cache.has(sessionId)) {
            this.l1Cache.set(sessionId, []);
            this.l2Cache.set(sessionId, "");
        }

        const history = this.l1Cache.get(sessionId)!;
        history.push({ role, content, timestamp: Date.now() });

        await this.checkCompression(sessionId);
    }

    private estimateTokens(text: string): number {
        return Math.floor(text.length / 4); // basic heuristic
    }

    private async checkCompression(sessionId: string) {
        const history = this.l1Cache.get(sessionId)!;
        const systemPrompt = this.registery.get(sessionId) || "";
        const summary = this.l2Cache.get(sessionId) || "";

        let totalTokens = this.estimateTokens(systemPrompt) + this.estimateTokens(summary);
        for (const msg of history) {
            totalTokens += this.estimateTokens(msg.content);
        }

        // Trigger compression if we exceed 80% capacity
        if (totalTokens > this.MAX_TOKENS * this.COMPRESSION_THRESHOLD) {
            console.log(`[ContextManager] Token threshold reached for session ${sessionId}. Triggering Swap to Vector.`);
            await this.compressMemory(sessionId);
        }
    }

    private async compressMemory(sessionId: string) {
        const history = this.l1Cache.get(sessionId)!;
        if (history.length <= this.L1_KEEP) return;

        const toCompress = history.slice(0, history.length - this.L1_KEEP);
        this.l1Cache.set(sessionId, history.slice(history.length - this.L1_KEEP));

        const textToCompress = toCompress.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

        // 1. Generate new summary using LLM (L2 Cache)
        const currentSummary = this.l2Cache.get(sessionId) || "";

        try {
            const promptData = this.registry.format('kernel_memory', 'summarize_context', {
                existingSummary: currentSummary || "None.",
                textToCompress: textToCompress
            });

            const { response: newSummary } = await this.router.routeChat(promptData.prompt);
            this.l2Cache.set(sessionId, newSummary);
            console.log(`[ContextManager] L2 Cache Summary updated for session ${sessionId}`);
        } catch (e) {
            console.error(`[ContextManager] Compression failed to route:`, e);
        }

        // 2. Swap to LanceDB Vector Store (Disk layer)
        await this.storeToVectorDB(sessionId, textToCompress);
    }

    private async storeToVectorDB(sessionId: string, text: string) {
        if (!this.db) return;
        const tableName = `session_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Dummy 128-dim vector if no fast local embedder available
        const vector = new Array(128).fill(0).map(() => Math.random());

        const record = [{ vector, text, timestamp: Date.now() }];

        try {
            const tableNames = await this.db.tableNames();
            if (tableNames.includes(tableName)) {
                const table = await this.db.openTable(tableName);
                await table.add(record);
            } else {
                await this.db.createTable(tableName, record);
            }
            console.log(`[ContextManager] Swapped memory to Disk (LanceDB) for session ${sessionId}`);
        } catch (error) {
            console.error(`[ContextManager] LanceDB swap error:`, error);
        }
    }

    public getContext(sessionId: string): string {
        const systemPrompt = this.registery.get(sessionId) || "";
        const summary = this.l2Cache.get(sessionId) || "";
        const history = this.l1Cache.get(sessionId) || [];

        let context = "";
        if (systemPrompt) context += `<Register_SystemPrompt>\n${systemPrompt}\n</Register_SystemPrompt>\n\n`;
        if (summary) context += `<L2_Cache_Summary>\n${summary}\n</L2_Cache_Summary>\n\n`;

        if (history.length > 0) {
            context += `<L1_Cache_ActiveWindow>\n`;
            context += history.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
            context += `\n</L1_Cache_ActiveWindow>`;
        }

        return context;
    }

    // Example Retrieval (Disk)
    public async retrieveContext(sessionId: string, query: string, limit: number = 2): Promise<string> {
        if (!this.db) return "";
        const tableName = `session_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        try {
            const tableNames = await this.db.tableNames();
            if (!tableNames.includes(tableName)) return "";

            const table = await this.db.openTable(tableName);

            // Dummy vector search for simulation
            const dummyQueryVector = new Array(128).fill(0).map(() => Math.random());

            const results = await table.search(dummyQueryVector).limit(limit).execute();
            if (!results || results.length === 0) return "";

            let retrieved = `<Disk_Vector_Retrieval>\nRelevant past memories:\n`;
            results.forEach((r: any) => {
                retrieved += `---\n${r.text}\n`;
            });
            retrieved += `</Disk_Vector_Retrieval>\n\n`;
            return retrieved;

        } catch (error) {
            console.error(`[ContextManager] LanceDB retrieval error:`, error);
            return "";
        }
    }
}
