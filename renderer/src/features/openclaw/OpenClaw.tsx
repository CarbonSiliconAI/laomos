import React, { useState, useEffect } from 'react';
import { api, ClawApp, SkillDef } from '../../lib/api';
import './OpenClaw.css';

type Tab = 'local' | 'hub';

export default function OpenClaw() {
    const [tab, setTab] = useState<Tab>('local');

    // Local Skills
    const [localSkills, setLocalSkills] = useState<SkillDef[]>([]);
    const [localLoading, setLocalLoading] = useState(false);

    // ClawHub
    const [apps, setApps] = useState<ClawApp[]>([]);
    const [query, setQuery] = useState('');
    const [hubLoading, setHubLoading] = useState(false);
    const [installingSlug, setInstallingSlug] = useState<string | null>(null);

    // Inspector
    const [selectedSkill, setSelectedSkill] = useState<SkillDef | null>(null);
    const [inspectorInput, setInspectorInput] = useState('');
    const [inspectorOutput, setInspectorOutput] = useState('');
    const [executing, setExecuting] = useState(false);
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const [selectedProvider, setSelectedProvider] = useState('cloud');

    function fetchLocalSkills() {
        setLocalLoading(true);
        api.skills()
            .then(r => setLocalSkills(r.skills ?? []))
            .catch(() => setLocalSkills([]))
            .finally(() => setLocalLoading(false));
    }

    function searchHub(q = query) {
        setHubLoading(true);
        api.clawSearch(q)
            .then(r => setApps(r.apps ?? []))
            .catch(() => setApps([]))
            .finally(() => setHubLoading(false));
    }

    async function installSkill(e: React.MouseEvent, slug: string, version: string) {
        e.stopPropagation();
        setInstallingSlug(slug);
        try {
            const res = await api.clawInstall(slug, version);
            if (res.success) {
                // Update local list of apps to show it's installed (if possible) or just switch to Local Skills tab.
                fetchLocalSkills();
                setTab('local');
            } else {
                alert(`Install failed: ${res.message}`);
            }
        } catch (err: any) {
            alert(`Install failed: ${err.message}`);
        } finally {
            setInstallingSlug(null);
        }
    }

    useEffect(() => { fetchLocalSkills(); }, []);
    useEffect(() => { if (tab === 'hub') searchHub(''); }, [tab]);

    function openInspector(skill: SkillDef) {
        setSelectedSkill(skill);
        setInspectorInput('');
        setInspectorOutput('');
    }

    function closeInspector() {
        setSelectedSkill(null);
        setInspectorInput('');
        setInspectorOutput('');
    }

    async function runSkill() {
        if (!selectedSkill || !inspectorInput.trim()) return;

        // Generate a random ID for this execution so we can target it for cancellation
        const execId = crypto.randomUUID();
        setCurrentExecutionId(execId);

        setExecuting(true);
        setInspectorOutput('Contacting Kernel ModelRouter...');
        try {
            const res = await api.skillsExecute({
                executionId: execId,
                skillContext: (selectedSkill as any).instructions ?? (selectedSkill as any).skill_markdown ?? '',
                userInput: inspectorInput.trim(),
                preferredProvider: selectedProvider,
            });
            setInspectorOutput(res.result ?? JSON.stringify(res, null, 2));
        } catch (e: any) {
            setInspectorOutput(`Error: ${e.message}`);
        } finally {
            setExecuting(false);
            setCurrentExecutionId(null);
        }
    }

    async function stopSkill() {
        if (!currentExecutionId) return;
        try {
            await api.skillsCancel(currentExecutionId);
            setInspectorOutput(prev => prev + '\n\n[Skill Execution Cancelled by User]');
            setExecuting(false);
            setCurrentExecutionId(null);
        } catch (e) {
            console.error('Failed to cancel skill', e);
        }
    }

    return (
        <div className="claw-page">
            <div className="claw-header">
                <div>
                    <h1 className="claw-header__title">OpenClaw Skills</h1>
                    <p className="claw-header__sub">Manage local agent skills and discover community integrations</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="claw-tabs">
                <button className={`claw-tab${tab === 'local' ? ' claw-tab--active' : ''}`} onClick={() => setTab('local')}>
                    Local Skills
                </button>
                <button className={`claw-tab${tab === 'hub' ? ' claw-tab--active' : ''}`} onClick={() => setTab('hub')}>
                    ClawHub
                </button>
                {tab === 'local' && (
                    <button className="btn btn-ghost claw-refresh-btn" onClick={fetchLocalSkills} disabled={localLoading}>
                        Refresh
                    </button>
                )}
            </div>

            {/* Hub search bar */}
            {tab === 'hub' && (
                <div className="claw-search-bar">
                    <input className="os-input" placeholder="Search skills and apps on ClawHub..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchHub()} />
                    <button className="btn btn-primary" onClick={() => searchHub()}>Search</button>
                </div>
            )}

            <div className="claw-body-wrap">
                <div className={`claw-body${selectedSkill ? ' claw-body--with-inspector' : ''}`}>
                    {/* Local Skills Tab */}
                    {tab === 'local' && (
                        localLoading ? (
                            <div className="empty-state"><div className="spinner" /></div>
                        ) : localSkills.length === 0 ? (
                            <div className="empty-state">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                <span>No local skills found in storage/skills</span>
                            </div>
                        ) : (
                            <div className="claw-grid">
                                {localSkills.map(skill => (
                                    <div key={skill.id} className={`claw-card glass-card${selectedSkill?.id === skill.id ? ' claw-card--selected' : ''}`}
                                        onClick={() => openInspector(skill)}>
                                        <div className="claw-card__header">
                                            <div className="claw-card__icon">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                            </div>
                                            <div>
                                                <div className="claw-card__name">{skill.name}</div>
                                                {skill.version && <div className="claw-card__version">v{skill.version}</div>}
                                            </div>
                                        </div>
                                        <p className="claw-card__desc">{skill.description}</p>
                                        {skill.tools && skill.tools.length > 0 && (
                                            <div className="claw-card__tags">
                                                {skill.tools.map(t => <span key={t} className="badge badge-accent">{t}</span>)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* ClawHub Tab */}
                    {tab === 'hub' && (
                        hubLoading ? (
                            <div className="empty-state"><div className="spinner" /></div>
                        ) : apps.length === 0 ? (
                            <div className="empty-state">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                <span>No apps found. Try a different search.</span>
                            </div>
                        ) : (
                            <div className="claw-grid">
                                {apps.map(app => (
                                    <div key={app.id} className="claw-card glass-card"
                                        onClick={() => openInspector({ id: app.id, name: app.name, description: app.description, version: app.version, tools: app.tags })}>
                                        <div className="claw-card__header">
                                            <div className="claw-card__icon">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                            </div>
                                            <div>
                                                <div className="claw-card__name">{app.name}</div>
                                                <div className="claw-card__version">v{app.version}</div>
                                            </div>
                                            <button className={`btn ${app.installed ? 'btn-ghost' : 'btn-primary'} claw-card__install`}
                                                disabled={installingSlug === (app.slug || app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) || app.installed}
                                                onClick={e => {
                                                    if (!app.installed) {
                                                        const validSlug = app.slug || app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                                                        installSkill(e, validSlug, app.version || '1.0.0');
                                                    }
                                                }}>
                                                {app.installed ? 'Installed' : installingSlug === (app.slug || app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) ? 'Installing...' : 'Install'}
                                            </button>
                                        </div>
                                        <p className="claw-card__desc">{app.description}</p>

                                        {/* Stats row */}
                                        {app.stats && (
                                            <div style={{
                                                display: 'flex', gap: '12px', flexWrap: 'wrap',
                                                fontSize: 'var(--fs-xs)', color: 'var(--muted)',
                                                margin: '6px 0 4px', alignItems: 'center',
                                            }}>
                                                <span title="Downloads" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    ⬇ {app.stats.downloads >= 1000 ? `${(app.stats.downloads / 1000).toFixed(1)}k` : app.stats.downloads}
                                                </span>
                                                <span title="Installs" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    📦 {app.stats.installs.toLocaleString()} installs
                                                </span>
                                                <span title="Stars" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    ⭐ {app.stats.stars}
                                                </span>
                                            </div>
                                        )}

                                        {/* Verification badges */}
                                        <div style={{
                                            display: 'flex', gap: '6px', flexWrap: 'wrap',
                                            margin: '4px 0',
                                        }}>
                                            {app.openclawVerified && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                                                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                                                    border: '1px solid rgba(16,185,129,0.25)',
                                                }}>✓ OpenClaw Verified</span>
                                            )}
                                            {app.virusTotalClean && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                                                    background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                                                    border: '1px solid rgba(59,130,246,0.25)',
                                                }}>🛡 VirusTotal Clean</span>
                                            )}
                                            {!app.openclawVerified && !app.virusTotalClean && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                                                    background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                                    border: '1px solid rgba(245,158,11,0.25)',
                                                }}>⚠ Unreviewed</span>
                                            )}
                                        </div>

                                        <div className="claw-card__tags">
                                            {(app.tags ?? []).map(t => <span key={t} className="badge badge-accent">{t}</span>)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* Skill Inspector Panel */}
                {selectedSkill && (
                    <div className="claw-inspector glass-card">
                        <div className="claw-inspector__header">
                            <span className="claw-inspector__title">{selectedSkill.name}</span>
                            <button className="btn btn-ghost claw-inspector__close" onClick={closeInspector}>&times;</button>
                        </div>
                        <div className="divider" />
                        <div className="claw-inspector__body">
                            <label className="claw-inspector__label">Description</label>
                            <p className="claw-inspector__desc">{selectedSkill.description}</p>

                            {selectedSkill.tools && selectedSkill.tools.length > 0 && (
                                <>
                                    <label className="claw-inspector__label">Tools</label>
                                    <div className="claw-card__tags" style={{ marginBottom: 8 }}>
                                        {selectedSkill.tools.map(t => <span key={t} className="badge badge-accent">{t}</span>)}
                                    </div>
                                </>
                            )}

                            <label className="claw-inspector__label">Input</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Model:</label>
                                <select
                                    className="os-input"
                                    value={selectedProvider}
                                    onChange={e => setSelectedProvider(e.target.value)}
                                    style={{
                                        flex: 1, padding: '4px 8px', fontSize: 'var(--fs-xs)',
                                        background: 'var(--glass)', border: '1px solid var(--line)',
                                        borderRadius: '6px', color: 'var(--fg)',
                                    }}
                                >
                                    <option value="cloud">☁️ Cloud (Anthropic → OpenAI → Google)</option>
                                    <option value="cloud-preferred">⚡ Cloud Preferred (fallback to local)</option>
                                    <option value="">🔄 Auto (level-based routing)</option>
                                    <option value="local">💻 Local (Ollama)</option>
                                </select>
                            </div>
                            <textarea
                                className="os-input claw-inspector__input"
                                placeholder="Enter input to run this skill..."
                                value={inspectorInput}
                                onChange={e => setInspectorInput(e.target.value)}
                                rows={3}
                            />

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn btn-primary claw-inspector__run"
                                    style={{ flex: 1 }}
                                    onClick={runSkill}
                                    disabled={executing || !inspectorInput.trim()}
                                >
                                    {executing ? <><div className="spinner" /> Executing...</> : 'Run Skill'}
                                </button>
                                {executing && (
                                    <button
                                        className="btn"
                                        style={{ background: '#ef4444', color: 'white', border: '1px solid #dc2626' }}
                                        onClick={stopSkill}
                                    >
                                        Stop
                                    </button>
                                )}
                            </div>

                            {inspectorOutput && (
                                <>
                                    <label className="claw-inspector__label">Output</label>
                                    <pre className="claw-inspector__output">{inspectorOutput}</pre>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
