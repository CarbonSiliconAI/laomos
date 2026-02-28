import React, { useState, useEffect } from 'react';
import { api, TelemetryStats, ProviderUsage, SystemSpecs } from '../../lib/api';
import './Monitor.css';

export default function Monitor() {
    const [stats, setStats] = useState<TelemetryStats | null>(null);
    const [providers, setProviders] = useState<ProviderUsage[]>([]);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);

    function load() {
        api.telemetryStats().then(setStats).catch(() => {});
        api.telemetryProviderUsage().then(r => setProviders(r.data ?? [])).catch(() => {});
        api.systemSpecs().then(setSpecs).catch(() => {});
    }

    useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

    const maxCost = providers.reduce((m, p) => Math.max(m, p.cost_usd ?? 0), 0.001);
    const fmtMem = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

    return (
        <div className="monitor-page">
            <div className="monitor-header">
                <div>
                    <h1 className="monitor-header__title">Activity Monitor</h1>
                    <p className="monitor-header__sub">Real-time telemetry and usage metrics</p>
                </div>
                <button className="btn btn-ghost" onClick={load}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Refresh
                </button>
            </div>

            <div className="monitor-body">
                <div className="monitor-kpis">
                    {[
                        { label: 'Total Runs', value: stats?.totalRuns ?? 0 },
                        { label: 'Success Rate', value: stats ? `${((stats.successRate ?? 0)*100).toFixed(1)}%` : '—' },
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
                    <div className="monitor-providers glass-card">
                        <div className="monitor-section-title">Provider Usage</div>
                        {providers.length === 0 ? (
                            <div className="empty-state" style={{padding:'16px'}}><span>No usage data</span></div>
                        ) : (
                            providers.map(p => (
                                <div key={p.provider} className="monitor-provider-row">
                                    <div className="monitor-provider-name">{p.provider}</div>
                                    <div className="monitor-bar-wrap">
                                        <div className="monitor-bar" style={{ width: `${Math.min((p.cost_usd/maxCost)*100, 100)}%` }} />
                                    </div>
                                    <div className="monitor-provider-stats">
                                        <span>{p.count} runs</span>
                                        <span>${(p.cost_usd ?? 0).toFixed(3)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {specs && (
                        <div className="monitor-specs glass-card">
                            <div className="monitor-section-title">System</div>
                            {[
                                ['Platform', specs.platform],
                                ['Architecture', specs.arch],
                                ['CPUs', String(specs.cpus)],
                                ['Memory', fmtMem(specs.memory)],
                                ['Free Memory', fmtMem(specs.freeMemory)],
                                ['Node', specs.nodeVersion],
                            ].map(([k, v]) => (
                                <div key={k} className="monitor-spec-row">
                                    <span className="monitor-spec-key">{k}</span>
                                    <span className="monitor-spec-val mono">{v}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
