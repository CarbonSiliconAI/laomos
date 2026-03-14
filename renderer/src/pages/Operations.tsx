import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SectionPage.css';

const WORKFLOW_TOOLS = [
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
        path: '/operations/news',
        title: 'News Hub',
        desc: 'AI-analyzed latest news and insights',
        color: 'rgba(56,189,248,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16A2 2 0 0 0 22 20V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                <path d="M18 14h-8" />
                <path d="M15 18h-5" />
                <path d="M10 6h8v4h-8V6Z" />
            </svg>
        ),
    },
    {
        path: '/operations/analyzer',
        title: 'Task Analyzer',
        desc: 'Goal-driven kernel testing',
        color: 'rgba(99,102,241,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
        ),
    },
    {
        path: '/operations/department',
        title: 'Departments',
        desc: 'Organize and batch-run task chains by department',
        color: 'rgba(16,185,129,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        path: '/operations/debug',
        title: 'System Debug',
        desc: 'Live telemetry and kernel trace logs',
        color: 'rgba(239,68,68,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
        ),
    },
];

const CREATIVE_ENTERTAINMENT = [
    {
        path: '/operations/telegram',
        title: 'Telegram',
        desc: 'Connect your Telegram Bot',
        color: 'rgba(56,189,248,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2L2 12.5l6.5 2.5L20 4.5l-9.5 9 1 7.5 4.5-5 5.5 4 2-18Z" />
            </svg>
        ),
    },
    {
        path: '/operations/whatsapp',
        title: 'WhatsApp',
        desc: 'Connect your personal WhatsApp',
        color: 'rgba(34,197,94,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
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
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
            </svg>
        ),
    },
    {
        path: '/operations/browser',
        title: 'Web Browser',
        desc: 'Search the internet directly',
        color: 'rgba(234,88,12,0.85)',
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
];

function CardList({ cards, navigate }: { cards: typeof WORKFLOW_TOOLS; navigate: (path: string) => void }) {
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

export default function OperationsPage() {
    const navigate = useNavigate();
    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Operations</h2>
                <p className="section-header__sub">Manage workflows, communications, and interactive tools</p>
            </div>

            <span className="section-group__label">Workflow Tools</span>
            <CardList cards={WORKFLOW_TOOLS} navigate={navigate} />

            <span className="section-group__label">Creative & Entertainment</span>
            <CardList cards={CREATIVE_ENTERTAINMENT} navigate={navigate} />
        </div>
    );
}
