import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ChainNode, ChainEdge, RunLogEntry, DiagnoseResult, DiagnoseFix, AgencyAgent } from '../../lib/api';
import './TaskChain.css';

// ── Layout helpers ──────────────────────────────────────────
interface PositionedNode extends ChainNode {
    x: number;
    y: number;
}

function layoutNodes(nodes: ChainNode[], edges: ChainEdge[]): PositionedNode[] {
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    nodes.forEach(n => { outgoing.set(n.id, []); incoming.set(n.id, []); });
    edges.forEach(e => {
        outgoing.get(e.from)?.push(e.to);
        incoming.get(e.to)?.push(e.from);
    });

    const goalNode = nodes.find(n => n.type === 'goal');
    if (!goalNode) return nodes.map((n, i) => ({ ...n, x: 100, y: 80 + i * 120 }));

    const layers = new Map<string, number>();
    const queue: string[] = [goalNode.id];
    layers.set(goalNode.id, 0);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLayer = layers.get(current)!;
        const parents = incoming.get(current) || [];
        for (const parent of parents) {
            if (!layers.has(parent)) {
                layers.set(parent, currentLayer + 1);
                queue.push(parent);
            }
        }
    }

    nodes.forEach(n => {
        if (!layers.has(n.id)) {
            const maxLayer = Math.max(...Array.from(layers.values()), 0);
            layers.set(n.id, maxLayer + 1);
        }
    });

    const maxLayer = Math.max(...Array.from(layers.values()));
    const layerGroups = new Map<number, ChainNode[]>();
    nodes.forEach(n => {
        const l = layers.get(n.id) || 0;
        if (!layerGroups.has(l)) layerGroups.set(l, []);
        layerGroups.get(l)!.push(n);
    });

    const colWidth = 260;
    const rowHeight = 110;
    const paddingX = 60;
    const paddingY = 40;

    const positioned: PositionedNode[] = [];
    layerGroups.forEach((group, layer) => {
        const col = maxLayer - layer;
        const totalHeight = group.length * rowHeight;
        const startY = paddingY + (300 - totalHeight) / 2;
        group.forEach((node, idx) => {
            positioned.push({
                ...node,
                x: paddingX + col * colWidth,
                y: Math.max(paddingY, startY + idx * rowHeight),
            });
        });
    });

    return positioned;
}

// ── Helpers ─────────────────────────────────────────────────
function extractAgentOutput(rawOutput: string): string {
    try {
        const parsed = JSON.parse(rawOutput);
        return parsed.response || rawOutput;
    } catch {
        return rawOutput;
    }
}

