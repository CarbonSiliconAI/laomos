import type { EvolutionAPI, EvolutionEvent, EvolutionStats, EventFilters } from './types';
import { MockEvolutionProvider } from './mock-provider';
import { APIEvolutionProvider } from './api-provider';

// ┌─────────────────────────────────────────────────────────────┐
// │ Hybrid provider: merges real API events with mock events    │
// │ so the Gene Map shows both mock data and real agent data.   │
// │ When enough real data exists, set INCLUDE_MOCK = false.     │
// └─────────────────────────────────────────────────────────────┘
const INCLUDE_MOCK = true;

class HybridEvolutionProvider implements EvolutionAPI {
  private apiProvider = new APIEvolutionProvider();
  private mockProvider = new MockEvolutionProvider();

  async getEvents(filters?: EventFilters): Promise<EvolutionEvent[]> {
    const [apiEvents, mockEvents] = await Promise.all([
      this.apiProvider.getEvents(filters).catch(() => [] as EvolutionEvent[]),
      INCLUDE_MOCK ? this.mockProvider.getEvents(filters) : Promise.resolve([]),
    ]);

    const merged = [...apiEvents, ...mockEvents];
    // Sort by timestamp descending
    merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return merged;
  }

  async getEvent(eventId: string): Promise<EvolutionEvent | null> {
    const apiResult = await this.apiProvider.getEvent(eventId).catch(() => null);
    if (apiResult) return apiResult;
    if (INCLUDE_MOCK) return this.mockProvider.getEvent(eventId);
    return null;
  }

  async getStats(): Promise<EvolutionStats> {
    const events = await this.getEvents();
    const total = events.length;
    const successCount = events.filter(e => e.outcome === 'success').length;
    const failureCount = events.filter(e => e.outcome === 'failure').length;
    const fallbackCount = events.filter(e => e.outcome === 'fallback').length;
    const totalCost = events.reduce((s, e) => s + e.cost_usd, 0);
    const avgLatency = total > 0 ? events.reduce((s, e) => s + e.latency_ms, 0) / total : 0;

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

  async exportEvents(filters?: EventFilters, format: 'json' | 'csv' = 'json'): Promise<Blob> {
    return this.apiProvider.exportEvents(filters, format);
  }
}

export const evolutionProvider: EvolutionAPI = new HybridEvolutionProvider();
