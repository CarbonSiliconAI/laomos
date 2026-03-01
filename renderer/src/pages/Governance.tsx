import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SectionPage.css';

const OBSERVABILITY = [
    {
        path: '/governance/monitor',
        title: 'Activity Monitor',
        desc: 'Real-time telemetry and usage metrics',
        color: 'rgba(239,68,68,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        path: '/governance/history',
        title: 'Run History',
        desc: 'Browse and compare AI execution runs',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
        ),
    },
    {
        path: '/governance/history?tab=evolution',
        title: 'Evolution Log',
        desc: 'Audit trail of self-healing evolution events',
        color: 'rgba(139,92,246,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 15c6.667-6 13.333 0 20-6" />
                <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
                <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
                <path d="M17 6l-2.5 2.5" />
                <path d="M14 8l-1.5 1.5" />
                <path d="M7 18l2.5-2.5" />
            </svg>
        ),
    },
];

const CONFIGURATION = [
    {
        path: '/governance/api-keys',
        title: 'API Keys',
        desc: 'Manage provider credentials',
        color: 'rgba(245,158,11,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
        ),
    },
    {
        path: '/governance/settings',
        title: 'Settings',
        desc: 'System configuration and preferences',
        color: 'rgba(107,114,128,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
        ),
    },
];

function CardList({ cards, navigate }: { cards: typeof OBSERVABILITY; navigate: (path: string) => void }) {
    return (
        <div className="section-cards">
            {cards.map((c) => (
                <button key={c.path} className="section-card glass-card" onClick={() => navigate(c.path)}>
                    <div className="section-card__icon" style={{ background: c.color }}>{c.icon}</div>
                    <div className="section-card__body">
                        <div className="section-card__title">{c.title}</div>
                        <div className="section-card__desc">{c.desc}</div>
                    </div>
                    <svg className="section-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
            ))}
        </div>
    );
}

export default function GovernancePage() {
    const navigate = useNavigate();
    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Governance</h2>
                <p className="section-header__sub">Monitor AI activity, manage keys, and configure the system</p>
            </div>

            <span className="section-group__label">Observability</span>
            <CardList cards={OBSERVABILITY} navigate={navigate} />

            <span className="section-group__label">Configuration</span>
            <CardList cards={CONFIGURATION} navigate={navigate} />
        </div>
    );
}
