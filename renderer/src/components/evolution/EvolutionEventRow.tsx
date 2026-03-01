import React from 'react';
import type { EvolutionEvent } from '../../lib/evolution/types';

interface Props {
  event: EvolutionEvent;
  isSelected: boolean;
  onClick: () => void;
}

const SOURCE_COLORS: Record<string, string> = {
  flow_node: 'var(--accent)',
  agent: 'var(--ok)',
  skill: 'var(--warn)',
};

export default function EvolutionEventRow({ event, isSelected, onClick }: Props) {
  const badgeClass =
    event.outcome === 'success' ? 'badge badge-ok' :
    event.outcome === 'fallback' ? 'badge badge-warn' :
    'badge badge-bad';

  const intentBadge =
    event.intent === 'repair' ? 'badge badge-accent' :
    event.intent === 'harden' ? 'badge badge-muted' :
    'badge badge-warn';

  const ts = new Date(event.timestamp);
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const latencyStr = event.latency_ms > 1000
    ? `${(event.latency_ms / 1000).toFixed(1)}s`
    : `${event.latency_ms}ms`;

  const truncatedError = event.trigger.error_message.length > 40
    ? event.trigger.error_message.slice(0, 40) + '…'
    : event.trigger.error_message;

  return (
    <tr
      className={`evo-row ${isSelected ? 'evo-row--selected' : ''}`}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      aria-label={`Evolution event: ${event.source_name} ${event.outcome}`}
    >
      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
        <div>{dateStr}</div>
        <div style={{ fontSize: 'var(--fs-2xs)', opacity: 0.7 }}>{timeStr}</div>
      </td>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: SOURCE_COLORS[event.source_type] ?? 'var(--muted-2)',
            flexShrink: 0,
          }} />
          <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{event.source_name}</span>
        </span>
      </td>
      <td>
        <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--bad)' }}>
          {event.trigger.error_type}
        </span>
        <div className="muted" style={{ fontSize: 'var(--fs-2xs)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncatedError}
        </div>
      </td>
      <td><span className={intentBadge}>{event.intent}</span></td>
      <td><span className={badgeClass}>{event.outcome}</span></td>
      <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>${event.cost_usd.toFixed(4)}</td>
      <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{latencyStr}</td>
    </tr>
  );
}
