import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SectionPage.css';

const CARDS = [
    {
        path: '/operations/flow',
        title: 'Flow Builder',
        desc: 'Chain tools and skills into AI pipelines',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M9 6h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9" />
                <line x1="6" y1="9" x2="6" y2="15" />
            </svg>
        ),
    },
    {
        path: '/operations/mail',
        title: 'Mail',
        desc: 'AI-powered email inbox and drafting',
        color: 'rgba(245,158,11,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
            </svg>
        ),
    },
    {
        path: '/operations/game',
        title: 'Adventure',
        desc: 'AI text adventure game',
        color: 'rgba(168,85,247,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4M15 11h.01M18 11h.01" />
            </svg>
        ),
    },
    {
        path: '/operations/draw',
        title: 'AI Draw',
        desc: 'Draw on canvas and generate AI images',
        color: 'rgba(236,72,153,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            </svg>
        ),
    },
    {
        path: '/operations/video',
        title: 'AI Video',
        desc: 'Generate videos from text prompts',
        color: 'rgba(14,165,233,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
            </svg>
        ),
    },
];

export default function OperationsPage() {
    const navigate = useNavigate();
    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Operations</h2>
                <p className="section-header__sub">Manage workflows, communications, and interactive tools</p>
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
