import React, { useState, useRef, useEffect } from 'react';
import './Search.css';

interface TraceEvent { step: string; status: string; details?: string; durationMs?: number; }
interface SearchResult { source: string; content: string; }

export default function Search() {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [traces, setTraces] = useState<TraceEvent[]>([]);
    const [result, setResult] = useState<SearchResult | null>(null);
    const [error, setError] = useState('');
    const traceRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight; }, [traces]);

    function traceColor(s: string) {
        if (s === 'running') return '#F59E0B';
        if (s === 'completed') return '#34C759';
        if (s === 'error') return '#FF3B30';
        return 'var(--muted)';
    }

    function doSearch() {
        if (!query.trim()) return;
        setSearching(true);
        setTraces([]);
        setResult(null);
        setError('');

        const es = new EventSource(`/api/apps/search?q=${encodeURIComponent(query.trim())}`);

        es.addEventListener('trace', (e) => {
            try {
                const ev: TraceEvent = JSON.parse(e.data);
                setTraces(prev => [...prev, ev]);
            } catch { /* ignore */ }
        });

        es.addEventListener('result', (e) => {
            try {
                const data: SearchResult = JSON.parse(e.data);
                setResult(data);
            } catch { /* ignore */ }
            es.close();
            setSearching(false);
        });

        es.addEventListener('error', (e: any) => {
            if (e.data) {
                try { const err = JSON.parse(e.data); setError(err.message ?? 'Search failed'); }
                catch { setError('Stream error'); }
            } else {
                if (searching) setError('Connection to server lost.');
            }
            es.close();
            setSearching(false);
        });

        es.onerror = () => { es.close(); setSearching(false); };
    }

    return (
        <div className="search-page">
            <div className="search-header">
                <div>
                    <h1 className="search-header__title">Smart Search</h1>
                    <p className="search-header__sub">AI-powered search across local knowledge and the web</p>
                </div>
            </div>

            <div className="search-input-bar glass-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input className="search-input" placeholder="Ask anything..."
                    value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()} disabled={searching} />
                <button className="btn btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
                    {searching ? <><div className="spinner" /> Searching...</> : 'Search'}
                </button>
            </div>

            <div className="search-body">
                {/* Trace Flow */}
                {traces.length > 0 && (
                    <div className="search-traces glass-card" ref={traceRef}>
                        <div className="section-title">Thinking...</div>
                        {traces.map((t, i) => (
                            <div key={t.step + i} className="search-trace" style={{ borderLeftColor: traceColor(t.status) }}>
                                <div className="search-trace__header">
                                    <span className="search-trace__dot" style={{ background: traceColor(t.status) }} />
                                    <strong className="search-trace__step">{t.step}</strong>
                                    {t.durationMs !== undefined && <span className="search-trace__ms">{(t.durationMs / 1000).toFixed(2)}s</span>}
                                    <span className="search-trace__status" style={{ color: traceColor(t.status) }}>
                                        {t.status === 'running' ? 'Running...' : t.status === 'completed' ? 'Done' : t.status === 'error' ? 'Error' : t.status}
                                    </span>
                                </div>
                                {t.details && <pre className="search-trace__details">{t.details}</pre>}
                            </div>
                        ))}
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className="search-result glass-card">
                        <div className="search-result__source">
                            {result.source === 'local'
                                ? <span className="search-source search-source--local">Local Knowledge</span>
                                : <span className="search-source search-source--web">Web Search</span>
                            }
                        </div>
                        <div className="search-result__content">{result.content}</div>
                    </div>
                )}

                {error && <div className="search-error glass-card">{error}</div>}

                {!searching && traces.length === 0 && !result && !error && (
                    <div className="empty-state">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        <span>Enter a query to search with AI assistance</span>
                    </div>
                )}
            </div>
        </div>
    );
}
