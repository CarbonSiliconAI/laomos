import React, { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../lib/api';
import type { OrgDept, OrgLink } from '../../lib/api';
import './Company.css';

const NODE_W = 140;
const NODE_H = 52;

export default function CompanyPage() {
    const [depts, setDepts] = useState<OrgDept[]>([]);
    const [links, setLinks] = useState<OrgLink[]>([]);
    const [savedDepts, setSavedDepts] = useState<string[]>([]);
    const [addDeptVal, setAddDeptVal] = useState('');
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [linkMode, setLinkMode] = useState(false);
    const [linkFrom, setLinkFrom] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameVal, setRenameVal] = useState('');
    const [editingLink, setEditingLink] = useState<{ from: string; to: string } | null>(null);
    const [linkLabelVal, setLinkLabelVal] = useState('');
    const canvasRef = useRef<HTMLDivElement>(null);

    const fetchData = useCallback(async () => {
        try {
            const data = await api.companyGet();
            setDepts(data.departments || []);
            setLinks(data.links || []);
            setSavedDepts(data.savedDepartments || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const act = async (body: any) => {
        await api.companyAction(body);
        await fetchData();
    };

    // Departments not yet on the graph
    const deptNamesOnGraph = new Set(depts.map(d => d.name));
    const availableToAdd = savedDepts.filter(n => !deptNamesOnGraph.has(n));

    const handleAddDept = () => {
        if (!addDeptVal) return;
        const cx = canvasRef.current ? canvasRef.current.scrollLeft + canvasRef.current.clientWidth / 2 - NODE_W / 2 : 300;
        const cy = canvasRef.current ? canvasRef.current.scrollTop + canvasRef.current.clientHeight / 2 - NODE_H / 2 : 200;
        act({ action: 'add-dept', name: addDeptVal, x: Math.round(cx), y: Math.round(cy) });
        setAddDeptVal('');
    };

    // Drag handlers
    const handleMouseDown = (e: React.MouseEvent, deptId: string) => {
        if (linkMode) {
            if (!linkFrom) {
                setLinkFrom(deptId);
            } else if (linkFrom !== deptId) {
                act({ action: 'add-link', from: linkFrom, to: deptId });
                setLinkFrom(null);
            }
            return;
        }
        if (renamingId) return;
        const dept = depts.find(d => d.id === deptId);
        if (!dept) return;
        setDragging(deptId);
        setDragOffset({ x: e.clientX - dept.x, y: e.clientY - dept.y });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;
        setDepts(prev => prev.map(d =>
            d.id === dragging ? { ...d, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } : d
        ));
    }, [dragging, dragOffset]);

    const handleMouseUp = useCallback(() => {
        if (dragging) {
            const dept = depts.find(d => d.id === dragging);
            if (dept) act({ action: 'move-dept', id: dragging, x: dept.x, y: dept.y });
            setDragging(null);
        }
    }, [dragging, depts]);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }, [handleMouseMove, handleMouseUp]);

    // SVG link lines
    const renderLinks = () => links.map((link, i) => {
        const fromD = depts.find(d => d.id === link.from);
        const toD = depts.find(d => d.id === link.to);
        if (!fromD || !toD) return null;
        const x1 = fromD.x + NODE_W / 2, y1 = fromD.y + NODE_H / 2;
        const x2 = toD.x + NODE_W / 2, y2 = toD.y + NODE_H / 2;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        return (
            <g key={`${link.from}-${link.to}-${i}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="org-link-line" />
                {/* arrow head */}
                <polygon
                    points={arrowHead(x1, y1, x2, y2)}
                    className="org-link-arrow"
                />
                {/* Label background & text */}
                {editingLink && editingLink.from === link.from && editingLink.to === link.to ? (
                    <foreignObject x={mx - 60} y={my - 14} width="120" height="28">
                        <input className="org-link-label-input" value={linkLabelVal}
                            onChange={e => setLinkLabelVal(e.target.value)}
                            onBlur={() => { act({ action: 'update-link-label', from: link.from, to: link.to, label: linkLabelVal }); setEditingLink(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') { act({ action: 'update-link-label', from: link.from, to: link.to, label: linkLabelVal }); setEditingLink(null); } }}
                            autoFocus
                        />
                    </foreignObject>
                ) : (
                    <g className="org-link-label-group" style={{ cursor: 'pointer' }}
                        onClick={() => { setEditingLink({ from: link.from, to: link.to }); setLinkLabelVal(link.label); }}>
                        <rect x={mx - 40} y={my - 10} width="80" height="20" rx="4" className="org-link-label-bg" />
                        <text x={mx} y={my + 4} textAnchor="middle" className="org-link-label-text">
                            {link.label || 'click to label'}
                        </text>
                    </g>
                )}
                {/* Delete link button */}
                <g className="org-link-delete" onClick={() => act({ action: 'remove-link', from: link.from, to: link.to })}
                    style={{ cursor: 'pointer' }}>
                    <circle cx={mx + 46} cy={my} r="8" className="org-link-delete-bg" />
                    <text x={mx + 46} y={my + 4} textAnchor="middle" className="org-link-delete-text">×</text>
                </g>
            </g>
        );
    });

    return (
        <div className="org-page">
            <header className="org-header">
                <div className="org-header__left">
                    <h2>🏗 Company Organization</h2>
                    <p>Visual organization graph — drag departments, link to connect</p>
                </div>
                <div className="org-header__actions">
                    <button className={`org-btn ${linkMode ? 'org-btn--active' : ''}`}
                        onClick={() => { setLinkMode(!linkMode); setLinkFrom(null); }}>
                        {linkMode ? '🔗 Linking...' : '🔗 Link Mode'}
                    </button>
                    <select className="org-dept-select" value={addDeptVal} onChange={e => setAddDeptVal(e.target.value)}>
                        <option value="">Select department...</option>
                        {availableToAdd.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button className="org-btn org-btn--primary" onClick={handleAddDept} disabled={!addDeptVal}>+ Add to Graph</button>
                </div>
            </header>

            {linkMode && (
                <div className="org-link-hint">
                    {linkFrom ? `Click a second department to complete the link` : `Click a department to start linking`}
                    <button className="org-link-hint__cancel" onClick={() => { setLinkMode(false); setLinkFrom(null); }}>Cancel</button>
                </div>
            )}

            <div className="org-canvas" ref={canvasRef}>
                <svg className="org-svg">
                    <defs>
                        <marker id="arrowMarker" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#4da6ff" />
                        </marker>
                    </defs>
                    {renderLinks()}
                </svg>

                {depts.map(dept => (
                    <div key={dept.id}
                        className={`org-node ${dragging === dept.id ? 'org-node--dragging' : ''} ${linkFrom === dept.id ? 'org-node--link-source' : ''} ${linkMode ? 'org-node--link-mode' : ''}`}
                        style={{ left: dept.x, top: dept.y, width: NODE_W, height: NODE_H }}
                        onMouseDown={e => handleMouseDown(e, dept.id)}
                    >
                        {renamingId === dept.id ? (
                            <input className="org-node__input" value={renameVal}
                                onChange={e => setRenameVal(e.target.value)}
                                onBlur={() => { act({ action: 'rename-dept', id: dept.id, name: renameVal }); setRenamingId(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') { act({ action: 'rename-dept', id: dept.id, name: renameVal }); setRenamingId(null); } }}
                                autoFocus onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                            />
                        ) : (
                            <span className="org-node__name"
                                onDoubleClick={e => { e.stopPropagation(); setRenamingId(dept.id); setRenameVal(dept.name); }}>
                                🏢 {dept.name}
                            </span>
                        )}
                        <button className="org-node__del" onMouseDown={e => e.stopPropagation()}
                            onClick={() => { if (confirm(`Delete "${dept.name}"?`)) act({ action: 'remove-dept', id: dept.id }); }}>×</button>
                    </div>
                ))}

                {depts.length === 0 && (
                    <div className="org-empty">
                        <div className="org-empty__icon">🏗</div>
                        <div>{savedDepts.length > 0 ? 'Select a saved department above to add it to the graph' : 'Create departments in the Departments app first'}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 10;
    const spread = 0.5;
    const tipX = (x1 + x2) / 2 + Math.cos(angle) * 20;
    const tipY = (y1 + y2) / 2 + Math.sin(angle) * 20;
    const lx = tipX - len * Math.cos(angle - spread);
    const ly = tipY - len * Math.sin(angle - spread);
    const rx = tipX - len * Math.cos(angle + spread);
    const ry = tipY - len * Math.sin(angle + spread);
    return `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`;
}
