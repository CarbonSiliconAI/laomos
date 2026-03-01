import React, { useEffect, useRef, useState } from 'react';
import type { EvolutionEvent } from '../../lib/evolution/types';
import './EvolutionEventDrawer.css';

interface Props {
  event: EvolutionEvent | null;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

function PcecPhaseBar({ phases }: { phases: EvolutionEvent['pcec_phases'] }) {
  const total = phases.perceive_ms + phases.construct_ms + phases.evaluate_ms + phases.commit_ms;
  const segments = [
    { label: 'Perceive', key: 'P', ms: phases.perceive_ms, color: 'var(--evo-perceive)' },
    { label: 'Construct', key: 'C', ms: phases.construct_ms, color: 'var(--evo-construct)' },
    { label: 'Evaluate', key: 'E', ms: phases.evaluate_ms, color: 'var(--evo-evaluate)' },
    { label: 'Commit', key: 'K', ms: phases.commit_ms, color: 'var(--evo-commit)' },
  ];

  return (
    <div className="evo-pcec">
      <div className="evo-pcec__bar">
        {segments.map(s => {
          const pct = (s.ms / total) * 100;
          return (
            <div
              key={s.key}
              className="evo-pcec__segment"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${s.label}: ${s.ms}ms`}
            >
              {pct > 12 && <span className="evo-pcec__letter">{s.key}</span>}
            </div>
          );
        })}
      </div>
      <div className="evo-pcec__legend">
        {segments.map(s => (
          <span key={s.key} className="evo-pcec__legend-item">
            <span className="evo-pcec__dot" style={{ background: s.color }} />
            {s.label} <span className="mono muted">{s.ms}ms</span>
          </span>
        ))}
        <span className="evo-pcec__legend-item" style={{ marginLeft: 'auto', fontWeight: 600 }}>
          Total: <span className="mono">{total}ms</span>
        </span>
      </div>
    </div>
  );
}

function CandidateCard({ candidate, index, isWinner }: {
  candidate: EvolutionEvent['candidates'][number];
  index: number;
  isWinner: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`evo-candidate ${isWinner ? 'evo-candidate--winner' : ''}`}>
      <div className="evo-candidate__header">
        <span className="evo-candidate__index">#{index + 1}</span>
        <span className="evo-candidate__strategy mono">{candidate.strategy}</span>
        <span className={`badge ${candidate.sandbox_result.passed ? 'badge-ok' : 'badge-bad'}`} style={{ marginLeft: 'auto' }}>
          {candidate.sandbox_result.passed ? 'PASS' : 'FAIL'}
        </span>
        {isWinner && (
          <span className="badge badge-accent" style={{ marginLeft: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Selected
          </span>
        )}
      </div>
      {/* Score bar */}
      <div className="evo-candidate__score-row">
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Score</span>
        <div className="evo-candidate__score-bar">
          <div
            className="evo-candidate__score-fill"
            style={{ width: `${candidate.score * 100}%`, background: isWinner ? 'var(--accent)' : 'var(--muted-2)' }}
          />
        </div>
        <span className="mono" style={{ fontSize: 'var(--fs-xs)', minWidth: 36, textAlign: 'right' }}>
          {candidate.score.toFixed(3)}
        </span>
      </div>
      {/* Code diff toggle */}
      <button className="evo-candidate__diff-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾ Hide diff' : '▸ Show diff'}
      </button>
      {expanded && (
        <pre className="evo-code-block">{candidate.code_diff}</pre>
      )}
    </div>
  );
}

export default function EvolutionEventDrawer({ event, onClose, onNavigate }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [showJson, setShowJson] = useState(false);

  // Focus trap and keyboard nav
  useEffect(() => {
    if (!event) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') onNavigate?.('prev');
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') onNavigate?.('next');
    };

    document.addEventListener('keydown', handler);
    drawerRef.current?.focus();

    return () => document.removeEventListener('keydown', handler);
  }, [event, onClose, onNavigate]);

  if (!event) return null;

  const outcomeClass =
    event.outcome === 'success' ? 'badge-ok' :
    event.outcome === 'fallback' ? 'badge-warn' : 'badge-bad';

  const copyId = () => {
    navigator.clipboard.writeText(event.event_id).catch(() => {});
  };

  return (
    <>
      <div className="evo-drawer__backdrop" onClick={onClose} />
      <div className="evo-drawer" ref={drawerRef} tabIndex={-1} role="dialog" aria-label="Evolution event detail">
        {/* Header */}
        <div className="evo-drawer__header">
          <div>
            <div className="evo-drawer__title">{event.source_name}</div>
            <div className="evo-drawer__subtitle">
              <span className={`badge ${outcomeClass}`}>{event.outcome}</span>
              <span className="muted">{new Date(event.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <button className="evo-drawer__close" onClick={onClose} aria-label="Close drawer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="evo-drawer__body">
          {/* PCEC Phase Timeline */}
          <div className="evo-drawer__section">
            <div className="evo-drawer__section-title">PCEC Cycle</div>
            <PcecPhaseBar phases={event.pcec_phases} />
          </div>

          {/* Trigger */}
          <div className="evo-drawer__section">
            <div className="evo-drawer__section-title">Trigger</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span className="badge badge-bad">{event.trigger.error_type}</span>
              {event.trigger.exit_code !== null && (
                <span className="badge badge-muted">exit: {event.trigger.exit_code}</span>
              )}
            </div>
            <pre className="evo-code-block" style={{ maxHeight: 120, overflow: 'auto' }}>
              {event.trigger.error_message}
            </pre>
            {Object.keys(event.trigger.context).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)' }}>
                  Context
                </summary>
                <pre className="evo-code-block" style={{ marginTop: 4 }}>
                  {JSON.stringify(event.trigger.context, null, 2)}
                </pre>
              </details>
            )}
          </div>

          {/* Candidates */}
          <div className="evo-drawer__section">
            <div className="evo-drawer__section-title">
              Candidates ({event.candidates.length})
            </div>
            {event.candidates.map((c, i) => (
              <CandidateCard
                key={i}
                candidate={c}
                index={i}
                isWinner={event.selected === i}
              />
            ))}
          </div>

          {/* Metadata */}
          <div className="evo-drawer__section">
            <div className="evo-drawer__section-title">Metadata</div>
            <div className="evo-drawer__meta-grid">
              <span className="muted">Cost</span>
              <span className="mono">${event.cost_usd.toFixed(4)}</span>
              <span className="muted">Latency</span>
              <span className="mono">{event.latency_ms}ms</span>
              <span className="muted">Intent</span>
              <span>{event.intent}</span>
              <span className="muted">Source Type</span>
              <span className="mono">{event.source_type}</span>
              <span className="muted">Source ID</span>
              <span className="mono" style={{ fontSize: 'var(--fs-2xs)' }}>{event.source_id}</span>
              <span className="muted">Event ID</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="mono" style={{ fontSize: 'var(--fs-2xs)' }}>
                  {event.event_id.slice(0, 16)}…
                </span>
                <button className="evo-drawer__copy" onClick={copyId} title="Copy full event ID">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </span>
              {event.gene_id && (
                <>
                  <span className="muted">Gene ID</span>
                  <span className="mono">{event.gene_id}</span>
                </>
              )}
            </div>
          </div>

          {/* JSON toggle */}
          <div className="evo-drawer__section">
            <button
              className="evo-drawer__json-toggle"
              onClick={() => setShowJson(!showJson)}
            >
              {showJson ? '▾ Hide JSON' : '▸ Show raw JSON'}
            </button>
            {showJson && (
              <pre className="evo-code-block evo-json-block">
                {JSON.stringify(event, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
