import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, RunRecord } from '../../lib/api';
import EvolutionLogTab from '../../components/evolution/EvolutionLogTab';
import './History.css';

type Filter = 'all' | 'completed' | 'failed';

function RunsTab() {
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<RunRecord | null>(null);
    const [detail, setDetail] = useState<RunRecord | null>(null);

    useEffect(() => {
        setLoading(true);
        api.telemetryRuns().then(r => {
            const sorted = (r.runs ?? []).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
            setRuns(sorted);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selected) { setDetail(null); return; }
        api.telemetryRun(selected.run_id).then(setDetail).catch(() => setDetail(selected));
    }, [selected]);

    const filtered = runs.filter(r => {
        if (filter === 'completed') return r.outcome === 'completed' || r.status === 'completed';
        if (filter === 'failed') return r.outcome !== 'completed' && r.status !== 'completed';
        return true;
    });

    return (
        <>
            <div className="history-filters" style={{ padding: '0 24px 8px' }}>
                {(['all', 'completed', 'failed'] as Filter[]).map(f => (
                    <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'} history-filter-btn`} onClick={() => setFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>
            <div className="history-body">
                <div className="history-table glass-card">
                    {loading ? (
                        <div className="empty-state"><div className="spinner"/></div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>No runs found</span>
                        </div>
                    ) : (
                        <table className="history-tbl">
                            <thead>
                                <tr><th>Run ID</th><th>Tool</th><th>Status</th><th>Cost</th><th>Latency</th><th>Date</th></tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.run_id} className={`history-tbl__row${selected?.run_id === r.run_id ? ' history-tbl__row--selected' : ''}`} onClick={() => setSelected(r)}>
                                        <td className="mono">{r.run_id?.slice(0, 8)}</td>
                                        <td>{r.tool ?? '—'}</td>
                                        <td><span className={`badge ${(r.outcome ?? r.status) === 'completed' ? 'badge-ok' : 'badge-bad'}`}>{r.outcome ?? r.status ?? '—'}</span></td>
                                        <td className="mono">${(r.cost_usd ?? 0).toFixed(4)}</td>
                                        <td className="mono">{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                                        <td className="muted">{r.created_at ? new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {detail && (
                    <div className="history-detail glass-card">
                        <div className="history-detail__header">
                            <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{detail.run_id}</span>
                            <button className="btn btn-ghost" style={{ padding: '4px' }} onClick={() => setSelected(null)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="divider"/>
                        <pre className="history-detail__json">{JSON.stringify(detail, null, 2)}</pre>
                    </div>
                )}
            </div>
        </>
    );
}

export default function History() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'runs';

    const setTab = (tab: string) => {
        setSearchParams({ tab }, { replace: true });
    };

    return (
        <div className="history-page">
            <div className="history-header">
                <div>
                    <h1 className="history-header__title">Run History</h1>
                    <p className="history-header__sub">Browse and inspect AI execution runs</p>
                </div>
            </div>

            <div className="history-tabs">
                <button
                    className={`history-tab ${activeTab === 'runs' ? 'history-tab--active' : ''}`}
                    onClick={() => setTab('runs')}
                >
                    Runs
                </button>
                <button
                    className={`history-tab ${activeTab === 'evolution' ? 'history-tab--active' : ''}`}
                    onClick={() => setTab('evolution')}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ marginRight: 5, verticalAlign: 'middle' }}>
                        <path d="M2 15c6.667-6 13.333 0 20-6" />
                        <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
                        <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
                    </svg>
                    Evolution
                </button>
            </div>

            {activeTab === 'evolution' ? (
                <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 16px' }}>
                    <EvolutionLogTab />
                </div>
            ) : (
                <RunsTab />
            )}
        </div>
    );
}
