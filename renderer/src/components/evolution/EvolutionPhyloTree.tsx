import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEvolutionEvents, useEvolutionStats } from '../../lib/evolution';
import type { EvolutionEvent, EvolutionOutcome, SourceType } from '../../lib/evolution/types';
import { computeShannonMetrics } from '../../lib/evolution/shannon';
import './EvolutionPhyloTree.css';

// ── Tree node interface ──
interface TreeNode {
  id: string;
  label: string;
  type: 'root' | 'source_type' | 'source' | 'event';
  sourceType?: SourceType;
  outcome?: EvolutionOutcome;
  cost_usd?: number;
  latency_ms?: number;
  timestamp?: string;
  errorType?: string;
  strategy?: string;
  sourceName?: string;
  eventCount?: number;
  children: TreeNode[];
}

// ── Layout node (tree node with computed position) ──
interface LayoutNode extends TreeNode {
  x: number;
  y: number;
  depth: number;
  angle: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
}

// ── Particle for edge animation ──
interface Particle {
  link: LayoutLink;
  progress: number;
  speed: number;
}

// ── Node colors — light Liquid Glass theme ──
function getNodeColor(node: LayoutNode): string {
  if (node.type === 'root') return '#6366f1';
  if (node.type === 'source_type') {
    if (node.sourceType === 'flow_node') return '#4f46e5';
    if (node.sourceType === 'agent')     return '#059669';
    if (node.sourceType === 'skill')     return '#d97706';
  }
  if (node.type === 'source') {
    if (node.sourceType === 'flow_node') return '#6366f1';
    if (node.sourceType === 'agent')     return '#10b981';
    if (node.sourceType === 'skill')     return '#f59e0b';
  }
  if (node.outcome === 'success')  return '#059669';
  if (node.outcome === 'failure')  return '#dc2626';
  if (node.outcome === 'fallback') return '#d97706';
  return '#6b7280';
}

function getNodeRadius(node: LayoutNode): number {
  if (node.type === 'root') return 14;
  if (node.type === 'source_type') return 10;
  if (node.type === 'source') return 7;
  return 2.5 + Math.sqrt((node.cost_usd || 0.01) * 1000) * 1;
}

// ── Build tree from flat events ──
function buildTree(events: EvolutionEvent[]): TreeNode {
  const typeMap: Record<string, Record<string, EvolutionEvent[]>> = {};

  events.forEach(e => {
    if (!typeMap[e.source_type]) typeMap[e.source_type] = {};
    if (!typeMap[e.source_type][e.source_name]) typeMap[e.source_type][e.source_name] = [];
    typeMap[e.source_type][e.source_name].push(e);
  });

  const TYPE_LABELS: Record<string, string> = {
    flow_node: 'Flow Nodes',
    agent: 'Agents',
    skill: 'Skills',
  };

  const children: TreeNode[] = Object.entries(typeMap).map(([type, sources]) => ({
    id: type,
    label: TYPE_LABELS[type] || type,
    type: 'source_type' as const,
    sourceType: type as SourceType,
    children: Object.entries(sources).map(([name, evts]) => ({
      id: `${type}_${name}`,
      label: name,
      type: 'source' as const,
      sourceType: type as SourceType,
      eventCount: evts.length,
      children: evts.map(ev => ({
        id: ev.event_id,
        label: ev.trigger.error_type,
        type: 'event' as const,
        sourceType: ev.source_type,
        outcome: ev.outcome,
        cost_usd: ev.cost_usd,
        latency_ms: ev.latency_ms,
        timestamp: ev.timestamp,
        errorType: ev.trigger.error_type,
        strategy: ev.candidates[ev.selected ?? 0]?.strategy || 'unknown',
        sourceName: ev.source_name,
        children: [],
      })),
    })),
  }));

  return { id: 'root', label: 'LaoMOS', type: 'root', children };
}

// ── Radial layout algorithm ──
function computeRadialLayout(
  tree: TreeNode,
  width: number,
  height: number
): { nodes: LayoutNode[]; links: LayoutLink[] } {
  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const maxDepth = 3; // root → source_type → source → event
  // Use the smaller dimension so the tree is always circular (not elliptical)
  const side = Math.min(width, height);
  const layerRadius = side / 2 / maxDepth * 0.85;

  function traverse(
    node: TreeNode,
    depth: number,
    angleStart: number,
    angleEnd: number,
    parent: LayoutNode | null
  ) {
    const angle = (angleStart + angleEnd) / 2;
    const radius = depth * layerRadius;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    const layoutNode: LayoutNode = {
      ...node,
      x, y, depth, angle,
      children: [] as any,
    };
    nodes.push(layoutNode);

    if (parent) {
      links.push({ source: parent, target: layoutNode });
    }

    if (node.children?.length) {
      const sliceSize = (angleEnd - angleStart) / node.children.length;
      node.children.forEach((child, i) => {
        traverse(
          child,
          depth + 1,
          angleStart + i * sliceSize,
          angleStart + (i + 1) * sliceSize,
          layoutNode
        );
      });
    }
  }

  traverse(tree, 0, 0, Math.PI * 2, null);
  return { nodes, links };
}