// ── Component ───────────────────────────────────────────────
export default function TaskChain() {
    const navigate = useNavigate();
    const [goal, setGoal] = useState('');
    const [chainName, setChainName] = useState('');
    const [nodes, setNodes] = useState<PositionedNode[]>([]);
    const [edges, setEdges] = useState<ChainEdge[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [svgPaths, setSvgPaths] = useState<string[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [running, setRunning] = useState(false);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [nodeOutputs, setNodeOutputs] = useState<Record<string, { output: string; passed?: boolean; status: 'running' | 'done' | 'failed' | 'skipped' }>>({});
    // Save / Load state
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [savedChains, setSavedChains] = useState<string[]>([]);
    const [showLoadPanel, setShowLoadPanel] = useState(false);
    const [experience, setExperience] = useState('');
    const [learning, setLearning] = useState(false);
    const [systemExperience, setSystemExperience] = useState('');
    const [improving, setImproving] = useState(false);
    const [improveResult, setImproveResult] = useState<{ iterations: number; improved: string[]; results: any[]; summary: string } | null>(null);
    const [runs, setRuns] = useState<RunLogEntry[]>([]);
    const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [linkFrom, setLinkFrom] = useState<string | null>(null);
    const [diagnosing, setDiagnosing] = useState(false);
    const [diagNodeId, setDiagNodeId] = useState<string | null>(null);
    const [diagResult, setDiagResult] = useState<DiagnoseResult | null>(null);
    const [installedAgents, setInstalledAgents] = useState<AgencyAgent[]>([]);
    const [showAgentPicker, setShowAgentPicker] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const stopRef = useRef(false);

    // ── Load saved chains list ──────────────────────────────
    const fetchChainList = useCallback(async () => {
        try {
            const res = await api.taskChainList();
            setSavedChains(res.chains || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchChainList(); }, [fetchChainList]);

    // Fetch installed agency agents
    useEffect(() => {
        api.agencyInstalled().then(r => setInstalledAgents(r.agents || [])).catch(() => {});
    }, []);

    // ── Recompute edge paths ────────────────────────────────
    const recomputeEdges = useCallback(() => {
        const container = canvasRef.current;
        if (!container || nodes.length === 0) { setSvgPaths([]); return; }
        const cRect = container.getBoundingClientRect();
        const paths: string[] = [];
        edges.forEach(edge => {
            const fromEl = document.getElementById(`tc-${edge.from}`);
            const toEl = document.getElementById(`tc-${edge.to}`);
            if (!fromEl || !toEl) return;
            const fR = fromEl.getBoundingClientRect();
            const tR = toEl.getBoundingClientRect();
            const x1 = fR.right - cRect.left;
            const y1 = fR.top - cRect.top + fR.height / 2;
            const x2 = tR.left - cRect.left;
            const y2 = tR.top - cRect.top + tR.height / 2;
            const curve = Math.abs(x2 - x1) * 0.45;
            paths.push(`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
        });
        setSvgPaths(paths);
    }, [nodes, edges]);

    useEffect(() => { recomputeEdges(); }, [recomputeEdges]);
    useEffect(() => {
        window.addEventListener('resize', recomputeEdges);
        return () => window.removeEventListener('resize', recomputeEdges);
    }, [recomputeEdges]);

    // ── Decompose ───────────────────────────────────────────
    const handleDecompose = async () => {
        if (!goal.trim() || loading) return;
        setLoading(true);
        setError('');
        setNodes([]);
        setEdges([]);
        setSvgPaths([]);
        setSelected(new Set());
        setNodeOutputs({});
        setSaveMsg('');

        try {
            const result = await api.taskChainDecompose(goal.trim());
            const positioned = layoutNodes(result.nodes, result.edges);
            setNodes(positioned);
            setEdges(result.edges);
            setSelected(new Set(result.nodes.map(n => n.id)));
            // Default chain name from goal
            setChainName(goal.trim().slice(0, 60));
        } catch (e: any) {
            setError(e.message || 'Decomposition failed');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDecompose(); }
    };

    // ── Toggle node selection ───────────────────────────────
    const toggleNode = (id: string) => {
        if (editMode) {
            // Edit mode: two-click edge creation
            if (!linkFrom) {
                setLinkFrom(id);
            } else if (linkFrom === id) {
                // Clicked same node, cancel
                setLinkFrom(null);
            } else {
                // Create edge from linkFrom -> id
                const exists = edges.some(e => e.from === linkFrom && e.to === id);
                if (!exists) {
                    const newEdges = [...edges, { from: linkFrom, to: id }];
                    setEdges(newEdges);
                    // Re-layout nodes with new edges
                    const baseNodes: ChainNode[] = nodes.map(({ x, y, ...rest }) => rest);
                    setNodes(layoutNodes(baseNodes, newEdges));
                }
                setLinkFrom(null);
            }
            return;
        }
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ── Remove edge (edit mode) ─────────────────────────────
    const removeEdge = (index: number) => {
        const newEdges = edges.filter((_, i) => i !== index);
        setEdges(newEdges);
        const baseNodes: ChainNode[] = nodes.map(({ x, y, ...rest }) => rest);
        setNodes(layoutNodes(baseNodes, newEdges));
    };

    // ── Diagnose node (right-click) ─────────────────────────
    const handleDiagnose = async (nodeId: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (editMode || running || diagnosing) return;
        setDiagNodeId(nodeId);
        setDiagResult(null);
        setDiagnosing(true);
        try {
            const result = await api.taskChainDiagnose({
                chainName: chainName.trim(),
                nodeId,
                nodes,
                edges,
                nodeOutputs,
            });
            setDiagResult(result);
        } catch (err: any) {
            setDiagResult({ diagnosis: `Error: ${err.message}`, fixes: [] });
        }
        setDiagnosing(false);
    };

    // ── Apply a single fix ──────────────────────────────────
    const applyFix = (fix: DiagnoseFix) => {
        if (fix.type === 'update_label' && fix.nodeId && fix.newLabel) {
            setNodes(prev => prev.map(n => n.id === fix.nodeId ? { ...n, label: fix.newLabel! } : n));
        } else if (fix.type === 'add_edge' && fix.from && fix.to) {
            const exists = edges.some(e => e.from === fix.from && e.to === fix.to);
            if (!exists) {
                const newEdges = [...edges, { from: fix.from!, to: fix.to! }];
                setEdges(newEdges);
                const baseNodes: ChainNode[] = nodes.map(({ x, y, ...rest }) => rest);
                setNodes(layoutNodes(baseNodes, newEdges));
            }
        } else if (fix.type === 'remove_edge' && fix.from && fix.to) {
            const newEdges = edges.filter(e => !(e.from === fix.from && e.to === fix.to));
            setEdges(newEdges);
            const baseNodes: ChainNode[] = nodes.map(({ x, y, ...rest }) => rest);
            setNodes(layoutNodes(baseNodes, newEdges));
        }
    };


    // ── Save chain ──────────────────────────────────────────
    const handleSave = async () => {
        if (!chainName.trim() || nodes.length === 0 || saving) return;
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await api.taskChainSave(chainName.trim(), nodes, edges);
            setSaveMsg(`✅ Saved as "${res.name}"`);
            fetchChainList();
        } catch (e: any) {
            setSaveMsg(`❌ ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Load chain ──────────────────────────────────────────
    const handleLoad = async (name: string) => {
        try {
            const res = await api.taskChainLoad(name);
            const positioned = layoutNodes(res.chain.nodes, res.chain.edges);
            setNodes(positioned);
            setEdges(res.chain.edges);
            setSelected(new Set(res.chain.nodes.map((n: any) => n.id)));
            setChainName(res.chain.name || name);
            setGoal(res.chain.name || name);
            setExperience(res.experience || '');
            setRuns(res.runs || []);
            setExpandedRunId(null);
            setShowLoadPanel(false);
            setJobStatus(null);
            setSaveMsg('');
            setError('');
        } catch (e: any) {
            setError(`Load failed: ${e.message}`);
        }
    };

    // ── Run Graph (Step-by-Step) ─────────────────────────────
    const handleRunGraph = async () => {
        if (selected.size === 0 || running) return;
        setRunning(true);
        stopRef.current = false;
        setJobStatus('Starting...');
        setNodeOutputs({});

        // Compute topological execution order (actions → conditions → goal)
        const selectedNodes = nodes.filter(n => selected.has(n.id));
        const inDeg = new Map<string, number>();
        const adj = new Map<string, string[]>();
        const selectedIds = new Set(selectedNodes.map(n => n.id));

        selectedNodes.forEach(n => { inDeg.set(n.id, 0); adj.set(n.id, []); });
        edges.forEach(e => {
            if (selectedIds.has(e.from) && selectedIds.has(e.to)) {
                adj.get(e.from)!.push(e.to);
                inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
            }
        });

        // Kahn's topological sort
        const queue = selectedNodes.filter(n => (inDeg.get(n.id) || 0) === 0).map(n => n.id);
        const order: string[] = [];
        while (queue.length > 0) {
            const id = queue.shift()!;
            order.push(id);
            for (const next of (adj.get(id) || [])) {
                const d = (inDeg.get(next) || 1) - 1;
                inDeg.set(next, d);
                if (d === 0) queue.push(next);
            }
        }
        // Add any remaining selected nodes not in the sort
        selectedNodes.forEach(n => { if (!order.includes(n.id)) order.push(n.id); });

        const logLines: string[] = [];
        let accumulatedContext = '';
        // Find the goal node's label to use as chainGoal
        const goalNode = selectedNodes.find(n => n.type === 'goal');
        const chainGoalText = goalNode?.label || goal || chainName;

        for (const nodeId of order) {
            if (stopRef.current) {
                setJobStatus('⏹ Stopped');
                break;
            }

            const node = selectedNodes.find(n => n.id === nodeId);
            if (!node) continue;

            // Mark as running
            setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: '⏳ Running...', status: 'running' } }));
            setJobStatus(`Running: ${node.label.slice(0, 40)}...`);

            try {
                // Agent nodes use agencyExecute, others use taskChainRunStep
                if (node.type === 'agent' && node.agentId) {
                    const execRes = await api.agencyExecute(node.agentId, node.label, accumulatedContext || undefined);
                    const exec = execRes.execution;
                    logLines.push(`\n========== [AGENT] ${node.agentName || node.label} ==========`);
                    if (exec.status === 'failed') {
                        setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: exec.error || 'Agent execution failed', status: 'failed' } }));
                        setJobStatus(`❌ Agent failed: ${node.label}`);
                        logLines.push(`ERROR: ${exec.error}`);
                        break;
                    }
                    const agentOutput = extractAgentOutput(exec.output);
                    logLines.push(`Output (${exec.durationMs}ms):\n${agentOutput}`);
                    setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: agentOutput, status: 'done' } }));
                    accumulatedContext += (accumulatedContext ? '\n\n' : '') + `[${node.agentName || node.label}]: ${agentOutput}`;
                } else {
                    const result = await api.taskChainRunStep({
                        nodeId: node.id,
                        nodeLabel: node.label,
                        nodeType: node.type,
                        skill: node.skill,
                        previousOutput: accumulatedContext || undefined,
                        chainGoal: chainGoalText,
                        accumulatedContext: accumulatedContext || undefined,
                    });

                    // Capture detailed execution log
                    if (result.executionLog && result.executionLog.length > 0) {
                        logLines.push(`\n========== [${node.type.toUpperCase()}] ${node.label} ==========`);
                        result.executionLog.forEach(entry => logLines.push(entry));
                    } else {
                        logLines.push(`[${node.type}] ${node.label}:\n${result.output}`);
                    }

                    if (node.type === 'condition' || node.type === 'goal') {
                        if (result.passed === false) {
                            setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: result.output, passed: false, status: 'failed' } }));
                            setJobStatus(`❌ Condition failed: ${node.label}`);
                            logLines.push(`STOPPED: condition "${node.label}" not satisfied`);
                            break;
                        }
                        setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: result.output, passed: true, status: 'done' } }));
                        if ((result as any).passthrough) {
                            accumulatedContext = (result as any).passthrough;
                        }
                    } else {
                        setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: result.output, status: 'done' } }));
                        const summary = (result as any).summary || result.output.substring(0, 300);
                        accumulatedContext += (accumulatedContext ? '\n\n' : '') + `[${node.label}]: ${summary}`;
                    }
                }
            } catch (e: any) {
                setNodeOutputs(prev => ({ ...prev, [nodeId]: { output: e.message, status: 'failed' } }));
                setJobStatus(`❌ Error at: ${node.label}`);
                logLines.push(`ERROR at ${node.label}: ${e.message}`);
                break;
            }
        }

        // Determine final run status
        let runStatus: 'success' | 'failed' | 'stopped' = 'success';
        if (stopRef.current) {
            runStatus = 'stopped';
        } else if (logLines.some(l => /ERROR|STOPPED|❌|FAIL/i.test(l))) {
            runStatus = 'failed';
        }

        if (!stopRef.current) {
            const allDone = order.every(id => {
                const o = nodeOutputs[id]; // this won't see latest, but jobStatus tells the story
                return true; // we already broke on failure
            });
            if (runStatus === 'success') {
                setJobStatus('✅ All steps completed');
            }
        }

        // Save experience log with status
        if (chainName.trim() && logLines.length > 0) {
            try {
                await api.taskChainLog(chainName.trim(), logLines.join('\n'), runStatus);
                // Refresh runs list
                try {
                    const loadRes = await api.taskChainLoad(chainName.trim());
                    setRuns(loadRes.runs || []);
                } catch { /* ignore */ }
            } catch { /* ignore */ }
        }
        setRunning(false);
    };

    // ── Stop ────────────────────────────────────────────────
    const handleStop = () => {
        stopRef.current = true;
        setJobStatus('⏹ Stopping...');
    };

    const addAgentNode = (agent: AgencyAgent) => {
        const newId = `agent-${Date.now()}`;
        const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x)) + 260 : 60;
        const newNode: PositionedNode = {
            id: newId,
            label: agent.name,
            type: 'agent',
            agentId: agent.id,
            agentName: agent.name,
            agentDivision: agent.division,
            x: maxX,
            y: 160,
        };
        setNodes(prev => [...prev, newNode]);
        setSelected(prev => new Set([...prev, newId]));
        setShowAgentPicker(false);
    };

    const divisionEmoji = (div: string) => {
        const map: Record<string, string> = {
            engineering: '🛠️', marketing: '📢', product: '📦',
            design: '🎨', finance: '💰', operations: '⚙️',
            sales: '💼', support: '🎧', legal: '⚖️', hr: '👥',
        };
        return map[div?.toLowerCase()] || '🤖';
    };

    const typeEmoji = (type: string) => {
        if (type === 'goal') return '🎯';
        if (type === 'condition') return '🔗';
        if (type === 'agent') return '🤖';
        if (type === 'draw') return '🎨';
        return '⚡';
    };

    return (
        <div className="taskchain-page">
            {/* Header */}
            <div className="taskchain-header">
                <h1>Task Chain</h1>
                <p>Describe your goal and the AI will decompose it into prerequisite conditions</p>
            </div>

            {/* Legend */}
            <div className="taskchain-legend">
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#E85D04' }} />Goal
                </div>
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#007AFF' }} />Condition
                </div>
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#28A745' }} />Action
                </div>
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#7C3AED' }} />Has Skill
                </div>
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#F59E0B' }} />Agent
                </div>
                <div className="taskchain-legend-item">
                    <div className="taskchain-legend-dot" style={{ background: '#7C3AED' }} />Draw
                </div>
            </div>

            {/* Input + Actions */}
            <div className="taskchain-input-bar">
                <textarea
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="E.g., Send a LinkedIn message to my colleague about the new project..."
                    rows={1}
                    disabled={loading}
                />
                <button className="taskchain-decompose-btn" onClick={handleDecompose} disabled={!goal.trim() || loading}>
                    {loading ? <><div className="taskchain-spinner" /> Analyzing...</> : <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><line x1="12" y1="5" x2="12" y2="1" /><line x1="12" y1="23" x2="12" y2="19" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                        Decompose
                    </>}
                </button>
                {nodes.length > 0 && !running && (
                    <button className="taskchain-run-btn" onClick={handleRunGraph} disabled={selected.size === 0}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        Run Graph ({selected.size})
                    </button>
                )}
                {running && (
                    <button className="taskchain-stop-btn" onClick={handleStop}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" /></svg>
                        Stop
                    </button>
                )}
                <button className="taskchain-load-btn" onClick={() => { setShowLoadPanel(!showLoadPanel); fetchChainList(); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                    Load
                </button>
                {nodes.length > 0 && (
                    <button className={`taskchain-edit-btn ${editMode ? 'taskchain-edit-btn--active' : ''}`} onClick={() => { setEditMode(!editMode); setLinkFrom(null); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        {editMode ? 'Done' : 'Edit'}
                    </button>
                )}
                <button className="taskchain-learn-btn" onClick={async () => {
                    setLearning(true);
                    try {
                        const res = await api.taskChainLearn();
                        setSystemExperience(res.summary);
                    } catch (e: any) {
                        setSystemExperience(`Error: ${e.message}`);
                    }
                    setLearning(false);
                }} disabled={learning}>
                    {learning ? <><div className="taskchain-spinner taskchain-spinner--dark" /> Learning...</> : <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                        Learn
                    </>}
                </button>
                <button className="taskchain-improve-btn" onClick={async () => {
                    setImproving(true);
                    setImproveResult(null);
                    try {
                        const res = await api.taskChainAutoImprove();
                        setImproveResult(res);
                    } catch (e: any) {
                        setImproveResult({ iterations: 0, improved: [], results: [], summary: `Error: ${e.message}` });
                    }
                    setImproving(false);
                }} disabled={improving || running}>
                    {improving ? <><div className="taskchain-spinner taskchain-spinner--dark" /> Improving...</> : <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                        Auto-Improve
                    </>}
                </button>
                {installedAgents.length > 0 && (
                    <div style={{ position: 'relative' }}>
                        <button className="taskchain-agent-btn" onClick={() => setShowAgentPicker(!showAgentPicker)}>
                            🤖 + Agent
                        </button>
                        {showAgentPicker && (
                            <div className="taskchain-agent-picker">
                                <div className="taskchain-agent-picker__title">Add Agent Node</div>
                                {installedAgents.map(a => (
                                    <button key={a.id} className="taskchain-agent-picker__item" onClick={() => addAgentNode(a)}>
                                        <span className="taskchain-agent-picker__emoji">{divisionEmoji(a.division)}</span>
                                        <span className="taskchain-agent-picker__name">{a.name}</span>
                                        <span className="taskchain-agent-picker__div">{a.division}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Save bar (when chain exists) */}
            {nodes.length > 0 && (
                <div className="taskchain-save-bar">
                    <label className="taskchain-save-bar__label">Chain Name:</label>
                    <input
                        className="taskchain-save-bar__input"
                        value={chainName}
                        onChange={e => setChainName(e.target.value)}
                        placeholder="Enter a name for this chain..."
                    />
                    <button className="taskchain-save-btn" onClick={handleSave} disabled={saving || !chainName.trim()}>
                        {saving ? <><div className="taskchain-spinner taskchain-spinner--dark" /> Saving...</> : <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                            Save
                        </>}
                    </button>
                    {saveMsg && <span className="taskchain-save-msg">{saveMsg}</span>}
                </div>
            )}

            {/* Job Status */}
            {jobStatus && <div className="taskchain-job-status">{jobStatus}</div>}

            {/* Load Panel */}
            {showLoadPanel && (
                <div className="taskchain-load-panel">
                    <div className="taskchain-load-panel__title">Saved Chains</div>
                    {savedChains.length === 0 ? (
                        <div className="taskchain-load-panel__empty">No saved chains yet.</div>
                    ) : (
                        savedChains.map(name => (
                            <button key={name} className="taskchain-load-panel__item" onClick={() => handleLoad(name)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="14" /><line x1="12" y1="14" x2="6" y2="20" /><line x1="12" y1="14" x2="18" y2="20" /></svg>
                                {name}
                            </button>
                        ))
                    )}
                </div>
            )}

            {/* Canvas */}
            <div className="taskchain-canvas-area" ref={canvasRef}>
                <svg className="taskchain-svg-edges" width="100%" height="100%">
                    <defs>
                        <marker id="tc-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="rgba(0,0,0,0.3)" />
                        </marker>
                    </defs>
                    {svgPaths.map((d, i) => (
                        <g key={i}>
                            {editMode && (
                                <path d={d} stroke="transparent" strokeWidth="14" fill="none" style={{ cursor: 'pointer' }}
                                    onClick={() => removeEdge(i)} />
                            )}
                            <path d={d}
                                stroke={editMode ? 'rgba(0,122,255,0.4)' : 'rgba(0,0,0,0.25)'}
                                strokeWidth="2" fill="none" markerEnd="url(#tc-arrowhead)"
                                className={editMode ? 'taskchain-edge--editable' : ''}
                                style={editMode ? { pointerEvents: 'none' } : undefined}
                            />
                        </g>
                    ))}
                </svg>

                <div className="taskchain-canvas">
                    {nodes.length === 0 && !loading && !error && (
                        <div className="taskchain-empty">
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="14" /><line x1="12" y1="14" x2="6" y2="20" /><line x1="12" y1="14" x2="18" y2="20" /></svg>
                            <h3>Top-Down Task Decomposition</h3>
                            <p>Type your high-level goal above and click Decompose. The AI will break it into prerequisite conditions and actionable steps.</p>
                        </div>
                    )}

                    {error && (
                        <div className="taskchain-empty">
                            <h3 style={{ color: '#FF3B30' }}>Error</h3>
                            <p>{error}</p>
                        </div>
                    )}

                    {nodes.map(node => (
                        <div
                            key={node.id}
                            id={`tc-${node.id}`}
                            className={[
                                'taskchain-node',
                                `taskchain-node--${node.type}`,
                                selected.has(node.id) ? 'taskchain-node--selected' : 'taskchain-node--unselected',
                                editMode ? 'taskchain-node--edit' : '',
                                linkFrom === node.id ? 'taskchain-node--link-from' : '',
                            ].filter(Boolean).join(' ')}
                            style={{ left: node.x, top: node.y }}
                            onClick={() => toggleNode(node.id)}
                            onContextMenu={(e) => handleDiagnose(node.id, e)}
                        >
                            <div className="taskchain-node__check">
                                {selected.has(node.id) ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                ) : (
                                    <div className="taskchain-node__check-empty" />
                                )}
                            </div>
                            <div className="taskchain-node__content">
                                <span className="taskchain-node__type-badge">{typeEmoji(node.type)} {node.type}</span>
                                <div className="taskchain-node__label">{node.label}</div>
                                {node.skill && (
                                    <div className="taskchain-skill-badge">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                        {node.skill}
                                    </div>
                                )}
                                {node.type === 'agent' && node.agentDivision && (
                                    <div className="taskchain-agent-badge">
                                        {divisionEmoji(node.agentDivision)} {node.agentDivision}
                                    </div>
                                )}
                                {node.type === 'action' && !node.skill && (
                                    <div className="taskchain-skill-missing" onClick={e => {
                                        e.stopPropagation();
                                        navigate(`/workforce/openclaw?search=${encodeURIComponent(node.label)}`);
                                    }}>
                                        🔍 Find Skill
                                    </div>
                                )}
                                {/* Per-node output */}
                                {nodeOutputs[node.id] && (
                                    <div className={`taskchain-node__output taskchain-node__output--${nodeOutputs[node.id].status}`}>
                                        {nodeOutputs[node.id].status === 'running' && <div className="taskchain-spinner taskchain-spinner--small" />}
                                        {nodeOutputs[node.id].passed === true && '✅ '}
                                        {nodeOutputs[node.id].passed === false && '❌ '}
                                        {node.type === 'draw' && nodeOutputs[node.id].status === 'done' && nodeOutputs[node.id].output ? (
                                            <img src={nodeOutputs[node.id].output} alt="AI Draw" className="taskchain-node__draw-img" />
                                        ) : (
                                            <>
                                                {nodeOutputs[node.id].output.slice(0, 150)}
                                                {nodeOutputs[node.id].output.length > 150 && '...'}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Diagnose Fix Panel */}
            {(diagnosing || diagResult) && (
                <div className="taskchain-fix-panel">
                    <div className="taskchain-fix-panel__header">
                        <span className="taskchain-fix-panel__title">
                            🔍 {diagnosing ? 'Diagnosing...' : 'Diagnosis'}
                            {diagNodeId && !diagnosing && (
                                <span className="taskchain-fix-panel__node"> — {nodes.find(n => n.id === diagNodeId)?.label}</span>
                            )}
                        </span>
                        {!diagnosing && (
                            <button className="taskchain-fix-panel__close" onClick={() => { setDiagResult(null); setDiagNodeId(null); }}>✕</button>
                        )}
                    </div>
                    {diagnosing ? (
                        <div className="taskchain-fix-panel__loading">
                            <div className="taskchain-spinner" /> Analyzing node execution and run history...
                        </div>
                    ) : diagResult && (
                        <div className="taskchain-fix-panel__body">
                            <div className="taskchain-fix-panel__diagnosis">{diagResult.diagnosis}</div>
                            {diagResult.fixes.length > 0 && (
                                <div className="taskchain-fix-panel__fixes">
                                    <div className="taskchain-fix-panel__fixes-title">Suggested Fixes:</div>
                                    {diagResult.fixes.map((fix, i) => (
                                        <div key={i} className="taskchain-fix-item">
                                            <div className="taskchain-fix-item__desc">
                                                {fix.type === 'update_label' && (
                                                    <><span className="taskchain-fix-item__tag taskchain-fix-item__tag--label">Label</span> Update <strong>{fix.nodeId}</strong> → "{fix.newLabel}"</>
                                                )}
                                                {fix.type === 'add_edge' && (
                                                    <><span className="taskchain-fix-item__tag taskchain-fix-item__tag--edge">+ Edge</span> {fix.from} → {fix.to}</>
                                                )}
                                                {fix.type === 'remove_edge' && (
                                                    <><span className="taskchain-fix-item__tag taskchain-fix-item__tag--remove">− Edge</span> {fix.from} → {fix.to}</>
                                                )}
                                            </div>
                                            <button className="taskchain-fix-item__apply" onClick={() => applyFix(fix)}>Apply</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Experience Log */}
            {experience && (
                <div className="taskchain-experience">
                    <div className="taskchain-experience__title">📋 Experience Log</div>
                    <pre className="taskchain-experience__content">{experience}</pre>
                </div>
            )}

            {/* Run History */}
            {runs.length > 0 && (
                <div className="taskchain-experience taskchain-experience--runs">
                    <div className="taskchain-experience__title">📜 Run History ({runs.length})</div>
                    <div className="taskchain-run-list">
                        {[...runs].reverse().map(run => (
                            <div key={run.id} className={`taskchain-run-item taskchain-run-item--${run.status}`}>
                                <div className="taskchain-run-item__header" onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}>
                                    <span className="taskchain-run-item__status">
                                        {run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : '⏹'}
                                    </span>
                                    <span className="taskchain-run-item__time">{new Date(run.timestamp).toLocaleString()}</span>
                                    <span className="taskchain-run-item__summary">{run.summary}</span>
                                    <span className="taskchain-run-item__chevron">{expandedRunId === run.id ? '▼' : '▶'}</span>
                                </div>
                                {expandedRunId === run.id && (
                                    <pre className="taskchain-run-item__log">{run.log}</pre>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* System Experience (auto-learned) */}
            {systemExperience && (
                <div className="taskchain-experience taskchain-experience--system">
                    <div className="taskchain-experience__title">🧠 System Experience</div>
                    <pre className="taskchain-experience__content">{systemExperience}</pre>
                </div>
            )}

            {/* Auto-Improvement Results */}
            {(improving || improveResult) && (
                <div className="taskchain-experience taskchain-experience--improve">
                    <div className="taskchain-experience__title">🔄 Auto-Improvement</div>
                    {improving ? (
                        <div className="taskchain-improve-progress">
                            <div className="taskchain-spinner" />
                            <span>Analyzing failures, improving skills, re-running chains... This may take a few minutes.</span>
                        </div>
                    ) : improveResult && (
                        <pre className="taskchain-experience__content">{improveResult.summary}</pre>
                    )}
                </div>
            )}

        </div>
    );
}
