import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import './Graph.css';

interface GraphNode { id: string; label: string; type: string; x: number; y: number; vx: number; vy: number; fx?: number | null; fy?: number | null; }
interface GraphEdge { source: string; target: string; }

const COLORS = ['#5E81F4', '#56CFE1', '#FF9F7F', '#FFD166', '#06D6A0', '#EF476F', '#118AB2', '#8338EC', '#FB5607', '#3A86FF'];

function colorForType(type: string): string {
    let hash = 0;
    for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Graph() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState<string | null>(null);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const animRef = useRef<number>(0);
    const nodesRef = useRef<GraphNode[]>([]);
    const edgesRef = useRef<GraphEdge[]>([]);

    useEffect(() => {
        setLoading(true);
        api.graph().then(data => {
            const w = 800, h = 600;
            const gNodes: GraphNode[] = (data.nodes ?? []).map((n: any, i: number) => ({
                id: n.id, label: n.label ?? n.id, type: n.type ?? 'default',
                x: w / 2 + (Math.random() - 0.5) * 400,
                y: h / 2 + (Math.random() - 0.5) * 300,
                vx: 0, vy: 0,
            }));
            const gEdges: GraphEdge[] = (data.edges ?? []).map((e: any) => ({
                source: typeof e.source === 'object' ? e.source.id : e.source,
                target: typeof e.target === 'object' ? e.target.id : e.target,
            }));
            setNodes(gNodes);
            setEdges(gEdges);
            nodesRef.current = gNodes;
            edgesRef.current = gEdges;
        }).catch(e => setError(e.message)).finally(() => setLoading(false));
    }, []);

    // Force simulation
    const simulate = useCallback(() => {
        const ns = nodesRef.current;
        const es = edgesRef.current;
        if (!ns.length) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.width;
        const h = canvas.height;

        // Apply forces
        // Center gravity
        for (const n of ns) {
            if (n.fx != null) { n.x = n.fx; n.y = n.fy!; n.vx = 0; n.vy = 0; continue; }
            n.vx += (w / 2 - n.x) * 0.001;
            n.vy += (h / 2 - n.y) * 0.001;
        }

        // Repulsion
        for (let i = 0; i < ns.length; i++) {
            for (let j = i + 1; j < ns.length; j++) {
                const dx = ns[j].x - ns[i].x;
                const dy = ns[j].y - ns[i].y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const force = 300 / (dist * dist);
                const fx = dx / dist * force;
                const fy = dy / dist * force;
                if (ns[i].fx == null) { ns[i].vx -= fx; ns[i].vy -= fy; }
                if (ns[j].fx == null) { ns[j].vx += fx; ns[j].vy += fy; }
            }
        }

        // Spring (edges)
        const nodeMap = new Map(ns.map(n => [n.id, n]));
        for (const e of es) {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t) continue;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = (dist - 120) * 0.005;
            const fx = dx / dist * force;
            const fy = dy / dist * force;
            if (s.fx == null) { s.vx += fx; s.vy += fy; }
            if (t.fx == null) { t.vx -= fx; t.vy -= fy; }
        }

        // Integrate + damping
        for (const n of ns) {
            if (n.fx != null) continue;
            n.vx *= 0.85;
            n.vy *= 0.85;
            n.x += n.vx;
            n.y += n.vy;
            n.x = Math.max(20, Math.min(w - 20, n.x));
            n.y = Math.max(20, Math.min(h - 20, n.y));
        }

        // Draw
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);

        // Edges
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        for (const e of es) {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t) continue;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
        }

        // Nodes
        for (const n of ns) {
            const color = colorForType(n.type);
            ctx.beginPath();
            ctx.arc(n.x, n.y, 15, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#ddd';
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillText(n.label, n.x + 20, n.y + 4);
        }

        animRef.current = requestAnimationFrame(simulate);
    }, []);

    useEffect(() => {
        if (nodes.length > 0) {
            nodesRef.current = nodes;
            edgesRef.current = edges;
            animRef.current = requestAnimationFrame(simulate);
        }
        return () => cancelAnimationFrame(animRef.current);
    }, [nodes, edges, simulate]);

    function handleMouseDown(e: React.MouseEvent) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const n of nodesRef.current) {
            const dx = mx - n.x, dy = my - n.y;
            if (dx * dx + dy * dy < 225) {
                n.fx = n.x;
                n.fy = n.y;
                setDragging(n.id);
                return;
            }
        }
    }

    function handleMouseMove(e: React.MouseEvent) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (dragging) {
            const n = nodesRef.current.find(n => n.id === dragging);
            if (n) { n.fx = mx; n.fy = my; n.x = mx; n.y = my; }
        }

        // Hover detection
        let found: GraphNode | null = null;
        for (const n of nodesRef.current) {
            const dx = mx - n.x, dy = my - n.y;
            if (dx * dx + dy * dy < 225) { found = n; break; }
        }
        setHoveredNode(found);
    }

    function handleMouseUp() {
        if (dragging) {
            const n = nodesRef.current.find(n => n.id === dragging);
            if (n) { n.fx = null; n.fy = null; }
            setDragging(null);
        }
    }

    return (
        <div className="graph-page">
            <div className="graph-header">
                <div>
                    <h1 className="graph-header__title">System Graph</h1>
                    <p className="graph-header__sub">Visualize system component relationships</p>
                </div>
            </div>
            <div className="graph-body">
                {loading ? (
                    <div className="empty-state"><div className="spinner" /><span>Loading graph data...</span></div>
                ) : error ? (
                    <div className="empty-state"><span>Error: {error}</span></div>
                ) : nodes.length === 0 ? (
                    <div className="empty-state">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>
                        <span>No graph data available</span>
                    </div>
                ) : (
                    <div className="graph-canvas-wrap glass-card">
                        <canvas ref={canvasRef} width={900} height={600} className="graph-canvas"
                            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                            style={{ cursor: dragging ? 'grabbing' : hoveredNode ? 'grab' : 'default' }} />
                        {hoveredNode && (
                            <div className="graph-tooltip">
                                <strong>{hoveredNode.label}</strong>
                                <span>Type: {hoveredNode.type}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
