import type { EvolutionEvent } from './types';

export interface ShannonMetrics {
  shannon: number;
  richness: number;
  evenness: number;
  gini: number;
  strategyDistribution: Record<string, number>;
}

export function computeShannonMetrics(events: EvolutionEvent[]): ShannonMetrics {
  const stratCount: Record<string, number> = {};
  events.forEach(e => {
    const strat = e.candidates[e.selected ?? 0]?.strategy || 'unknown';
    stratCount[strat] = (stratCount[strat] || 0) + 1;
  });

  const total = events.length;
  if (total === 0) {
    return { shannon: 0, richness: 0, evenness: 0, gini: 0, strategyDistribution: {} };
  }

  const probs = Object.values(stratCount).map(c => c / total);
  const shannon = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0);
  const richness = Object.keys(stratCount).length;
  const maxH = Math.log(richness);
  const evenness = maxH > 0 ? shannon / maxH : 0;

  const sorted = [...probs].sort((a, b) => a - b);
  const n = sorted.length;
  let giniSum = 0;
  sorted.forEach((p, i) => { giniSum += (2 * (i + 1) - n - 1) * p; });
  const gini = n > 0 ? Math.abs(giniSum / (n * sorted.reduce((s, p) => s + p, 0))) : 0;

  return { shannon, richness, evenness, gini, strategyDistribution: stratCount };
}
