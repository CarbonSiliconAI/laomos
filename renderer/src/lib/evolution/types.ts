// ══════════════════════════════════════════════════════
// Evolution Layer — Type Definitions
// Aligned with LaoMOS Evolution Phase 1 PRD EvolutionEvent schema
// ══════════════════════════════════════════════════════

export type EvolutionIntent = 'repair' | 'harden' | 'innovate';
export type EvolutionOutcome = 'success' | 'failure' | 'fallback';
export type SourceType = 'flow_node' | 'agent' | 'skill';

export interface EvolutionCandidate {
  strategy: string;
  code_diff: string;
  sandbox_result: {
    passed: boolean;
    output: string;
    duration_ms: number;
  };
  score: number; // 0–1 composite fitness
}

export interface EvolutionEvent {
  event_id: string;
  timestamp: string; // ISO 8601
  source_type: SourceType;
  source_id: string;
  source_name: string;
  trigger: {
    error_type: string;
    error_message: string;
    exit_code: number | null;
    context: Record<string, unknown>;
  };
  intent: EvolutionIntent;
  pcec_phases: {
    perceive_ms: number;
    construct_ms: number;
    evaluate_ms: number;
    commit_ms: number;
  };
  candidates: EvolutionCandidate[];
  selected: number | null; // index into candidates
  outcome: EvolutionOutcome;
  cost_usd: number;
  latency_ms: number;
  gene_id: string | null; // reserved for Phase 2
}

export interface DailyTrend {
  date: string; // YYYY-MM-DD
  events: number;
  successes: number;
  cost_usd: number;
}

export interface EvolutionStats {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  fallbackCount: number;
  successRate: number; // 0–1
  nativeSuccessRate: number; // 0–1 (without evolution)
  effectiveSuccessRate: number; // 0–1 (with evolution)
  totalCostUsd: number;
  avgCostPerEvent: number;
  avgLatencyMs: number;
  trend7d: DailyTrend[];
}

export interface EventFilters {
  dateFrom?: string;
  dateTo?: string;
  sourceType?: SourceType[];
  outcome?: EvolutionOutcome[];
  intent?: EvolutionIntent[];
  searchQuery?: string;
}

export interface EvolutionAPI {
  getEvents(filters?: EventFilters): Promise<EvolutionEvent[]>;
  getEvent(eventId: string): Promise<EvolutionEvent | null>;
  getStats(): Promise<EvolutionStats>;
  exportEvents(filters?: EventFilters, format?: 'json' | 'csv'): Promise<Blob>;
}
