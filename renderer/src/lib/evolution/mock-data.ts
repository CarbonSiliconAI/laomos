import type { EvolutionEvent, EvolutionCandidate, EvolutionOutcome, EvolutionIntent, SourceType, DailyTrend, EvolutionStats } from './types';

// ── Seeded PRNG (mulberry32) for deterministic mock data ──
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randBetween(min, max + 1));
}

// ── Data pools ──────────────────────────────────────

const ERROR_TYPES = [
  'TimeoutError', 'APIRateLimitError', 'JSONParseError', 'ConnectionRefused',
  'OutOfMemoryError', 'InvalidResponseError', 'AuthenticationError',
  'FileNotFoundError', 'PermissionDenied', 'SchemaValidationError',
  'ModelOverloadError', 'ContextLengthExceeded',
];

const ERROR_MESSAGES: Record<string, string[]> = {
  TimeoutError: ['Request exceeded 30s timeout limit', 'LLM inference timed out after 45s', 'Upstream service did not respond within deadline'],
  APIRateLimitError: ['Rate limit exceeded: 60 req/min', 'Token bucket exhausted, retry after 12s', 'Quota exceeded for model gpt-4'],
  JSONParseError: ['Unexpected token < at position 0', 'Unterminated string in JSON at position 342', 'Expected "," or "}" after property value'],
  ConnectionRefused: ['ECONNREFUSED 127.0.0.1:11434', 'Failed to connect to Ollama endpoint', 'Connection reset by peer'],
  OutOfMemoryError: ['JavaScript heap out of memory', 'CUDA out of memory: 2.1 GiB allocated', 'Worker process killed: OOM'],
  InvalidResponseError: ['Expected JSON object, received string', 'Response missing required field: result', 'Status 502: Bad Gateway'],
  AuthenticationError: ['API key invalid or expired', 'Bearer token rejected by provider', 'OAuth refresh token expired'],
  FileNotFoundError: ['ENOENT: no such file /data/input.csv', 'Attachment not found: doc_38f2a', 'Template file missing: report.hbs'],
  PermissionDenied: ['EACCES: permission denied /var/run/sandbox', 'Insufficient permissions for model endpoint', 'Sandbox write blocked by policy'],
  SchemaValidationError: ['Field "amount" must be number, got string', 'Missing required field: recipient_email', 'Enum value "urgent" not in allowed set'],
  ModelOverloadError: ['Model qwen2:7b is currently overloaded', 'All inference workers busy, queue depth: 12', 'Service degraded: p99 latency > 60s'],
  ContextLengthExceeded: ['Input exceeds 8192 token context window', 'Combined prompt+completion would exceed limit', 'Document too large for single-pass processing'],
};

const FLOW_NODES = [
  { id: 'node_email_parse', name: 'Email Parser' },
  { id: 'node_llm_summarize', name: 'LLM Summarizer' },
  { id: 'node_api_call', name: 'REST API Call' },
  { id: 'node_data_transform', name: 'Data Transform' },
  { id: 'node_file_write', name: 'File Writer' },
  { id: 'node_webhook', name: 'Webhook Trigger' },
  { id: 'node_pdf_extract', name: 'PDF Extractor' },
  { id: 'node_rag_query', name: 'RAG Query' },
];

const AGENTS = [
  { id: 'agent_mail', name: 'Mail Agent' },
  { id: 'agent_research', name: 'Research Agent' },
  { id: 'agent_code', name: 'Code Agent' },
];

const SKILLS = [
  { id: 'skill_translate', name: 'Translation Skill' },
  { id: 'skill_classify', name: 'Classifier Skill' },
];

const STRATEGIES = [
  'retry-with-backoff', 'switch-model-fallback', 'reduce-context-window',
  'chunk-and-retry', 'cache-warm-retry', 'parameter-adjustment',
  'prompt-simplification', 'output-format-fix', 'timeout-increase',
  'auth-token-refresh', 'connection-pool-reset', 'schema-coercion',
];

// ── Helpers ─────────────────────────────────────────

function sha256Mock(): string {
  const chars = '0123456789abcdef';
  return Array.from({ length: 64 }, () => chars[Math.floor(rand() * 16)]).join('');
}

function generateCandidate(outcomeHint: EvolutionOutcome, index: number): EvolutionCandidate {
  const strategy = pick(STRATEGIES);
  const isWinner = outcomeHint === 'success' && index === 0;
  const passed = isWinner ? true : rand() > 0.5;
  const score = isWinner ? 0.7 + rand() * 0.3 : rand() * 0.7;

  return {
    strategy,
    code_diff: `--- a/node_handler.ts\n+++ b/node_handler.ts\n@@ -${randInt(10, 80)},6 +${randInt(10, 80)},8 @@\n-  const result = await execute(input);\n+  // ${strategy}\n+  const result = await executeWith${strategy.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')}(input, {\n+    maxRetries: ${randInt(1, 5)},\n+    timeout: ${randInt(5000, 30000)}\n+  });`,
    sandbox_result: {
      passed,
      output: passed ? `OK: ${strategy} resolved the issue` : `FAIL: ${strategy} did not resolve — ${pick(ERROR_TYPES)}`,
      duration_ms: randInt(200, 8000),
    },
    score: Math.round(score * 1000) / 1000,
  };
}

