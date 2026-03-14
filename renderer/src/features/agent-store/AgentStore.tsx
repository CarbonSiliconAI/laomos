import React, { useState, useEffect, useMemo } from 'react';
import { api, AgencyAgent, AgentEvolutionScore } from '../../lib/api';
import DepartmentScaffold from './DepartmentScaffold';
import './AgentStore.css';

// ── SVG icon components (lucide style, 24x24 viewBox) ────────────────────────

const S = 'currentColor';
const P: React.SVGAttributes<SVGSVGElement> = { fill: 'none', stroke: S, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const icons: Record<string, (size?: number) => React.ReactNode> = {
    engineering: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
    ),
    design: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
    ),
    marketing: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M21 15V6m-4 9V9m-4 6v-3m-4 3v-1" /><line x1="3" y1="21" x2="21" y2="21" /></svg>
    ),
    sales: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
    ),
    testing: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
    ),
    product: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
    ),
    specialized: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    ),
    support: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
    ),
    strategy: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="10" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" /></svg>
    ),
    'project-management': (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>
    ),
    'paid-media': (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
    ),
    'game-development': (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h4M8 10v4M15 11h.01M18 11h.01" /></svg>
    ),
    'spatial-computing': (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    ),
    _default: (sz = 20) => (
        <svg width={sz} height={sz} viewBox="0 0 24 24" {...P}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    ),
};

function divisionIcon(division: string, size?: number): React.ReactNode {
    return (icons[division] ?? icons._default)(size);
}

function divisionColor(division: string): string {
    const colors: Record<string, string> = {
        engineering: 'rgba(99,102,241,0.14)',
        design: 'rgba(236,72,153,0.14)',
        marketing: 'rgba(245,158,11,0.14)',
        sales: 'rgba(16,185,129,0.14)',
        testing: 'rgba(139,92,246,0.14)',
        product: 'rgba(59,130,246,0.14)',
        specialized: 'rgba(239,68,68,0.14)',
        support: 'rgba(20,184,166,0.14)',
        strategy: 'rgba(107,114,128,0.14)',
        'project-management': 'rgba(245,158,11,0.14)',
        'paid-media': 'rgba(236,72,153,0.14)',
        'game-development': 'rgba(139,92,246,0.14)',
        'spatial-computing': 'rgba(59,130,246,0.14)',
    };
    return colors[division] ?? 'rgba(99,102,241,0.14)';
}

function divisionStroke(division: string): string {
    const strokes: Record<string, string> = {
        engineering: '#6366f1',
        design: '#ec4899',
        marketing: '#f59e0b',
        sales: '#10b981',
        testing: '#8b5cf6',
        product: '#3b82f6',
        specialized: '#ef4444',
        support: '#14b8a6',
        strategy: '#6b7280',
        'project-management': '#f59e0b',
        'paid-media': '#ec4899',
        'game-development': '#8b5cf6',
        'spatial-computing': '#3b82f6',
    };
    return strokes[division] ?? '#6366f1';
}

