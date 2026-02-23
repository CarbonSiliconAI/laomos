import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { ExecutionJournal } from '../telemetry/journal';
import { telemetryBus } from '../telemetry/bus';
import { estimateTokens, computeCost, hashContent } from '../telemetry/cost';
import { BudgetConstraint } from '../telemetry/types';
import { selectModel } from './budget';

export type TaskStatus = 'READY' | 'WAITING' | 'DONE' | 'ERROR';

export interface AgentTask {
    id: string;
    type: string; // chat, draw, video, search
    inputs: string[];
    output?: string;
    status: TaskStatus;
    manualInput?: string;
    dependencies: string[];
}

export interface JobState {
    jobId: string;
    tasks: Record<string, AgentTask>;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}

function inferOutputType(tool: string): 'text' | 'image' | 'video' | 'url' | 'unknown' {
    if (tool === 'draw') return 'image';
    if (tool === 'video') return 'video';
    if (tool === 'chat' || tool === 'search') return 'text';
    return 'unknown';
}

export class AgentScheduler {
    private checkPointDir: string;
    private activeJobs: Map<string, JobState> = new Map();
    private apiHandlers: any;
    private journal?: ExecutionJournal;
    private jobToRunId: Map<string, string> = new Map();
    private jobToSnapshot: Map<string, { nodes: any[]; edges: any[] }> = new Map();
    private budget?: BudgetConstraint;
    private jobCostAccumulator = new Map<string, number>();

    constructor(systemDir: string, apiHandlers: any, journal?: ExecutionJournal, budget?: BudgetConstraint) {
        this.checkPointDir = path.join(systemDir, '.aos_state');
        this.apiHandlers = apiHandlers;
        this.journal = journal;
        this.budget = budget;
    }

