import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import './Draw.css';

interface TraceEvent { step: string; status: string; details?: string; durationMs?: number; }

type GenType = 'image' | 'graph';

export default function Draw() {
    const location = useLocation();
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [prompt, setPrompt] = useState('');
    const [provider, setProvider] = useState('openai');
    const [genType, setGenType] = useState<GenType>('image');
    const [generating, setGenerating] = useState(false);
    const [status, setStatus] = useState('');
    const [traces, setTraces] = useState<TraceEvent[]>([]);
    const paintingRef = useRef(false);
    const traceRef = useRef<HTMLDivElement>(null);
    const returnToRef = useRef<string | null>(null);
    const imageSavedRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    useEffect(() => { if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight; }, [traces]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const queryPrompt = params.get('prompt');
        const auto = params.get('auto');
        const returnTo = params.get('returnTo');

        if (queryPrompt) {
            returnToRef.current = returnTo;
            imageSavedRef.current = false;
            setPrompt(queryPrompt);
            // Clear query params from URL immediately
            navigate('/operations/draw', { replace: true });
            if (auto === 'true') {
                setTimeout(() => generate(queryPrompt), 150);
            }
        }
        // location.key changes on every navigation, ensuring this fires even for repeat visits
    }, [location.key]);

    function getCanvasCtx() {
        const canvas = canvasRef.current;
        return canvas ? canvas.getContext('2d') : null;
    }

    function startDraw(e: React.MouseEvent) {
        paintingRef.current = true;
        draw(e);
    }
    function stopDraw() {
        paintingRef.current = false;
        const ctx = getCanvasCtx();
        if (ctx) ctx.beginPath();
    }
    function draw(e: React.MouseEvent) {
        if (!paintingRef.current) return;
        const ctx = getCanvasCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.lineWidth = tool === 'eraser' ? 10 : 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = tool === 'eraser' ? '#1a1a2e' : '#ffffff';
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function clearCanvas() {
        const ctx = getCanvasCtx();
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function traceColor(s: string) {
        if (s === 'running') return '#F59E0B';
        if (s === 'completed') return '#34C759';
        if (s === 'error') return '#FF3B30';
        return 'var(--muted)';
    }

    async function generate(overridePrompt?: string | React.MouseEvent) {
        const p = typeof overridePrompt === 'string' ? overridePrompt : prompt;
        if (!p.trim()) return;
        setGenerating(true);
        setStatus('Contacting AI Service...');
        setTraces([]);

        const endpoint = genType === 'graph' ? '/api/ai/generate-graph' : '/api/ai/generate-image';
        const url = `${endpoint}?provider=${encodeURIComponent(provider)}&prompt=${encodeURIComponent(p)}`;
        const es = new EventSource(url);

        es.addEventListener('trace', (e) => {
            try {
                const ev: TraceEvent = JSON.parse(e.data);
                setTraces(prev => {
                    const idx = prev.findIndex(p => p.step === ev.step);
                    if (idx >= 0) { const copy = [...prev]; copy[idx] = ev; return copy; }
                    return [...prev, ev];
                });
            } catch { /* ignore */ }
        });

        es.addEventListener('result', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (genType === 'image' && data.url) {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    const drawImageToCanvas = () => {
                        const ctx = getCanvasCtx();
                        const canvas = canvasRef.current;
                        if (ctx && canvas) {
                            // Clear before drawing new
                            ctx.fillStyle = '#1a1a2e';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        }
                        setStatus('Image generated!');

                        // Handle auto-return logic
                        if (returnToRef.current === 'game' && !imageSavedRef.current) {
                            imageSavedRef.current = true;
                            setStatus('Saving to Adventure Game log...');
                            api.gameAppendMessage({
                                role: 'system',
                                content: `Visualized drawing.`,
                                image: data.url
                            }).then(() => {
                                returnToRef.current = null;
                                navigate('/operations/game');
                            }).catch(() => {
                                imageSavedRef.current = false;
                                setStatus('Image generated! Failed to auto-return to game.');
                            });
                        }
                    };

                    img.onload = drawImageToCanvas;

                    img.onerror = () => {
                        console.warn("CORS or load failure for raw URL. Attempting via proxy...");
                        // Use a proxy endpoint to bypass CORS restrictions for canvas painting
                        const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(data.url)}`;
                        const proxyImg = new Image();
                        proxyImg.crossOrigin = 'anonymous';
                        proxyImg.onload = () => {
                            img.src = proxyUrl; // Just reuse the outer img reference or draw proxyImg directly
                            const ctx = getCanvasCtx();
                            const canvas = canvasRef.current;
                            if (ctx && canvas) {
                                ctx.fillStyle = '#1a1a2e';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(proxyImg, 0, 0, canvas.width, canvas.height);
                            }
                            setStatus('Image generated! (via proxy)');

                            // Handle auto-return logic
                            if (returnToRef.current === 'game' && !imageSavedRef.current) {
                                imageSavedRef.current = true;
                                setStatus('Saving to Adventure Game log...');
                                api.gameAppendMessage({
                                    role: 'system',
                                    content: `Visualized drawing.`,
                                    image: data.url
                                }).then(() => {
                                    returnToRef.current = null;
                                    navigate('/operations/game');
                                }).catch(() => {
                                    imageSavedRef.current = false;
                                    setStatus('Image generated! Failed to auto-return to game.');
                                });
                            }
                        };
                        proxyImg.onerror = () => setStatus('Error loading image onto canvas. Check console.');
                        proxyImg.src = proxyUrl;
                    };

                    img.src = data.url;
                } else if (data.code) {
                    setStatus('Graph generated! (see trace output)');
                }
            } catch { /* ignore */ }
            es.close();
            setGenerating(false);
        });

        es.addEventListener('error', (e: any) => {
            if (e.data) {
                try { const err = JSON.parse(e.data); setStatus(`Error: ${err.message}`); }
                catch { setStatus('Stream error'); }
            }
            es.close();
            setGenerating(false);
        });

        es.onerror = () => { es.close(); setGenerating(false); };
    }

    return (
        <div className="draw-page">
            <div className="draw-header">
                <div>
                    <h1 className="draw-header__title">AI Drawing</h1>
                    <p className="draw-header__sub">Draw on canvas and generate AI images</p>
                </div>
            </div>
            <div className="draw-body">
                <div className="draw-canvas-area glass-card">
                    <div className="draw-toolbar">
                        <button className={`draw-tool${tool === 'pen' ? ' draw-tool--active' : ''}`} onClick={() => setTool('pen')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>
                            Pen
                        </button>
                        <button className={`draw-tool${tool === 'eraser' ? ' draw-tool--active' : ''}`} onClick={() => setTool('eraser')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16l9-9 8 8-4 4" /><path d="M6 11l4 4" /></svg>
                            Eraser
                        </button>
                        <button className="draw-tool" onClick={clearCanvas}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            Clear
                        </button>
                    </div>
                    <canvas ref={canvasRef} width={800} height={500} className="draw-canvas"
                        onMouseDown={startDraw} onMouseUp={stopDraw} onMouseMove={draw} onMouseLeave={stopDraw} />
                </div>
                <div className="draw-sidebar glass-card">
                    <div className="section-title">AI Generation</div>
                    <div className="draw-field">
                        <label>Provider</label>
                        <select className="os-input" value={provider} onChange={e => setProvider(e.target.value)}>
                            <option value="openai">OpenAI</option>
                            <option value="google">Google</option>
                            <option value="anthropic">Anthropic</option>
                        </select>
                    </div>
                    <div className="draw-field">
                        <label>Type</label>
                        <select className="os-input" value={genType} onChange={e => setGenType(e.target.value as GenType)}>
                            <option value="image">Image</option>
                            <option value="graph">Graph / Diagram</option>
                        </select>
                    </div>
                    <div className="draw-field">
                        <label>Prompt</label>
                        <textarea className="os-input" rows={3} placeholder="Describe what to generate..."
                            value={prompt} onChange={e => setPrompt(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating || !prompt.trim()}>
                        {generating ? <><div className="spinner" /> Generating...</> : 'Generate'}
                    </button>
                    {status && <p className="draw-status">{status}</p>}

                    {traces.length > 0 && (
                        <div className="draw-traces" ref={traceRef}>
                            <div className="section-title">Task Flow</div>
                            {traces.map((t, i) => (
                                <div key={t.step + i} className="draw-trace" style={{ borderLeftColor: traceColor(t.status) }}>
                                    <div className="draw-trace__header">
                                        <span className="draw-trace__dot" style={{ background: traceColor(t.status) }} />
                                        <span className="draw-trace__step">{t.step}</span>
                                        {t.durationMs !== undefined && <span className="draw-trace__ms">{(t.durationMs / 1000).toFixed(2)}s</span>}
                                    </div>
                                    {t.details && <div className="draw-trace__details">{t.details}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
