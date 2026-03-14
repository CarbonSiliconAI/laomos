
import { Octokit } from '@octokit/rest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import { ModelRouter } from './kernel/router';
import { telemetryBus } from './telemetry/bus';

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

export interface AgencySkill {
    id: string;
    agentId: string;
    agentName: string;
    division: string;
    name: string;
    description: string;
    category: string;
    source: 'prompt' | 'metric' | 'inferred';
    createdAt: number;
}

export interface AgencyExperience {
    id: string;
    agentId: string;
    agentName: string;
    division: string;
    summary: string;
    insight: string;
    totalRuns: number;
    successRate: number;
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
        this._backfillEvolutionEvents();
        this._backfillSkills();
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
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agency_skills (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                agent_name TEXT,
                division TEXT,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'general',
                source TEXT DEFAULT 'prompt',
                created_at INTEGER NOT NULL
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agency_experience (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                agent_name TEXT,
                division TEXT,
                summary TEXT,
                insight TEXT,
                total_runs INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS evolution_events (
                event_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                source_name TEXT NOT NULL,
                trigger_json TEXT,
                intent TEXT,
                pcec_json TEXT,
                candidates_json TEXT,
                selected INTEGER,
                outcome TEXT,
                cost_usd REAL DEFAULT 0,
                latency_ms INTEGER DEFAULT 0,
                gene_id TEXT
            )
        `);
    }

    /** Backfill evolution events from existing executions that predate the evolution tracking */
    private _backfillEvolutionEvents(): void {
        const existingCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM evolution_events').get() as { cnt: number }).cnt;
        if (existingCount > 0) return; // already has data

        const executions = this.db.prepare(
            'SELECT * FROM agency_executions ORDER BY created_at ASC'
        ).all() as Array<Record<string, unknown>>;

        if (executions.length === 0) return;

        const insert = this.db.prepare(`
            INSERT OR IGNORE INTO evolution_events (event_id, timestamp, source_type, source_id, source_name, trigger_json, intent, pcec_json, candidates_json, selected, outcome, cost_usd, latency_ms, gene_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const tx = this.db.transaction(() => {
            for (const exec of executions) {
                const success = exec.status === 'success';
                const ts = new Date(exec.created_at as number).toISOString();
                const durationMs = exec.duration_ms as number || 0;
                const agentId = exec.agent_id as string;
                const agentName = exec.agent_name as string || '';

                // Look up division from agency_agents table
                const agentRow = this.db.prepare('SELECT division FROM agency_agents WHERE id = ?').get(agentId) as { division: string } | undefined;
                const division = agentRow?.division || '';

                insert.run(
                    uuidv4(), ts, 'agent', agentId, agentName,
                    JSON.stringify({
                        error_type: success ? '' : 'execution_failure',
                        error_message: success ? '' : ((exec.error as string) || 'Unknown error'),
                        exit_code: success ? 0 : 1,
                        context: { division, duration_ms: durationMs },
                    }),
                    'harden',
                    JSON.stringify({ perceive_ms: 0, construct_ms: 0, evaluate_ms: durationMs, commit_ms: 0 }),
                    '[]', null,
                    success ? 'success' : 'failure',
                    0, durationMs, agentId,
                );
            }
        });

        tx();
        console.log(`[AgencyManager] Backfilled ${executions.length} evolution events from existing executions`);
    }

    /** Backfill skills for installed agents that don't have any yet */
    private _backfillSkills(): void {
        const installed = this.db.prepare('SELECT id FROM agency_agents WHERE is_installed = 1').all() as Array<{ id: string }>;
        let backfilled = 0;
        for (const { id } of installed) {
            const existing = this.db.prepare('SELECT COUNT(*) as cnt FROM agency_skills WHERE agent_id = ?').get(id) as { cnt: number };
            if (existing.cnt === 0) {
                this.extractAndStoreSkills(id);
                backfilled++;
            }
        }
        if (backfilled > 0) {
            console.log(`[AgencyManager] Backfilled skills for ${backfilled} installed agents`);
        }
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

        // If GitHub fails (e.g. rate limit), fall back to installed agents from SQLite
        if (divisions.length === 0) {
            const installed = this.getInstalledAgents();
            if (installed.length > 0) {
                console.log(`[AgencyManager] GitHub unavailable, returning ${installed.length} installed agents from SQLite`);
                for (const agent of installed) {
                    this.cache.set(agent.id, agent);
                }
                this.cacheTimestamp = Date.now();
                return installed;
            }
            return [];
        }

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

        // Auto-extract skills on install
        this.extractAndStoreSkills(agentId);

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

            this._emitEvolutionEvent(agent, agentId, input, durationMs, true, '');

            // Auto-generate experience every 5 runs
            const runs = this.getTotalRuns(agentId);
            if (runs > 0 && runs % 5 === 0) {
                this.generateExperience(agentId).catch(e => console.error('[AgencyManager] auto-experience error:', e.message));
            }

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

            this._emitEvolutionEvent(agent, agentId, input, durationMs, false, err.message);
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

    // ── Evolution Event Emission ──────────────────────────────────────────────

    private _emitEvolutionEvent(
        agent: AgencyAgent, agentId: string, input: string,
        durationMs: number, success: boolean, errorMessage: string
    ): void {
        const event = {
            event_id: uuidv4(),
            timestamp: new Date().toISOString(),
            source_type: 'agent' as const,
            source_id: agentId,
            source_name: agent.name,
            trigger: {
                error_type: success ? '' : 'execution_failure',
                error_message: success ? '' : (errorMessage || 'Unknown error'),
                exit_code: success ? 0 : 1,
                context: {
                    input_preview: input.slice(0, 100),
                    division: agent.division,
                    duration_ms: durationMs,
                } as Record<string, unknown>,
            },
            intent: 'harden' as const,
            pcec_phases: {
                perceive_ms: 0,
                construct_ms: 0,
                evaluate_ms: durationMs,
                commit_ms: 0,
            },
            candidates: [],
            selected: null,
            outcome: success ? 'success' as const : 'failure' as const,
            cost_usd: 0,
            latency_ms: durationMs,
            gene_id: agentId,
        };

        // Persist to SQLite
        this.db.prepare(`
            INSERT INTO evolution_events (event_id, timestamp, source_type, source_id, source_name, trigger_json, intent, pcec_json, candidates_json, selected, outcome, cost_usd, latency_ms, gene_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            event.event_id, event.timestamp, event.source_type, event.source_id, event.source_name,
            JSON.stringify(event.trigger), event.intent, JSON.stringify(event.pcec_phases),
            JSON.stringify(event.candidates), event.selected, event.outcome,
            event.cost_usd, event.latency_ms, event.gene_id,
        );

        // Publish to telemetry bus
        telemetryBus.publishEvolution(event);
    }

    // ── Evolution Score ───────────────────────────────────────────────────────

    getAgentEvolutionScore(agentId: string): {
        totalRuns: number;
        successRate: number;
        avgDurationMs: number;
        trend: 'improving' | 'stable' | 'degrading';
    } {
        const total = this.db.prepare(
            'SELECT COUNT(*) as cnt FROM agency_executions WHERE agent_id = ?'
        ).get(agentId) as { cnt: number };
        const successCnt = this.db.prepare(
            "SELECT COUNT(*) as cnt FROM agency_executions WHERE agent_id = ? AND status = 'success'"
        ).get(agentId) as { cnt: number };
        const avgDur = this.db.prepare(
            'SELECT AVG(duration_ms) as avg FROM agency_executions WHERE agent_id = ?'
        ).get(agentId) as { avg: number | null };

        const totalRuns = total.cnt;
        const successRate = totalRuns > 0 ? successCnt.cnt / totalRuns : 0;
        const avgDurationMs = avgDur.avg ?? 0;

        // Trend: compare recent 10 vs previous 10
        let trend: 'improving' | 'stable' | 'degrading' = 'stable';
        if (totalRuns >= 5) {
            const recent = this.db.prepare(
                "SELECT status FROM agency_executions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10"
            ).all(agentId) as Array<{ status: string }>;
            const older = this.db.prepare(
                "SELECT status FROM agency_executions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10 OFFSET 10"
            ).all(agentId) as Array<{ status: string }>;

            if (older.length >= 3) {
                const recentRate = recent.filter(r => r.status === 'success').length / recent.length;
                const olderRate = older.filter(r => r.status === 'success').length / older.length;
                const delta = recentRate - olderRate;
                if (delta > 0.1) trend = 'improving';
                else if (delta < -0.1) trend = 'degrading';
            }
        }

        return { totalRuns, successRate, avgDurationMs, trend };
    }

    // ── Evolution Events Query ────────────────────────────────────────────────

    getEvolutionEvents(filters?: {
        sourceType?: string[];
        outcome?: string[];
        limit?: number;
    }): Array<Record<string, unknown>> {
        let query = 'SELECT * FROM evolution_events WHERE 1=1';
        const params: unknown[] = [];

        if (filters?.sourceType?.length) {
            query += ` AND source_type IN (${filters.sourceType.map(() => '?').join(',')})`;
            params.push(...filters.sourceType);
        }
        if (filters?.outcome?.length) {
            query += ` AND outcome IN (${filters.outcome.map(() => '?').join(',')})`;
            params.push(...filters.outcome);
        }

        query += ' ORDER BY timestamp DESC';

        if (filters?.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
        return rows.map(row => ({
            event_id: row.event_id,
            timestamp: row.timestamp,
            source_type: row.source_type,
            source_id: row.source_id,
            source_name: row.source_name,
            trigger: JSON.parse(row.trigger_json as string || '{}'),
            intent: row.intent,
            pcec_phases: JSON.parse(row.pcec_json as string || '{}'),
            candidates: JSON.parse(row.candidates_json as string || '[]'),
            selected: row.selected as number | null,
            outcome: row.outcome,
            cost_usd: row.cost_usd,
            latency_ms: row.latency_ms,
            gene_id: row.gene_id,
        }));
    }

    // ── Skills & Experience (F6) ──────────────────────────────────────────────

    getTotalRuns(agentId: string): number {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM agency_executions WHERE agent_id = ?').get(agentId) as { cnt: number };
        return row.cnt;
    }

    extractAndStoreSkills(agentId: string): AgencySkill[] {
        const row = this.db.prepare('SELECT * FROM agency_agents WHERE id = ?').get(agentId) as any;
        if (!row) return [];

        const content: string = row.prompt_content || '';
        const agentName: string = row.name || '';
        const division: string = row.division || '';
        const now = Date.now();

        // Delete old skills for this agent
        this.db.prepare('DELETE FROM agency_skills WHERE agent_id = ?').run(agentId);

        const skills: AgencySkill[] = [];

        // 1. Extract from Critical Rules section
        const criticalSkills = extractSkills(content);
        for (const s of criticalSkills) {
            const skill: AgencySkill = {
                id: `skill-${uuidv4()}`,
                agentId, agentName, division,
                name: s.length > 60 ? s.slice(0, 57) + '...' : s,
                description: s,
                category: this._inferCategory(s),
                source: 'prompt',
                createdAt: now,
            };
            skills.push(skill);
        }

        // 2. Extract from Success Metrics
        const metrics = extractMetrics(content);
        for (const m of metrics) {
            const skill: AgencySkill = {
                id: `skill-${uuidv4()}`,
                agentId, agentName, division,
                name: m.length > 60 ? m.slice(0, 57) + '...' : m,
                description: m,
                category: 'metric',
                source: 'metric',
                createdAt: now,
            };
            skills.push(skill);
        }

        // 3. Extract from h2 section titles as inferred capabilities
        const h2s = content.match(/^##\s+(.+)/gm) || [];
        for (const h2 of h2s) {
            const title = h2.replace(/^##\s+/, '').replace(/[🚨📊🎯⚡💡🔧]/g, '').trim();
            if (title.length < 3 || /critical|success|metric/i.test(title)) continue;
            const skill: AgencySkill = {
                id: `skill-${uuidv4()}`,
                agentId, agentName, division,
                name: title,
                description: `Capability area: ${title}`,
                category: this._inferCategory(title),
                source: 'inferred',
                createdAt: now,
            };
            skills.push(skill);
        }

        // Persist
        const insert = this.db.prepare(`
            INSERT INTO agency_skills (id, agent_id, agent_name, division, name, description, category, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const tx = this.db.transaction(() => {
            for (const sk of skills) {
                insert.run(sk.id, sk.agentId, sk.agentName, sk.division, sk.name, sk.description, sk.category, sk.source, sk.createdAt);
            }
        });
        tx();

        console.log(`[AgencyManager] Extracted ${skills.length} skills for ${agentName}`);
        return skills;
    }

    private _inferCategory(text: string): string {
        const t = text.toLowerCase();
        if (/test|qa|quality|bug|defect/i.test(t)) return 'testing';
        if (/code|develop|engineer|build|deploy|ci|cd/i.test(t)) return 'engineering';
        if (/design|ui|ux|visual|layout/i.test(t)) return 'design';
        if (/market|seo|content|brand|campaign/i.test(t)) return 'marketing';
        if (/sale|revenue|deal|pipeline|lead/i.test(t)) return 'sales';
        if (/strateg|plan|roadmap|vision/i.test(t)) return 'strategy';
        if (/support|help|ticket|customer/i.test(t)) return 'support';
        if (/manage|project|sprint|agile|scrum/i.test(t)) return 'management';
        return 'general';
    }

    async generateExperience(agentId: string): Promise<AgencyExperience | null> {
        const row = this.db.prepare('SELECT * FROM agency_agents WHERE id = ? AND is_installed = 1').get(agentId) as any;
        if (!row) return null;

        const agentName: string = row.name || '';
        const division: string = row.division || '';
        const totalRuns = this.getTotalRuns(agentId);
        if (totalRuns === 0) return null;

        const score = this.getAgentEvolutionScore(agentId);

        // Get recent executions for context
        const recentExecs = this.db.prepare(
            'SELECT input, output, status, duration_ms FROM agency_executions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 5'
        ).all(agentId) as Array<{ input: string; output: string; status: string; duration_ms: number }>;

        const execSummary = recentExecs.map((e, i) =>
            `Run ${i + 1}: [${e.status}] input="${e.input.slice(0, 80)}" duration=${e.duration_ms}ms`
        ).join('\n');

        // Generate insight via LLM if available
        let insight = `Agent has completed ${totalRuns} runs with ${Math.round(score.successRate * 100)}% success rate. Trend: ${score.trend}.`;
        let summary = `${agentName} — ${totalRuns} executions, ${Math.round(score.successRate * 100)}% success`;

        if (this.modelRouter) {
            try {
                const prompt = [
                    `You are summarizing the experience of an AI agent named "${agentName}" (division: ${division}).`,
                    `Stats: ${totalRuns} total runs, ${Math.round(score.successRate * 100)}% success rate, avg ${Math.round(score.avgDurationMs)}ms, trend: ${score.trend}.`,
                    `Recent runs:\n${execSummary}`,
                    '',
                    'Write a concise 2-sentence experience summary and a 1-sentence actionable insight for improving this agent.',
                    'Format: SUMMARY: <text>\nINSIGHT: <text>',
                ].join('\n');
                const result = await this.modelRouter.routeChat(prompt, 'cloud');
                const text = typeof result === 'string' ? result : (result as any)?.content || '';
                const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
                const insightMatch = text.match(/INSIGHT:\s*(.+)/i);
                if (summaryMatch) summary = summaryMatch[1].trim();
                if (insightMatch) insight = insightMatch[1].trim();
            } catch (err: any) {
                console.error(`[AgencyManager] generateExperience LLM error: ${err.message}`);
            }
        }

        const exp: AgencyExperience = {
            id: `exp-${uuidv4()}`,
            agentId, agentName, division,
            summary, insight,
            totalRuns, successRate: score.successRate,
            createdAt: Date.now(),
        };

        this.db.prepare(`
            INSERT INTO agency_experience (id, agent_id, agent_name, division, summary, insight, total_runs, success_rate, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(exp.id, exp.agentId, exp.agentName, exp.division, exp.summary, exp.insight, exp.totalRuns, exp.successRate, exp.createdAt);

        console.log(`[AgencyManager] Generated experience for ${agentName}: ${totalRuns} runs`);
        return exp;
    }

    getSkills(agentId?: string): AgencySkill[] {
        const query = agentId
            ? 'SELECT * FROM agency_skills WHERE agent_id = ? ORDER BY created_at DESC'
            : 'SELECT * FROM agency_skills ORDER BY created_at DESC';
        const rows = (agentId ? this.db.prepare(query).all(agentId) : this.db.prepare(query).all()) as any[];
        return rows.map(r => ({
            id: r.id, agentId: r.agent_id, agentName: r.agent_name, division: r.division,
            name: r.name, description: r.description, category: r.category, source: r.source,
            createdAt: r.created_at,
        }));
    }

    getExperience(agentId?: string): AgencyExperience[] {
        const query = agentId
            ? 'SELECT * FROM agency_experience WHERE agent_id = ? ORDER BY created_at DESC'
            : 'SELECT * FROM agency_experience ORDER BY created_at DESC';
        const rows = (agentId ? this.db.prepare(query).all(agentId) : this.db.prepare(query).all()) as any[];
        return rows.map(r => ({
            id: r.id, agentId: r.agent_id, agentName: r.agent_name, division: r.division,
            summary: r.summary, insight: r.insight, totalRuns: r.total_runs, successRate: r.success_rate,
            createdAt: r.created_at,
        }));
    }
}
