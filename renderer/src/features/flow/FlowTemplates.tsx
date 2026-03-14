import React, { useState, useEffect } from 'react';
import { api, FlowTemplate, FlowTemplateNode, FlowTemplateEdge } from '../../lib/api';

interface Props {
    onApply: (nodes: FlowTemplateNode[], edges: FlowTemplateEdge[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
    engineering: 'Engineering',
    marketing: 'Marketing',
    product: 'Product',
    mixed: 'Mixed',
};

const CATEGORY_COLORS: Record<string, string> = {
    engineering: '#6366f1',
    marketing: '#f59e0b',
    product: '#3b82f6',
    mixed: '#8b5cf6',
};

// Lucide-style SVG icons
const IconLayers = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
);
const IconUsers = (props: { size?: number }) => (
    <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const IconArrowRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
);
const IconX = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

export default function FlowTemplates({ onApply }: Props) {
    const [open, setOpen] = useState(false);
    const [templates, setTemplates] = useState<FlowTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        console.log('[FlowTemplates] fetch starting…');
        setLoading(true);
        api.agencyFlowTemplates()
            .then(r => {
                console.log('[FlowTemplates] response:', r);
                setTemplates(r.templates ?? []);
            })
            .catch(err => {
                console.error('[FlowTemplates] error:', err);
                setTemplates([]);
            })
            .finally(() => setLoading(false));
    }, [open]);

    async function handleApply(t: FlowTemplate) {
        setApplying(t.id);
        setError(null);
        try {
            const res = await api.agencyApplyTemplate(t.id);
            if (res.flow) {
                onApply(res.flow.nodes, res.flow.edges);
                setOpen(false);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to apply template');
        } finally {
            setApplying(null);
        }
    }

    // Group by category
    const grouped = templates.reduce<Record<string, FlowTemplate[]>>((acc, t) => {
        (acc[t.category] = acc[t.category] || []).push(t);
        return acc;
    }, {});

    // Styles
    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.25)',
    };
    const drawer: React.CSSProperties = {
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 8001,
        width: 420, maxWidth: '90vw',
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)',
        borderLeft: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
    };
    const drawerHeader: React.CSSProperties = {
        padding: '20px 24px 14px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    };
    const drawerBody: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px 24px' };
    const card: React.CSSProperties = {
        padding: 16, borderRadius: 12, marginBottom: 12,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
    };
    const catBadge = (cat: string): React.CSSProperties => ({
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 600,
        padding: '2px 8px', borderRadius: 8,
        background: `${CATEGORY_COLORS[cat] ?? '#6366f1'}18`,
        color: CATEGORY_COLORS[cat] ?? '#6366f1',
        marginBottom: 8,
    });

    return (
        <>
            <button className="btn btn-ghost" style={{ fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={() => setOpen(true)}>
                <IconLayers /> Templates
            </button>

            {open && <div style={overlay} onClick={() => setOpen(false)} />}
            <div style={drawer}>
                <div style={drawerHeader}>
                    <div>
                        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text)' }}>
                            Agency Agent Templates
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginTop: 3 }}>
                            Multi-agent collaboration scenarios
                        </div>
                    </div>
                    <button onClick={() => setOpen(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                        <IconX />
                    </button>
                </div>

                <div style={drawerBody}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32, fontSize: 'var(--fs-sm)' }}>
                            <div className="spinner" style={{ margin: '0 auto 10px' }} /> Loading templates...
                        </div>
                    ) : Object.entries(grouped).map(([cat, tpls]) => (
                        <div key={cat} style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                                {CATEGORY_LABELS[cat] ?? cat}
                            </div>
                            {tpls.map(t => (
                                <div key={t.id} style={card}>
                                    <div style={catBadge(t.category)}>
                                        <IconUsers size={10} /> {t.agentCount} agents
                                    </div>
                                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                        {t.name}
                                    </div>
                                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', lineHeight: 1.45, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {t.description}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted-2)', marginBottom: 10, lineHeight: 1.5 }}>
                                        {t.nodes.map((n, i) => (
                                            <span key={n.id}>
                                                {i > 0 && <span style={{ margin: '0 3px', opacity: 0.5 }}><IconArrowRight /></span>}
                                                {n.label}
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ padding: '5px 14px', fontSize: 'var(--fs-xs)', fontWeight: 600, background: '#d97706', borderColor: '#d97706' }}
                                            disabled={applying === t.id}
                                            onClick={() => handleApply(t)}
                                        >
                                            {applying === t.id ? 'Applying...' : 'Use Template'}
                                        </button>
                                        {error && applying === null && (
                                            <span style={{ fontSize: 'var(--fs-2xs)', color: '#ef4444' }}>{error}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
