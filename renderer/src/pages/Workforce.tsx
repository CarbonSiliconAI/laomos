import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SectionPage.css';

const CARDS = [
    {
        path: '/workforce/chat',
        title: 'AI Chat',
        desc: 'Converse with local and cloud AI models',
        color: 'rgba(16,185,129,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        path: '/workforce/openclaw',
        title: 'App Store',
        desc: 'Browse and install AI skills from ClawHub',
        color: 'rgba(59,130,246,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
        ),
    },
    {
        path: '/workforce/models',
        title: 'Model Manager',
        desc: 'Manage and pull Ollama models',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
        ),
    },
];

export default function WorkforcePage() {
    const navigate = useNavigate();
    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Workforce</h2>
                <p className="section-header__sub">Deploy AI agents, manage models, and expand capabilities</p>
            </div>
            <div className="section-cards">
                {CARDS.map((c) => (
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
        </div>
    );
}
