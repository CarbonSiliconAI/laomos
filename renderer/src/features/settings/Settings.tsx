import React, { useState, useEffect } from 'react';
import { api, BudgetConstraint, CacheStats, SystemSpecs } from '../../lib/api';
import './Settings.css';

export default function Settings() {
    const [budget, setBudget] = useState<BudgetConstraint | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        api.budgetGet().then(setBudget).catch(() => {});
        api.cacheStats().then(setCacheStats).catch(() => {});
        api.systemSpecs().then(setSpecs).catch(() => {});
    }, []);

    async function saveBudget() {
        if (!budget) return;
        setSaving(true);
        try { await api.budgetSet(budget); } catch {}
        finally { setSaving(false); }
    }

    async function clearCache() {
        setClearing(true);
        try { await api.cacheClear(); const s = await api.cacheStats(); setCacheStats(s); } catch {}
        finally { setClearing(false); }
    }

    return (
        <div className="settings-page">
            <div className="settings-header">
                <h1 className="settings-header__title">Settings</h1>
                <p className="settings-header__sub">Configure system behavior and preferences</p>
            </div>
            <div className="settings-body">
                {/* Budget */}
                <div className="settings-section glass-card">
                    <div className="settings-section__title">Budget</div>
                    <div className="settings-section__desc">Control AI spending per run</div>
                    {budget && (
                        <>
                            <div className="settings-field">
                                <label>Max Cost per Run (USD)</label>
                                <input className="os-input" type="number" min="0.01" max="100" step="0.01"
                                    value={budget.maxCostUsdPerRun} onChange={e => setBudget(b => b ? { ...b, maxCostUsdPerRun: parseFloat(e.target.value) } : b)} />
                            </div>
                            <div className="settings-field">
                                <label>Max Latency (ms)</label>
                                <input className="os-input" type="number" min="1000" step="1000"
                                    value={budget.maxLatencyMs} onChange={e => setBudget(b => b ? { ...b, maxLatencyMs: parseInt(e.target.value) } : b)} />
                            </div>
                            <div className="settings-field">
                                <label>Quality Floor (0–1)</label>
                                <input className="os-input" type="number" min="0" max="1" step="0.05"
                                    value={budget.qualityFloor} onChange={e => setBudget(b => b ? { ...b, qualityFloor: parseFloat(e.target.value) } : b)} />
                            </div>
                            <div className="settings-field">
                                <label>Preferred Provider</label>
                                <select className="os-input" value={budget.preferredModels?.[0] ?? ''}
                                    onChange={e => setBudget(b => b ? { ...b, preferredModels: e.target.value ? [e.target.value] : [] } : b)}>
                                    <option value="">Auto</option>
                                    <option value="local">Local (Ollama)</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={saveBudget} disabled={saving}>
                                {saving ? <><div className="spinner"/> Saving…</> : 'Save Budget'}
                            </button>
                        </>
                    )}
                </div>

                {/* Cache */}
                <div className="settings-section glass-card">
                    <div className="settings-section__title">Semantic Cache</div>
                    <div className="settings-section__desc">Hash-based deduplication of identical requests</div>
                    {cacheStats ? (
                        <div className="settings-stats">
                            <div className="settings-stat"><span>Entries</span><strong>{cacheStats.total_entries}</strong></div>
                            <div className="settings-stat"><span>Total Hits</span><strong>{cacheStats.total_hits}</strong></div>
                            <div className="settings-stat"><span>Hit Rate</span><strong>{(cacheStats.hit_rate_pct ?? 0).toFixed(1)}%</strong></div>
                        </div>
                    ) : null}
                    <button className="btn btn-ghost" onClick={clearCache} disabled={clearing}>
                        {clearing ? <><div className="spinner"/> Clearing…</> : 'Clear Cache'}
                    </button>
                </div>

                {/* System */}
                {specs && (
                    <div className="settings-section glass-card">
                        <div className="settings-section__title">System Info</div>
                        {[['Platform', specs.platform], ['Architecture', specs.arch], ['CPUs', String(specs.cpus)], ['Node', specs.nodeVersion]].map(([k, v]) => (
                            <div key={k} className="settings-info-row">
                                <span>{k}</span>
                                <span className="mono">{v}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
