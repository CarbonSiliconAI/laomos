import React from 'react';
import type { DailyTrend } from '../../lib/evolution/types';

interface Props {
  data: DailyTrend[];
  width?: number;
  height?: number;
}

export default function EvolutionSparkline({ data, width = 120, height = 32 }: Props) {
  if (!data.length) {
    // Flat line placeholder
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2}
          stroke="var(--muted-2)" strokeWidth="1" strokeDasharray="4 3" />
      </svg>
    );
  }

  const values = data.map(d => d.events);
  const max = Math.max(...values, 1); // avoid division by zero
  const pad = 2;
  const innerH = height - pad * 2;
  const stepX = (width - pad * 2) / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + innerH - (v / max) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      role="img" aria-label="7-day evolution trend">
      {/* Area fill */}
      <path d={areaPath} fill="var(--ok)" opacity="0.15" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--ok)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2"
          fill="var(--ok)" opacity="0.6">
          <title>{data[i].date}: {data[i].events} events</title>
        </circle>
      ))}
    </svg>
  );
}
