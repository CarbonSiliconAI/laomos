import React, { useState, useRef, useEffect } from 'react';
import './Video.css';

interface TraceEvent { step: string; status: string; details?: string; durationMs?: number; }

export default function Video() {
    const [prompt, setPrompt] = useState('');
    const [provider, setProvider] = useState('google');
    const [generating, setGenerating] = useState(false);
    const [status, setStatus] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [traces, setTraces] = useState<TraceEvent[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const traceRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight; }, [traces]);

    function traceColor(s: string) {
        if (s === 'running') return '#F59E0B';
        if (s === 'completed') return '#34C759';
        if (s === 'error') return '#FF3B30';
        return 'var(--muted)';
    }

    async function generate() {
        if (!prompt.trim()) return;
        setGenerating(true);
        setStatus('Requesting video...');
        setTraces([]);
        setVideoUrl('');

        const url = `/api/ai/generate-video?provider=${encodeURIComponent(provider)}&prompt=${encodeURIComponent(prompt)}`;
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
                let finalUrl = data.url;
                if (finalUrl?.startsWith('https://generativelanguage.googleapis.com')) {
                    finalUrl = `/api/media/fetch?uri=${encodeURIComponent(finalUrl)}`;
                }
                setVideoUrl(finalUrl);
                setStatus('Video loaded');

                // Try autoplay
                setTimeout(() => {
                    videoRef.current?.play().catch(() => setStatus('Video loaded (click to play)'));
                }, 100);
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
        <div className="video-page">
            <div className="video-header">
                <div>
                    <h1 className="video-header__title">AI Video</h1>
                    <p className="video-header__sub">Generate videos from text prompts</p>
                </div>
            </div>
            <div className="video-body">
                <div className="video-player-area glass-card">
                    {videoUrl ? (
                        <video ref={videoRef} className="video-player" src={videoUrl} controls loop />
                    ) : (
                        <div className="video-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" />
                            </svg>
                            <span>Generated video will appear here</span>
                        </div>
                    )}
                </div>
                <div className="video-sidebar glass-card">
                    <div className="section-title">Generation</div>
                    <div className="video-field">
                        <label>Provider</label>
                        <select className="os-input" value={provider} onChange={e => setProvider(e.target.value)}>
                            <option value="google">Google (Gemini)</option>
                            <option value="openai">OpenAI</option>
                        </select>
                    </div>
                    <div className="video-field">
                        <label>Prompt</label>
                        <textarea className="os-input" rows={3} placeholder="Describe the video to generate..."
                            value={prompt} onChange={e => setPrompt(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={generate} disabled={generating || !prompt.trim()}>
                        {generating ? <><div className="spinner" /> Generating...</> : 'Generate'}
                    </button>
                    {status && <p className="video-status">{status}</p>}

                    {traces.length > 0 && (
                        <div className="video-traces" ref={traceRef}>
                            <div className="section-title">Task Flow</div>
                            {traces.map((t, i) => (
                                <div key={t.step + i} className="video-trace" style={{ borderLeftColor: traceColor(t.status) }}>
                                    <div className="video-trace__header">
                                        <span className="video-trace__dot" style={{ background: traceColor(t.status) }} />
                                        <span className="video-trace__step">{t.step}</span>
                                        {t.durationMs !== undefined && <span className="video-trace__ms">{(t.durationMs / 1000).toFixed(2)}s</span>}
                                    </div>
                                    {t.details && <div className="video-trace__details">{t.details}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
