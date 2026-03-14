import React, { useState, useMemo } from 'react';
import { api, AgencyAgent } from '../../lib/api';

interface Props {
    installedAgents: AgencyAgent[];
}

interface ScaffoldResult {
    created: Array<{ id: string; name: string; tasks: string[] }>;
    skipped: string[];
}

export default function DepartmentScaffold({ installedAgents }: Props) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ScaffoldResult | null>(null);

    const divisionCounts = useMemo(() => {
        const map = new Map<string, number>();
        installedAgents.forEach(a => map.set(a.division, (map.get(a.division) || 0) + 1));
        return map;
    }, [installedAgents]);

    const divisions = useMemo(() =>
        Array.from(divisionCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b)),
        [divisionCounts]
    );

    function handleOpen() {
        setResult(null);
        setSelected(new Set());
        setOpen(true);
    }

    function toggleDivision(d: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(d)) next.delete(d); else next.add(d);
            return next;
        });
    }

    function selectAll() {
        if (selected.size === divisions.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(divisions.map(([d]) => d)));
        }
    }

    async function handleScaffold() {
        if (selected.size === 0) return;
        setLoading(true);
        try {
            const res = await api.agencyScaffoldDepartments(Array.from(selected));
            setResult(res);
        } catch {
            setResult({ created: [], skipped: ['Request failed'] });
        } finally {
            setLoading(false);
        }
    }

    // Overlay styles
    const overlay: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
    const modal: React.CSSProperties = {
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)',
        borderRadius: 16, border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
    };
    const header: React.CSSProperties = { padding: '20px 24px 12px' };
    const body: React.CSSProperties = { padding: '0 24px', flex: 1, overflowY: 'auto' };
    const footer: React.CSSProperties = {
        padding: '16px 24px', borderTop: '1px solid var(--line)',
        display: 'flex', justifyContent: 'flex-end', gap: 10,
    };
    const row: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer',
    };
    const badge: React.CSSProperties = {
        fontSize: 10, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
        padding: '2px 7px', borderRadius: 8, marginLeft: 'auto', fontWeight: 600,
    };

    return (
        <>
            <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--fs-xs)', gap: 4, display: 'inline-flex', alignItems: 'center' }}
                onClick={handleOpen}
                disabled={installedAgents.length === 0}
                title={installedAgents.length === 0 ? 'Install agents first' : ''}
            >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                Generate Departments
            </button>

            {open && (
                <div style={overlay} onClick={() => !loading && setOpen(false)}>
                    <div style={modal} onClick={e => e.stopPropagation()}>
                        <div style={header}>
                            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text)' }}>
                                Generate Departments from Divisions
                            </div>
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginTop: 4 }}>
                                Select divisions to create matching Departments with installed Agents
                            </div>
                        </div>

                        <div style={body}>
                            {result ? (
                                /* ── Result view ── */
                                <div style={{ padding: '12px 0 16px' }}>
                                    {result.created.length > 0 && (
                                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', marginBottom: 10, fontSize: 'var(--fs-sm)', color: '#15803d' }}>
                                            <span style={{ fontWeight: 600 }}>{'\u2713'} Created: </span>
                                            {result.created.map(d => d.name).join(', ')}
                                        </div>
                                    )}
                                    {result.skipped.length > 0 && (
                                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', fontSize: 'var(--fs-sm)', color: '#92400e' }}>
                                            <span style={{ fontWeight: 600 }}>Skipped: </span>
                                            {result.skipped.join(', ')}
                                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                                                (no installed agents or department already exists)
                                            </span>
                                        </div>
                                    )}
                                    {result.created.length === 0 && result.skipped.length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 20 }}>
                                            No departments were created
                                        </div>
                                    )}
                                </div>
                            ) : divisions.length === 0 ? (
                                /* ── No installed agents ── */
                                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: '32px 0' }}>
                                    No installed agents. Install agents first from the store.
                                </div>
                            ) : (
                                /* ── Division picker ── */
                                <div style={{ paddingBottom: 8 }}>
                                    <div style={{ ...row, borderBottom: '2px solid var(--line)' }} onClick={selectAll}>
                                        <input
                                            type="checkbox"
                                            checked={selected.size === divisions.length}
                                            readOnly
                                            style={{ accentColor: '#d97706' }}
                                        />
                                        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)' }}>Select All</span>
                                        <span style={badge}>{divisions.length}</span>
                                    </div>
                                    {divisions.map(([div, count]) => (
                                        <div key={div} style={row} onClick={() => toggleDivision(div)}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(div)}
                                                readOnly
                                                style={{ accentColor: '#d97706' }}
                                            />
                                            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>{div}</span>
                                            <span style={badge}>{count} agent{count > 1 ? 's' : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={footer}>
                            {result ? (
                                <button className="btn btn-primary" onClick={() => setOpen(false)}>
                                    Close
                                </button>
                            ) : (
                                <>
                                    <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={loading}>
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ background: '#d97706', borderColor: '#d97706' }}
                                        disabled={selected.size === 0 || loading}
                                        onClick={handleScaffold}
                                    >
                                        {loading ? 'Generating...' : `Generate ${selected.size} Department${selected.size !== 1 ? 's' : ''}`}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
