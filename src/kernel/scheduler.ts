import fs from 'fs-extra';
import path from 'path';

export type TaskStatus = 'READY' | 'WAITING' | 'DONE' | 'ERROR';

export interface AgentTask {
    id: string; // matches node id
    type: string; // chat, draw, etc
    inputs: string[];
    output?: string;
    status: TaskStatus;
    manualInput?: string;
    dependencies: string[]; // node IDs that must finish before this
}

export interface JobState {
    jobId: string;
    tasks: Record<string, AgentTask>;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export class AgentScheduler {
    private checkPointDir: string;
    private activeJobs: Map<string, JobState> = new Map();
    private apiHandlers: any; // references to ModelRouter, ExternalAPI, etc.

    constructor(systemDir: string, apiHandlers: any) {
        this.checkPointDir = path.join(systemDir, '.aos_state');
        this.apiHandlers = apiHandlers;
    }

    async init() {
        await fs.ensureDir(this.checkPointDir);
        console.log(`[Scheduler] Initialized Checkpoint Directory at ${this.checkPointDir}`);

        // Recover checkpoints
        const files = await fs.readdir(this.checkPointDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const data = await fs.readFile(path.join(this.checkPointDir, file), 'utf-8');
                    const state: JobState = JSON.parse(data);
                    // Only resume if it was running, though in a real OS we'd re-trigger the event loop
                    if (state.status === 'RUNNING') {
                        console.log(`[Scheduler] Recovered Job ${state.jobId} from checkpoint.`);
                        this.activeJobs.set(state.jobId, state);
                        this.runEventLoop(state.jobId).catch(console.error);
                    } else {
                        // Just load it into memory
                        this.activeJobs.set(state.jobId, state);
                    }
                } catch (e) {
                    console.error(`[Scheduler] Failed to parse checkpoint ${file}`, e);
                }
            }
        }
    }

    async submitJob(nodes: any[], edges: any[]): Promise<string> {
        const jobId = `job-${Date.now()}`;
        const state: JobState = { jobId, tasks: {}, status: 'RUNNING' };

        // Initialize tasks
        nodes.forEach(n => {
            state.tasks[n.id] = {
                id: n.id,
                type: n.type,
                inputs: [],
                status: 'WAITING',
                manualInput: n.manualInput,
                dependencies: []
            };
        });

        // Map dependencies
        edges.forEach(e => {
            if (state.tasks[e.to]) {
                state.tasks[e.to].dependencies.push(e.from);
            }
        });

        // Mark roots as READY
        for (const taskId in state.tasks) {
            if (state.tasks[taskId].dependencies.length === 0) {
                state.tasks[taskId].status = 'READY';
                if (state.tasks[taskId].manualInput) {
                    state.tasks[taskId].inputs.push(state.tasks[taskId].manualInput!);
                }
            }
        }

        this.activeJobs.set(jobId, state);
        await this.saveCheckpoint(jobId);

        // Kick off the event loop for this job non-blockingly
        this.runEventLoop(jobId).catch(e => console.error(e));

        return jobId;
    }

    private async runEventLoop(jobId: string) {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        let active = true;
        while (active && state.status === 'RUNNING') {
            let madeProgress = false;
            let allDone = true;

            // Iterate over tasks
            for (const taskId in state.tasks) {
                const task = state.tasks[taskId];

                if (task.status !== 'DONE' && task.status !== 'ERROR') {
                    allDone = false;
                }

                if (task.status === 'READY') {
                    madeProgress = true;
                    // Suspend to WAITING
                    task.status = 'WAITING';
                    await this.saveCheckpoint(jobId);

                    console.log(`[Scheduler] Suspending Job ${jobId} Task ${task.id} (${task.type}) for I/O...`);

                    // Execute asynchronously, don't await here!
                    // This allows the while loop to continue and find other READY tasks to kick off concurrently.
                    this.executeTask(jobId, task.id).then(async (result) => {
                        const t = state.tasks[task.id];
                        t.output = result;
                        t.status = 'DONE';
                        await this.saveCheckpoint(jobId);

                        // Propagate output to downstream dependents
                        for (const childId in state.tasks) {
                            const child = state.tasks[childId];
                            if (child.dependencies.includes(task.id)) {
                                child.inputs.push(result);
                                // Check if child is fully ready (all deps DONE)
                                const allDepsDone = child.dependencies.every(dId => state.tasks[dId].status === 'DONE');
                                if (allDepsDone) {
                                    child.status = 'READY';
                                }
                            }
                        }
                    }).catch(async (e) => {
                        console.error(`[Scheduler] Task ${task.id} failed:`, e);
                        const t = state.tasks[task.id];
                        t.output = `Error: ${e.message}`;
                        t.status = 'ERROR';
                        await this.saveCheckpoint(jobId);
                    });
                }
            }

            if (allDone) {
                state.status = 'COMPLETED';
                await this.saveCheckpoint(jobId);
                console.log(`[Scheduler] Job ${jobId} Completed.`);
                active = false;
            } else if (!madeProgress) {
                // Yield to Node event loop, wait a bit before checking again
                // Avoids 100% CPU spin when all tasks are WAITING
                await new Promise(r => setTimeout(r, 100));
            }
        }
    }

    private async executeTask(jobId: string, taskId: string): Promise<string> {
        const state = this.activeJobs.get(jobId)!;
        const task = state.tasks[taskId];
        let inputData = task.inputs.join('\n\n');

        if (!inputData) inputData = "Evaluate context.";

        // Route to actual models
        if (task.type === 'chat') {
            const res = await this.apiHandlers.modelRouter.routeChat(inputData);
            return res.response || "No response";
        } else if (task.type === 'draw') {
            try {
                const res = await this.apiHandlers.externalApiManager.generateImage('openai', inputData);
                return await this.saveImageToDisk(res);
            } catch (e) {
                console.warn("OpenAI Draw failed, falling back to mock:", e);
                const mockRes = await this.apiHandlers.externalApiManager.generateImage('mock', inputData);
                return await this.saveImageToDisk(mockRes);
            }
        } else if (task.type === 'video') {
            try {
                const res = await this.apiHandlers.externalApiManager.generateVideo('google', inputData);
                return `Generated Video at: ${res}`;
            } catch (e) {
                console.warn("Google Video failed, falling back to mock:", e);
                const res = await this.apiHandlers.externalApiManager.generateVideo('mock', inputData);
                return `Generated Video at: ${res}`;
            }
        } else if (task.type === 'search') {
            // Mock search delay
            await new Promise(r => setTimeout(r, 800));
            return `Mock Search Result for: "${inputData}"\nFound 10,000 results.`;
        }
        return `Processed ${task.type}`;
    }

    private async saveCheckpoint(jobId: string) {
        const state = this.activeJobs.get(jobId);
        if (!state) return;
        const cpPath = path.join(this.checkPointDir, `${jobId}.json`);
        await fs.writeFile(cpPath, JSON.stringify(state, null, 2));
    }

    public getJobStatus(jobId: string) {
        return this.activeJobs.get(jobId) || null;
    }

    private async saveImageToDisk(base64String: string): Promise<string> {
        try {
            // Check if it's already a URL
            if (base64String.startsWith('http')) return base64String;

            // Extract pure base64
            let base64Data = base64String;
            if (base64String.startsWith('data:image/')) {
                const parts = base64String.split(';base64,');
                if (parts.length === 2) {
                    base64Data = parts[1];
                }
            }

            // Fallback for random strings from mock if they don't look like base64
            if (base64Data.length < 100 && !base64Data.startsWith('iVBORw0KGgo')) {
                return base64String; // Return raw text if it's just a mock text response
            }

            const fileName = `flow_draw_${Date.now()}.png`;
            // Save to the personal storage folder (one directory up from system)
            const personalDir = path.join(this.checkPointDir, '../../personal');
            await fs.ensureDir(personalDir);

            const filePath = path.join(personalDir, fileName);
            await fs.writeFile(filePath, base64Data, 'base64');

            console.log(`[Scheduler] Saved AI Draw image to ${filePath}`);
            return `/api/files/read?path=${encodeURIComponent(filePath)}`;
        } catch (e) {
            console.error("[Scheduler] Error saving image to disk:", e);
            return base64String; // Return original on failure
        }
    }
}
