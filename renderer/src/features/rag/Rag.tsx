import React, { useState, useEffect, useRef } from 'react';
import { api, FileEntry } from '../../lib/api';
import './Rag.css';

interface RagResult { id: string; name: string; description: string; tags: string[]; version: string; }
interface TraceEvent { step: string; status: string; details?: string; }

type Tab = 'converter' | 'search';

export default function Rag() {
    const [tab, setTab] = useState<Tab>('converter');

    // Converter
    const [docs, setDocs] = useState<FileEntry[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [converting, setConverting] = useState(false);
    const [traces, setTraces] = useState<TraceEvent[]>([]);
    const [convertResult, setConvertResult] = useState('');
    const [convertError, setConvertError] = useState('');
    const traceRef = useRef<HTMLDivElement>(null);

    // Search
    const [query, setQuery] = useState('');
    const [tags, setTags] = useState('');
    const [results, setResults] = useState<RagResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    useEffect(() => { fetchDocs(); }, []);
    useEffect(() => { if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight; }, [traces]);

    function fetchDocs() {
        setDocsLoading(true);
        api.filesList('storage/Docs')
            .then(r => {
                const files = (r.files ?? []).filter(f => f.type === 'file' && (f.name.endsWith('.txt') || f.name.endsWith('.md')));
                setDocs(files);
            })
            .catch(() => setDocs([]))
            .finally(() => setDocsLoading(false));
    }

    function startConvert() {
        setConverting(true);
        setTraces([]);
        setConvertResult('');
        setConvertError('');

        const es = new EventSource('/api/apps/rag-convert');

        es.addEventListener('trace', (e) => {
            try {
                const trace: TraceEvent = JSON.parse(e.data);
                setTraces(prev => [...prev, trace]);
            } catch { /* ignore */ }
        });

        es.addEventListener('result', (e) => {
            try {
                const data = JSON.parse(e.data);
                setConvertResult(data.message ?? 'Conversion complete');
            } catch { /* ignore */ }
            es.close();
            setConverting(false);
        });

        es.addEventListener('error', (e: any) => {
            if (e.data) {
                try {
                    const data = JSON.parse(e.data);
                    setConvertError(data.message ?? 'Conversion failed');
                } catch {
                    setConvertError('Stream error');
                }
            }
            es.close();
            setConverting(false);
        });

        es.onerror = () => {
            es.close();
            setConverting(false);
        };
    }

    async function search() {
        if (!query.trim()) return;
        setLoading(true);
        setSearched(true);
        try {
            const res = await api.ragSearch(query.trim(), tags.trim() || undefined);
            setResults((res.apps ?? []) as RagResult[]);
        } catch { setResults([]); }
        finally { setLoading(false); }
    }

    function traceColor(status: string) {
        if (status === 'RUNNING') return '#F59E0B';
        if (status === 'DONE') return '#34C759';
        if (status === 'ERROR') return '#FF3B30';
        return 'var(--muted)';
    }

    return (
        <div className="rag-page">
            <div className="rag-header">
                <h1 className="rag-header__title">RAG</h1>
                <p className="rag-header__sub">Convert documents to vector embeddings and search your knowledge base</p>
            </div>

            {/* Tabs */}
            <div className="rag-tabs">
                <button className={`rag-tab${tab === 'converter' ? ' rag-tab--active' : ''}`} onClick={() => setTab('converter')}>
                    Converter
                </button>
                <button className={`rag-tab${tab === 'search' ? ' rag-tab--active' : ''}`} onClick={() => setTab('search')}>
                    Search
                </button>
            </div>

            {/* Converter Tab */}
            {tab === 'converter' && (
                <div className="rag-body">
                    <div className="rag-converter glass-card">
                        <div className="section-title">Documents (storage/Docs)</div>
                        <div className="rag-docs-list">
                            {docsLoading ? (
                                <div className="empty-state"><div className="spinner" /></div>
                            ) : docs.length === 0 ? (
                                <div className="rag-docs-empty">No .txt or .md files found in storage/Docs</div>
                            ) : (
                                docs.map(f => (
                                    <div key={f.path} className="rag-doc-item">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
                                        <span>{f.name}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <button className="btn btn-primary" onClick={startConvert} disabled={converting || docs.length === 0}>
                            {converting ? <><div className="spinner" /> Converting...</> : 'Convert to RAGs'}
                        </button>
                    </div>

                    {/* Trace Events */}
                    {(traces.length > 0 || convertResult || convertError) && (
                        <div className="rag-traces glass-card" ref={traceRef}>
                            <div className="section-title">Conversion Progress</div>
                            {traces.map((t, i) => (
                                <div key={i} className="rag-trace" style={{ borderLeftColor: traceColor(t.status) }}>
                                    <div className="rag-trace__header">
                                        <span className="rag-trace__dot" style={{ background: traceColor(t.status) }} />
                                        <strong className="rag-trace__step">{t.step}</strong>
                                        <span className="rag-trace__status" style={{ color: traceColor(t.status) }}>
                                            {t.status === 'RUNNING' ? 'Running...' : t.status === 'DONE' ? 'Done' : t.status === 'ERROR' ? 'Error' : t.status}
                                        </span>
                                    </div>
                                    {t.details && <pre className="rag-trace__details">{t.details}</pre>}
                                </div>
                            ))}
                            {convertResult && (
                                <div className="rag-convert-result rag-convert-result--ok">{convertResult}</div>
                            )}
                            {convertError && (
                                <div className="rag-convert-result rag-convert-result--err">{convertError}</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Search Tab */}
            {tab === 'search' && (
                <>
                    <div className="rag-search glass-card">
                        <input className="os-input" placeholder="What are you looking for?" value={query}
                            onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
                        <input className="os-input" placeholder="Tags (optional)" value={tags}
                            onChange={e => setTags(e.target.value)} style={{ maxWidth: 200 }} />
                        <button className="btn btn-primary" onClick={search} disabled={loading || !query.trim()}>
                            {loading ? <><div className="spinner" /> Searching...</> : 'Search'}
                        </button>
                    </div>
                    <div className="rag-body">
                        {!searched ? (
                            <div className="empty-state">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                <span>Enter a query to search your knowledge base</span>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="empty-state"><span>No results found for "{query}"</span></div>
                        ) : (
                            <div className="rag-results">
                                <div className="section-title">{results.length} result{results.length !== 1 ? 's' : ''}</div>
                                {results.map(r => (
                                    <div key={r.id} className="rag-result glass-card">
                                        <div className="rag-result__name">{r.name}</div>
                                        <p className="rag-result__desc">{r.description}</p>
                                        <div className="rag-result__tags">
                                            {(r.tags ?? []).map(t => <span key={t} className="badge badge-accent">{t}</span>)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
