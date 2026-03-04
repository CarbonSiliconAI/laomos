import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import './Flow.css';

// ── Types ───────────────────────────────────────────────────────────────────
interface FlowNodeData {
    id: string;
    type: string;
    label: string;
    cat: string;
    domain: string;
    func: string;
    in: string;
    out: string;
    x: number;
    y: number;
    manualInput: string;
    lastOutput: string;
    status: '' | 'running' | 'done' | 'error';
}

interface Edge { from: string; to: string; }

interface ToolDef {
    type: string; label: string; cat: string; domain: string;
    func: string; in: string; out: string;
}

interface TeleEvent {
    node_id: string; tool: string; status: string; model?: string;
    latency_ms?: number; cost_usd?: number;
    context?: { label?: string; cache_hit?: boolean; model_selected_reason?: string };
}

// ── Default Native Tools ────────────────────────────────────────────────────
const NATIVE_TOOLS: ToolDef[] = [
    { type: 'chat', label: '\u{1F4AC} Ollama Chat', cat: 'Native AI', domain: 'General', func: 'Local LLM text generation', in: 'Text', out: 'Text' },
    { type: 'draw', label: '\u{1F3A8} AI Draw', cat: 'Native AI', domain: 'Art', func: 'Generates images from prompts', in: 'Text', out: 'Image URL' },
    { type: 'video', label: '\u{1F3AC} AI Video', cat: 'Native AI', domain: 'Media', func: 'Generates video clips', in: 'Text', out: 'Video Stream' },
    { type: 'search', label: '\u{1F50D} Web Search', cat: 'Search & Tools', domain: 'General', func: 'Queries real-time web data', in: 'Search Query', out: 'JSON Results' },
    { type: 'display', label: '\u{1F441} Input Display', cat: 'Utility', domain: 'General', func: 'Displays ingested input', in: 'Any', out: 'Same as Input' },
];

