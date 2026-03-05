const BASE = '';

export async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(BASE + url, {
        headers: { 'Content-Type': 'application/json', ...opts?.headers },
        ...opts,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}

export const api = {
    // ── Ollama ──────────────────────────────
    ollamaModels: () => apiFetch<{ models: string[] }>('/api/ollama/models'),
    ollamaChat: (body: object, opts?: RequestInit) => apiFetch<{ message?: { role: string; content: string }; response?: string }>('/api/ollama/chat', {
        method: 'POST', body: JSON.stringify(body), ...opts
    }),
    ollamaPull: (name: string) => apiFetch<{ status: string }>('/api/ollama/pull', {
        method: 'POST', body: JSON.stringify({ model: name }),
    }),

    // ── AI ──────────────────────────────────
    aiJobs: () => apiFetch<{ jobs: object[] }>('/api/ai/jobs'),
    aiStop: (jobId: string) => apiFetch('/api/ai/stop', {
        method: 'POST', body: JSON.stringify({ jobId }),
    }),
    aiChat: (body: object, opts?: RequestInit) => apiFetch<{ response: string; jobId: string }>('/api/ai/chat', {
        method: 'POST', body: JSON.stringify(body), ...opts
    }),

    // ── Skills / Flow ────────────────────────
    skills: () => apiFetch<{ skills: SkillDef[] }>('/api/skills'),
    skillsExecute: (body: object) => apiFetch<{ result: string }>('/api/skills/execute', {
        method: 'POST', body: JSON.stringify(body),
    }),
    skillsCancel: (executionId: string) => apiFetch<{ success: boolean; message: string }>('/api/skills/cancel', {
        method: 'POST', body: JSON.stringify({ executionId }),
    }),
    kernelTools: () => apiFetch<{ tools: ToolDef[] }>('/api/kernel/tools'),
    kernelRun: (body: object) => apiFetch('/api/kernel/run', {
        method: 'POST', body: JSON.stringify(body),
    }),
    kernelStatus: (jobId: string) => apiFetch<KernelStatus>(`/api/kernel/status/${jobId}`),

    // ── Calendar ─────────────────────────────
    calendarJobs: () => apiFetch<{ jobs: ScheduledJob[] }>('/api/calendar/jobs'),
    calendarCreateJob: (body: { type: 'skill' | 'flow'; targetId: string; inputPayload: any; scheduledTime: string }) => apiFetch<{ success: boolean; job: ScheduledJob }>('/api/calendar/jobs', {
        method: 'POST', body: JSON.stringify(body),
    }),
    calendarDeleteJob: (id: string) => apiFetch<{ success: boolean }>(`/api/calendar/jobs/${id}`, { method: 'DELETE' }),

    // ── Files ───────────────────────────────
    filesList: (p?: string) => apiFetch<{ files: FileEntry[] }>(`/api/files/list${p ? `?path=${encodeURIComponent(p)}` : ''}`),
    filesRead: (p: string) => apiFetch<{ content: string }>(`/api/files/read?path=${encodeURIComponent(p)}`),
    filesCreate: (path: string, content: string) => apiFetch('/api/files/create', {
        method: 'POST', body: JSON.stringify({ path, content }),
    }),

    // ── Keys ────────────────────────────────
    keysGet: () => apiFetch<Record<string, string>>('/api/keys'),
    keysSet: (provider: string, key: string) => apiFetch('/api/keys', {
        method: 'POST', body: JSON.stringify({ provider, key }),
    }),
    keysDelete: (provider: string) => apiFetch(`/api/keys/${provider}`, { method: 'DELETE' }),
    keysVerify: (provider: string, key: string) => apiFetch<{ valid: boolean }>('/api/keys/verify', {
        method: 'POST', body: JSON.stringify({ provider, key }),
    }),

    // ── Mail ────────────────────────────────
    mailInbox: (limit = 20) => apiFetch<{ emails: Email[] }>(`/api/mail/inbox?limit=${limit}`),
    mailStatus: () => apiFetch<MailStatus>('/api/mail/status'),
    mailConfig: (body: object) => apiFetch('/api/mail/config', {
        method: 'POST', body: JSON.stringify(body),
    }),
    mailSend: (body: object) => apiFetch('/api/mail/send', {
        method: 'POST', body: JSON.stringify(body),
    }),
    mailSummarize: (uid: string) => apiFetch<{ summary: string }>('/api/mail/summarize', {
        method: 'POST', body: JSON.stringify({ uid }),
    }),
    mailDraft: (body: object) => apiFetch<{ draft: string }>('/api/mail/draft', {
        method: 'POST', body: JSON.stringify(body),
    }),
    mailDelete: (uid: string) => apiFetch('/api/mail/delete', {
        method: 'POST', body: JSON.stringify({ uid }),
    }),
    mailRead: (uid: string) => apiFetch('/api/mail/read', {
        method: 'POST', body: JSON.stringify({ uid }),
    }),

    // ── Game ────────────────────────────────
    gameState: () => apiFetch<GameState>('/api/game/state'),
    gameChat: (action: string, model?: string) => apiFetch<{ state: GameState }>('/api/game/chat', {
        method: 'POST', body: JSON.stringify({ action, model }),
    }),
    gameAppendMessage: (msg: { role: string; content: string; image?: string }) => apiFetch<{ state: GameState }>('/api/game/message', {
        method: 'POST', body: JSON.stringify(msg),
    }),
    gameReset: () => apiFetch('/api/game/reset', { method: 'POST' }),

    // ── System ──────────────────────────────
    systemSpecs: () => apiFetch<SystemSpecs>('/api/system/specs'),
    systemFirewall: () => apiFetch<{ enabled: boolean; rules: object[] }>('/api/system/firewall'),
    systemFirewallSet: (enabled: boolean) => apiFetch<{ success: boolean; enabled: boolean }>('/api/system/firewall', {
        method: 'POST', body: JSON.stringify({ enabled }),
    }),
    systemAutoConfig: () => apiFetch<{ success: boolean; log?: string }>('/api/system/auto-config', { method: 'POST' }),
    // ── Activity Monitor & Telemetry ───────────────────────────
    telemetryStats: () => apiFetch<TelemetryStats>('/api/telemetry/stats'),
    telemetryRuns: () => apiFetch<{ runs: RunRecord[] }>('/api/telemetry/runs'),
    telemetryRun: (runId: string) => apiFetch<RunRecord>(`/api/telemetry/runs/${runId}`),
    telemetryUsagePerHour: () => apiFetch<{ data: UsageHour[] }>('/api/telemetry/usage-per-hour'),
    telemetryProviderUsage: () => apiFetch<{ data: ProviderUsage[] }>('/api/telemetry/provider-usage'),
    systemMetrics: () => apiFetch<HardwareMetrics>('/api/system/metrics'),

    // ── OpenClaw ────────────────────────────
    clawSearch: (q: string) => apiFetch<{ apps: ClawApp[] }>(`/api/clawhub/search?q=${encodeURIComponent(q)}`),
    clawInstall: (slug: string, version: string) => apiFetch<{ success: boolean; message: string }>('/api/clawhub/install', {
        method: 'POST', body: JSON.stringify({ slug, version })
    }),

    // ── Telegram Skill Daemon ───────────────
    telegramDaemonStart: (token: string, chatId: string) => apiFetch<{ success: boolean }>('/api/telegram/skill-daemon/start', {
        method: 'POST', body: JSON.stringify({ token, chatId })
    }),
    telegramDaemonStop: () => apiFetch<{ success: boolean }>('/api/telegram/skill-daemon/stop', { method: 'POST' }),
    telegramDaemonStatus: () => apiFetch<{ running: boolean; log: { timestamp: number; type: string; message: string }[]; messages: { id: number; text: string; isSelf: boolean; date: number; sender: string }[] }>('/api/telegram/skill-daemon/status'),

    // ── WhatsApp Skill Daemon ────────────────
    whatsappDaemonStart: () => apiFetch<{ success: boolean }>('/api/whatsapp/skill-daemon/start', { method: 'POST' }),
    whatsappDaemonStop: () => apiFetch<{ success: boolean }>('/api/whatsapp/skill-daemon/stop', { method: 'POST' }),
    whatsappDaemonStatus: () => apiFetch<{ running: boolean; processing: boolean; log: { timestamp: number; type: string; message: string }[]; messages: { id: number; text: string; isSelf: boolean; date: number; sender: string }[] }>('/api/whatsapp/skill-daemon/status'),
    whatsappDaemonProcess: (text: string, sender: string) => apiFetch<{ success: boolean; reply: string }>('/api/whatsapp/skill-daemon/process', {
        method: 'POST', body: JSON.stringify({ text, sender })
    }),

    // ── RAG ─────────────────────────────────
    ragSearch: (q: string, tags?: string) => apiFetch<{ apps: object[] }>(
        `/api/apps/search?q=${encodeURIComponent(q)}${tags ? `&tags=${encodeURIComponent(tags)}` : ''}`
    ),

    // ── Graph ───────────────────────────────
    graph: () => apiFetch<{ nodes: object[]; edges: object[] }>('/api/graph'),

    // ── Kernel Analyzer ─────────────────────
    kernelAnalyze: (prompt: string) => apiFetch<AnalyzedTask>('/api/kernel/analyze', {
        method: 'POST', body: JSON.stringify({ prompt }),
    }),
    kernelAbort: (jobId: string) => apiFetch<{ success: boolean; message: string }>(`/api/kernel/abort/${jobId}`, {
        method: 'POST',
    }),

    // ── Budget / Cache ───────────────────────
    budgetGet: () => apiFetch<BudgetConstraint>('/api/budget'),
    budgetSet: (body: Partial<BudgetConstraint>) => apiFetch<BudgetConstraint>('/api/budget', {
        method: 'POST', body: JSON.stringify(body),
    }),
    cacheStats: () => apiFetch<CacheStats>('/api/cache/stats'),
    cacheClear: () => apiFetch('/api/cache', { method: 'DELETE' }),

    // ── Task Chain ──────────────────────────
    taskChainDecompose: (goal: string) => apiFetch<TaskChainResult>('/api/task-chain/decompose', {
        method: 'POST', body: JSON.stringify({ goal }),
    }),
    taskChainSave: (name: string, nodes: any[], edges: any[]) => apiFetch<{ success: boolean; name: string }>('/api/task-chain/save', {
        method: 'POST', body: JSON.stringify({ name, nodes, edges }),
    }),
    taskChainLog: (name: string, log: string) => apiFetch<{ success: boolean }>('/api/task-chain/log', {
        method: 'POST', body: JSON.stringify({ name, log }),
    }),
    taskChainList: () => apiFetch<{ chains: string[] }>('/api/task-chain/list'),
    taskChainLoad: (name: string) => apiFetch<{ chain: TaskChainResult & { name: string }; experience: string }>(`/api/task-chain/load/${encodeURIComponent(name)}`),
    taskChainRunStep: (body: { nodeId: string; nodeLabel: string; nodeType: string; skill?: string; previousOutput?: string }) =>
        apiFetch<{ output: string; passed?: boolean; executionLog?: string[]; status: string }>('/api/task-chain/run-step', {
            method: 'POST', body: JSON.stringify(body),
        }),
    taskChainLearn: () => apiFetch<{ summary: string; saved: boolean }>('/api/task-chain/learn', { method: 'POST' }),
    taskChainExperience: () => apiFetch<{ experience: string }>('/api/task-chain/experience'),
    taskChainAutoImprove: () => apiFetch<{ iterations: number; improved: string[]; results: any[]; summary: string }>('/api/task-chain/auto-improve', { method: 'POST' }),
};

// ── Type Definitions ─────────────────────────────────────────────────────────

export interface AnalyzedTask {
    target: string;
    expected_output: string;
    success_criteria: string;
    error?: string;
}

export interface SkillDef {
    id: string;
    name: string;
    description: string;
    version?: string;
    tools?: string[];
}

export interface ToolDef {
    name: string;
    description: string;
    parameters?: object;
}

export interface ScheduledJob {
    id: string;
    type: 'skill' | 'flow';
    targetId: string;
    inputPayload: any;
    scheduledTime: string; // ISO format
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    result?: string;
    createdAt: string;
}

export interface KernelStatus {
    status: string;
    result?: string;
    error?: string;
    events?: object[];
}

export interface FileEntry {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
}

export interface Email {
    uid: string;
    subject: string;
    from: string;
    date: string;
    read: boolean;
    body?: string;
}

export interface MailStatus {
    configured: boolean;
    address?: string;
}

export interface GameState {
    context: string;
    inventory: string;
    history: Array<{ role: string; content: string; image?: string }>;
}

export interface GameResponse {
    response: string;
    context: string;
    inventory: string;
}

export interface SystemSpecs {
    platform: string;
    cpuModel: string;
    cpuCores: number;
    totalMem: string;
    freeMem: string;
    recommendedModels: string[];
}

export interface TelemetryStats {
    totalRuns: number;
    successRate: number;
    avgCostUsd: number;
    totalCostUsd: number;
    avgLatencyMs: number;
}

export interface RunRecord {
    run_id: string;
    job_id: string;
    tool: string;
    status: string;
    outcome: string;
    cost_usd: number;
    latency_ms: number;
    created_at: number;
    context?: object;
}

export interface UsageHour {
    hour: string;
    count: number;
    cost_usd: number;
}

export interface ProviderUsage {
    provider: string;
    count: number;
    cost_usd: number;
}

export interface ClawApp {
    id: string;
    name: string;
    description: string;
    slug?: string;
    tags: string[];
    version: string;
    installed?: boolean;
    stats?: {
        downloads: number;
        installs: number;
        stars: number;
        versions: number;
    };
    author?: string;
    openclawVerified?: boolean;
    virusTotalClean?: boolean;
}

export interface BudgetConstraint {
    maxCostUsdPerRun: number;
    maxLatencyMs: number;
    qualityFloor: number;
    preferredModels: string[];
    fallbackModels: string[];
    fallbackLocalModel?: string;
}

export interface CacheStats {
    total_entries: number;
    total_hits: number;
    hit_rate_pct: number;
}

export interface AIJob {
    id: string;
    description: string;
    provider: string;
    startTime: number;
}

export interface HardwareMetrics {
    cpu: number;
    ram: number;
    disk: number;
}

export interface ChainNode {
    id: string;
    label: string;
    type: 'goal' | 'condition' | 'action';
    skill?: string;
}

export interface ChainEdge {
    from: string;
    to: string;
}

export interface TaskChainResult {
    nodes: ChainNode[];
    edges: ChainEdge[];
}
