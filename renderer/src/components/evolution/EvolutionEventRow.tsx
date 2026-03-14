import React from 'react';
import type { EvolutionEvent } from '../../lib/evolution/types';

interface Props {
  event: EvolutionEvent;
  isSelected: boolean;
  onClick: () => void;
}

const SOURCE_COLORS: Record<string, string> = {
  flow_node: 'var(--accent)',
  agent: '#d97706',  // amber for agents
  skill: 'var(--ok)',
};

const DIVISION_EMOJI: Record<string, string> = {
  engineering: '\u{1F4BB}', design: '\u{1F3A8}', marketing: '\u{1F4CA}', sales: '\u{1F4B0}',
  testing: '\u{1F527}', product: '\u{1F4E6}', specialized: '\u{2B50}', support: '\u{1F6A9}',
  strategy: '\u{1F3AF}', 'project-management': '\u{1F4CB}', 'paid-media': '\u{1F4B3}',
  'game-development': '\u{1F3AE}', 'spatial-computing': '\u{1F30D}',
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
          {event.source_type === 'agent' ? (
            <span style={{ fontSize: 12, flexShrink: 0 }}>
              {DIVISION_EMOJI[(event.trigger.context?.division as string) || ''] || '\u{1F916}'}
            </span>
          ) : (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: SOURCE_COLORS[event.source_type] ?? 'var(--muted-2)',
              flexShrink: 0,
            }} />
          )}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>
              {event.source_type === 'agent' ? `[Agent] ${event.source_name}` : event.source_name}
            </span>
            {event.source_type === 'agent' && (
              <span style={{ fontSize: 'var(--fs-2xs)', color: '#b45309' }}>
                {(event.trigger.context?.division as string) || ''} · {event.latency_ms > 1000 ? `${(event.latency_ms / 1000).toFixed(1)}s` : `${event.latency_ms}ms`}
              </span>
            )}
          </span>
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
