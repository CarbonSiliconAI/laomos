import React, { useState } from 'react';
import { api } from '../../lib/api';
import './News.css';

interface NewsResult {
    headlines: any[];
    analysis: string;
}

export default function News() {
    const [topic, setTopic] = useState('');
    const [hours, setHours] = useState(24);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<NewsResult | null>(null);
    const [error, setError] = useState('');

    const [traces, setTraces] = useState<string[]>([]);

    async function handleSearch() {
        setLoading(true);
        setError('');
        setResult(null);
        setTraces([]);

        const url = `/api/news/search?topic=${encodeURIComponent(topic)}&hours=${hours}`;
        const eventSource = new EventSource(url);

        eventSource.addEventListener('trace', (e) => {
            try {
                const data = JSON.parse(e.data);
                setTraces(prev => [...prev, data.message || JSON.stringify(data)]);
            } catch (err) {
                console.error('Trace parse error', err);
            }
        });

        eventSource.addEventListener('result', (e) => {
            try {
                const data = JSON.parse(e.data);
                setResult(data);
            } catch (err) {
                console.error('Result parse error', err);
                setError('Failed to parse final result.');
            } finally {
                setLoading(false);
                eventSource.close();
            }
        });

        eventSource.addEventListener('error', (e: any) => {
            console.error('SSE Error:', e);
            try {
                const data = e.data ? JSON.parse(e.data) : { message: 'Stream connection error' };
                setError(data.message || 'Stream connection error');
            } catch (err) {
                setError('Stream connection closed unexpectedly.');
            }
            setLoading(false);
            eventSource.close();
        });
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') handleSearch();
    }

    return (
        <div className="news-page">
            <div className="news-header">
                <div>
                    <h1 className="news-header__title">AI News Hub</h1>
                    <p className="news-header__sub">Search latest news and get AI fact-checking, key takeaways, and action plans.</p>
                </div>
            </div>

            <div className="glass-card news-search-bar">
                <input
                    type="text"
                    className="os-input news-topic-input"
                    placeholder="Optional: Enter a topic, or leave blank for Top Global News"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={loading}
                />
                <select
                    className="os-input news-timespan-select"
                    value={hours}
                    onChange={e => setHours(Number(e.target.value))}
                    disabled={loading}
                >
                    <option value={12}>Past 12 Hours</option>
                    <option value={24}>Past 24 Hours</option>
                    <option value={48}>Past 48 Hours</option>
                    <option value={168}>Past 7 Days</option>
                </select>
                <button
                    className="btn btn-primary news-search-btn"
                    onClick={handleSearch}
                    disabled={loading}
                >
                    {loading ? 'Analyzing...' : 'Search & Analyze'}
                </button>
            </div>

            {error && (
                <div className="news-error glass-card">
                    <p>{error}</p>
                </div>
            )}

            <div className="news-content">
                {loading && (
                    <div className="news-loading">
                        <div className="spinner"></div>
                        <p>Gathering news and running AI analysis... This may take a minute.</p>
                        <div className="news-traces">
                            {traces.map((t, i) => (
                                <div key={i} className="news-trace-item">
                                    <span className="trace-dot"></span>
                                    {t}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {result && !loading && (
                    <div className="news-results-container">
                        <div className="glass-card news-analysis-card">
                            <h2 className="news-card-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                AI Analysis
                            </h2>
                            <div className="news-markdown-content" dangerouslySetInnerHTML={{ __html: result.analysis }} />
                        </div>

                        <div className="glass-card news-headlines-card">
                            <h3 className="news-card-title">Retrieved Sources</h3>
                            <ul className="news-sources-list">
                                {result.headlines.length === 0 && <li>No recent news found for this topic.</li>}
                                {result.headlines.map((hl, idx) => (
                                    <li key={idx}>
                                        <a href={hl.link || '#'} target="_blank" rel="noopener noreferrer" className="news-headline-link">
                                            {hl.title}
                                        </a>
                                        {hl.source && <span className="news-headline-source">({hl.source})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
