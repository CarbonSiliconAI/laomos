
import { Octokit } from '@octokit/rest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { ModelRouter } from './kernel/router';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencyAgent {
    id: string;
    name: string;
    description: string;
    division: string;
    color?: string;
    emoji?: string;
    sha: string;
    promptContent: string;
    skills: string[];
    metrics: string[];
    installedAt?: number;
    isInstalled: boolean;
}

export interface AgencyExecution {
    id: string;
    agentId: string;
    agentName: string;
    input: string;
    output: string;
    durationMs: number;
    status: 'success' | 'failed';
    error?: string;
    createdAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const REPO_OWNER = 'msitarzewski';
const REPO_NAME = 'agency-agents';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const EXCLUDED_DIRS = new Set(['.github', 'scripts', 'examples']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
    return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractSkills(content: string): string[] {
    const match = content.match(/^##\s+.*(?:Critical|🚨).*$/im);
    if (!match) return [];
    const startIdx = content.indexOf(match[0]) + match[0].length;
    const rest = content.slice(startIdx);
    // Stop at next h2
    const nextH2 = rest.search(/^##\s+/m);
    const section = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;
    const items: string[] = [];
    for (const line of section.split('\n')) {
        const m = line.match(/^\s*-\s+(.+)/);
        if (m) items.push(m[1].trim());
    }
    return items;
}

function extractMetrics(content: string): string[] {
    const match = content.match(/^##\s+.*Success\s+Metrics.*$/im);
    if (!match) return [];
    const startIdx = content.indexOf(match[0]) + match[0].length;
    const rest = content.slice(startIdx);
    const nextH2 = rest.search(/^##\s+/m);
    const section = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;
    const items: string[] = [];
    for (const line of section.split('\n')) {
        const m = line.match(/^\s*-\s+(.+)/);
        if (m) items.push(m[1].trim());
    }
    return items;
}

// ── AgencyManager ────────────────────────────────────────────────────────────

export class AgencyManager {
    private octokit: Octokit;
    private db: Database.Database;
    private cache = new Map<string, AgencyAgent>();
    private cacheTimestamp = 0;
    private modelRouter: ModelRouter | null = null;

    constructor(systemDir: string) {
        this.octokit = new Octokit();

        const dbDir = path.join(systemDir, '.laomos_state');
        fs.ensureDirSync(dbDir);
        const dbPath = path.join(dbDir, 'agency_agents.db');
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this._createSchema();

        console.log(`[AgencyManager] SQLite DB initialized at ${dbPath}`);
    }

    setModelRouter(router: ModelRouter): void {
        this.modelRouter = router;
    }

    private _createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agency_agents (
                id TEXT PRIMARY KEY,
                name TEXT,
                description TEXT,
                division TEXT,
                sha TEXT,
                prompt_content TEXT,
                skills TEXT,
                metrics TEXT,
                installed_at INTEGER,
                is_installed INTEGER DEFAULT 0
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agency_executions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                agent_name TEXT,
                input TEXT,
                output TEXT,
                duration_ms INTEGER,
                status TEXT DEFAULT 'success',
                error TEXT,
                created_at INTEGER NOT NULL
            )
        `);
    }

    // ── GitHub fetches ───────────────────────────────────────────────────────

    async fetchDivisions(): Promise<string[]> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                path: '',
            });
            if (!Array.isArray(data)) return [];
            return data
                .filter((item: any) => item.type === 'dir' && !EXCLUDED_DIRS.has(item.name))
                .map((item: any) => item.name);
        } catch (error: any) {
            console.error('[AgencyManager] fetchDivisions error:', error.message);
            return [];
        }
    }

    async fetchAgentsByDivision(division: string): Promise<Array<{ name: string; path: string; sha: string }>> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                path: division,
            });
            if (!Array.isArray(data)) return [];
            return data
                .filter((item: any) => item.type === 'file' && item.name.endsWith('.md'))
                .map((item: any) => ({ name: item.name, path: item.path, sha: item.sha }));
        } catch (error: any) {
            console.error(`[AgencyManager] fetchAgentsByDivision(${division}) error:`, error.message);
            return [];
        }
    }

    async fetchAgentContent(filePath: string, sha: string): Promise<AgencyAgent | null> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                path: filePath,
            }) as { data: { content?: string; encoding?: string } };

            if (!data.content) return null;

            const raw = Buffer.from(data.content, (data.encoding as BufferEncoding) || 'base64').toString('utf-8');
            const { data: fm, content } = matter(raw);

            const parts = filePath.split('/');
            const division = parts[0];
            const fileName = parts[parts.length - 1].replace(/\.md$/, '');

            // Derive name: strip division prefix if present
            let name = fm.name as string | undefined;
            if (!name) {
                let baseName = fileName;
                if (baseName.startsWith(division + '-')) {
                    baseName = baseName.slice(division.length + 1);
                }
                name = toTitleCase(baseName);
            }

            // Derive description
            let description = fm.description as string | undefined;
            if (!description) {
                const bqMatch = content.match(/^>\s*(.+)/m);
                description = bqMatch ? bqMatch[1].trim() : '';
            }

            const agent: AgencyAgent = {
                id: filePath.replace(/\.md$/, ''),
                name,
                description: description || '',
                division,
                color: fm.color as string | undefined,
                emoji: fm.emoji as string | undefined,
                sha,
                promptContent: content.trim(),
                skills: extractSkills(content),
                metrics: extractMetrics(content),
                isInstalled: false,
            };

            // Merge install state from SQLite
            const row = this.db.prepare('SELECT installed_at, is_installed FROM agency_agents WHERE id = ?').get(agent.id) as any;
            if (row && row.is_installed) {
                agent.isInstalled = true;
                agent.installedAt = row.installed_at;
            }

            return agent;
        } catch (error: any) {
            console.error(`[AgencyManager] fetchAgentContent(${filePath}) error:`, error.message);
            return null;
        }
    }

    // ── Aggregate ────────────────────────────────────────────────────────────

    async getAllAgents(): Promise<AgencyAgent[]> {
        // Return cache if fresh
        if (this.cache.size > 0 && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
            return Array.from(this.cache.values());
        }

        const divisions = await this.fetchDivisions();
        const agents: AgencyAgent[] = [];

        // Sequential per division to avoid rate limits
        for (const division of divisions) {
            const files = await this.fetchAgentsByDivision(division);
            // Concurrent within a division (small number of files)
            const results = await Promise.all(
                files.map(f => this.fetchAgentContent(f.path, f.sha))
            );
            for (const agent of results) {
                if (agent) agents.push(agent);
            }
        }

        // Refresh cache
        this.cache.clear();
        for (const agent of agents) {
            this.cache.set(agent.id, agent);
        }
        this.cacheTimestamp = Date.now();

        return agents;
    }

    async getAgentsByDivision(division: string): Promise<AgencyAgent[]> {
        const all = await this.getAllAgents();
        return all.filter(a => a.division === division);
    }

    // ── Install / Uninstall ──────────────────────────────────────────────────

    async installAgent(agentId: string): Promise<AgencyAgent | null> {
        // Ensure we have the agent data
        let agent = this.cache.get(agentId);
        if (!agent) {
            // Try fetching fresh
            const all = await this.getAllAgents();
            agent = all.find(a => a.id === agentId);
        }
        if (!agent) return null;

        const now = Date.now();
        this.db.prepare(`
            INSERT INTO agency_agents (id, name, description, division, sha, prompt_content, skills, metrics, installed_at, is_installed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                division = excluded.division,
                sha = excluded.sha,
                prompt_content = excluded.prompt_content,
                skills = excluded.skills,
                metrics = excluded.metrics,
                installed_at = excluded.installed_at,
                is_installed = 1
        `).run(
            agent.id, agent.name, agent.description, agent.division,
            agent.sha, agent.promptContent,
            JSON.stringify(agent.skills), JSON.stringify(agent.metrics),
            now
        );

        agent.isInstalled = true;
        agent.installedAt = now;
        this.cache.set(agentId, agent);

        console.log(`[AgencyManager] Installed agent: ${agent.name}`);
        return agent;
    }

    async uninstallAgent(agentId: string): Promise<boolean> {
        this.db.prepare('UPDATE agency_agents SET is_installed = 0, installed_at = NULL WHERE id = ?').run(agentId);

        const cached = this.cache.get(agentId);
        if (cached) {
            cached.isInstalled = false;
            cached.installedAt = undefined;
        }

        console.log(`[AgencyManager] Uninstalled agent: ${agentId}`);
        return true;
    }

    getInstalledAgents(): AgencyAgent[] {
        const rows = this.db.prepare('SELECT * FROM agency_agents WHERE is_installed = 1').all() as any[];
        return rows.map(row => {
            const agent: AgencyAgent = {
                id: row.id,
                name: row.name,
                description: row.description,
                division: row.division,
                sha: row.sha,
                promptContent: row.prompt_content,
                skills: JSON.parse(row.skills || '[]'),
                metrics: JSON.parse(row.metrics || '[]'),
                installedAt: row.installed_at,
                isInstalled: true,
            };
            return agent;
        });
    }

    // ── Execute Agent Task ────────────────────────────────────────────────────

    async executeAgentTask(agentId: string, input: string, context?: string): Promise<AgencyExecution> {
        if (!this.modelRouter) {
            throw new Error('ModelRouter not configured');
        }

        // Get agent from DB or cache
        let agent = this.cache.get(agentId);
        if (!agent) {
            const row = this.db.prepare('SELECT * FROM agency_agents WHERE id = ? AND is_installed = 1').get(agentId) as any;
            if (!row) throw new Error(`Agent not found or not installed: ${agentId}`);
            agent = {
                id: row.id, name: row.name, description: row.description,
                division: row.division, sha: row.sha,
                promptContent: row.prompt_content,
                skills: JSON.parse(row.skills || '[]'),
                metrics: JSON.parse(row.metrics || '[]'),
                installedAt: row.installed_at, isInstalled: true,
            };
        }

        const prompt = [
            `You are "${agent.name}", an AI agent with the following role and instructions:`,
            '',
            agent.promptContent,
            '',
            context ? `## Previous Context\n${context}\n` : '',
            `## Task\n${input}`,
            '',
            'Provide a clear, actionable response.',
        ].filter(Boolean).join('\n');

        const execId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const startTime = Date.now();

        try {
            const result = await this.modelRouter.routeChat(prompt, 'cloud');
            const durationMs = Date.now() - startTime;
            const output = typeof result === 'string' ? result : (result as any)?.content || JSON.stringify(result);

            const execution: AgencyExecution = {
                id: execId, agentId, agentName: agent.name,
                input, output, durationMs, status: 'success',
                createdAt: startTime,
            };

            this.db.prepare(`
                INSERT INTO agency_executions (id, agent_id, agent_name, input, output, duration_ms, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'success', ?)
            `).run(execId, agentId, agent.name, input, output, durationMs, startTime);

            console.log(`[AgencyManager] Executed ${agent.name} in ${durationMs}ms`);
            return execution;
        } catch (err: any) {
            const durationMs = Date.now() - startTime;
            const execution: AgencyExecution = {
                id: execId, agentId, agentName: agent.name,
                input, output: '', durationMs, status: 'failed',
                error: err.message, createdAt: startTime,
            };

            this.db.prepare(`
                INSERT INTO agency_executions (id, agent_id, agent_name, input, output, duration_ms, status, error, created_at)
                VALUES (?, ?, ?, ?, '', ?, 'failed', ?, ?)
            `).run(execId, agentId, agent.name, input, durationMs, err.message, startTime);

            console.error(`[AgencyManager] Execution failed for ${agent.name}: ${err.message}`);
            return execution;
        }
    }

    getExecutions(agentId?: string, limit = 20): AgencyExecution[] {
        const query = agentId
            ? 'SELECT * FROM agency_executions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?'
            : 'SELECT * FROM agency_executions ORDER BY created_at DESC LIMIT ?';
        const args = agentId ? [agentId, limit] : [limit];
        const rows = this.db.prepare(query).all(...args) as any[];
        return rows.map(row => ({
            id: row.id,
            agentId: row.agent_id,
            agentName: row.agent_name,
            input: row.input,
            output: row.output,
            durationMs: row.duration_ms,
            status: row.status,
            error: row.error || undefined,
            createdAt: row.created_at,
        }));
    }
}