export default function AgentStore() {
    const [agents, setAgents] = useState<AgencyAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [activeDivision, setActiveDivision] = useState('all');
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [evoScores, setEvoScores] = useState<Record<string, AgentEvolutionScore>>({});

    function fetchAgents() {
        setLoading(true);
        setError(null);
        api.agencyAgents()
            .then(r => {
                const list = r.agents ?? [];
                setAgents(list);
                // Fetch evolution scores for installed agents
                const installed = list.filter(a => a.isInstalled);
                if (installed.length > 0) {
                    Promise.all(installed.map(a =>
                        api.agencyEvolutionScore(a.id)
                            .then(score => ({ id: a.id, score }))
                            .catch(() => null)
                    )).then(results => {
                        const scores: Record<string, AgentEvolutionScore> = {};
                        for (const r of results) {
                            if (r && r.score.totalRuns > 0) scores[r.id] = r.score;
                        }
                        setEvoScores(scores);
                    });
                }
            })
            .catch(e => setError(e.message ?? 'Failed to fetch agents'))
            .finally(() => setLoading(false));
    }

    useEffect(() => { fetchAgents(); }, []);

    const divisions = useMemo(() => {
        const set = new Set<string>();
        agents.forEach(a => set.add(a.division));
        return Array.from(set).sort();
    }, [agents]);

    const filtered = useMemo(() => {
        let list = agents;
        if (activeDivision !== 'all') {
            list = list.filter(a => a.division === activeDivision);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(a =>
                a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
            );
        }
        return list;
    }, [agents, activeDivision, search]);

    const installedCount = useMemo(() => agents.filter(a => a.isInstalled).length, [agents]);

    async function handleToggleInstall(agent: AgencyAgent) {
        setInstalling(agent.id);
        try {
            if (agent.isInstalled) {
                await api.agencyUninstall(agent.id);
            } else {
                await api.agencyInstall(agent.id);
                // Auto-extract skills on install
                api.agencyExtractSkills(agent.id).catch(console.error);
            }
            setAgents(prev => prev.map(a =>
                a.id === agent.id ? { ...a, isInstalled: !a.isInstalled, installedAt: a.isInstalled ? undefined : Date.now() } : a
            ));
        } catch {
            // silent
        } finally {
            setInstalling(null);
        }
    }

    return (
        <div className="agent-store">
            {/* Header */}
            <div className="agent-store__header">
                <div className="agent-store__header-left">
                    <h1 className="agent-store__title">Agent Store</h1>
                    <p className="agent-store__sub">Browse and install agency-agents specialists</p>
                </div>
                <div className="agent-store__header-right">
                    <DepartmentScaffold installedAgents={agents.filter(a => a.isInstalled)} />
                    <span className="agent-store__count">
                        Installed {installedCount} / {agents.length}
                    </span>
                    <input
                        className="os-input agent-store__search"
                        placeholder="Search agents..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="agent-store__tabs">
                <button
                    className={`agent-store__tab${activeDivision === 'all' ? ' agent-store__tab--active' : ''}`}
                    onClick={() => setActiveDivision('all')}
                >
                    All
                </button>
                {divisions.map(d => (
                    <button
                        key={d}
                        className={`agent-store__tab${activeDivision === d ? ' agent-store__tab--active' : ''}`}
                        onClick={() => setActiveDivision(d)}
                    >
                        <span className="agent-store__tab-icon" style={{ color: divisionStroke(d) }}>{divisionIcon(d, 13)}</span>
                        {d}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="agent-store__body">
                {loading ? (
                    <div className="agent-store__grid">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="agent-skeleton glass-card">
                                <div className="agent-skeleton__bar" style={{ width: 40, height: 40, borderRadius: 12 }} />
                                <div className="agent-skeleton__bar" style={{ width: '60%', height: 14 }} />
                                <div className="agent-skeleton__bar" style={{ width: '90%', height: 10 }} />
                                <div className="agent-skeleton__bar" style={{ width: '80%', height: 10 }} />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="agent-store__error">
                        <span>{error}</span>
                        <button className="btn btn-primary" onClick={fetchAgents}>Retry</button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="agent-store__empty">
                        <span>No matching agents found</span>
                    </div>
                ) : (
                    <div className="agent-store__grid">
                        {filtered.map(agent => (
                            <div
                                key={agent.id}
                                className={`agent-card glass-card${agent.isInstalled ? ' agent-card--installed' : ''}`}
                            >
                                <div className="agent-card__top">
                                    <div
                                        className="agent-card__icon"
                                        style={{ background: divisionColor(agent.division), color: divisionStroke(agent.division) }}
                                    >
                                        {divisionIcon(agent.division)}
                                    </div>
                                    <div className="agent-card__meta">
                                        <div className="agent-card__name">{agent.name}</div>
                                        <div className="agent-card__division">
                                            <span style={{ color: divisionStroke(agent.division), display: 'inline-flex', verticalAlign: 'middle', marginRight: 3 }}>{divisionIcon(agent.division, 11)}</span>
                                            {agent.division}
                                        </div>
                                    </div>
                                </div>
                                <div className="agent-card__desc">{agent.description}</div>
                                {agent.isInstalled && evoScores[agent.id] && (() => {
                                    const score = evoScores[agent.id];
                                    const trendArrow = score.trend === 'improving' ? '\u2191' : score.trend === 'degrading' ? '\u2193' : '\u2192';
                                    const trendColor = score.trend === 'improving' ? '#059669' : score.trend === 'degrading' ? '#dc2626' : '#6b7280';
                                    const pct = Math.round(score.successRate * 100);
                                    return (
                                        <div className="agent-card__evo">
                                            <span className="agent-card__evo-runs">{score.totalRuns} runs</span>
                                            <div className="agent-card__evo-bar-track">
                                                <div className="agent-card__evo-bar-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="agent-card__evo-pct">{pct}%</span>
                                            <span className="agent-card__evo-trend" style={{ color: trendColor }} title={score.trend}>
                                                {trendArrow}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <div className="agent-card__footer">
                                    <button
                                        className={`agent-card__btn ${agent.isInstalled ? 'agent-card__btn--installed' : 'agent-card__btn--install'}`}
                                        disabled={installing === agent.id}
                                        onClick={() => handleToggleInstall(agent)}
                                    >
                                        {installing === agent.id
                                            ? '...'
                                            : agent.isInstalled
                                                ? 'Installed \u2713'
                                                : 'Install'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
