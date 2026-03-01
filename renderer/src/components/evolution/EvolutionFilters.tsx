import React from 'react';
import type { EventFilters, SourceType, EvolutionOutcome } from '../../lib/evolution/types';

interface Props {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
  resultCount: number;
}

export default function EvolutionFilters({ filters, onChange, resultCount }: Props) {
  const update = (partial: Partial<EventFilters>) => onChange({ ...filters, ...partial });

  const hasActiveFilters =
    filters.dateFrom || filters.dateTo ||
    (filters.sourceType?.length ?? 0) > 0 ||
    (filters.outcome?.length ?? 0) > 0 ||
    filters.searchQuery;

  const toggleArrayFilter = <T extends string>(
    current: T[] | undefined,
    value: T,
    key: keyof EventFilters,
  ) => {
    const arr = current ?? [];
    const next = arr.includes(value)
      ? arr.filter(v => v !== value)
      : [...arr, value];
    update({ [key]: next.length > 0 ? next : undefined });
  };

  return (
    <div className="evo-filters">
      {/* Date from */}
      <input
        type="date"
        className="evo-filters__input"
        value={filters.dateFrom?.slice(0, 10) ?? ''}
        onChange={(e) => update({ dateFrom: e.target.value ? e.target.value + 'T00:00:00Z' : undefined })}
        title="From date"
        aria-label="Filter from date"
      />

      {/* Date to */}
      <input
        type="date"
        className="evo-filters__input"
        value={filters.dateTo?.slice(0, 10) ?? ''}
        onChange={(e) => update({ dateTo: e.target.value ? e.target.value + 'T23:59:59Z' : undefined })}
        title="To date"
        aria-label="Filter to date"
      />

      {/* Divider */}
      <div className="evo-filters__divider" />

      {/* Source type toggles */}
      {(['flow_node', 'agent', 'skill'] as SourceType[]).map(st => (
        <button
          key={st}
          className={`evo-filters__chip ${filters.sourceType?.includes(st) ? 'evo-filters__chip--active' : ''}`}
          onClick={() => toggleArrayFilter(filters.sourceType, st, 'sourceType')}
          title={`Filter by ${st}`}
        >
          {st === 'flow_node' ? 'Flow' : st === 'agent' ? 'Agent' : 'Skill'}
        </button>
      ))}

      {/* Divider */}
      <div className="evo-filters__divider" />

      {/* Outcome toggles */}
      {(['success', 'failure', 'fallback'] as EvolutionOutcome[]).map(oc => (
        <button
          key={oc}
          className={`evo-filters__chip evo-filters__chip--${oc} ${filters.outcome?.includes(oc) ? 'evo-filters__chip--active' : ''}`}
          onClick={() => toggleArrayFilter(filters.outcome, oc, 'outcome')}
        >
          {oc}
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search */}
      <input
        type="text"
        className="evo-filters__input evo-filters__search"
        placeholder="Search errors, sources…"
        value={filters.searchQuery ?? ''}
        onChange={(e) => update({ searchQuery: e.target.value || undefined })}
        aria-label="Search evolution events"
      />

      {/* Result count */}
      <span className="evo-filters__count">{resultCount} events</span>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          className="evo-filters__clear"
          onClick={() => onChange({})}
          title="Clear all filters"
        >
          Clear
        </button>
      )}
    </div>
  );
}
