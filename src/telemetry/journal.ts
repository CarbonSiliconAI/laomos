import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { ExecutionEvent, ExecutionRecord, FlowSnapshot } from './types';
import { telemetryBus } from './bus';

export class ExecutionJournal {
    private db: Database.Database;

    constructor(systemDir: string) {
        const dbDir = path.join(systemDir, '.aos_state');
        fs.ensureDirSync(dbDir);
        const dbPath = path.join(dbDir, 'telemetry.db');
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this._createSchema();
        this._migrateSchema();

        // Persist every end-of-task event (skip 'running' start events — no metrics yet)
        telemetryBus.subscribe((event) => {
            if (event.status !== 'running') this.recordEvent(event);
        });

        console.log(`[Journal] SQLite telemetry DB initialized at ${dbPath}`);
    }

    private _createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS runs (
                run_id           TEXT PRIMARY KEY,
                job_id           TEXT,
                flow_snapshot    TEXT,
                status           TEXT DEFAULT 'running',
                total_cost_usd   REAL DEFAULT 0,
                total_latency_ms REAL DEFAULT 0,
                rating           INTEGER,
                outcome          TEXT,
                created_at       INTEGER,
                completed_at     INTEGER
            );

            CREATE TABLE IF NOT EXISTS events (
                event_id      TEXT PRIMARY KEY,
                run_id        TEXT REFERENCES runs(run_id),
                node_id       TEXT,
                tool          TEXT,
                flow_id       TEXT,
                model         TEXT,
                input_tokens  INTEGER,
                output_tokens INTEGER,
                latency_ms    REAL,
                cost_usd      REAL,
                status        TEXT,
                output_type   TEXT,
                output_preview TEXT,
                input_hash    TEXT,
                output_hash   TEXT,
                error_message TEXT,
                context       TEXT,
                timestamp     INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
            CREATE INDEX IF NOT EXISTS idx_runs_created  ON runs(created_at DESC);
        `);
    }

    private _migrateSchema(): void {
        // Add columns introduced after initial schema
        const addCols = [
            'ALTER TABLE events ADD COLUMN flow_id TEXT',
            'ALTER TABLE events ADD COLUMN output_type TEXT',
            'ALTER TABLE events ADD COLUMN context TEXT',
        ];
        for (const sql of addCols) {
            try { this.db.exec(sql); } catch { /* already exists */ }
        }

        // Rename task_type → tool if migrating from the first schema version
        const cols = (this.db.prepare('PRAGMA table_info(events)').all() as any[]).map(c => c.name);
        if (cols.includes('task_type') && !cols.includes('tool')) {
            this.db.exec('ALTER TABLE events RENAME COLUMN task_type TO tool');
        }

        // Cache table for semantic deduplication (Phase 2)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cache (
                cache_key  TEXT PRIMARY KEY,
                model      TEXT,
                tool       TEXT,
                result     TEXT,
                output_hash TEXT,
                created_at INTEGER,
                expires_at INTEGER,
                hit_count  INTEGER DEFAULT 0
            );
        `);