// ── Main generator ──────────────────────────────────

export function generateMockEvents(count: number = 50): EvolutionEvent[] {
  const now = Date.now();
  const events: EvolutionEvent[] = [];

  for (let i = 0; i < count; i++) {
    // Weighted toward recent days
    const daysAgo = Math.floor(Math.pow(rand(), 1.5) * 14);
    const hoursOffset = randInt(0, 23);
    const minutesOffset = randInt(0, 59);
    const ts = new Date(now - daysAgo * 86400000 - hoursOffset * 3600000 - minutesOffset * 60000);

    // Source type distribution: 70% flow_node, 20% agent, 10% skill
    const sourceRoll = rand();
    let sourceType: SourceType;
    let source: { id: string; name: string };
    if (sourceRoll < 0.7) {
      sourceType = 'flow_node';
      source = pick(FLOW_NODES);
    } else if (sourceRoll < 0.9) {
      sourceType = 'agent';
      source = pick(AGENTS);
    } else {
      sourceType = 'skill';
      source = pick(SKILLS);
    }

    // Outcome distribution: 65% success, 15% failure, 20% fallback
    const outcomeRoll = rand();
    const outcome: EvolutionOutcome =
      outcomeRoll < 0.65 ? 'success' :
      outcomeRoll < 0.80 ? 'failure' : 'fallback';

    // Intent distribution: 80% repair, 15% harden, 5% innovate
    const intentRoll = rand();
    const intent: EvolutionIntent =
      intentRoll < 0.80 ? 'repair' :
      intentRoll < 0.95 ? 'harden' : 'innovate';

    const errorType = pick(ERROR_TYPES);
    const errorMessages = ERROR_MESSAGES[errorType] || ['Unknown error occurred'];

    const candidateCount = randInt(1, 3);
    const candidates = Array.from({ length: candidateCount }, (_, ci) =>
      generateCandidate(outcome, ci)
    );

    // PCEC phase timings
    const perceive_ms = randInt(100, 2000);
    const construct_ms = randInt(500, 12000);
    const evaluate_ms = randInt(200, 8000);
    const commit_ms = outcome === 'success' ? randInt(50, 500) : randInt(10, 100);
    const totalLatency = perceive_ms + construct_ms + evaluate_ms + commit_ms;

    const cost = randBetween(0.001, 0.08);

    events.push({
      event_id: sha256Mock(),
      timestamp: ts.toISOString(),
      source_type: sourceType,
      source_id: source.id,
      source_name: source.name,
      trigger: {
        error_type: errorType,
        error_message: pick(errorMessages),
        exit_code: rand() > 0.3 ? randInt(1, 255) : null,
        context: {
          flow_run_id: `run_${sha256Mock().slice(0, 12)}`,
          node_index: randInt(0, 8),
          attempt: randInt(1, 3),
        },
      },
      intent,
      pcec_phases: { perceive_ms, construct_ms, evaluate_ms, commit_ms },
      candidates,
      selected: outcome === 'success' ? 0 : outcome === 'fallback' ? null : null,
      outcome,
      cost_usd: Math.round(cost * 10000) / 10000,
      latency_ms: totalLatency,
      gene_id: null,
    });
  }

  // Sort by timestamp descending (newest first)
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ── Stats aggregator ────────────────────────────────

export function computeStats(events: EvolutionEvent[]): EvolutionStats {
  const successCount = events.filter(e => e.outcome === 'success').length;
  const failureCount = events.filter(e => e.outcome === 'failure').length;
  const fallbackCount = events.filter(e => e.outcome === 'fallback').length;
  const totalCost = events.reduce((sum, e) => sum + e.cost_usd, 0);
  const totalLatency = events.reduce((sum, e) => sum + e.latency_ms, 0);

  // Simulate native vs effective success rates
  const nativeSuccessRate = 0.701; // baseline without evolution
  const effectiveSuccessRate = events.length > 0
    ? Math.min(0.99, nativeSuccessRate + (successCount / events.length) * 0.2)
    : nativeSuccessRate;

  // Build 7-day trend
  const today = new Date();
  const trend7d: DailyTrend[] = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayEvents = events.filter(e => e.timestamp.slice(0, 10) === dateStr);
    trend7d.push({
      date: dateStr,
      events: dayEvents.length,
      successes: dayEvents.filter(e => e.outcome === 'success').length,
      cost_usd: Math.round(dayEvents.reduce((s, e) => s + e.cost_usd, 0) * 10000) / 10000,
    });
  }

  return {
    totalEvents: events.length,
    successCount,
    failureCount,
    fallbackCount,
    successRate: events.length > 0 ? successCount / events.length : 0,
    nativeSuccessRate,
    effectiveSuccessRate,
    totalCostUsd: Math.round(totalCost * 10000) / 10000,
    avgCostPerEvent: events.length > 0 ? Math.round((totalCost / events.length) * 10000) / 10000 : 0,
    avgLatencyMs: events.length > 0 ? Math.round(totalLatency / events.length) : 0,
    trend7d,
  };
}
