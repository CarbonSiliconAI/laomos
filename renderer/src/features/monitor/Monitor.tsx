import React, { useState, useEffect } from 'react';
import { api, TelemetryStats, ProviderUsage, SystemSpecs, AIJob, HardwareMetrics } from '../../lib/api';
import './Monitor.css';

export default function Monitor() {
    const [stats, setStats] = useState<TelemetryStats | null>(null);
    const [providers, setProviders] = useState<ProviderUsage[]>([]);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);
    const [jobs, setJobs] = useState<AIJob[]>([]);
    const [metrics, setMetrics] = useState<HardwareMetrics | null>(null);

    function load() {
        api.telemetryStats().then(setStats).catch(() => { });
        api.telemetryProviderUsage().then(r => setProviders(r.data ?? [])).catch(() => { });
        api.systemSpecs().then(setSpecs).catch(() => { });
        api.aiJobs().then(r => setJobs((r.jobs as AIJob[]) ?? [])).catch(() => { });
        api.systemMetrics().then(setMetrics).catch(() => { });
    }

    async function handleKillJob(jobId: string) {
        try {
            await api.aiStop(jobId);
            load(); // Reload immediately to reflect the killed job
        } catch (e) {
            console.error('Failed to kill job', e);
        }
    }

    useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

    const maxCost = providers.reduce((m, p) => Math.max(m, p.cost_usd ?? 0), 0.001);

    return (
        <div className="monitor-page">
            <div className="monitor-header">
                <div>
                    <h1 className="monitor-header__title">Activity Monitor</h1>
                    <p className="monitor-header__sub">Real-time telemetry and usage metrics</p>
                </div>
                <button className="btn btn-ghost" onClick={load}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Refresh
                </button>
            </div>

            <div className="monitor-body">
                <div className="monitor-kpis">
                    {[
                        { label: 'Total Runs', value: stats?.totalRuns ?? 0 },
                        { label: 'Success Rate', value: stats ? `${((stats.successRate ?? 0) * 100).toFixed(1)}%` : '—' },
                        { label: 'Avg Cost', value: stats ? `$${(stats.avgCostUsd ?? 0).toFixed(4)}` : '—' },
                        { label: 'Total Cost', value: stats ? `$${(stats.totalCostUsd ?? 0).toFixed(3)}` : '—' },
                        { label: 'Avg Latency', value: stats?.avgLatencyMs ? `${stats.avgLatencyMs}ms` : '—' },
                    ].map(k => (
                        <div key={k.label} className="monitor-kpi glass-card">
                            <div className="monitor-kpi__label">{k.label}</div>
                            <div className="monitor-kpi__value">{k.value}</div>
                        </div>
                    ))}
                </div>

                <div className="monitor-row">
                    <div className="monitor-hardware glass-card">
                        <div className="monitor-section-title">Hardware Performance</div>
                        {metrics ? (
                            <div className="monitor-metrics-list">
                                <div className="monitor-metric-row">
                                    <div className="monitor-metric-label">CPU Usage</div>
                                    <div className="monitor-bar-wrap"><div className="monitor-bar cpu-bar" style={{ width: `${metrics.cpu}%` }} /></div>
                                    <div className="monitor-metric-val">{metrics.cpu.toFixed(1)}%</div>
                                </div>
                                <div className="monitor-metric-row">
                                    <div className="monitor-metric-label">Memory</div>
                                    <div className="monitor-bar-wrap"><div className="monitor-bar ram-bar" style={{ width: `${metrics.ram}%` }} /></div>
                                    <div className="monitor-metric-val">{metrics.ram.toFixed(1)}%</div>
                                </div>
                                <div className="monitor-metric-row">
                                    <div className="monitor-metric-label">Root Disk</div>
                                    <div className="monitor-bar-wrap"><div className="monitor-bar disk-bar" style={{ width: `${metrics.disk}%` }} /></div>
                                    <div className="monitor-metric-val">{metrics.disk}%</div>
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state">Loading metrics...</div>
                        )}
                    </div>

                    <div className="monitor-providers glass-card">
                        <div className="monitor-section-title">Provider Usage</div>
                        {providers.length === 0 ? (
                            <div className="empty-state" style={{ padding: '16px' }}><span>No usage data</span></div>
                        ) : (
                            providers.map(p => (
                                <div key={p.provider} className="monitor-provider-row">
                                    <div className="monitor-provider-name">{p.provider}</div>
                                    <div className="monitor-bar-wrap">
                                        <div className="monitor-bar" style={{ width: `${Math.min((p.cost_usd / maxCost) * 100, 100)}%` }} />
                                    </div>
                                    <div className="monitor-provider-stats">
                                        <span>{p.count} runs</span>
                                        <span>${(p.cost_usd ?? 0).toFixed(3)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="monitor-jobs-panel glass-card">
                    <div className="monitor-section-title" style={{ marginBottom: '12px' }}>Active AI Jobs (Threads)</div>
                    {jobs.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px' }}>No active AI threads running.</div>
                    ) : (
                        <div className="monitor-table-wrap">
                            <table className="monitor-table">
                                <thead>
                                    <tr>
                                        <th>Thread ID</th>
                                        <th>Provider</th>
                                        <th>Description</th>
                                        <th>Runtime</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map(job => (
                                        <tr key={job.id}>
                                            <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>{job.id.substring(0, 8)}</td>
                                            <td><span className="badge badge-outline">{job.provider}</span></td>
                                            <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.description}</td>
                                            <td className="mono">{((Date.now() - job.startTime) / 1000).toFixed(1)}s</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-sm btn-danger" onClick={() => handleKillJob(job.id)} title="Kill Thread">
                                                    Kill
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
