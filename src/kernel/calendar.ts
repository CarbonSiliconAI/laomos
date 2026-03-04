import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export type JobType = 'skill' | 'flow';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ScheduledJob {
    id: string;
    type: JobType;
    targetId: string; // The Skill ID or the Flow ID
    inputPayload: any; // e.g. { userInput, preferredProvider } for skills
    scheduledTime: number; // Unix timestamp ms
    status: JobStatus;
    result?: string;
    error?: string;
    createdAt: number;
    completedAt?: number;
}

export class CalendarManager {
    private checkPointPath: string;
    private jobs: Map<string, ScheduledJob> = new Map();
    private timer: NodeJS.Timeout | null = null;

    // Dependencies to trigger the actual work
    private executeSkill: (targetId: string, inputPayload: any) => Promise<string>;
    private executeFlow: (targetId: string, inputPayload: any) => Promise<string>;

    constructor(
        systemDir: string,
        executeSkill: (targetId: string, inputPayload: any) => Promise<string>,
        executeFlow: (targetId: string, inputPayload: any) => Promise<string>
    ) {
        this.checkPointPath = path.join(systemDir, '.laomos_state', 'calendar.json');
        this.executeSkill = executeSkill;
        this.executeFlow = executeFlow;
    }

    async init() {
        await fs.ensureDir(path.dirname(this.checkPointPath));
        if (await fs.pathExists(this.checkPointPath)) {
            try {
                const data = await fs.readFile(this.checkPointPath, 'utf-8');
                const parsed: ScheduledJob[] = JSON.parse(data);
                for (const job of parsed) {
                    // Reset interrupted running jobs to pending so they retry
                    if (job.status === 'RUNNING') job.status = 'PENDING';

                    // Migrate string dates to numeric timestamps
                    if (typeof job.scheduledTime === 'string') {
                        job.scheduledTime = new Date(job.scheduledTime).getTime();
                    }

                    this.jobs.set(job.id, job);
                }
                console.log(`[Calendar] Loaded ${this.jobs.size} scheduled jobs.`);
            } catch (e) {
                console.error(`[Calendar] Failed to parse calendar checkpoint`, e);
            }
        }
    }

    start() {
        if (this.timer) return;
        console.log(`[Calendar] Scheduler loop started.`);
        // Note: interval runs every 10 seconds checking for due jobs
        this.timer = setInterval(() => this.tick(), 10000);
        // Do an immediate tick
        this.tick();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async addJob(type: JobType, targetId: string, inputPayload: any, scheduledTime: number): Promise<ScheduledJob> {
        const id = `caljob-${crypto.randomUUID()}`;
        const job: ScheduledJob = {
            id,
            type,
            targetId,
            inputPayload,
            scheduledTime,
            status: 'PENDING',
            createdAt: Date.now()
        };
        this.jobs.set(id, job);
        await this.save();
        console.log(`[Calendar] Added new ${type} job ${id} scheduled for ${new Date(scheduledTime).toISOString()}`);

        // Immediately tick in case they scheduled it for right now
        this.tick();
        return job;
    }

    async deleteJob(id: string): Promise<boolean> {
        if (this.jobs.has(id)) {
            this.jobs.delete(id);
            await this.save();
            return true;
        }
        return false;
    }

    getAllJobs(): ScheduledJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    private async tick() {
        const now = Date.now();
        const pendingJobs = Array.from(this.jobs.values()).filter(j => j.status === 'PENDING' && j.scheduledTime <= now);

        for (const job of pendingJobs) {
            console.log(`[Calendar] Triggering due job ${job.id} (${job.type}: ${job.targetId})...`);
            job.status = 'RUNNING';
            await this.save();

            // Run async but don't await so we don't block the other jobs in the tick
            this.runJob(job).catch(e => console.error(`[Calendar] Unhandled error running job ${job.id}`, e));
        }
    }

    private async runJob(job: ScheduledJob) {
        try {
            let result = '';
            if (job.type === 'skill') {
                result = await this.executeSkill(job.targetId, job.inputPayload);
            } else if (job.type === 'flow') {
                result = await this.executeFlow(job.targetId, job.inputPayload);
            } else {
                throw new Error(`Unknown job type: ${job.type}`);
            }

            job.status = 'COMPLETED';
            job.result = result;
            job.completedAt = Date.now();
        } catch (e: any) {
            job.status = 'FAILED';
            job.error = e.message;
            job.completedAt = Date.now();
        } finally {
            await this.save();
            console.log(`[Calendar] Job ${job.id} finished with status ${job.status}`);
        }
    }

    private async save() {
        try {
            const data = Array.from(this.jobs.values());
            await fs.writeFile(this.checkPointPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[Calendar] Error saving checkpoint:', e);
        }
    }
}
