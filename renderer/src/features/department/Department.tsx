import React, { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Department, DeptTask } from '../../lib/api';
import './Department.css';

// ── Inline SVG icons (lucide style) ──────────────────────────────────────────
const IconBuilding = (props: { size?: number }) => (
    <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>
);
const IconLink = (props: { size?: number }) => (
    <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
);
const IconPlay = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
);
const IconSquare = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
);
const IconClipboard = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
);
const IconRefresh = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
);
const IconLoader = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>
);
const IconCheck = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const IconX = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

function statusIcon(s: string) {
    switch (s) {
        case 'running': return <IconLoader />;
        case 'done': return <IconCheck />;
        case 'failed': return <IconX />;
        case 'stopped': return <IconSquare />;
        default: return null;
    }
}

export default function DepartmentPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [activeDeptId, setActiveDeptId] = useState<string | null>(null);
    const [availableChains, setAvailableChains] = useState<string[]>([]);
    const [deptTaskSelected, setDeptTaskSelected] = useState<Set<string>>(new Set());
    const [deptTaskStatus, setDeptTaskStatus] = useState<Record<string, 'pending' | 'running' | 'done' | 'failed' | 'stopped'>>({});
    const [deptRunning, setDeptRunning] = useState(false);
    const [renamingDept, setRenamingDept] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [addChainValue, setAddChainValue] = useState('');
    const deptStopRefs = useRef<Record<string, boolean>>({});
    const [reviewingTask, setReviewingTask] = useState<string | null>(null);
    const [reviewResults, setReviewResults] = useState<Record<string, { review: string; improveResult?: { count: number; improved: string[] }; timestamp: string }>>({});
    const [agentResults, setAgentResults] = useState<Record<string, { agentName: string; output: string; status: 'success' | 'failed'; durationMs: number; error?: string; timestamp: number }>>({});

    const normalizeTasks = (tasks: any[]): DeptTask[] =>
        (tasks || []).map((t: any) => {
            if (typeof t === 'string') {
                const isAgent = t.includes('/');
                const name = isAgent
                    ? t.split('/').pop()!.replace(/^[a-z]+-/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    : t;
                return { id: t, type: isAgent ? 'agent' as const : 'chain' as const, name };
            }
            return t as DeptTask;
        });

    const fetchDepartments = useCallback(async () => {
        try {
            const data = await api.departmentsGet();
            const depts = (data.departments || []).map((d: any) => ({
                ...d,
                tasks: normalizeTasks(d.tasks),
            }));
            setDepartments(depts);
            setActiveDeptId(data.activeDept);
            setAvailableChains(data.availableChains || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

    const activeDept = departments.find(d => d.id === activeDeptId) || null;

    const deptAction = async (body: { action: string; id?: string; name?: string; task?: string }) => {
        await api.departmentsAction(body);
        await fetchDepartments();
    };

    const handleRunSelected = async () => {
        if (!activeDept || deptRunning) return;
        const tasksToRun = activeDept.tasks.filter(t => deptTaskSelected.has(t.id));
        if (tasksToRun.length === 0) return;
        setDeptRunning(true);
        deptStopRefs.current = {};

        const initStatus: Record<string, 'pending'> = {};
        tasksToRun.forEach(t => { initStatus[t.id] = 'pending'; });
        setDeptTaskStatus(initStatus);

        for (const task of tasksToRun) {
            const taskKey = task.id;
            if (deptStopRefs.current['__all']) break;
            if (deptStopRefs.current[taskKey]) {
                setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'stopped' }));
                continue;
            }
            setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'running' }));
            try {
                if (task.type === 'agent') {
                    // Agency Agent execution
                    const execRes = await api.agencyExecute(task.id, task.name || activeDept.name || '');
                    const exec = execRes.execution;
                    // Parse output: extract .response from JSON if possible
                    let displayOutput = exec.output || '';
                    try {
                        const parsed = JSON.parse(displayOutput);
                        displayOutput = parsed.response || displayOutput;
                    } catch { /* use raw output */ }
                    setAgentResults(prev => ({
                        ...prev,
                        [taskKey]: {
                            agentName: exec.agentName || task.name || task.id,
                            output: displayOutput,
                            status: exec.status,
                            durationMs: exec.durationMs,
                            error: exec.error,
                            timestamp: exec.createdAt || Date.now(),
                        },
                    }));
                    if (exec.status === 'failed') {
                        setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'failed' }));
                    } else {
                        setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'done' }));
                    }
                } else {
                    // Task Chain execution
                    const res = await api.taskChainLoad(taskKey);
                    const cNodes = res.chain.nodes || [];
                    const cEdges = res.chain.edges || [];
                    const gNode = cNodes.find((n: { id: string; type: string; label: string }) => n.type === 'goal');
                    const cGoal = gNode?.label || taskKey;
                    let accCtx = '';

                    const inD = new Map<string, number>();
                    const adj = new Map<string, string[]>();
                    cNodes.forEach((n: { id: string }) => { inD.set(n.id, 0); adj.set(n.id, []); });
                    cEdges.forEach((e: { from: string; to: string }) => { adj.get(e.from)?.push(e.to); inD.set(e.to, (inD.get(e.to) || 0) + 1); });
                    const q = cNodes.filter((n: { id: string }) => (inD.get(n.id) || 0) === 0).map((n: { id: string }) => n.id);
                    const order: string[] = [];
                    while (q.length > 0) {
                        const nid = q.shift()!;
                        order.push(nid);
                        for (const nx of (adj.get(nid) || [])) { const dd = (inD.get(nx) || 1) - 1; inD.set(nx, dd); if (dd === 0) q.push(nx); }
                    }

                    let failed = false;
                    for (const nid of order) {
                        if (deptStopRefs.current[taskKey] || deptStopRefs.current['__all']) { failed = true; break; }
                        const node = cNodes.find((n: { id: string; label: string; type: string; skill?: string }) => n.id === nid);
                        if (!node) continue;
                        const result = await api.taskChainRunStep({
                            nodeId: node.id, nodeLabel: node.label, nodeType: node.type,
                            skill: node.skill, previousOutput: accCtx || undefined,
                            chainGoal: cGoal, accumulatedContext: accCtx || undefined,
                        });
                        if ((node.type === 'condition' || node.type === 'goal') && result.passed === false) { failed = true; break; }
                        if (node.type === 'action') {
                            const sum = result.output.substring(0, 300);
                            accCtx += (accCtx ? '\n\n' : '') + `[${node.label}]: ${sum}`;
                        }
                    }

                    if (deptStopRefs.current[taskKey]) {
                        setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'stopped' }));
                    } else {
                        setDeptTaskStatus(prev => ({ ...prev, [taskKey]: failed ? 'failed' : 'done' }));
                    }
                }
            } catch {
                setDeptTaskStatus(prev => ({ ...prev, [taskKey]: 'failed' }));
            }
        }
        setDeptRunning(false);
    };

    const selectAll = () => {
        if (!activeDept) return;
        if (deptTaskSelected.size === activeDept.tasks.length) {
            setDeptTaskSelected(new Set());
        } else {
            setDeptTaskSelected(new Set(activeDept.tasks.map(t => t.id)));
        }
    };

    const handleReview = async (taskName: string, autoImprove: boolean) => {
        setReviewingTask(taskName);
        try {
            const res = await api.departmentsReview(taskName, autoImprove);
            setReviewResults(prev => ({ ...prev, [taskName]: res }));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            setReviewResults(prev => ({ ...prev, [taskName]: { review: `Error: ${msg}`, timestamp: new Date().toISOString() } }));
        }
        setReviewingTask(null);
    };

    return (
        <div className="dept-page">
            <header className="dept-header">
                <div>
                    <h2>Departments</h2>
                    <p>Organize and batch-run task chains by department</p>
                </div>
            </header>

            <div className="dept-content">
                {/* Sidebar: department list */}
                <aside className="dept-sidebar">
                    <div className="dept-sidebar__head">
                        <span>Departments</span>
                        <button className="dept-sidebar__new" onClick={() => deptAction({ action: 'create', name: 'New Dept' })}>+ New</button>
                    </div>
                    <div className="dept-sidebar__list">
                        {departments.length === 0 && <div className="dept-sidebar__empty">No departments yet</div>}
                        {departments.map(d => (
                            <div key={d.id}
                                className={`dept-sidebar__item ${d.id === activeDeptId ? 'dept-sidebar__item--active' : ''}`}
                                onClick={() => { deptAction({ action: 'set-active', id: d.id }); setDeptTaskSelected(new Set()); setDeptTaskStatus({}); }}
                            >
                                {renamingDept === d.id ? (
                                    <input className="dept-sidebar__rename" value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => { deptAction({ action: 'rename', id: d.id, name: renameValue }); setRenamingDept(null); }}
                                        onKeyDown={e => { if (e.key === 'Enter') { deptAction({ action: 'rename', id: d.id, name: renameValue }); setRenamingDept(null); } }}
                                        autoFocus onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <>
                                        <span className="dept-sidebar__item-icon"><IconBuilding /></span>
                                        <span className="dept-sidebar__name" onDoubleClick={(e) => { e.stopPropagation(); setRenamingDept(d.id); setRenameValue(d.name); }}>
                                            {d.name}
                                        </span>
                                    </>
                                )}
                                <span className="dept-sidebar__count">{d.tasks.length}</span>
                                <button className="dept-sidebar__del" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.name}"?`)) deptAction({ action: 'delete', id: d.id }); }}>&times;</button>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main area: task list for active dept */}
                <main className="dept-main">
                    {!activeDept ? (
                        <div className="dept-main__empty">
                            <div className="dept-main__empty-icon"><IconBuilding size={48} /></div>
                            <div>Select or create a department to get started</div>
                        </div>
                    ) : (
                        <>
                            <div className="dept-main__toolbar">
                                <h3>{activeDept.name}</h3>
                                <div className="dept-main__add-row">
                                    <select className="dept-main__chain-select" value={addChainValue}
                                        onChange={e => setAddChainValue(e.target.value)}>
                                        <option value="">Add task chain...</option>
                                        {availableChains.filter(c => !activeDept.tasks.some(t => t.id === c)).map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <button className="dept-main__add-btn" disabled={!addChainValue}
                                        onClick={() => { if (addChainValue) { deptAction({ action: 'add-task', id: activeDeptId!, task: addChainValue }); setAddChainValue(''); } }}
                                    >+ Add</button>
                                </div>
                            </div>

                            {activeDept.tasks.length === 0 ? (
                                <div className="dept-main__no-tasks">No tasks in this department. Use the dropdown above to add saved task chains.</div>
                            ) : (
                                <>
                                    <div className="dept-tasklist__header">
                                        <label className="dept-tasklist__select-all">
                                            <input type="checkbox"
                                                checked={deptTaskSelected.size === activeDept.tasks.length && activeDept.tasks.length > 0}
                                                onChange={selectAll} />
                                            Select All
                                        </label>
                                    </div>
                                    <div className="dept-tasklist">
                                        {activeDept.tasks.map(task => {
                                            const taskKey = task.id;
                                            const taskLabel = task.name || task.id;
                                            const status = deptTaskStatus[taskKey];
                                            const isAgent = task.type === 'agent';
                                            return (
                                                <div key={taskKey} className={`dept-task ${status ? `dept-task--${status}` : ''}`}>
                                                    <label className="dept-task__check">
                                                        <input type="checkbox" checked={deptTaskSelected.has(taskKey)}
                                                            onChange={() => setDeptTaskSelected(prev => {
                                                                const next = new Set(prev);
                                                                next.has(taskKey) ? next.delete(taskKey) : next.add(taskKey);
                                                                return next;
                                                            })}
                                                        />
                                                    </label>
                                                    <span className="dept-task__icon">{isAgent ? <span style={{ fontSize: 13 }}>🤖</span> : <IconLink />}</span>
                                                    <span className="dept-task__name">{taskLabel}</span>
                                                    {isAgent && <span className="dept-task__type-badge dept-task__type-badge--agent">Agent</span>}
                                                    {status && <span className={`dept-task__status dept-task__status--${status}`}>
                                                        {statusIcon(status)} {status}
                                                    </span>}
                                                    {status === 'running' && (
                                                        <button className="dept-task__stop" onClick={() => { deptStopRefs.current[taskKey] = true; }}>Stop</button>
                                                    )}
                                                    {!isAgent && (
                                                        <>
                                                            <button className="dept-task__review-btn" title="Manager Review"
                                                                disabled={reviewingTask === taskKey}
                                                                onClick={() => handleReview(taskKey, false)}>
                                                                {reviewingTask === taskKey ? <IconLoader /> : <IconClipboard />}
                                                            </button>
                                                            <button className="dept-task__improve-btn" title="Review & Auto-Fix"
                                                                disabled={reviewingTask === taskKey}
                                                                onClick={() => handleReview(taskKey, true)}>
                                                                {reviewingTask === taskKey ? <IconLoader /> : <IconRefresh />}
                                                            </button>
                                                        </>
                                                    )}
                                                    <button className="dept-task__remove" onClick={() => deptAction({ action: 'remove-task', id: activeDeptId!, task: taskKey })}>&times;</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="dept-actions">
                                        <button className="dept-actions__run" disabled={deptRunning || deptTaskSelected.size === 0}
                                            onClick={handleRunSelected}>
                                            {deptRunning ? <><div className="spinner" /> Running...</> : <><IconPlay /> Run Selected ({deptTaskSelected.size})</>}
                                        </button>
                                        {deptRunning && (
                                            <button className="dept-actions__stop-all" onClick={() => { deptStopRefs.current['__all'] = true; }}>
                                                <IconSquare /> Stop All
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Manager Review Results */}
                            {Object.keys(reviewResults).length > 0 && (
                                <div className="dept-reviews">
                                    <h4 className="dept-reviews__title"><IconClipboard /> Manager Reviews</h4>
                                    {Object.entries(reviewResults).map(([taskName, result]) => (
                                        <div key={taskName} className="dept-review-card">
                                            <div className="dept-review-card__header">
                                                <IconLink /><span>{taskName}</span>
                                                <span className="dept-review-card__time">{new Date(result.timestamp).toLocaleString()}</span>
                                                <button className="dept-review-card__close" onClick={() => setReviewResults(prev => { const n = { ...prev }; delete n[taskName]; return n; })}>&times;</button>
                                            </div>
                                            <pre className="dept-review-card__body">{result.review}</pre>
                                            {result.improveResult && result.improveResult.count > 0 && (
                                                <div className="dept-review-card__improved">
                                                    <IconRefresh /> Auto-improved {result.improveResult.count} skill(s): {result.improveResult.improved.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Agent Execution Results */}
                            {Object.keys(agentResults).length > 0 && (
                                <div className="dept-reviews">
                                    <h4 className="dept-reviews__title">🤖 Agent Execution Results</h4>
                                    {Object.entries(agentResults).map(([taskId, result]) => (
                                        <div key={taskId} className={`dept-review-card dept-agent-card--${result.status}`}>
                                            <div className="dept-review-card__header">
                                                <span style={{ fontSize: 13 }}>🤖</span>
                                                <span>{result.agentName}</span>
                                                <span className={`dept-agent-card__status dept-agent-card__status--${result.status}`}>
                                                    {result.status === 'success' ? '✅ Success' : '❌ Failed'}
                                                </span>
                                                <span className="dept-agent-card__duration">{(result.durationMs / 1000).toFixed(1)}s</span>
                                                <span className="dept-review-card__time">{new Date(result.timestamp).toLocaleString()}</span>
                                                <button className="dept-review-card__close" onClick={() => setAgentResults(prev => { const n = { ...prev }; delete n[taskId]; return n; })}>&times;</button>
                                            </div>
                                            <pre className="dept-review-card__body">{result.status === 'failed' ? (result.error || 'Execution failed') : result.output}</pre>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
