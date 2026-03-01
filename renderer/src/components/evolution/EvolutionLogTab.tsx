import React, { useState, useCallback, useMemo } from 'react';
import type { EventFilters } from '../../lib/evolution/types';
import { useEvolutionEvents, computeShannonMetrics } from '../../lib/evolution';
import EvolutionFilters from './EvolutionFilters';
import EvolutionExport from './EvolutionExport';
import EvolutionEventRow from './EvolutionEventRow';
import EvolutionEventDrawer from './EvolutionEventDrawer';
import './EvolutionLogTab.css';

export default function EvolutionLogTab() {
  const [filters, setFilters] = useState<EventFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { events, loading, error, refetch } = useEvolutionEvents(filters);
  const shannon = useMemo(() => computeShannonMetrics(events), [events]);

  const selectedEvent = events.find(e => e.event_id === selectedId) ?? null;

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedId || events.length === 0) return;
    const idx = events.findIndex(e => e.event_id === selectedId);
    if (idx === -1) return;
    const nextIdx = direction === 'next'
      ? Math.min(idx + 1, events.length - 1)
      : Math.max(idx - 1, 0);
    setSelectedId(events[nextIdx].event_id);
  }, [selectedId, events]);

  return (
    <div className="evo-log">
      {/* Shannon Diversity strip */}
      {events.length > 0 && (
        <div className="evo-log__shannon-strip">
          <div className="evo-log__shannon-card glass-card">
            <span className="evo-log__shannon-label">Shannon H&prime;</span>
            <span className="evo-log__shannon-value">{shannon.shannon.toFixed(2)}</span>
          </div>
          <div className="evo-log__shannon-card glass-card">
            <span className="evo-log__shannon-label">Richness</span>
            <span className="evo-log__shannon-value">{shannon.richness}</span>
          </div>
          <div className="evo-log__shannon-card glass-card">
            <span className="evo-log__shannon-label">Evenness</span>
            <span className="evo-log__shannon-value">{shannon.evenness.toFixed(2)}</span>
          </div>
          <div className="evo-log__shannon-card glass-card">
            <span className="evo-log__shannon-label">Gini</span>
            <span className="evo-log__shannon-value">{shannon.gini.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Filter bar + Export */}
      <div className="evo-log__toolbar">
        <EvolutionFilters
          filters={filters}
          onChange={setFilters}
          resultCount={events.length}
        />
        <EvolutionExport filters={filters} />
      </div>

      {/* Event list */}
      <div className="evo-log__list">
        {loading ? (
          <div className="evo-log__skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="evo-log__skeleton-row" />
            ))}
          </div>
        ) : error ? (
          <div className="evo-log__error glass-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bad)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
            <button className="evo-log__retry" onClick={refetch}>Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div className="evo-log__empty glass-card">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="var(--muted-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 15c6.667-6 13.333 0 20-6" />
              <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
              <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
            </svg>
            <div className="evo-log__empty-title">No evolution events yet</div>
            <div className="evo-log__empty-sub">
              Events will appear here when Auto-Repair is enabled on flow nodes
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="evo-log__table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Error</th>
                  <th>Intent</th>
                  <th>Outcome</th>
                  <th>Cost</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {events.map(evt => (
                  <EvolutionEventRow
                    key={evt.event_id}
                    event={evt}
                    isSelected={evt.event_id === selectedId}
                    onClick={() => setSelectedId(
                      evt.event_id === selectedId ? null : evt.event_id
                    )}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <EvolutionEventDrawer
        event={selectedEvent}
        onClose={() => setSelectedId(null)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
