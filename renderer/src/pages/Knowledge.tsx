import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SectionPage.css';

const CARDS = [
    {
        path: '/knowledge/files',
        title: 'Files',
        desc: 'Browse, read, and create documents',
        color: 'rgba(59,130,246,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        path: '/knowledge/rag',
        title: 'Knowledge Base',
        desc: 'Import documents and ask questions against your knowledge base',
        color: 'rgba(16,185,129,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="11" y1="8" x2="11" y2="14" />
            </svg>
        ),
    },
    {
        path: '/knowledge/search',
        title: 'Smart Search',
        desc: 'AI-powered search across local knowledge and web',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
    },
    {
        path: '/knowledge/graph',
        title: 'Knowledge Graph',
        desc: 'Explore and visualize relationships between concepts and entities',
        color: 'rgba(139,92,246,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
            </svg>
        ),
    },
    {
        path: '/knowledge/agency',
        title: 'Agency Knowledge',
        desc: 'Skills and experience extracted from installed agency agents',
        color: 'rgba(217,119,6,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
        ),
    },
];

export default function KnowledgePage() {
    const navigate = useNavigate();
    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Knowledge</h2>
                <p className="section-header__sub">Manage your documents and unlock semantic search</p>
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