    async init() {
        await fs.ensureDir(this.checkPointDir);
        console.log(`[Scheduler] Initialized Checkpoint Directory at ${this.checkPointDir}`);

        const files = await fs.readdir(this.checkPointDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const data = await fs.readFile(path.join(this.checkPointDir, file), 'utf-8');
                    const state: JobState = JSON.parse(data);
                    if (state.status === 'RUNNING') {
                        console.log(`[Scheduler] Recovered Job ${state.jobId} from checkpoint.`);
                        this.activeJobs.set(state.jobId, state);
                        this.runEventLoop(state.jobId).catch(console.error);
                    } else {
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

        edges.forEach(e => {
            if (state.tasks[e.to]) {
                state.tasks[e.to].dependencies.push(e.from);
            }
        });

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

        if (this.journal) {
            const runId = crypto.randomUUID();
            this.jobToRunId.set(jobId, runId);
            this.jobToSnapshot.set(jobId, { nodes, edges });
            this.journal.startRun(runId, jobId, { nodes, edges });
        }

        this.runEventLoop(jobId).catch(e => console.error(e));
        return jobId;
    }

    /** Returns the telemetry run_id for a job, if telemetry is active. */
    public getRunId(jobId: string): string | undefined {
        return this.jobToRunId.get(jobId);
    }

    private async runEventLoop(jobId: string) {
        const state = this.activeJobs.get(jobId);
        if (!state) return;

        let active = true;
        while (active && state.status === 'RUNNING') {
            let madeProgress = false;
            let allDone = true;

            for (const taskId in state.tasks) {
                const task = state.tasks[taskId];

                if (task.status !== 'DONE' && task.status !== 'ERROR') {
                    allDone = false;
                }

                if (task.status === 'READY') {
                    madeProgress = true;
                    task.status = 'WAITING';
                    await this.saveCheckpoint(jobId);

                    console.log(`[Scheduler] Suspending Job ${jobId} Task ${task.id} (${task.type}) for I/O...`);

                    this.executeTask(jobId, task.id).then(async (result) => {
                        const t = state.tasks[task.id];
                        t.output = result;
                        t.status = 'DONE';
                        await this.saveCheckpoint(jobId);

                        for (const childId in state.tasks) {
                            const child = state.tasks[childId];
                            if (child.dependencies.includes(task.id)) {
                                child.inputs.push(result);
                                const allDepsDone = child.dependencies.every(dId => state.tasks[dId].status === 'DONE');
                                if (allDepsDone) child.status = 'READY';
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

                const runId = this.jobToRunId.get(jobId);
                if (this.journal && runId) this.journal.finalizeRun(runId, 'completed');
            } else if (!madeProgress) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        if (state.status === 'FAILED') {
            const runId = this.jobToRunId.get(jobId);
            if (this.journal && runId) this.journal.finalizeRun(runId, 'failed');
        }
    }

    private async executeTask(jobId: string, taskId: string): Promise<string> {
        const state = this.activeJobs.get(jobId)!;
        const task = state.tasks[taskId];
        let inputData = task.inputs.join('\n\n') || 'Evaluate context.';

        const runId = this.jobToRunId.get(jobId);
        const snapshot = this.jobToSnapshot.get(jobId);
        const nodeInfo = snapshot?.nodes?.find((n: any) => n.id === taskId);
        const context: Record<string, any> = {};
        if (nodeInfo?.label)  context.label    = nodeInfo.label;
        if (nodeInfo?.cat)    context.category = nodeInfo.cat;
        if (nodeInfo?.domain) context.domain   = nodeInfo.domain;

        const startTime = Date.now();

        // Emit START event so the trace panel shows live activity immediately
        if (runId) {
            telemetryBus.publish({
                event_id:     crypto.randomUUID(),
                flow_id:      jobId,
                run_id:       runId,
                node_id:      taskId,
                tool:         task.type,
                model:        undefined,
                input_hash:   hashContent(inputData),
                input_tokens: estimateTokens(inputData),
                output_tokens: 0,
                latency_ms:   0,
                cost_usd:     0,
                status:       'running',
                output_type:  inferOutputType(task.type),
                timestamp:    Date.now(),
                context:      Object.keys(context).length ? context : undefined,
            });
        }

        let result = '';
        let model = 'unknown';
        let succeeded = true;
        let errorMessage: string | undefined;
        let cacheHit = false;

        try {
            if (task.type === 'chat') {
                // 1. Check semantic cache
                const cacheKey = `${hashContent(inputData)}|${task.type}|auto`;
                const cached = this.journal?.cacheGet(cacheKey);
                if (cached) {
                    result   = cached.result;
                    model    = cached.model;
                    cacheHit = true;
                    context.cache_hit = true;
                } else {
                    // 2. Select provider via budget constraint
                    const accumulated = this.jobCostAccumulator.get(jobId) ?? 0;
                    const preferredProvider = this.budget ? selectModel(accumulated, this.budget) : undefined;

                    const res = await this.apiHandlers.modelRouter.routeChat(inputData, preferredProvider);
                    result = res.response || 'No response';
                    model  = res.model || res.providerUsed || 'local';
                    context.model_selected_reason = preferredProvider
                        ? `budget:${preferredProvider}`
                        : `auto:level_${res.level ?? '?'}`;
                    context.budget_snapshot = {
                        cost_so_far: accumulated,
                        max: this.budget?.maxCostUsdPerRun,
                    };
                }
            } else if (task.type === 'draw') {
                try {
                    const res = await this.apiHandlers.externalApiManager.generateImage('openai', inputData);
                    result = await this.saveImageToDisk(res);
                    model  = 'dall-e-3';
                } catch (e) {
                    console.warn('OpenAI Draw failed, falling back to mock:', e);
                    const mockRes = await this.apiHandlers.externalApiManager.generateImage('mock', inputData);
                    result = await this.saveImageToDisk(mockRes);
                    model  = 'mock';
                }
            } else if (task.type === 'video') {
                try {
                    const res = await this.apiHandlers.externalApiManager.generateVideo('google', inputData);
                    result = `Generated Video at: ${res}`;
                    model  = 'gemini-video';
                } catch (e) {
                    console.warn('Google Video failed, falling back to mock:', e);
                    const res = await this.apiHandlers.externalApiManager.generateVideo('mock', inputData);
                    result = `Generated Video at: ${res}`;
                    model  = 'mock';
                }
            } else if (task.type === 'search') {
                await new Promise(r => setTimeout(r, 800));
                result = `Mock Search Result for: "${inputData}"\nFound 10,000 results.`;
                model  = 'mock';
            } else {
                result = `Processed ${task.type}`;
                model  = 'mock';
            }
        } catch (e: any) {
            succeeded = false;
            errorMessage = e.message;
            result = `Error: ${e.message}`;
            throw e;
        } finally {
            // Emit END event (success or error)
            if (runId) {
                const latency      = Date.now() - startTime;
                const inputTokens  = estimateTokens(inputData);
                const outputTokens = estimateTokens(result);
                // Cache hits are free; only charge for real API calls
                const costUsd      = cacheHit ? 0 : computeCost(model, inputTokens, outputTokens);

                // Store chat result in cache (on success, non-cache-hit)
                if (task.type === 'chat' && !cacheHit && succeeded) {
                    const cacheKey = `${hashContent(inputData)}|${task.type}|auto`;
                    this.journal?.cacheSet(cacheKey, model, task.type, result, hashContent(result), 3_600_000);
                }

                // Accumulate cost for budget tracking
                const prev = this.jobCostAccumulator.get(jobId) ?? 0;
                this.jobCostAccumulator.set(jobId, prev + costUsd);

                // Determine output_type (url if result looks like an image/video path)
                const resultOutputType: 'text' | 'image' | 'video' | 'url' | 'unknown' =
                    (result.startsWith('http') || result.startsWith('/api/'))
                        ? (task.type === 'draw' ? 'image' : task.type === 'video' ? 'video' : 'url')
                        : inferOutputType(task.type);

                telemetryBus.publish({
                    event_id:      crypto.randomUUID(),
                    flow_id:       jobId,
                    run_id:        runId,
                    node_id:       taskId,
                    tool:          task.type,
                    model,
                    input_hash:    hashContent(inputData),
                    output_hash:   hashContent(result),
                    input_tokens:  inputTokens,
                    output_tokens: outputTokens,
                    latency_ms:    latency,
                    cost_usd:      costUsd,
                    status:        succeeded ? 'success' : 'error',
                    output_type:   resultOutputType,
                    timestamp:     Date.now(),
                    context:       Object.keys(context).length ? context : undefined,
                    output_preview: result.slice(0, 200),
                    error_message: errorMessage,
                });
            }
        }

        return result;
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
            if (base64String.startsWith('http')) return base64String;

            let base64Data = base64String;
            if (base64String.startsWith('data:image/')) {
                const parts = base64String.split(';base64,');
                if (parts.length === 2) base64Data = parts[1];
            }

            if (base64Data.length < 100 && !base64Data.startsWith('iVBORw0KGgo')) {
                return base64String;
            }

            const fileName = `flow_draw_${Date.now()}.png`;
            const personalDir = path.join(this.checkPointDir, '../../personal');
            await fs.ensureDir(personalDir);
            const filePath = path.join(personalDir, fileName);
            await fs.writeFile(filePath, base64Data, 'base64');
            console.log(`[Scheduler] Saved AI Draw image to ${filePath}`);
            return `/api/files/read?path=${encodeURIComponent(filePath)}`;
        } catch (e) {
            console.error('[Scheduler] Error saving image to disk:', e);
            return base64String;
        }
    }
}
