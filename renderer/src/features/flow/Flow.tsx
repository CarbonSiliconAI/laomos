import React, { useState, useEffect } from 'react';
import { api, SkillDef } from '../../lib/api';
import './Flow.css';

interface FlowNode {
    id: string;
    skillId: string;
    prompt: string;
}

export default function Flow() {
    const [skills, setSkills] = useState<SkillDef[]>([]);
    const [nodes, setNodes] = useState<FlowNode[]>([]);
    const [userInput, setUserInput] = useState('');
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        api.skills().then(r => setSkills(r.skills ?? [])).catch(() => {});
    }, []);

    function addNode() {
        const id = `node-${Date.now()}`;
        const skillId = skills[0]?.id ?? '';
        setNodes(prev => [...prev, { id, skillId, prompt: '' }]);
    }

    function removeNode(id: string) {
        setNodes(prev => prev.filter(n => n.id !== id));
    }

    function updateNode(id: string, patch: Partial<FlowNode>) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
    }

    async function runFlow() {
        if (!userInput.trim()) { setError('Enter a user input first.'); return; }
        setRunning(true);
        setResult('');
        setError('');
        const ctx = nodes
            .map((n, i) => {
                const skill = skills.find(s => s.id === n.skillId);
                return `Step ${i + 1} [${skill?.name ?? n.skillId}]: ${n.prompt}`;
            })
            .join('\n');
        try {
            const res = await api.skillsExecute({ skillContext: ctx, userInput: userInput.trim() });
            setResult(res.result ?? '');
        } catch (e: any) {
            setError(e.message ?? 'Execution failed');
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="flow-page">
            <div className="flow-header">
                <div>
                    <h1 className="flow-header__title">Flow Builder</h1>
                    <p className="flow-header__sub">Chain tools and skills into AI pipelines</p>
                </div>
                <button className="btn btn-primary" onClick={addNode} disabled={skills.length === 0}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Step
                </button>
            </div>

            <div className="flow-body">
                <div className="flow-pipeline">
                    {nodes.length === 0 ? (
                        <div className="empty-state">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>
                            <span>Add steps to build your pipeline</span>
                        </div>
                    ) : (
                        nodes.map((node, idx) => (
                            <div key={node.id} className="flow-node glass-card">
                                <div className="flow-node__header">
                                    <span className="flow-node__num">{idx + 1}</span>
                                    <select
                                        className="os-input flow-node__skill-select"
                                        value={node.skillId}
                                        onChange={e => updateNode(node.id, { skillId: e.target.value })}
                                    >
                                        {skills.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-ghost flow-node__remove"
                                        onClick={() => removeNode(node.id)}
                                        title="Remove step"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                                <textarea
                                    className="os-input flow-node__prompt"
                                    placeholder="Step context / instructions…"
                                    value={node.prompt}
                                    onChange={e => updateNode(node.id, { prompt: e.target.value })}
                                    rows={2}
                                />
                                {idx < nodes.length - 1 && (
                                    <div className="flow-node__connector">
                                        <svg width="16" height="24" viewBox="0 0 16 24" fill="none"><line x1="8" y1="0" x2="8" y2="24" stroke="var(--muted-2)" strokeWidth="1.5" strokeDasharray="4 4" /><polyline points="4,18 8,24 12,18" stroke="var(--muted-2)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="flow-run-area glass-card">
                    <div className="flow-run-area__label">User Input</div>
                    <textarea
                        className="os-input flow-run-input"
                        placeholder="What do you want the pipeline to accomplish?"
                        value={userInput}
                        onChange={e => setUserInput(e.target.value)}
                        rows={3}
                    />
                    <button
                        className="btn btn-primary flow-run-btn"
                        onClick={runFlow}
                        disabled={running || nodes.length === 0}
                    >
                        {running ? (
                            <><div className="spinner" /> Running…</>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                Run Flow
                            </>
                        )}
                    </button>
                </div>

                {(result || error) && (
                    <div className="flow-result glass-card">
                        <div className="flow-result__label">
                            {error ? (
                                <span className="badge badge-bad">Error</span>
                            ) : (
                                <span className="badge badge-ok">Result</span>
                            )}
                        </div>
                        <pre className="flow-result__content">
                            {error || result}
                        </pre>
                    </div>
                )}
            </div>

            <div className="flow-skills-panel glass-card">
                <div className="section-title">Available Skills ({skills.length})</div>
                <div className="flow-skills-list">
                    {skills.length === 0 ? (
                        <div className="empty-state" style={{ padding: '12px' }}>
                            <span>No skills installed</span>
                        </div>
                    ) : (
                        skills.map(s => (
                            <div key={s.id} className="flow-skill-item">
                                <div className="flow-skill-item__name">{s.name}</div>
                                <div className="flow-skill-item__desc">{s.description}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
