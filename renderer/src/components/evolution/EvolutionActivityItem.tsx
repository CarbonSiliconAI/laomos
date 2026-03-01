import React from 'react';
import type { EvolutionEvent } from '../../lib/evolution/types';

interface Props {
  event: EvolutionEvent;
}

export default function EvolutionActivityItem({ event }: Props) {
  const badgeClass =
    event.outcome === 'success' ? 'badge badge-ok' :
    event.outcome === 'fallback' ? 'badge badge-warn' :
    'badge badge-bad';

  const outcomeLabel =
    event.outcome === 'success' ? 'Self-healed' :
    event.outcome === 'fallback' ? 'Fallback' :
    'Failed';

  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <tr>
      <td className="mono">{event.source_name}</td>
      <td>
        <span className={badgeClass} style={{ gap: 4, display: 'inline-flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
            <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
          </svg>
          {outcomeLabel}
        </span>
      </td>
      <td className="mono">${event.cost_usd.toFixed(4)}</td>
      <td className="mono">{event.latency_ms > 1000 ? `${(event.latency_ms / 1000).toFixed(1)}s` : `${event.latency_ms}ms`}</td>
      <td className="muted">{time}</td>
    </tr>
  );
}
