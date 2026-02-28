import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TelemetryStats, RunRecord } from '../lib/api';
import './Home.css';

function KpiCard({ label, value, sub, color }: {
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}) {
    return (
        <div className="kpi-card glass-card">
            <div className="kpi-card__label">{label}</div>
            <div className="kpi-card__value" style={color ? { color } : undefined}>{value}</div>
            {sub && <div className="kpi-card__sub">{sub}</div>}
        </div>
    );
}

function QuickLaunch({ items }: { items: Array<{ label: string; path: string; icon: React.ReactNode; color: string }> }) {
    const navigate = useNavigate();
    return (
        <div className="quick-launch">
            {items.map((item) => (
                <button
                    key={item.path}
                    className="quick-launch__item"
                    onClick={() => navigate(item.path)}
                    style={{ '--ql-color': item.color } as React.CSSProperties}
                >
                    <span className="quick-launch__icon">{item.icon}</span>
                    <span className="quick-launch__label">{item.label}</span>
                </button>
            ))}
        </div>
    );
}

const QUICK_ITEMS = [
    {
        label: 'Flow Builder',
        path: '/operations/flow',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
            </svg>
        ),
    },
    {
        label: 'AI Chat',
        path: '/workforce/chat',
        color: 'rgba(16,185,129,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        label: 'Mail',
        path: '/operations/mail',
        color: 'rgba(245,158,11,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
        ),
    },
    {
        label: 'Files',
        path: '/knowledge/files',
        color: 'rgba(59,130,246,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        label: 'Monitor',
        path: '/governance/monitor',
        color: 'rgba(239,68,68,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        label: 'Adventure',
        path: '/operations/game',
        color: 'rgba(168,85,247,0.85)',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4M15 11h.01M18 11h.01" />
            </svg>
        ),
    },
];

export default function HomePage() {
    const [stats, setStats] = useState<TelemetryStats | null>(null);
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        Promise.all([
            api.telemetryStats().catch(() => null),
            api.telemetryRuns().catch(() => ({ runs: [] })),
        ]).then(([s, r]) => {
            setStats(s);
            setRuns((r?.runs ?? []).slice(0, 8));
            setLoadingStats(false);
        });
    }, []);

    const fmt = (n: number | undefined, decimals = 2) =>
        n !== undefined ? n.toFixed(decimals) : '—';

    return (
        <div className="home-page">
            {/* Hero */}
            <div className="home-hero">
                <div>
                    <h1 className="home-hero__title">AI Company OS</h1>
                    <p className="home-hero__sub">Your command centre for intelligent operations</p>
                </div>
            </div>

            {/* KPI strip */}
            <div className="home-kpis">
                {loadingStats ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="kpi-card glass-card kpi-card--loading" />
                    ))
                ) : (
                    <>
                        <KpiCard
                            label="Total Runs"
                            value={stats?.totalRuns ?? 0}
                            sub="all time"
                        />
                        <KpiCard
                            label="Success Rate"
                            value={`${fmt((stats?.successRate ?? 0) * 100, 1)}%`}
                            color={
                                (stats?.successRate ?? 0) > 0.8 ? 'var(--ok)'
                                : (stats?.successRate ?? 0) > 0.5 ? 'var(--warn)'
                                : 'var(--bad)'
                            }
                        />
                        <KpiCard
                            label="Avg Cost"
                            value={`$${fmt(stats?.avgCostUsd ?? 0, 4)}`}
                            sub="per run"
                        />
                        <KpiCard
                            label="Total Cost"
                            value={`$${fmt(stats?.totalCostUsd ?? 0, 3)}`}
                            sub="all time"
                        />
                    </>
                )}
            </div>

            {/* Quick Launch */}
            <div className="home-section">
                <div className="home-section__title">Quick Launch</div>
                <QuickLaunch items={QUICK_ITEMS} />
            </div>

            {/* Recent Activity */}
            <div className="home-section">
                <div className="home-section__title">Recent Activity</div>
                <div className="glass-card home-activity">
                    {runs.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            <span>No runs yet — start with Flow Builder or AI Chat</span>
                        </div>
                    ) : (
                        <table className="home-activity__table">
                            <thead>
                                <tr>
                                    <th>Tool</th>
                                    <th>Status</th>
                                    <th>Cost</th>
                                    <th>Latency</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((r) => (
                                    <tr key={r.run_id}>
                                        <td className="mono">{r.tool ?? '—'}</td>
                                        <td>
                                            <span className={`badge ${r.outcome === 'completed' ? 'badge-ok' : 'badge-bad'}`}>
                                                {r.outcome ?? r.status}
                                            </span>
                                        </td>
                                        <td className="mono">${(r.cost_usd ?? 0).toFixed(4)}</td>
                                        <td className="mono">{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                                        <td className="muted">
                                            {r.created_at
                                                ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
