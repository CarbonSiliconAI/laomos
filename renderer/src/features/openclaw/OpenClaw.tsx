import React, { useState, useEffect } from 'react';
import { api, ClawApp } from '../../lib/api';
import './OpenClaw.css';

export default function OpenClaw() {
    const [apps, setApps] = useState<ClawApp[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);

    function search(q = query) {
        setLoading(true);
        api.clawSearch(q).then(r => setApps(r.apps ?? [])).catch(() => setApps([])).finally(() => setLoading(false));
    }

    useEffect(() => { search(''); }, []);

    return (
        <div className="claw-page">
            <div className="claw-header">
                <div><h1 className="claw-header__title">App Store</h1><p className="claw-header__sub">Browse and install AI skills from ClawHub</p></div>
            </div>
            <div className="claw-search-bar">
                <input className="os-input" placeholder="Search skills and apps…" value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                />
                <button className="btn btn-primary" onClick={() => search()}>Search</button>
            </div>
            <div className="claw-body">
                {loading ? (
                    <div className="empty-state"><div className="spinner"/></div>
                ) : apps.length === 0 ? (
                    <div className="empty-state">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        <span>No apps found. Try a different search.</span>
                    </div>
                ) : (
                    <div className="claw-grid">
                        {apps.map(app => (
                            <div key={app.id} className="claw-card glass-card">
                                <div className="claw-card__header">
                                    <div className="claw-card__icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                                    </div>
                                    <div>
                                        <div className="claw-card__name">{app.name}</div>
                                        <div className="claw-card__version">v{app.version}</div>
                                    </div>
                                    <button className={`btn ${app.installed ? 'btn-ghost' : 'btn-primary'} claw-card__install`}
                                        onClick={() => app.installed ? null : alert(`Install ${app.name} — coming soon`)}>
                                        {app.installed ? 'Installed' : 'Install'}
                                    </button>
                                </div>
                                <p className="claw-card__desc">{app.description}</p>
                                <div className="claw-card__tags">
                                    {(app.tags ?? []).map(t => <span key={t} className="badge badge-accent">{t}</span>)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
