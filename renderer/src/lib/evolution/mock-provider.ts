import type { EvolutionAPI, EvolutionEvent, EvolutionStats, EventFilters } from './types';
import { generateMockEvents, computeStats } from './mock-data';

export class MockEvolutionProvider implements EvolutionAPI {
  private events: EvolutionEvent[];
  private stats: EvolutionStats;

  constructor() {
    this.events = generateMockEvents(50);
    this.stats = computeStats(this.events);
  }

  async getEvents(filters?: EventFilters): Promise<EvolutionEvent[]> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

    let result = [...this.events];

    if (filters?.dateFrom) {
      result = result.filter(e => e.timestamp >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      result = result.filter(e => e.timestamp <= filters.dateTo!);
    }
    if (filters?.sourceType?.length) {
      result = result.filter(e => filters.sourceType!.includes(e.source_type));
    }
    if (filters?.outcome?.length) {
      result = result.filter(e => filters.outcome!.includes(e.outcome));
    }
    if (filters?.intent?.length) {
      result = result.filter(e => filters.intent!.includes(e.intent));
    }
    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      result = result.filter(e =>
        e.source_name.toLowerCase().includes(q) ||
        e.trigger.error_message.toLowerCase().includes(q) ||
        e.trigger.error_type.toLowerCase().includes(q)
      );
    }

    return result;
  }

  async getEvent(eventId: string): Promise<EvolutionEvent | null> {
    await new Promise(r => setTimeout(r, 100));
    return this.events.find(e => e.event_id === eventId) ?? null;
  }

  async getStats(): Promise<EvolutionStats> {
    await new Promise(r => setTimeout(r, 200));
    return this.stats;
  }

  async exportEvents(filters?: EventFilters, format: 'json' | 'csv' = 'json'): Promise<Blob> {
    const events = await this.getEvents(filters);

    if (format === 'json') {
      return new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    }

    // CSV
    const headers = [
      'event_id', 'timestamp', 'source_type', 'source_id', 'source_name',
      'error_type', 'error_message', 'intent', 'outcome',
      'cost_usd', 'latency_ms', 'candidates_count', 'selected_strategy',
    ];
    const rows = events.map(e => [
      e.event_id,
      e.timestamp,
      e.source_type,
      e.source_id,
      e.source_name,
      e.trigger.error_type,
      `"${e.trigger.error_message.replace(/"/g, '""')}"`,
      e.intent,
      e.outcome,
      e.cost_usd.toString(),
      e.latency_ms.toString(),
      e.candidates.length.toString(),
      e.selected !== null ? e.candidates[e.selected]?.strategy ?? '' : '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return new Blob([csv], { type: 'text/csv' });
  }
}
