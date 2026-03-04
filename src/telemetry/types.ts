export interface EvaluationCriteria {
    dimension: 'task_completion' | 'cost_efficiency' | 'latency' | 'output_quality';
    target: number;   // e.g. 0.10 USD, 5000 ms
    floor: number;    // minimum acceptable score (0–1)
    weight: number;   // relative weight for composite score
    evaluator?: 'mock_llm_judge' | 'rule_based';
}

export interface Goal {
    goal_id: string;
    description: string;
    success_criteria: EvaluationCriteria[];
    priority_weights?: Record<string, number>;
    created_at: number;
}

export interface OutcomeRecord {
    run_id: string;
    goal_id: string;
    scoresByDimension: Record<string, number>;
    finalScore: number;   // 0–100
    passed: boolean;
    failReasons: string[];
    judgeReason?: string;
}

export interface BudgetConstraint {
    maxCostUsdPerRun: number;
    maxLatencyMs: number;
    qualityFloor: number;
    preferredModels: string[];
    fallbackModels: string[];
    fallbackLocalModel?: string;
}

export interface ExecutionEvent {
    event_id: string;
    flow_id: string;
    run_id: string;
    node_id: string;
    tool: string;           // task type: chat | draw | video | search
    model?: string;
    input_hash: string;
    output_hash?: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    cost_usd: number;
    status: 'running' | 'success' | 'error';
    output_type: 'text' | 'image' | 'video' | 'url' | 'unknown';
    timestamp: number;
    context?: Record<string, any>;
    // bonus fields kept for UI display
    output_preview?: string;
    error_message?: string;
}

export interface FlowSnapshot {
    nodes: any[];
    edges: any[];
}

export interface ExecutionRecord {
    run_id: string;
    // Spec fields (also used in client-side IndexedDB records)
    flow_id?: string;
    flow_version?: string;
    triggered_by?: string;    // 'user' | 'replay' | 'scheduled'
    goal_id?: string;
    steps?: ExecutionEvent[];  // alias for events; used in IndexedDB records
    snapshot?: FlowSnapshot;   // alias for flow_snapshot; used in IndexedDB records
    timestamp?: number;        // alias for created_at; used in IndexedDB records
    outcome?: string;
    // Backend SQLite fields (kept for server-side journal compatibility)
    job_id?: string;
    flow_snapshot?: FlowSnapshot;
    events?: ExecutionEvent[];
    created_at?: number;
    completed_at?: number;
    // Shared fields
    total_cost_usd: number;
    total_latency_ms: number;
    status: 'running' | 'completed' | 'failed';
    rating?: number;
    outcome_score?: OutcomeRecord;
}

export interface NodeDiff {
    node_id: string;
    field: string;
    value_a: any;
    value_b: any;
}

export interface ExecutionDiff {
    run_a: string;
    run_b: string;
    total_cost_delta: number;
    total_latency_delta: number;
    rating_delta?: number;
    node_diffs: NodeDiff[];
    added_nodes: string[];
    removed_nodes: string[];
}