let nodeCounter = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtMs(v?: number) { if (!v || v <= 0) return ''; return v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms'; }
function fmtCost(v?: number) { if (!v || v <= 0) return ''; return '$' + v.toFixed(5); }

// ── Component ───────────────────────────────────────────────────────────────
export default function Flow() {
    const [nodes, setNodes] = useState<FlowNodeData[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [saved, setSaved] = useState(false);
    const [running, setRunning] = useState(false);
    const [teleEvents, setTeleEvents] = useState<TeleEvent[]>([]);
    const [runId, setRunId] = useState('');
    const [svgPaths, setSvgPaths] = useState<string[]>([]);
    const [paletteTools, setPaletteTools] = useState<ToolDef[]>(NATIVE_TOOLS);

    // Fetch OpenClaw skills dynamically
    useEffect(() => {
        api.skills().then(res => {
            const skillTools = (res.skills || []).map(s => ({
                type: `skill:${s.name}`,
                label: `\u{1F9BE} ${s.name}`,
                cat: 'OpenClaw Skills',
                domain: 'Skill',
                func: s.description || 'Executes an OpenClaw skill',
                in: 'Parameters',
                out: 'Output'
            }));
            setPaletteTools([...NATIVE_TOOLS, ...skillTools]);
        }).catch(err => console.error('Failed to load skills for Flow UI', err));
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
    const drawingRef = useRef<{ fromId: string } | null>(null);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const teleRef = useRef<HTMLDivElement>(null);

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // ── Edge rendering ──────────────────────────────────────────────────
    const recomputeEdges = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cRect = container.getBoundingClientRect();
        const paths: string[] = [];
        edgesRef.current.forEach(edge => {
            const fromEl = document.getElementById(edge.from);
            const toEl = document.getElementById(edge.to);
            if (!fromEl || !toEl) return;
            const fR = fromEl.getBoundingClientRect();
            const tR = toEl.getBoundingClientRect();
            const x1 = fR.right - cRect.left + 6;
            const y1 = fR.top - cRect.top + fR.height / 2;
            const x2 = tR.left - cRect.left - 6;
            const y2 = tR.top - cRect.top + tR.height / 2;
            const curve = Math.abs(x2 - x1) * 0.5;
            paths.push(`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
        });
        setSvgPaths(paths);
    }, []);

    useEffect(() => { recomputeEdges(); }, [nodes, edges, recomputeEdges]);
    useEffect(() => { if (teleRef.current) teleRef.current.scrollTop = teleRef.current.scrollHeight; }, [teleEvents]);

    // ── Palette drag → canvas drop ──────────────────────────────────────
    function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        try {
            const tool: ToolDef = JSON.parse(data);
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const newNode: FlowNodeData = {
                id: `node_${++nodeCounter}`, ...tool,
                x: Math.max(0, e.clientX - rect.left - 100),
                y: Math.max(0, e.clientY - rect.top - 30),
                manualInput: '', lastOutput: '', status: '',
            };
            setNodes(prev => [...prev, newNode]);
        } catch { /* ignore */ }
    }

    // ── Node dragging ───────────────────────────────────────────────────
    function startNodeDrag(e: React.MouseEvent, nodeId: string) {
        if ((e.target as HTMLElement).closest('.flow-port, textarea, .flow-node-delete, .flow-node-output')) return;
        const el = document.getElementById(nodeId);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        draggingRef.current = { nodeId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    }

    function handleCanvasMouseMove(e: React.MouseEvent) {
        const drag = draggingRef.current;
        const container = containerRef.current;
        if (!drag || !container) return;
        const cRect = container.getBoundingClientRect();
        const newX = Math.max(0, e.clientX - cRect.left - drag.offsetX);
        const newY = Math.max(0, e.clientY - cRect.top - drag.offsetY);
        setNodes(prev => prev.map(n => n.id === drag.nodeId ? { ...n, x: newX, y: newY } : n));
    }

    function handleCanvasMouseUp() { draggingRef.current = null; drawingRef.current = null; }

    // ── Edge creation ───────────────────────────────────────────────────
    function startEdge(e: React.MouseEvent, fromId: string) { e.stopPropagation(); drawingRef.current = { fromId }; }
    function finishEdge(e: React.MouseEvent, toId: string) {
        e.stopPropagation();
        const d = drawingRef.current;
        if (!d || d.fromId === toId) return;
        if (!edgesRef.current.some(ed => ed.from === d.fromId && ed.to === toId))
            setEdges(prev => [...prev, { from: d.fromId, to: toId }]);
        drawingRef.current = null;
    }

    // ── Node operations ─────────────────────────────────────────────────
    function deleteNode(id: string) {
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
        if (selectedId === id) { setSelectedId(null); setInspectorOpen(false); }
    }

    function updateNodeField(id: string, field: keyof FlowNodeData, val: string) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: val } : n));
    }

    function selectNode(id: string) { setSelectedId(id); setInspectorOpen(true); setSaved(false); }
    function closeInspector() { setInspectorOpen(false); setSelectedId(null); }
    function saveProtocol() { setSaved(true); setTimeout(() => setSaved(false), 1500); }

    // ── Execution ───────────────────────────────────────────────────────
    async function runFlow() {
        if (nodes.length === 0) return;
        setRunning(true);
        setTeleEvents([]);

        // Reset node status
        setNodes(prev => prev.map(n => ({ ...n, status: '' as const, lastOutput: '' })));

        try {
            // 1. Submit to kernel
            const res = await api.kernelRun({ nodes: nodesRef.current, edges: edgesRef.current }) as any;
            const jobId = res.jobId;
            const rid = res.runId || '';
            setRunId(rid);
            if (!jobId) throw new Error('Failed to start job.');

            // 2. SSE telemetry stream
            let es: EventSource | null = null;
            if (rid) {
                es = new EventSource(`/api/telemetry/stream?runId=${encodeURIComponent(rid)}`);
                es.onmessage = (e) => {
                    try {
                        const ev: TeleEvent = JSON.parse(e.data);
                        setTeleEvents(prev => {
                            const existing = prev.findIndex(p => p.node_id === ev.node_id);
                            if (existing >= 0) {
                                const copy = [...prev];
                                copy[existing] = ev;
                                return copy;
                            }
                            return [...prev, ev];
                        });
                    } catch { /* ignore parse errors */ }
                };
                es.onerror = () => es?.close();
            }

            // 3. Poll job status for node highlighting + output
            let polling = true;
            while (polling) {
                await new Promise(r => setTimeout(r, 500));
                try {
                    const jobState = await api.kernelStatus(jobId) as any;

                    if (jobState.tasks) {
                        setNodes(prev => prev.map(n => {
                            const task = jobState.tasks[n.id];
                            if (!task) return n;
                            let status: '' | 'running' | 'done' | 'error' = '';
                            if (task.status === 'WAITING' || task.status === 'RUNNING') status = 'running';
                            else if (task.status === 'DONE') status = 'done';
                            else if (task.status === 'ERROR') status = 'error';
                            return {
                                ...n,
                                status,
                                lastOutput: task.output || n.lastOutput,
                            };
                        }));
                    }

                    if (jobState.status === 'COMPLETED' || jobState.status === 'FAILED') {
                        polling = false;
                        if (es) es.close();
                    }
                } catch {
                    polling = false;
                    if (es) es.close();
                }
            }
        } catch (e: any) {
            console.error('Kernel execution error:', e);
        } finally {
            setRunning(false);
        }
    }

    const selectedNode = nodes.find(n => n.id === selectedId);

    // Node glow style based on status
    function nodeGlow(status: string): React.CSSProperties {
        switch (status) {
            case 'running': return { boxShadow: '0 0 14px rgba(255,200,80,0.5)', borderColor: 'rgba(255,200,80,0.8)' };
            case 'done': return { boxShadow: '0 0 14px rgba(100,220,100,0.4)', borderColor: 'rgba(100,220,100,0.7)' };
            case 'error': return { boxShadow: '0 0 14px rgba(255,100,80,0.4)', borderColor: 'rgba(255,100,80,0.7)' };
            default: return {};
        }
    }

    function teleStatusColor(s: string) {
        if (s === 'running') return '#F59E0B';
        if (s === 'success') return '#34C759';
        if (s === 'error') return '#FF3B30';
        return '#888';
    }

    async function abortFlow() {
        if (!runId) return;
        try {
            await api.kernelAbort(runId);
        } catch (e) {
            console.error('Failed to abort flow:', e);
        }
        setRunning(false);
    }

    return (
        <div className="flow-page">
            {/* Header */}
            <div className="flow-header">
                <div>
                    <h1 className="flow-header__title">Flow Builder</h1>
                    <p className="flow-header__sub">Drag tools onto the canvas and connect them</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={runFlow} disabled={running || nodes.length === 0}>
                        {running ? <><div className="spinner" /> Running...</> : <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            Run Graph
                        </>}
                    </button>
                    {running && (
                        <button className="btn btn-danger" onClick={abortFlow} style={{ background: '#FF3B30', color: '#fff', border: 'none' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Left: Tool Palette */}
            <div className="flow-palette glass-card">
                <div className="section-title">Tool Palette</div>
                <div className="flow-palette-list">
                    {Array.from(new Set(paletteTools.map(t => t.cat))).map(cat => (
                        <div key={cat} className="flow-palette-cat-box">
                            <div className="flow-palette-cat-title">{cat}</div>
                            {paletteTools.filter(t => t.cat === cat).map(tool => (
                                <div key={tool.type} className="flow-palette-item" draggable
                                    onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', JSON.stringify(tool)); }}>
                                    <span className="flow-palette-item__label">{tool.label}</span>
                                    <span className="flow-palette-item__desc">{tool.func}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: Canvas */}
            <div className="flow-canvas-area" ref={containerRef}
                onDragOver={handleDragOver} onDrop={handleDrop}
                onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
                <svg className="flow-svg-edges" width="100%" height="100%">
                    {svgPaths.map((d, i) => <path key={i} d={d} stroke="rgba(0,0,0,0.5)" strokeWidth="3" fill="none" />)}
                </svg>
                <div className="flow-canvas">
                    {nodes.length === 0 && (
                        <div className="flow-canvas-empty">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>
                            <span>Drag tools from the palette to build your flow</span>
                        </div>
                    )}
                    {nodes.map(node => (
                        <div key={node.id} id={node.id}
                            className={`flow-node glass-card${selectedId === node.id ? ' flow-node--selected' : ''}`}
                            style={{ left: node.x, top: node.y, ...nodeGlow(node.status) }}
                            onMouseDown={e => { selectNode(node.id); startNodeDrag(e, node.id); }}>
                            <div className="flow-node__label">
                                {node.label}
                                <button className="flow-node-delete" title="Remove"
                                    onClick={e => { e.stopPropagation(); deleteNode(node.id); }}>&times;</button>
                            </div>
                            <textarea className="flow-node__input os-input" placeholder="Enter input..."
                                value={node.manualInput}
                                onChange={e => updateNodeField(node.id, 'manualInput', e.target.value)}
                                onMouseDown={e => e.stopPropagation()} rows={2} />
                            {/* Output display */}
                            {node.lastOutput && (
                                <div className="flow-node-output" onMouseDown={e => e.stopPropagation()}>
                                    {node.lastOutput.startsWith('http') || node.lastOutput.startsWith('/api/')
                                        ? <img src={node.lastOutput} alt="output" className="flow-node-output__img" />
                                        : <div className="flow-node-output__text">{node.lastOutput}</div>
                                    }
                                </div>
                            )}
                            <div className="flow-node__ports">
                                <div className="flow-port flow-port--in" onMouseUp={e => finishEdge(e, node.id)} title="Input" />
                                <div className="flow-port flow-port--out" onMouseDown={e => startEdge(e, node.id)} title="Output" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: AI Task Flow (telemetry) */}
            <div className="flow-taskflow glass-card">
                <div className="section-title">AI Task Flow</div>
                <div className="flow-tele-feed" ref={teleRef}>
                    {teleEvents.length === 0 ? (
                        <div className="flow-tele-empty">Execution trace will appear here...</div>
                    ) : teleEvents.map((ev, i) => {
                        const c = teleStatusColor(ev.status);
                        const label = ev.context?.label?.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim() || ev.node_id;
                        const icon = ev.status === 'success' ? '\u2713' : ev.status === 'error' ? '\u2717' : '\u2026';
                        return (
                            <div key={ev.node_id + i} className="flow-tele-ev" style={{ borderLeftColor: c }}>
                                <div className="flow-tele-ev__row">
                                    <span className="flow-tele-dot" style={{ background: c }} />
                                    <span className="flow-tele-label">{label}</span>
                                    <span className="flow-tele-tool">{ev.tool}</span>
                                    {ev.model && <span className="flow-tele-model">{ev.model}</span>}
                                    {ev.context?.cache_hit && <span className="flow-tele-cache">CACHE</span>}
                                    <span className="flow-tele-ms">{fmtMs(ev.latency_ms)}</span>
                                    {fmtCost(ev.cost_usd) && <span className="flow-tele-cost">{fmtCost(ev.cost_usd)}</span>}
                                    <span className="flow-tele-icon" style={{ color: c }}>{icon}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Protocol Inspector */}
            {inspectorOpen && selectedNode && (
                <div className="flow-inspector">
                    <div className="flow-inspector__header">
                        <span className="flow-inspector__title">Protocol Inspector</span>
                        <button className="btn btn-ghost flow-inspector__close" onClick={closeInspector}>&times;</button>
                    </div>
                    <div className="flow-inspector__body">
                        <div className="flow-inspector__col">
                            <label className="flow-inspector__label">Agent Category</label>
                            <select className="os-input" value={selectedNode.cat}
                                onChange={e => updateNodeField(selectedNode.id, 'cat', e.target.value)}>
                                {['Conversational', 'Generative', 'Vision', 'Planning', 'Tools', 'Search', 'Utility'].map(o =>
                                    <option key={o} value={o}>{o}</option>)}
                            </select>
                            <label className="flow-inspector__label">Vertical Domain</label>
                            <input className="os-input" value={selectedNode.domain}
                                onChange={e => updateNodeField(selectedNode.id, 'domain', e.target.value)} placeholder="e.g., General, Art, Coding" />
                            <label className="flow-inspector__label">Functionality</label>
                            <textarea className="os-input" rows={2} value={selectedNode.func}
                                onChange={e => updateNodeField(selectedNode.id, 'func', e.target.value)} placeholder="Describe what this agent does..." />
                        </div>
                        <div className="flow-inspector__col">
                            <label className="flow-inspector__label">Input Format</label>
                            <input className="os-input" value={selectedNode.in}
                                onChange={e => updateNodeField(selectedNode.id, 'in', e.target.value)} placeholder="e.g., Text Prompt" />
                            <label className="flow-inspector__label">Output Format</label>
                            <input className="os-input" value={selectedNode.out}
                                onChange={e => updateNodeField(selectedNode.id, 'out', e.target.value)} placeholder="e.g., Markdown Text" />
                            <button className={`btn ${saved ? 'btn-ghost' : 'btn-primary'} flow-inspector__save`}
                                onClick={saveProtocol}>{saved ? 'Saved!' : 'Save Protocol Status'}</button>
                        </div>
                        <div className="flow-inspector__col flow-inspector__col--wide">
                            <label className="flow-inspector__label">
                                {selectedNode.cat === 'OpenClaw Skills' ? 'Preset Input Words / Parameters' : 'Manual Input Value'}
                                <span className="flow-inspector__hint">
                                    {selectedNode.cat === 'OpenClaw Skills'
                                        ? ' (Parameters passed into this OpenClaw skill)'
                                        : ' (Overrides incoming connections)'}
                                </span>
                            </label>
                            <textarea className="os-input mono" rows={3} value={selectedNode.manualInput}
                                onChange={e => updateNodeField(selectedNode.id, 'manualInput', e.target.value)}
                                placeholder={selectedNode.cat === 'OpenClaw Skills' ? 'e.g., search keywords' : "Start execution with this input..."} />
                            <label className="flow-inspector__label">Last Output Value</label>
                            <textarea className="os-input mono" rows={3} value={selectedNode.lastOutput} readOnly
                                placeholder="Output will appear here after run..." />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
