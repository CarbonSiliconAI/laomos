import React, { useState } from 'react';
import { api } from '../../lib/api';
import './Rag.css';

interface RagResult { id: string; name: string; description: string; tags: string[]; version: string; }

export default function Rag() {
    const [query, setQuery] = useState('');
    const [tags, setTags] = useState('');
    const [results, setResults] = useState<RagResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

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

    return (
        <div className="rag-page">
            <div className="rag-header">
                <h1 className="rag-header__title">RAG Search</h1>
                <p className="rag-header__sub">Semantic search over your documents and knowledge base</p>
            </div>
            <div className="rag-search glass-card">
                <input className="os-input" placeholder="What are you looking for?" value={query}
                    onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
                <input className="os-input" placeholder="Tags (comma-separated, optional)" value={tags}
                    onChange={e => setTags(e.target.value)} style={{ maxWidth: 240 }} />
                <button className="btn btn-primary" onClick={search} disabled={loading || !query.trim()}>
                    {loading ? <><div className="spinner"/> Searching…</> : (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search</>
                    )}
                </button>
            </div>
            <div className="rag-body">
                {!searched ? (
                    <div className="empty-state">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
                        <span>Enter a query to search your knowledge base</span>
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state">
                        <span>No results found for "{query}"</span>
                    </div>
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
        </div>
    );
}
