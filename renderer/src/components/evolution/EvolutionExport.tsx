import React, { useState } from 'react';
import type { EventFilters } from '../../lib/evolution/types';
import { evolutionProvider } from '../../lib/evolution';

interface Props {
  filters?: EventFilters;
}

export default function EvolutionExport({ filters }: Props) {
  const [exporting, setExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const doExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    setShowMenu(false);
    try {
      const blob = await evolutionProvider.exportEvents(filters, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laomos-evolution-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="evo-export" style={{ position: 'relative' }}>
      <button
        className="evo-export__btn"
        onClick={() => setShowMenu(!showMenu)}
        disabled={exporting}
        title="Export evolution events"
      >
        {exporting ? (
          <span className="spinner" style={{ width: 14, height: 14 }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        Export
      </button>
      {showMenu && (
        <>
          <div className="evo-export__backdrop" onClick={() => setShowMenu(false)} />
          <div className="evo-export__menu glass-card">
            <button className="evo-export__option" onClick={() => doExport('json')}>
              <span className="mono">JSON</span>
              <span className="muted">Full event data</span>
            </button>
            <button className="evo-export__option" onClick={() => doExport('csv')}>
              <span className="mono">CSV</span>
              <span className="muted">Spreadsheet-ready</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
