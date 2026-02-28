import Database from 'better-sqlite3';
import { AgentScheduler } from './scheduler';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface CronJob {
    id: string;
    name: string;
    flowId: string; // The ID of the flow/job to run, or empty if we just have nodes/edges
    nodes: any;
    edges: any;
    intervalValue: string; // 'daily', 'weekly', 'monthly'
    lastRunDate: number;
}

export class CronManager {
    private db: Database.Database;
    private scheduler: AgentScheduler;
    private pollingInterval: NodeJS.Timeout;

    constructor(storageDir: string, scheduler: AgentScheduler) {
        this.scheduler = scheduler;
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        const dbPath = path.join(storageDir, 'cron.db');
        this.db = new Database(dbPath);
        this.initSchema();

        // Start polling every minute (60000ms)
        this.pollingInterval = setInterval(() => this.pollJobs(), 60000);
    }

    private initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cron_jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                nodes TEXT NOT NULL,
                edges TEXT NOT NULL,
                intervalValue TEXT NOT NULL,
                lastRunDate INTEGER NOT NULL
            )
        `);
    }

    public getJobs(): CronJob[] {
        const stmt = this.db.prepare('SELECT * FROM cron_jobs');
        const rows = stmt.all();
        return rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            flowId: '',
            nodes: JSON.parse(row.nodes),
            edges: JSON.parse(row.edges),
            intervalValue: row.intervalValue,
            lastRunDate: row.lastRunDate
        }));
    }

    public addJob(name: string, nodes: any, edges: any, intervalValue: string): string {
        const id = uuidv4();
        const stmt = this.db.prepare(`
            INSERT INTO cron_jobs (id, name, nodes, edges, intervalValue, lastRunDate)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, name, JSON.stringify(nodes), JSON.stringify(edges), intervalValue, Date.now());
        console.log(`[CronManager] Scheduled job ${name} (${id}) running ${intervalValue}`);
        return id;
    }

    public deleteJob(id: string) {
        const stmt = this.db.prepare('DELETE FROM cron_jobs WHERE id = ?');
        stmt.run(id);
        console.log(`[CronManager] Deleted scheduled job ${id}`);
    }

    private async pollJobs() {
        // console.log('[CronManager] Polling jobs...');
        const jobs = this.getJobs();
        const now = Date.now();

        for (const job of jobs) {
            let shouldRun = false;
            const msSinceLast = now - job.lastRunDate;

            // Simple intervals implementation
            if (job.intervalValue === 'daily' && msSinceLast >= 24 * 60 * 60 * 1000) {
                shouldRun = true;
            } else if (job.intervalValue === 'weekly' && msSinceLast >= 7 * 24 * 60 * 60 * 1000) {
                shouldRun = true;
            } else if (job.intervalValue === 'monthly' && msSinceLast >= 30 * 24 * 60 * 60 * 1000) {
                // approximate
                shouldRun = true;
            }

            // Also support testing/demo interval 'every_minute'
            if (job.intervalValue === 'minute' && msSinceLast >= 60 * 1000) {
                shouldRun = true;
            }

            if (shouldRun) {
                console.log(`[CronManager] Triggering scheduled job: ${job.name} (${job.id})`);
                try {
                    // Update lastRunDate before submitting to prevent double-runs
                    const stmt = this.db.prepare('UPDATE cron_jobs SET lastRunDate = ? WHERE id = ?');
                    stmt.run(Date.now(), job.id);

                    await this.scheduler.submitJob(job.nodes, job.edges);
                } catch (e: any) {
                    console.error(`[CronManager] Error executing scheduled job ${job.id}: ${e.message}`);
                }
            }
        }
    }

    public shutdown() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        this.db.close();
    }
}
