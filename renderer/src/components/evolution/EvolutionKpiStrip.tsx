import React from 'react';
import type { EvolutionStats } from '../../lib/evolution/types';
import EvolutionSparkline from './EvolutionSparkline';

interface Props {
  stats: EvolutionStats;
}

// DNA helix icon (inline SVG, matches 26px value size aesthetic)
function DnaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="var(--evo-dna)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ marginRight: 4, verticalAlign: 'middle', opacity: 0.7 }}>
      <path d="M2 15c6.667-6 13.333 0 20-6" />
      <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
      <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
      <path d="M17 6l-2.5 2.5" />
      <path d="M14 8l-1.5 1.5" />
      <path d="M7 18l2.5-2.5" />
      <path d="M3.5 14.5l.5-.5" />
      <path d="M20 9l.5-.5" />
      <path d="M6.5 12.5l1-1" />
      <path d="M16.5 10.5l1-1" />
    </svg>
  );
}

export default function EvolutionKpiStrip({ stats }: Props) {
  if (stats.totalEvents === 0) return null; // Progressive disclosure

  const lift = stats.effectiveSuccessRate - stats.nativeSuccessRate;
  const liftColor =
    lift > 0.10 ? 'var(--ok)' :
    lift > 0.05 ? 'var(--warn)' :
    'var(--muted)';

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <>
      {/* Self-Healed card */}
      <div className="kpi-card glass-card">
        <div className="kpi-card__label">
          <DnaIcon /> Self-Healed
        </div>
        <div className="kpi-card__value" style={{ color: 'var(--ok)' }}>
          {stats.successCount}
        </div>
        <div className="kpi-card__sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EvolutionSparkline data={stats.trend7d} width={80} height={24} />
          <span>last 7 days</span>
        </div>
      </div>

      {/* Effective Rate card */}
      <div className="kpi-card glass-card">
        <div className="kpi-card__label">Effective Rate</div>
        <div className="kpi-card__value" style={{ color: liftColor }}>
          {fmtPct(stats.effectiveSuccessRate)}
        </div>
        <div className="kpi-card__sub">
          vs {fmtPct(stats.nativeSuccessRate)} native
          {lift > 0 && (
            <span style={{ color: liftColor, marginLeft: 6, fontWeight: 600 }}>
              +{fmtPct(lift)}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
