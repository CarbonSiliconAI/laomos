import React, { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Department } from '../../lib/api';
import './Department.css';

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

    const fetchDepartments = useCallback(async () => {
        try {
            const data = await api.departmentsGet();
            setDepartments(data.departments || []);
            setActiveDeptId(data.activeDept);
            setAvailableChains(data.availableChains || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

    const activeDept = departments.find(d => d.id === activeDeptId) || null;

    const deptAction = async (body: any) => {
        await api.departmentsAction(body);
        await fetchDepartments();
    };

    const handleRunSelected = async () => {
        if (!activeDept || deptRunning) return;
        const tasksToRun = activeDept.tasks.filter(t => deptTaskSelected.has(t));
        if (tasksToRun.length === 0) return;
        setDeptRunning(true);
        deptStopRefs.current = {};

        const initStatus: Record<string, 'pending'> = {};
        tasksToRun.forEach(t => { initStatus[t] = 'pending'; });
        setDeptTaskStatus(initStatus);

        for (const cName of tasksToRun) {
            if (deptStopRefs.current['__all']) break;
            if (deptStopRefs.current[cName]) {
                setDeptTaskStatus(prev => ({ ...prev, [cName]: 'stopped' }));
                continue;
            }
            setDeptTaskStatus(prev => ({ ...prev, [cName]: 'running' }));
            try {
                const res = await api.taskChainLoad(cName);
                const cNodes = res.chain.nodes || [];
                const cEdges = res.chain.edges || [];
                const gNode = cNodes.find((n: any) => n.type === 'goal');
                const cGoal = gNode?.label || cName;
                let accCtx = '';

                // Topological sort
                const inD = new Map<string, number>();
                const adj = new Map<string, string[]>();
                cNodes.forEach((n: any) => { inD.set(n.id, 0); adj.set(n.id, []); });
                cEdges.forEach((e: any) => { adj.get(e.from)?.push(e.to); inD.set(e.to, (inD.get(e.to) || 0) + 1); });
                const q = cNodes.filter((n: any) => (inD.get(n.id) || 0) === 0).map((n: any) => n.id);
                const order: string[] = [];
                while (q.length > 0) {
                    const nid = q.shift()!;
                    order.push(nid);
                    for (const nx of (adj.get(nid) || [])) { const dd = (inD.get(nx) || 1) - 1; inD.set(nx, dd); if (dd === 0) q.push(nx); }
                }

                let failed = false;
                for (const nid of order) {
                    if (deptStopRefs.current[cName] || deptStopRefs.current['__all']) { failed = true; break; }
                    const node = cNodes.find((n: any) => n.id === nid);
                    if (!node) continue;
                    const result = await api.taskChainRunStep({
                        nodeId: node.id, nodeLabel: node.label, nodeType: node.type,
                        skill: node.skill, previousOutput: accCtx || undefined,
                        chainGoal: cGoal, accumulatedContext: accCtx || undefined,
                    });
                    if ((node.type === 'condition' || node.type === 'goal') && result.passed === false) { failed = true; break; }
                    if (node.type === 'action') {
                        const sum = (result as any).summary || result.output.substring(0, 300);
                        accCtx += (accCtx ? '\n\n' : '') + `[${node.label}]: ${sum}`;
                    } else if ((result as any).passthrough) {
                        accCtx = (result as any).passthrough;
                    }
                }

                if (deptStopRefs.current[cName]) {
                    setDeptTaskStatus(prev => ({ ...prev, [cName]: 'stopped' }));
                } else {
                    setDeptTaskStatus(prev => ({ ...prev, [cName]: failed ? 'failed' : 'done' }));
                }
            } catch {
                setDeptTaskStatus(prev => ({ ...prev, [cName]: 'failed' }));
            }
        }
        setDeptRunning(false);
    };

    const selectAll = () => {
        if (!activeDept) return;
        if (deptTaskSelected.size === activeDept.tasks.length) {
            setDeptTaskSelected(new Set());
        } else {
            setDeptTaskSelected(new Set(activeDept.tasks));
        }
    };

    return (
        <div className="dept-page">
            <header className="dept-header">
                <h2>🏢 Departments</h2>
                <p>Organize and batch-run task chains by department</p>
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
                                    <span className="dept-sidebar__name" onDoubleClick={(e) => { e.stopPropagation(); setRenamingDept(d.id); setRenameValue(d.name); }}>
                                        🏢 {d.name}
                                    </span>
                                )}
                                <span className="dept-sidebar__count">{d.tasks.length}</span>
                                <button className="dept-sidebar__del" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.name}"?`)) deptAction({ action: 'delete', id: d.id }); }}>×</button>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main area: task list for active dept */}
                <main className="dept-main">
                    {!activeDept ? (
                        <div className="dept-main__empty">
                            <div className="dept-main__empty-icon">🏢</div>
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
                                        {availableChains.filter(c => !activeDept.tasks.includes(c)).map(c => (
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
                                        {activeDept.tasks.map(taskName => {
                                            const status = deptTaskStatus[taskName];
                                            return (
                                                <div key={taskName} className={`dept-task ${status ? `dept-task--${status}` : ''}`}>
                                                    <label className="dept-task__check">
                                                        <input type="checkbox" checked={deptTaskSelected.has(taskName)}
                                                            onChange={() => setDeptTaskSelected(prev => {
                                                                const next = new Set(prev);
                                                                next.has(taskName) ? next.delete(taskName) : next.add(taskName);
                                                                return next;
                                                            })}
                                                        />
                                                    </label>
                                                    <span className="dept-task__name">⛓ {taskName}</span>
                                                    {status && <span className={`dept-task__status dept-task__status--${status}`}>
                                                        {status === 'running' ? '⏳' : status === 'done' ? '✅' : status === 'failed' ? '❌' : status === 'stopped' ? '⏹' : '⏸'}
                                                        {' '}{status}
                                                    </span>}
                                                    {status === 'running' && (
                                                        <button className="dept-task__stop" onClick={() => { deptStopRefs.current[taskName] = true; }}>Stop</button>
                                                    )}
                                                    <button className="dept-task__remove" onClick={() => deptAction({ action: 'remove-task', id: activeDeptId!, task: taskName })}>×</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="dept-actions">
                                        <button className="dept-actions__run" disabled={deptRunning || deptTaskSelected.size === 0}
                                            onClick={handleRunSelected}>
                                            {deptRunning ? '⏳ Running...' : `▶ Run Selected (${deptTaskSelected.size})`}
                                        </button>
                                        {deptRunning && (
                                            <button className="dept-actions__stop-all" onClick={() => { deptStopRefs.current['__all'] = true; }}>⏹ Stop All</button>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
