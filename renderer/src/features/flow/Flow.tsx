import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import FlowTemplates from './FlowTemplates';
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

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtMs(v?: number) { if (!v || v <= 0) return ''; return v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms'; }
function fmtCost(v?: number) { if (!v || v <= 0) return ''; return '$' + v.toFixed(5); }

/**
 * Topological sort — returns layers of nodes that can execute in parallel.
 * Each layer depends only on nodes in previous layers.
 */
function topologicalSort(nodes: FlowNodeData[], edges: Edge[]): FlowNodeData[][] {
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    const nodeMap = new Map<string, FlowNodeData>();
    nodes.forEach(n => { inDeg.set(n.id, 0); adj.set(n.id, []); nodeMap.set(n.id, n); });
    edges.forEach(e => {
        if (adj.has(e.from) && inDeg.has(e.to)) {
            adj.get(e.from)!.push(e.to);
            inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
        }
    });
    const layers: FlowNodeData[][] = [];
    let queue = nodes.filter(n => (inDeg.get(n.id) || 0) === 0);
    while (queue.length > 0) {
        layers.push(queue);
        const next: FlowNodeData[] = [];
        for (const n of queue) {
            for (const toId of adj.get(n.id) || []) {
                const deg = (inDeg.get(toId) || 1) - 1;
                inDeg.set(toId, deg);
                if (deg === 0) { const node = nodeMap.get(toId); if (node) next.push(node); }
            }
        }
        queue = next;
    }
    return layers;
}

/**
 * Build input for a node: manualInput > upstream outputs > globalInput
 */
function buildNodeInput(node: FlowNodeData, edges: Edge[], outputMap: Map<string, string>, globalInput: string): string {
    if (node.manualInput.trim()) return node.manualInput.trim();
    const upstreamIds = edges.filter(e => e.to === node.id).map(e => e.from);
    const parts = upstreamIds.map(id => outputMap.get(id)).filter(Boolean) as string[];
    if (parts.length > 0) return parts.join('\n\n');
    return globalInput;
}

/**
 * Extract agent output — parses JSON to get .response field
 */
function extractAgentOutput(raw: string): string {
    try { const j = JSON.parse(raw); return j.response || j.output || raw; } catch { return raw; }
}

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
    const [showTaskFlow, setShowTaskFlow] = useState(false);
    const [paletteTools, setPaletteTools] = useState<ToolDef[]>(NATIVE_TOOLS);
    const [globalInput, setGlobalInput] = useState('');

    // ── Zoom / Pan state ─────────────────────────────────────────────────
    const [scale, setScale] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);

    // Refs that always hold the latest view values (needed inside event listeners)
    const viewRef = useRef({ scale: 1, panX: 0, panY: 0 });
    useEffect(() => { viewRef.current = { scale, panX, panY }; }, [scale, panX, panY]);

    // Fetch OpenClaw skills + installed agents dynamically
    useEffect(() => {
        Promise.all([
            api.skills().catch(() => ({ skills: [] })),
            api.agencyInstalled().catch(() => ({ agents: [] })),
        ]).then(([skillRes, agentRes]) => {
            const skillTools: ToolDef[] = (skillRes.skills || []).map(s => ({
                type: `skill:${s.name}`,
                label: `\u{1F9BE} ${s.name}`,
                cat: 'OpenClaw Skills',
                domain: 'Skill',
                func: s.description || 'Executes an OpenClaw skill',
                in: 'Parameters',
                out: 'Output'
            }));
            const agentTools: ToolDef[] = (agentRes.agents || []).map(a => ({
                type: `agent:${a.id}`,
                label: `\u{1F916} ${a.name}`,
                cat: 'Agency Agents',
                domain: a.division || 'Agent',
                func: a.description || 'Executes an Agency agent',
                in: 'Text',
                out: 'Text'
            }));
            setPaletteTools([...NATIVE_TOOLS, ...agentTools, ...skillTools]);
        });
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
    const drawingRef = useRef<{ fromId: string } | null>(null);
    const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const teleRef = useRef<HTMLDivElement>(null);

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // ── Edge rendering ──────────────────────────────────────────────────
    // Edges are drawn in screen-space on an SVG that covers the container.
    // getBoundingClientRect already accounts for CSS transforms, so edges
    // visually connect to the transformed node positions automatically.
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

    useEffect(() => { recomputeEdges(); }, [nodes, edges, scale, panX, panY, recomputeEdges]);
    useEffect(() => { if (teleRef.current) teleRef.current.scrollTop = teleRef.current.scrollHeight; }, [teleEvents]);
    // Cleanup drag listeners on unmount
    useEffect(() => () => cleanupDragListeners(), []);

    // ── Wheel: zoom (Ctrl/Cmd+wheel / pinch) & pan (plain wheel / trackpad) ──
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const v = viewRef.current;
            if (e.ctrlKey || e.metaKey) {
                // Zoom toward cursor
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const factor = 1 - e.deltaY * 0.005;
                const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
                const ratio = newScale / v.scale;
                const newPanX = mx - (mx - v.panX) * ratio;
                const newPanY = my - (my - v.panY) * ratio;
                viewRef.current = { scale: newScale, panX: newPanX, panY: newPanY };
                setScale(newScale);
                setPanX(newPanX);
                setPanY(newPanY);
            } else {
                // Pan
                const newPanX = v.panX - e.deltaX;
                const newPanY = v.panY - e.deltaY;
                viewRef.current = { ...v, panX: newPanX, panY: newPanY };
                setPanX(newPanX);
                setPanY(newPanY);
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    // ── Convert screen coords → canvas coords ───────────────────────────
    function screenToCanvas(clientX: number, clientY: number) {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        const v = viewRef.current;
        return {
            x: (clientX - rect.left - v.panX) / v.scale,
            y: (clientY - rect.top - v.panY) / v.scale,
        };
    }

    // ── Palette drag → canvas drop ──────────────────────────────────────
    function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        try {
            const tool: ToolDef = JSON.parse(data);
            const pos = screenToCanvas(e.clientX, e.clientY);
            const newNode: FlowNodeData = {
                id: `node_${++nodeCounter}`, ...tool,
                x: Math.max(0, pos.x - 100),
                y: Math.max(0, pos.y - 30),
                manualInput: '', lastOutput: '', status: '',
            };
            setNodes(prev => [...prev, newNode]);
        } catch { /* ignore */ }
    }

    // ── Cleanup any stale drag listeners ────────────────────────────────
    function cleanupDragListeners() {
        if (dragListenersRef.current) {
            document.removeEventListener('mousemove', dragListenersRef.current.move);
            document.removeEventListener('mouseup', dragListenersRef.current.up);
            dragListenersRef.current = null;
        }
        draggingRef.current = null;
    }

    // ── Node dragging (document-level so it works even over the inspector) ──
    function startNodeDrag(e: React.MouseEvent, nodeId: string) {
        if ((e.target as HTMLElement).closest('.flow-port, textarea, .flow-node-delete, .flow-node-output')) return;
        e.preventDefault();

        // Always clean up previous listeners first
        cleanupDragListeners();

        const startX = e.clientX;
        const startY = e.clientY;
        let lastX = startX;
        let lastY = startY;
        let hasMoved = false;
        draggingRef.current = { nodeId, offsetX: 0, offsetY: 0 };

        const onMove = (me: MouseEvent) => {
            if (!draggingRef.current) return;
            const dx = (me.clientX - lastX) / viewRef.current.scale;
            const dy = (me.clientY - lastY) / viewRef.current.scale;
            lastX = me.clientX;
            lastY = me.clientY;
            if (!hasMoved && Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) > 3) {
                hasMoved = true;
            }
            if (hasMoved) {
                setNodes(prev => prev.map(n =>
                    n.id === nodeId
                        ? { ...n, x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) }
                        : n
                ));
            }
        };
        const onUp = (me: MouseEvent) => {
            cleanupDragListeners();
            // If no significant movement, treat as click → select & open inspector
            if (!hasMoved) {
                selectNode(nodeId);
            }
            me.preventDefault();
        };

        dragListenersRef.current = { move: onMove, up: onUp };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ── Canvas panning (middle-button drag or Space+drag) ────────────────
    function handleCanvasAreaMouseDown(e: React.MouseEvent) {
        // Middle button → pan
        if (e.button === 1) {
            e.preventDefault();
            startPan(e.clientX, e.clientY);
        }
    }

    function startPan(startX: number, startY: number) {
        const startPanX = viewRef.current.panX;
        const startPanY = viewRef.current.panY;
        const onMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            const newPanX = startPanX + dx;
            const newPanY = startPanY + dy;
            viewRef.current = { ...viewRef.current, panX: newPanX, panY: newPanY };
            setPanX(newPanX);
            setPanY(newPanY);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // Cancel edge-drawing when mouseUp lands on empty canvas
    function handleCanvasMouseUp() { drawingRef.current = null; }

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

    // ── Zoom helpers ─────────────────────────────────────────────────────
    function zoomBy(factor: number) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const v = viewRef.current;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const ratio = newScale / v.scale;
        const newPanX = cx - (cx - v.panX) * ratio;
        const newPanY = cy - (cy - v.panY) * ratio;
        viewRef.current = { scale: newScale, panX: newPanX, panY: newPanY };
        setScale(newScale);
        setPanX(newPanX);
        setPanY(newPanY);
    }

    function zoomReset() {
        viewRef.current = { scale: 1, panX: 0, panY: 0 };
        setScale(1);
        setPanX(0);
        setPanY(0);
    }

    function zoomFit() {
        if (nodes.length === 0) return;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const pad = 60;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + 200);
            maxY = Math.max(maxY, n.y + 140);
        });
        const cw = maxX - minX + pad * 2;
        const ch = maxY - minY + pad * 2;
        const ns = Math.min(1.5, rect.width / cw, rect.height / ch);
        const npx = (rect.width - cw * ns) / 2 - minX * ns + pad * ns;
        const npy = (rect.height - ch * ns) / 2 - minY * ns + pad * ns;
        viewRef.current = { scale: ns, panX: npx, panY: npy };
        setScale(ns);
        setPanX(npx);
        setPanY(npy);
    }

    // ── Per-node-type execution adapter ────────────────────────────────
    async function executeNode(node: FlowNodeData, input: string): Promise<string> {
        const nodeType = node.type;

        if (nodeType === 'chat') {
            const res = await api.aiChat({ prompt: input });
            return res.response || '';
        }

        if (nodeType === 'draw') {
            // Use task-chain run-step which handles draw
            const res = await api.taskChainRunStep({
                nodeId: node.id, nodeLabel: node.label, nodeType: 'draw',
                previousOutput: input, accumulatedContext: input,
            });
            return res.output || '';
        }

        if (nodeType === 'search') {
            // Use task-chain run-step for search
            const res = await api.taskChainRunStep({
                nodeId: node.id, nodeLabel: node.label, nodeType: 'action',
                previousOutput: input, chainGoal: `Search: ${input}`,
            });
            return res.output || '';
        }

        if (nodeType === 'display') {
            return input; // pass-through
        }

        if (nodeType === 'video') {
            const res = await api.taskChainRunStep({
                nodeId: node.id, nodeLabel: node.label, nodeType: 'action',
                previousOutput: input, chainGoal: `Generate video: ${input}`,
            });
            return res.output || '';
        }

        // Agent type (from Agency)
        if (nodeType.startsWith('agent:')) {
            const agentId = nodeType.replace('agent:', '');
            const res = await api.agencyExecute(agentId, input);
            return extractAgentOutput(res.execution.output);
        }

        // Skill type
        if (nodeType.startsWith('skill:')) {
            const skillName = nodeType.replace('skill:', '');
            const res = await api.skillsExecute({ name: skillName, input });
            return res.result || '';
        }

        // Fallback: use LLM chat
        const res = await api.aiChat({ prompt: input });
        return res.response || '';
    }

    // ── Execution (client-side topological) ──────────────────────────
    const abortRef = useRef(false);

    async function runFlow() {
        if (nodes.length === 0) return;
        abortRef.current = false;
        setRunning(true);
        setTeleEvents([]);

        // Reset all node status
        setNodes(prev => prev.map(n => ({ ...n, status: '' as const, lastOutput: '' })));

        const outputMap = new Map<string, string>();
        const layers = topologicalSort(nodesRef.current, edgesRef.current);
        const startTime = Date.now();

        try {
            for (const layer of layers) {
                if (abortRef.current) break;

                // Mark layer nodes as running
                setNodes(prev => prev.map(n =>
                    layer.some(ln => ln.id === n.id) ? { ...n, status: 'running' as const } : n
                ));

                // Execute layer in parallel
                const results = await Promise.all(layer.map(async (node) => {
                    if (abortRef.current) return { id: node.id, output: '', error: true };
                    const input = buildNodeInput(node, edgesRef.current, outputMap, globalInput);
                    const nodeStart = Date.now();

                    // Add telemetry event (running)
                    setTeleEvents(prev => [...prev, {
                        node_id: node.id, tool: node.type, status: 'running',
                        context: { label: node.label },
                    }]);

                    try {
                        const output = await executeNode(node, input);
                        const latency = Date.now() - nodeStart;
                        outputMap.set(node.id, output);

                        // Update telemetry
                        setTeleEvents(prev => prev.map(ev =>
                            ev.node_id === node.id ? { ...ev, status: 'success', latency_ms: latency } : ev
                        ));

                        return { id: node.id, output, error: false };
                    } catch (err: any) {
                        const latency = Date.now() - nodeStart;
                        setTeleEvents(prev => prev.map(ev =>
                            ev.node_id === node.id ? { ...ev, status: 'error', latency_ms: latency } : ev
                        ));
                        return { id: node.id, output: `Error: ${err.message}`, error: true };
                    }
                }));

                // Update node statuses and outputs
                setNodes(prev => prev.map(n => {
                    const r = results.find(r => r.id === n.id);
                    if (!r) return n;
                    return { ...n, status: r.error ? 'error' as const : 'done' as const, lastOutput: r.output };
                }));
            }
        } catch (e: any) {
            console.error('Flow execution error:', e);
        } finally {
            setRunning(false);
            setRunId(`flow-${Date.now() - startTime}ms`);
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

    function abortFlow() {
        abortRef.current = true;
        setRunning(false);
    }

    return (
        <div className={`flow-page${showTaskFlow ? '' : ' flow-page--no-taskflow'}`}>
            {/* Header */}
            <div className="flow-header">
                <div>
                    <h1 className="flow-header__title">Flow Builder</h1>
                    <p className="flow-header__sub">Drag tools onto the canvas and connect them</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                    <input
                        className="flow-global-input os-input"
                        placeholder="Enter your goal — all nodes share this input..."
                        value={globalInput}
                        onChange={e => setGlobalInput(e.target.value)}
                    />
                    <FlowTemplates onApply={(tplNodes, tplEdges) => {
                        setNodes(tplNodes.map(n => ({
                            ...n,
                            status: '' as const,
                        })));
                        setEdges(tplEdges);
                        // Auto-fit after applying template
                        setTimeout(() => zoomFit(), 50);
                    }} />
                    <button className="btn btn-ghost" style={{ fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setShowTaskFlow(v => !v)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                        {showTaskFlow ? 'Hide' : 'Show'} Task Flow
                    </button>
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
                onMouseDown={handleCanvasAreaMouseDown}>
                <svg className="flow-svg-edges" width="100%" height="100%">
                    {svgPaths.map((d, i) => <path key={i} d={d} stroke="rgba(0,0,0,0.5)" strokeWidth="3" fill="none" />)}
                </svg>
                <div className="flow-canvas"
                    style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }}
                    onMouseUp={handleCanvasMouseUp}>
                    {nodes.length === 0 && (
                        <div className="flow-canvas-empty">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>
                            <span>Drag tools from the palette to build your flow</span>
                        </div>
                    )}
                    {nodes.map(node => (
                        <div key={node.id} id={node.id}
                            className={`flow-node glass-card${selectedId === node.id ? ' flow-node--selected' : ''}`}
                            data-status={node.status || undefined}
                            style={{ left: node.x, top: node.y, ...nodeGlow(node.status) }}
                            onMouseDown={e => startNodeDrag(e, node.id)}>
                            {node.status && <div className={`flow-node__status-dot flow-node__status-dot--${node.status}`} />}
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

                {/* Zoom controls — floating inside canvas area */}
                <div className="flow-zoom-bar">
                    <button className="flow-zoom-btn" onClick={() => zoomBy(0.8)} title="Zoom out">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <span className="flow-zoom-pct" onClick={zoomReset} title="Reset zoom">{Math.round(scale * 100)}%</span>
                    <button className="flow-zoom-btn" onClick={() => zoomBy(1.25)} title="Zoom in">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <button className="flow-zoom-btn" onClick={zoomFit} title="Fit to content">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                    </button>
                </div>
            </div>

            {/* Right: AI Task Flow (telemetry) */}
            {showTaskFlow && <div className="flow-taskflow glass-card">
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
            </div>}

            {/* Protocol Inspector — scoped to canvas area */}
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
