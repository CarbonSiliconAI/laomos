import type { EvolutionAPI, EvolutionEvent, EvolutionStats, EventFilters } from './types';
import { api } from '../api';
import type { EvolutionEventData } from '../api';

function mapEvent(e: EvolutionEventData): EvolutionEvent {
  return {
    event_id: e.event_id,
    timestamp: e.timestamp,
    source_type: e.source_type,
    source_id: e.source_id,
    source_name: e.source_name,
    trigger: e.trigger,
    intent: e.intent,
    pcec_phases: e.pcec_phases,
    candidates: e.candidates,
    selected: e.selected,
    outcome: e.outcome,
    cost_usd: e.cost_usd,
    latency_ms: e.latency_ms,
    gene_id: e.gene_id,
  };
}

function computeStats(events: EvolutionEvent[]): EvolutionStats {
  const total = events.length;
  const successCount = events.filter(e => e.outcome === 'success').length;
  const failureCount = events.filter(e => e.outcome === 'failure').length;
  const fallbackCount = events.filter(e => e.outcome === 'fallback').length;
  const totalCost = events.reduce((s, e) => s + e.cost_usd, 0);
  const avgLatency = total > 0 ? events.reduce((s, e) => s + e.latency_ms, 0) / total : 0;

  // Build 7-day trend
  const now = new Date();
  const trend7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const dayEvents = events.filter(e => e.timestamp.startsWith(dateStr));
    return {
      date: dateStr,
      events: dayEvents.length,
      successes: dayEvents.filter(e => e.outcome === 'success').length,
      cost_usd: dayEvents.reduce((s, e) => s + e.cost_usd, 0),
    };
  });

  return {
    totalEvents: total,
    successCount,
    failureCount,
    fallbackCount,
    successRate: total > 0 ? successCount / total : 0,
    nativeSuccessRate: total > 0 ? successCount / total : 0,
    effectiveSuccessRate: total > 0 ? (successCount + fallbackCount) / total : 0,
    totalCostUsd: totalCost,
    avgCostPerEvent: total > 0 ? totalCost / total : 0,
    avgLatencyMs: avgLatency,
    trend7d,
  };
}

export class APIEvolutionProvider implements EvolutionAPI {
  async getEvents(filters?: EventFilters): Promise<EvolutionEvent[]> {
    const params: { sourceType?: string; outcome?: string; limit?: number } = {};
    if (filters?.sourceType?.length) params.sourceType = filters.sourceType.join(',');
    if (filters?.outcome?.length) params.outcome = filters.outcome.join(',');

    const res = await api.evolutionEvents(params);
    let events = (res.events || []).map(mapEvent);

    // Apply client-side filters not supported by server
    if (filters?.dateFrom) {
      events = events.filter(e => e.timestamp >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      events = events.filter(e => e.timestamp <= filters.dateTo!);
    }
    if (filters?.intent?.length) {
      events = events.filter(e => filters.intent!.includes(e.intent));
    }
    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      events = events.filter(e =>
        e.source_name.toLowerCase().includes(q) ||
        e.trigger.error_message.toLowerCase().includes(q) ||
        e.trigger.error_type.toLowerCase().includes(q)
      );
    }

    return events;
  }

  async getEvent(eventId: string): Promise<EvolutionEvent | null> {
    const res = await api.evolutionEvents({ limit: 500 });
    const events = (res.events || []).map(mapEvent);
    return events.find(e => e.event_id === eventId) ?? null;
  }

  async getStats(): Promise<EvolutionStats> {
    const res = await api.evolutionEvents();
    const events = (res.events || []).map(mapEvent);
    return computeStats(events);
  }

  async exportEvents(filters?: EventFilters, format: 'json' | 'csv' = 'json'): Promise<Blob> {
    const events = await this.getEvents(filters);

    if (format === 'json') {
      return new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    }

    const headers = [
      'event_id', 'timestamp', 'source_type', 'source_id', 'source_name',
      'error_type', 'error_message', 'intent', 'outcome',
      'cost_usd', 'latency_ms', 'gene_id',
    ];
    const rows = events.map(e => [
      e.event_id, e.timestamp, e.source_type, e.source_id, e.source_name,
      e.trigger.error_type, `"${e.trigger.error_message.replace(/"/g, '""')}"`,
      e.intent, e.outcome, e.cost_usd.toString(), e.latency_ms.toString(),
      e.gene_id || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return new Blob([csv], { type: 'text/csv' });
  }
}
