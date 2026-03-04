import React, { useState, useEffect } from 'react';
import { api, BudgetConstraint, CacheStats, SystemSpecs } from '../../lib/api';
import './Settings.css';

declare global {
    interface Window {
        osUpdater?: {
            version: () => Promise<string>;
            channel: { get: () => Promise<string>; set: (ch: string) => Promise<void> };
            updates: { check: () => Promise<void>; download: () => Promise<void>; install: () => Promise<void> };
            onStatus: (cb: (ev: UpdateEvent) => void) => () => void;
        };
    }
}

interface UpdateEvent {
    type: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error';
    version?: string;
    percent?: number;
    message?: string;
}

const DEFAULT_APPS = [
    { id: 'chat', name: 'AI Chat' },
    { id: 'flow', name: 'Flow Builder' },
    { id: 'files', name: 'File Explorer' },
    { id: 'mail', name: 'Mail' },
    { id: 'game', name: 'Games' },
];

const TIER_LABELS: Record<string, string> = {
    '1': 'Tier 1 — Read Only',
    '2': 'Tier 2 — Read + Write',
    '3': 'Tier 3 — Full Access',
};

export default function Settings() {
    const [budget, setBudget] = useState<BudgetConstraint | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);

    // Firewall
    const [firewallEnabled, setFirewallEnabled] = useState<boolean | null>(null);
    const [firewallToggling, setFirewallToggling] = useState(false);

    // Updater
    const [appVersion, setAppVersion] = useState('');
    const [channel, setChannel] = useState('stable');
    const [updateStatus, setUpdateStatus] = useState('');
    const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
    const [updateReady, setUpdateReady] = useState(false);

    // Auto-Config
    const [configRunning, setConfigRunning] = useState(false);
    const [configLog, setConfigLog] = useState('');

    // App Permissions
    const [permissions, setPermissions] = useState<Record<string, string>>(() => {
        try { return JSON.parse(localStorage.getItem('appPermissions') ?? '{}'); } catch { return {}; }
    });

    useEffect(() => {
        api.budgetGet().then(setBudget).catch(() => { });
        api.cacheStats().then(setCacheStats).catch(() => { });
        api.systemSpecs().then(setSpecs).catch(() => { });
        api.systemFirewall().then(r => setFirewallEnabled(r.enabled)).catch(() => { });

        // Updater
        const updater = window.osUpdater;
        if (updater) {
            updater.version().then(setAppVersion).catch(() => { });
            updater.channel.get().then(setChannel).catch(() => { });
            const unsub = updater.onStatus((ev) => {
                switch (ev.type) {
                    case 'checking': setUpdateStatus('Checking for updates…'); break;
                    case 'available': setUpdateStatus(`Update available: v${ev.version}`); break;
                    case 'not-available': setUpdateStatus('You are on the latest version.'); break;
                    case 'download-progress': setDownloadPercent(ev.percent ?? 0); setUpdateStatus('Downloading…'); break;
                    case 'downloaded': setUpdateReady(true); setDownloadPercent(null); setUpdateStatus('Update downloaded — restart to apply.'); break;
                    case 'error': setUpdateStatus(`Error: ${ev.message ?? 'Update failed'}`); setDownloadPercent(null); break;
                }
            });
            return unsub;
        }
    }, []);

    async function saveBudget() {
        if (!budget) return;
        setSaving(true);
        try { await api.budgetSet(budget); } catch { }
        finally { setSaving(false); }
    }

    async function clearCache() {
        setClearing(true);
        try { await api.cacheClear(); const s = await api.cacheStats(); setCacheStats(s); } catch { }
        finally { setClearing(false); }
    }

    async function toggleFirewall() {
        if (firewallEnabled === null) return;
        setFirewallToggling(true);
        try {
            const res = await api.systemFirewallSet(!firewallEnabled);
            setFirewallEnabled(res.enabled);
        } catch { }
        finally { setFirewallToggling(false); }
    }

    function setPermission(appId: string, tier: string) {
        const next = { ...permissions, [appId]: tier };
        setPermissions(next);
        localStorage.setItem('appPermissions', JSON.stringify(next));
    }

    async function switchChannel(ch: string) {
        setChannel(ch);
        await window.osUpdater?.channel.set(ch).catch(() => { });
    }

    async function runAutoConfig() {
        setConfigRunning(true);
        setConfigLog('Starting system auto-configuration...\nThis will install node, python, and ollama using Homebrew.\nThis might take a few minutes.');
        try {
            const res = await api.systemAutoConfig();
            setConfigLog(prev => prev + '\n\n' + (res.log || 'Completed successfully.'));
        } catch (err: any) {
            setConfigLog(prev => prev + '\n\nError: ' + err.message);
        } finally {
            setConfigRunning(false);
        }
    }

    return (
        <div className="settings-page">
            <div className="settings-header">
                <h1 className="settings-header__title">Settings</h1>
                <p className="settings-header__sub">Configure system behavior and preferences</p>
            </div>
            <div className="settings-body">
                {/* AI Firewall */}
                <div className="settings-section glass-card">
                    <div className="settings-section__title">AI Firewall</div>
                    <div className="settings-section__desc">Scan prompts and responses for unsafe content</div>
                    <div className="settings-toggle-row">
                        <span className="settings-toggle-label">
                            {firewallEnabled === null ? 'Loading…' : firewallEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <button
                            className={`settings-toggle ${firewallEnabled ? 'settings-toggle--on' : ''}`}
                            onClick={toggleFirewall}
                            disabled={firewallEnabled === null || firewallToggling}
                        >
                            <div className="settings-toggle__knob" />
                        </button>
                    </div>
                </div>

                {/* Auto-updater */}
                {window.osUpdater && (
                    <div className="settings-section glass-card">
                        <div className="settings-section__title">Updates</div>
                        <div className="settings-section__desc">
                            {appVersion ? `Current version: v${appVersion}` : 'LaoMOS auto-updater'}
                        </div>
                        <div className="settings-field">
                            <label>Update Channel</label>
                            <select className="os-input" value={channel} onChange={e => switchChannel(e.target.value)}>
                                <option value="stable">Stable</option>
                                <option value="beta">Beta</option>
                            </select>
                        </div>
                        {downloadPercent !== null && (
                            <div className="settings-progress">
                                <div className="settings-progress__bar" style={{ width: `${Math.round(downloadPercent)}%` }} />
                            </div>
                        )}
                        {updateStatus && <p className="settings-update-status">{updateStatus}</p>}
                        <div className="settings-btn-row">
                            {!updateReady ? (
                                <>
                                    <button className="btn btn-ghost" onClick={() => window.osUpdater?.updates.check()}>Check for Updates</button>
                                    <button className="btn btn-primary" onClick={() => window.osUpdater?.updates.download()} disabled={downloadPercent !== null}>Download</button>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={() => window.osUpdater?.updates.install()}>Restart &amp; Install</button>
                            )}
                        </div>
                    </div>
                )}

                {/* App Permissions */}
                <div className="settings-section glass-card">
                    <div className="settings-section__title">App Permissions</div>
                    <div className="settings-section__desc">Set access tiers for each app module</div>
                    <p style={{
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--muted-2)',
                        marginTop: '2px',
                        marginBottom: '8px',
                        fontWeight: 400,
                    }}>
                        Tier 1: Read-only access &middot; Tier 2: Read + execute &middot; Tier 3: Full access (read, execute, write)
                    </p>
                    {DEFAULT_APPS.map(app => (
                        <div key={app.id} className="settings-perm-row">
                            <span className="settings-perm-label">{app.name}</span>
                            <select
                                className="os-input settings-perm-select"
                                value={permissions[app.id] ?? '3'}
                                onChange={e => setPermission(app.id, e.target.value)}
                            >
                                <option value="1">Tier 1 — Read Only</option>
                                <option value="2">Tier 2 — Read + Write</option>
                                <option value="3">Tier 3 — Full Access</option>
                            </select>
                        </div>
                    ))}
                </div>

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
                            <div className="settings-field">
                                <label>Fallback Provider (Last Resort)</label>
                                <select className="os-input" value={budget.fallbackModels?.[0] ?? 'local'}
                                    onChange={e => setBudget(b => b ? { ...b, fallbackModels: e.target.value ? [e.target.value] : [] } : b)}>
                                    <option value="local">Local (Ollama)</option>
                                    <option value="online">Online (OpenAI / Anthropic / Gemini)</option>
                                </select>
                            </div>
                            <div className="settings-field">
                                <label>Fallback Local Model</label>
                                <input className="os-input" type="text" placeholder="e.g. qwen3.5:9b, llama3.1:8b"
                                    value={budget.fallbackLocalModel ?? 'qwen3.5:9b'}
                                    onChange={e => setBudget(b => b ? { ...b, fallbackLocalModel: e.target.value } : b)} />
                            </div>
                            <button className="btn btn-primary" onClick={saveBudget} disabled={saving}>
                                {saving ? <><div className="spinner" /> Saving…</> : 'Save Budget'}
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
                        {clearing ? <><div className="spinner" /> Clearing…</> : 'Clear Cache'}
                    </button>
                </div>

                {/* Auto-Config */}
                <div className="settings-section glass-card">
                    <div className="settings-section__title">System Auto-Config</div>
                    <div className="settings-section__desc">Install required system dependencies (Node/npm, Python, Ollama) via Homebrew</div>
                    <div className="settings-btn-row" style={{ marginTop: '12px' }}>
                        <button className="btn btn-primary" onClick={runAutoConfig} disabled={configRunning}>
                            {configRunning ? <><div className="spinner" /> Configuring…</> : 'Run Auto-Config'}
                        </button>
                    </div>
                    {configLog && (
                        <div className="settings-log-box mono" style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: 'var(--bg-3)',
                            borderRadius: '6px',
                            fontSize: 'var(--fs-xs)',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {configLog}
                        </div>
                    )}
                </div>

                {/* System */}
                {specs && (
                    <div className="settings-section glass-card">
                        <div className="settings-section__title">System Info</div>
                        {[
                            ['Platform', specs.platform],
                            ['CPU Model', specs.cpuModel],
                            ['CPU Cores', String(specs.cpuCores)],
                            ['Total Memory', specs.totalMem],
                            ['Free Memory', specs.freeMem],
                        ].map(([k, v]) => (
                            <div key={k} className="settings-info-row">
                                <span>{k}</span>
                                <span className="mono">{v}</span>
                            </div>
                        ))}
                        {specs.recommendedModels?.length > 0 && (
                            <div className="settings-info-row">
                                <span>Recommended Models</span>
                                <span className="mono">{specs.recommendedModels.join(', ')}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