// ── Create particles ──
function createParticles(links: LayoutLink[], count: number = 60): Particle[] {
  if (links.length === 0) return [];
  return Array.from({ length: count }, () => {
    const link = links[Math.floor(Math.random() * links.length)];
    return {
      link,
      progress: Math.random(),
      speed: 0.002 + Math.random() * 0.004,
    };
  });
}

// ── Main Component ──
export default function EvolutionPhyloTree() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<LayoutNode[]>([]);
  const linksRef = useRef<LayoutLink[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 900 });
  const [canvasReady, setCanvasReady] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Zoom/pan state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const wasPanningRef = useRef(false);

  // Reduced motion
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const { events, loading } = useEvolutionEvents();
  useEvolutionStats();

  // Build tree and layout
  const tree = useMemo(() => events ? buildTree(events) : null, [events]);
  const shannonMetrics = useMemo(() => events ? computeShannonMetrics(events) : null, [events]);

  // Keep transformRef in sync
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Layout computation
  useEffect(() => {
    if (!tree) return;
    setCanvasReady(false);
    const { nodes, links } = computeRadialLayout(tree, canvasSize.width, canvasSize.height);
    nodesRef.current = nodes;
    linksRef.current = links;
    particlesRef.current = createParticles(links, 80);
    requestAnimationFrame(() => setCanvasReady(true));
  }, [tree, canvasSize]);

  // Resize observer — observe canvas element directly for exact CSS dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        setCanvasSize({ width: w, height: h });
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Canvas animation loop
  useEffect(() => {
    let raf: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      if (!ctx || !canvas) return;

      // Sync buffer to actual CSS display size every frame — no lag, no mismatch
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const bufW = Math.round(W * dpr);
      const bufH = Math.round(H * dpr);
      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clear canvas (CSS provides the Liquid Glass background)
      ctx.clearRect(0, 0, W, H);

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const particles = particlesRef.current;
      const time = Date.now() / 1000;

      // Apply zoom/pan transform
      const t = transformRef.current;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      // Subtle radial glow at center (moves with tree)
      const centerGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.45);
      centerGlow.addColorStop(0, 'rgba(99, 102, 241, 0.04)');
      centerGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, W, H);

      // Concentric guide rings (moves with tree)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.06)';
      ctx.lineWidth = 1;
      const ringCx = W / 2, ringCy = H / 2;
      const maxR = Math.min(W, H) * 0.45;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, maxR * (ring / 4), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw curved links
      links.forEach(l => {
        const gradient = ctx.createLinearGradient(l.source.x, l.source.y, l.target.x, l.target.y);
        const srcColor = getNodeColor(l.source);
        const tgtColor = getNodeColor(l.target);
        gradient.addColorStop(0, srcColor + '30');
        gradient.addColorStop(1, tgtColor + '50');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = l.target.type === 'event' ? 0.8 : 2;
        ctx.beginPath();
        const midX = (l.source.x + l.target.x) / 2 + (l.target.y - l.source.y) * 0.1;
        const midY = (l.source.y + l.target.y) / 2 - (l.target.x - l.source.x) * 0.1;
        ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(midX, midY, l.target.x, l.target.y);
        ctx.stroke();
      });

      // Draw particles (respect reduced motion)
      if (!prefersReducedMotion) {
        particles.forEach(p => {
          p.progress += p.speed;
          if (p.progress > 1) {
            p.progress = 0;
            if (links.length > 0) {
              p.link = links[Math.floor(Math.random() * links.length)];
            }
          }
          const pt = p.progress;
          const s = p.link.source;
          const e = p.link.target;
          const midX = (s.x + e.x) / 2 + (e.y - s.y) * 0.1;
          const midY = (s.y + e.y) / 2 - (e.x - s.x) * 0.1;
          const x = (1 - pt) * (1 - pt) * s.x + 2 * (1 - pt) * pt * midX + pt * pt * e.x;
          const y = (1 - pt) * (1 - pt) * s.y + 2 * (1 - pt) * pt * midY + pt * pt * e.y;
          const color = getNodeColor(e as LayoutNode);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.7 * (1 - Math.abs(pt - 0.5) * 2);
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }

      // Draw nodes
      nodes.forEach(n => {
        const r = getNodeRadius(n);
        const color = getNodeColor(n);
        const isHovered = hoveredNode?.id === n.id;
        const isSelected = selectedNode?.id === n.id;

        // Shadow glow (light theme — subtle drop shadow)
        if (n.type !== 'event' || isHovered || isSelected) {
          ctx.shadowColor = color;
          ctx.shadowBlur = isHovered ? 12 : isSelected ? 10 : 4;
        }

        // Breathing pulse for recent events
        let pulseR = r;
        if (!prefersReducedMotion && n.type === 'event' && n.timestamp) {
          const ageHours = (Date.now() - new Date(n.timestamp).getTime()) / 3600000;
          if (ageHours < 24) {
            const idx = parseInt(n.id.replace(/\D/g, '') || '0', 10);
            pulseR = r * (1 + 0.15 * Math.sin(time * 3 + idx * 0.5));
          }
        }

        // Node circle
        ctx.fillStyle = color;
        ctx.globalAlpha = n.type === 'event' ? 0.85 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Selection ring
        if (isSelected) {
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, pulseR + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Labels — dark text for light background
        if (showLabels && (n.type === 'root' || n.type === 'source_type' || n.type === 'source' || isHovered)) {
          ctx.font = n.type === 'root'
            ? 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif'
            : n.type === 'source_type'
              ? 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif'
              : '9px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'center';
          const labelY = n.y + r + (n.type === 'root' ? 14 : 11);
          ctx.fillText(n.label, n.x, labelY);
          if (n.type === 'source' && n.eventCount) {
            ctx.font = '8px -apple-system, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText(`${n.eventCount} events`, n.x, labelY + 10);
          }
        }
      });

      ctx.restore();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [canvasSize, hoveredNode, selectedNode, showLabels, tree, prefersReducedMotion]);

  // Wheel zoom — native listener for reliable preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / rect.width;
      const scaleY = canvas.clientHeight / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      const t = transformRef.current;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.3, Math.min(5, t.scale * zoomFactor));
      const sc = newScale / t.scale;
      const newTransform = {
        x: mouseX - (mouseX - t.x) * sc,
        y: mouseY - (mouseY - t.y) * sc,
        scale: newScale,
      };
      transformRef.current = newTransform;
      setTransform(newTransform);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [tree]); // re-attach when canvas appears in DOM

  // Pan: mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    wasPanningRef.current = false;
    if (e.button === 1 || (e.button === 0 && !hoveredNode)) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y,
      };
    }
  }, [hoveredNode]);

  // Combined mouse move: pan + hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isPanningRef.current) {
      wasPanningRef.current = true;
      const newTransform = {
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
        scale: transformRef.current.scale,
      };
      transformRef.current = newTransform;
      setTransform(newTransform);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const t = transformRef.current;
    // Map mouse position from CSS display space to drawing coordinate space
    const scaleX = canvas.clientWidth / rect.width;
    const scaleY = canvas.clientHeight / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    // Convert screen coords to world coords accounting for zoom/pan
    const worldX = (screenX - t.x) / t.scale;
    const worldY = (screenY - t.y) / t.scale;

    let closest: LayoutNode | null = null;
    let minDist = Infinity;
    nodesRef.current.forEach(n => {
      const d = Math.hypot(n.x - worldX, n.y - worldY);
      const threshold = getNodeRadius(n) + (n.type === 'event' ? 8 : 12);
      if (d < threshold && d < minDist) {
        closest = n;
        minDist = d;
      }
    });
    setHoveredNode(closest);
    if (closest) {
      setTooltipPos({ x: screenX + 12, y: screenY - 8 });
    } else {
      setTooltipPos(null);
    }
    canvas.style.cursor = closest ? 'pointer' : 'grab';
  }, [canvasSize]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleClick = useCallback(() => {
    if (wasPanningRef.current) {
      wasPanningRef.current = false;
      return;
    }
    if (hoveredNode) {
      setSelectedNode(prev => prev?.id === hoveredNode.id ? null : hoveredNode);
    }
  }, [hoveredNode]);

  // Zoom button helpers
  const zoomTo = useCallback((factor: number) => {
    const t = transformRef.current;
    const newScale = Math.max(0.3, Math.min(5, t.scale * factor));
    const cx = canvasSize.width / 2;
    const cy = canvasSize.height / 2;
    const sc = newScale / t.scale;
    const nt = { x: cx - (cx - t.x) * sc, y: cy - (cy - t.y) * sc, scale: newScale };
    transformRef.current = nt;
    setTransform(nt);
  }, [canvasSize]);

  const resetZoom = useCallback(() => {
    const nt = { x: 0, y: 0, scale: 1 };
    transformRef.current = nt;
    setTransform(nt);
  }, []);

  if (loading) {
    return (
      <div className="phylo-tree">
        <div className="phylo-tree__loading">
          <div className="spinner" />
          <span>Building evolution tree…</span>
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="phylo-tree">
        <div className="phylo-tree__empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #6366f1)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
            <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
          </svg>
          <h3>No evolution tree to display</h3>
          <p>Events will appear here when Auto-Repair runs.</p>
        </div>
      </div>
    );
  }

  const eventCount = events.length;
  const successCount = events.filter(e => e.outcome === 'success').length;
  const failureCount = events.filter(e => e.outcome === 'failure').length;
  const fallbackCount = events.filter(e => e.outcome === 'fallback').length;
  const successRate = eventCount > 0 ? ((successCount / eventCount) * 100).toFixed(1) : '0.0';
  const totalCost = events.reduce((s, e) => s + e.cost_usd, 0);

  return (
    <div className="phylo-tree">
      <div className="phylo-tree__header">
        <div className="phylo-tree__title-group">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #6366f1)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
            <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
            <path d="M17 6l-2.5 2.5" />
            <path d="M7 18l2.5-2.5" />
          </svg>
          <div>
            <h2 className="phylo-tree__title">Evolution Phylogenetic Tree</h2>
            <p className="phylo-tree__subtitle">
              Interactive lineage map of {eventCount} self-healing evolution events
            </p>
          </div>
        </div>
        <button
          className={`phylo-tree__toggle ${showLabels ? 'phylo-tree__toggle--active' : ''}`}
          onClick={() => setShowLabels(!showLabels)}
        >
          {showLabels ? 'Labels On' : 'Labels Off'}
        </button>
      </div>

      <div className="phylo-tree__stats">
        {[
          { label: 'Total Events', value: eventCount, color: 'var(--accent, #6366f1)' },
          { label: 'Self-Healed', value: successCount, color: 'var(--ok, #10b981)' },
          { label: 'Failed', value: failureCount, color: 'var(--bad, #ef4444)' },
          { label: 'Fallback', value: fallbackCount, color: 'var(--warn, #f59e0b)' },
          { label: 'Success Rate', value: `${successRate}%`, color: parseFloat(successRate) > 60 ? 'var(--ok)' : 'var(--bad)' },
          { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, color: 'var(--muted)' },
        ].map(s => (
          <div key={s.label} className="phylo-tree__stat-card">
            <span className="phylo-tree__stat-label">{s.label}</span>
            <span className="phylo-tree__stat-value" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="phylo-tree__canvas-container" ref={containerRef}>
        {/* Loading overlay */}
        {!canvasReady && (
          <div className="phylo-tree__canvas-loading">
            <div className="spinner" />
            <span>Rendering tree…</span>
          </div>
        )}

        {/* Zoom controls */}
        <div className="phylo-tree__zoom-controls">
          <button className="phylo-tree__zoom-btn" onClick={() => zoomTo(1.3)} title="Zoom In">+</button>
          <button className="phylo-tree__zoom-btn" onClick={() => zoomTo(0.7)} title="Zoom Out">&minus;</button>
          <button className="phylo-tree__zoom-btn" onClick={resetZoom} title="Reset View">&#8962;</button>
          <span className="phylo-tree__zoom-level">{Math.round(transform.scale * 100)}%</span>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="phylo-tree__canvas"
          style={{ opacity: canvasReady ? 1 : 0 }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { handleMouseUp(); setHoveredNode(null); setTooltipPos(null); }}
          onClick={handleClick}
        />

        {/* Legend bar (HTML overlay) */}
        <div className="phylo-tree__legend-bar">
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#4f46e5' }} /> Flow Nodes
          </span>
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#10b981' }} /> Agents
          </span>
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#f59e0b' }} /> Skills
          </span>
          <span className="phylo-tree__legend-divider" />
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#059669' }} /> Success
          </span>
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#dc2626' }} /> Failure
          </span>
          <span className="phylo-tree__legend-item">
            <span className="phylo-tree__legend-dot" style={{ background: '#d97706' }} /> Fallback
          </span>
        </div>

        {/* Tooltip (HTML overlay, screen-space positioned) */}
        {hoveredNode?.type === 'event' && tooltipPos && (
          <div className="phylo-tree__tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            <div className="phylo-tree__tooltip-title">{hoveredNode.sourceName || hoveredNode.label}</div>
            <div className="phylo-tree__tooltip-error">{hoveredNode.errorType}</div>
            <div className="phylo-tree__tooltip-meta">
              <span className={`phylo-tree__tooltip-outcome phylo-tree__tooltip-outcome--${hoveredNode.outcome}`}>
                {hoveredNode.outcome}
              </span>
              <span>${(hoveredNode.cost_usd || 0).toFixed(4)}</span>
              <span>{((hoveredNode.latency_ms || 0) / 1000).toFixed(1)}s</span>
            </div>
            <div className="phylo-tree__tooltip-strategy">{hoveredNode.strategy}</div>
          </div>
        )}
      </div>

      {selectedNode?.type === 'event' && (
        <div className="phylo-tree__detail glass-card">
          <div className="phylo-tree__detail-header">
            <div>
              <strong>{selectedNode.sourceName}</strong>
              <span className="phylo-tree__detail-meta">
                {selectedNode.sourceType} · {selectedNode.timestamp ? new Date(selectedNode.timestamp).toLocaleString() : ''}
              </span>
            </div>
            <span className={`badge badge-${selectedNode.outcome === 'success' ? 'ok' : selectedNode.outcome === 'failure' ? 'bad' : 'warn'}`}>
              {selectedNode.outcome}
            </span>
          </div>
          <div className="phylo-tree__detail-grid">
            <div className="phylo-tree__detail-cell">
              <span className="phylo-tree__detail-cell-label">Error Type</span>
              <code>{selectedNode.errorType}</code>
            </div>
            <div className="phylo-tree__detail-cell">
              <span className="phylo-tree__detail-cell-label">Strategy</span>
              <code>{selectedNode.strategy}</code>
            </div>
            <div className="phylo-tree__detail-cell">
              <span className="phylo-tree__detail-cell-label">Cost</span>
              <span>${(selectedNode.cost_usd || 0).toFixed(4)}</span>
            </div>
            <div className="phylo-tree__detail-cell">
              <span className="phylo-tree__detail-cell-label">Latency</span>
              <span>{((selectedNode.latency_ms || 0) / 1000).toFixed(1)}s</span>
            </div>
          </div>
          <button className="phylo-tree__close-btn" onClick={() => setSelectedNode(null)}>Close</button>
        </div>
      )}

      {shannonMetrics && (
        <div className="phylo-tree__shannon">
          <h3 className="phylo-tree__section-title">Ecosystem Health (Shannon Diversity)</h3>
          <div className="phylo-tree__shannon-cards">
            {[
              { label: "Shannon H'", value: shannonMetrics.shannon.toFixed(3), sub: 'Strategy diversity index', color: shannonMetrics.shannon > 2 ? 'var(--ok)' : 'var(--warn)' },
              { label: 'Strategy Richness', value: shannonMetrics.richness, sub: 'Unique strategies', color: 'var(--accent, #4f46e5)' },
              { label: 'Evenness', value: shannonMetrics.evenness.toFixed(3), sub: 'Distribution uniformity', color: shannonMetrics.evenness > 0.7 ? 'var(--ok)' : 'var(--warn)' },
              { label: 'Gini Coefficient', value: shannonMetrics.gini.toFixed(3), sub: 'Usage inequality', color: shannonMetrics.gini < 0.3 ? 'var(--ok)' : 'var(--bad)' },
            ].map(m => (
              <div key={m.label} className="phylo-tree__shannon-card glass-card">
                <span className="phylo-tree__shannon-label">{m.label}</span>
                <span className="phylo-tree__shannon-value" style={{ color: m.color }}>{m.value}</span>
                <span className="phylo-tree__shannon-sub">{m.sub}</span>
              </div>
            ))}
          </div>

          <div className="phylo-tree__strat-bar glass-card">
            <span className="phylo-tree__shannon-label">Strategy Distribution</span>
            <div className="phylo-tree__strat-segments">
              {Object.entries(shannonMetrics.strategyDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([strat, count], i) => {
                  const pct = (count / eventCount) * 100;
                  const hue = (i * 37) % 360;
                  return (
                    <div
                      key={strat}
                      className="phylo-tree__strat-segment"
                      style={{ width: `${pct}%`, background: `hsl(${hue}, 60%, 55%)` }}
                      title={`${strat}: ${count} uses`}
                    />
                  );
                })}
            </div>
            <div className="phylo-tree__strat-legend">
              {Object.entries(shannonMetrics.strategyDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([strat, count], i) => (
                  <span key={strat} className="phylo-tree__strat-legend-item">
                    <span className="phylo-tree__legend-dot" style={{ background: `hsl(${(i * 37) % 360}, 60%, 55%)` }} />
                    {strat} ({count})
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