        // Evict expired entries at startup
        this.db.prepare('DELETE FROM cache WHERE expires_at < ?').run(Date.now());
    }

    startRun(runId: string, jobId: string, flowSnapshot: FlowSnapshot): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO runs (run_id, job_id, flow_snapshot, status, created_at)
            VALUES (?, ?, ?, 'running', ?)
        `).run(runId, jobId, JSON.stringify(flowSnapshot), Date.now());
    }

    recordEvent(event: ExecutionEvent): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO events
                (event_id, run_id, node_id, tool, flow_id, model, input_tokens, output_tokens,
                 latency_ms, cost_usd, status, output_type, output_preview, input_hash,
                 output_hash, error_message, context, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            event.event_id, event.run_id, event.node_id, event.tool,
            event.flow_id ?? null, event.model ?? null,
            event.input_tokens, event.output_tokens,
            event.latency_ms, event.cost_usd, event.status,
            event.output_type ?? null, event.output_preview ?? null,
            event.input_hash, event.output_hash ?? null,
            event.error_message ?? null,
            event.context ? JSON.stringify(event.context) : null,
            event.timestamp
        );

        // Update run aggregate totals (only for completed events)
        this.db.prepare(`
            UPDATE runs
            SET total_cost_usd   = total_cost_usd   + ?,
                total_latency_ms = total_latency_ms + ?
            WHERE run_id = ?
        `).run(event.cost_usd, event.latency_ms, event.run_id);
    }

    finalizeRun(runId: string, status: 'completed' | 'failed'): void {
        this.db.prepare(`
            UPDATE runs SET status = ?, completed_at = ? WHERE run_id = ?
        `).run(status, Date.now(), runId);
    }

    rateRun(runId: string, rating: number, outcome?: string): void {
        this.db.prepare(`
            UPDATE runs SET rating = ?, outcome = ? WHERE run_id = ?
        `).run(Math.min(5, Math.max(1, rating)), outcome ?? null, runId);
    }

    getRun(runId: string): ExecutionRecord | null {
        const run = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as any;
        if (!run) return null;
        const rawEvents = this.db.prepare(
            'SELECT * FROM events WHERE run_id = ? ORDER BY timestamp'
        ).all(runId) as any[];
        const events: ExecutionEvent[] = rawEvents.map(e => ({
            ...e,
            context: e.context ? JSON.parse(e.context) : undefined,
        }));
        return {
            run_id: run.run_id,
            job_id: run.job_id,
            flow_snapshot: JSON.parse(run.flow_snapshot || '{"nodes":[],"edges":[]}'),
            events,
            total_cost_usd: run.total_cost_usd,
            total_latency_ms: run.total_latency_ms,
            status: run.status,
            rating: run.rating,
            outcome: run.outcome,
            created_at: run.created_at,
            completed_at: run.completed_at,
        };
    }

    listRuns(limit = 50): Omit<ExecutionRecord, 'events'>[] {
        return (this.db.prepare(
            'SELECT * FROM runs ORDER BY created_at DESC LIMIT ?'
        ).all(limit) as any[]).map(r => ({
            run_id: r.run_id,
            job_id: r.job_id,
            flow_snapshot: JSON.parse(r.flow_snapshot || '{"nodes":[],"edges":[]}'),
            total_cost_usd: r.total_cost_usd,
            total_latency_ms: r.total_latency_ms,
            status: r.status,
            rating: r.rating,
            outcome: r.outcome,
            created_at: r.created_at,
            completed_at: r.completed_at,
        }));
    }

    getApiUsagePerHour(limit = 24): { hour: string; total_cost_usd: number; total_requests: number }[] {
        return this.db.prepare(`
            SELECT
                strftime('%Y-%m-%d %H:00', timestamp / 1000, 'unixepoch', 'localtime') AS hour,
                SUM(cost_usd) AS total_cost_usd,
                COUNT(*) AS total_requests
            FROM events
            WHERE status = 'success' OR status = 'completed'
            GROUP BY hour
            ORDER BY hour DESC
            LIMIT ?
        `).all(limit) as any[];
    }

    getProviderUsage(hours = 24): { provider: string; total_cost_usd: number; total_requests: number; quota_usd: number }[] {
        const rows = this.db.prepare(`
            SELECT
                CASE 
                    WHEN model LIKE 'gpt%' OR model LIKE 'o1%' OR model LIKE 'dall-e%' THEN 'OpenAI'
                    WHEN model LIKE 'claude%' THEN 'Anthropic'
                    WHEN model LIKE 'gemini%' OR model LIKE 'imagen%' THEN 'Google'
                    WHEN model LIKE 'llama%' OR model LIKE 'qwen%' OR model LIKE 'gemma%' THEN 'Local (Ollama)'
                    WHEN model IS NULL OR model = '' THEN 'Unknown'
                    ELSE 'Other'
                END AS provider,
                SUM(cost_usd) AS total_cost_usd,
                COUNT(*) AS total_requests
            FROM events
            WHERE status = 'success' OR status = 'completed'
            GROUP BY provider
            ORDER BY total_cost_usd DESC
        `).all() as any[];

        // Append mock quota to the result
        return rows.map(r => {
            let quota = 5.00; // default for external
            if (r.provider === 'Local (Ollama)') quota = 0.00; // Free

            return {
                ...r,
                quota_usd: quota
            };
        });
    }

    getStats(): { total_runs: number; total_cost_usd: number; avg_latency_ms: number; avg_rating: number } {
        const s = this.db.prepare(`
            SELECT
                COUNT(*)              AS total_runs,
                SUM(total_cost_usd)   AS total_cost_usd,
                AVG(total_latency_ms) AS avg_latency_ms,
                AVG(rating)           AS avg_rating
            FROM runs WHERE status = 'completed'
        `).get() as any;
        return {
            total_runs: s.total_runs || 0,
            total_cost_usd: s.total_cost_usd || 0,
            avg_latency_ms: s.avg_latency_ms || 0,
            avg_rating: s.avg_rating || 0,
        };
    }

    // ── Semantic Cache (Phase 2) ──────────────────────────────────────────────

    cacheGet(key: string): { model: string; tool: string; result: string; output_hash: string } | null {
        const row = this.db.prepare(
            'SELECT model, tool, result, output_hash, expires_at FROM cache WHERE cache_key = ?'
        ).get(key) as any;
        if (!row) return null;
        if (row.expires_at < Date.now()) {
            this.db.prepare('DELETE FROM cache WHERE cache_key = ?').run(key);
            return null;
        }
        this.db.prepare('UPDATE cache SET hit_count = hit_count + 1 WHERE cache_key = ?').run(key);
        return { model: row.model, tool: row.tool, result: row.result, output_hash: row.output_hash };
    }

    cacheSet(key: string, model: string, tool: string, result: string, outputHash: string, ttlMs: number): void {
        const now = Date.now();
        this.db.prepare(`
            INSERT OR REPLACE INTO cache (cache_key, model, tool, result, output_hash, created_at, expires_at, hit_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(key, model, tool, result, outputHash, now, now + ttlMs);
    }

    cacheClear(): void {
        this.db.prepare('DELETE FROM cache').run();
    }

    getCacheStats(): { total_entries: number; total_hits: number; hit_rate_pct: number } {
        const s = this.db.prepare(`
            SELECT COUNT(*) AS total_entries, SUM(hit_count) AS total_hits FROM cache
        `).get() as any;
        const total = s.total_entries || 0;
        const hits = s.total_hits || 0;
        const lookups = total + hits;
        return {
            total_entries: total,
            total_hits: hits,
            hit_rate_pct: lookups > 0 ? Math.round((hits / lookups) * 100) : 0,
        };
    }
}
