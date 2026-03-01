import React, { useState } from 'react';
import { api } from '../../lib/api';
import './News.css';

interface NewsResult {
    headlines: any[];
    analysis: string;
}

export default function News() {
    const [topic, setTopic] = useState(() => {
        try { return JSON.parse(localStorage.getItem('aos_news_state') || '{}').topic || ''; }
        catch { return ''; }
    });
    const [hours, setHours] = useState(() => {
        try { return JSON.parse(localStorage.getItem('aos_news_state') || '{}').hours || 24; }
        catch { return 24; }
    });
    const [result, setResult] = useState<NewsResult | null>(() => {
        try { return JSON.parse(localStorage.getItem('aos_news_state') || '{}').result || null; }
        catch { return null; }
    });
    const [traces, setTraces] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('aos_news_state') || '{}').traces || []; }
        catch { return []; }
    });
    const [jobId, setJobId] = useState<string | null>(() => {
        try { return JSON.parse(localStorage.getItem('aos_news_state') || '{}').jobId || null; }
        catch { return null; }
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Keep a ref to the active stream so we can abort it if the user leaves the page
    const streamRef = React.useRef<EventSource | null>(null);

    // New state for inline summaries
    const [summaries, setSummaries] = useState<Record<string, { loading: boolean; text: string; error: string }>>({});

    // Keep save/load logic updated
    React.useEffect(() => {
        localStorage.setItem('aos_news_state', JSON.stringify({ topic, hours, result, traces, jobId, summaries }));
    }, [topic, hours, result, traces, jobId, summaries]);

    async function handleSummarize(url: string, title: string, index: number) {
        setSummaries(prev => ({ ...prev, [index]: { loading: true, text: '', error: '' } }));
        try {
            const res = await fetch('http://127.0.0.1:3123/api/apps/browser-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: title, engines: ['Google', 'DuckDuckGo'] })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSummaries(prev => ({ ...prev, [index]: { loading: false, text: data.result, error: '' } }));
        } catch (e: any) {
            setSummaries(prev => ({ ...prev, [index]: { loading: false, text: '', error: e.message || 'Failed to summarize' } }));
        }
    }

    // Unmount cleanup logic
    React.useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.close();
                streamRef.current = null;
            }
        };
    }, []);

    // Reattach on mount
    React.useEffect(() => {
        if (jobId && loading) attachToJob(jobId);
    }, []);

    function attachToJob(targetJobId: string) {
        if (streamRef.current) streamRef.current.close();
        const url = `/api/news/stream/${targetJobId}`;
        const eventSource = new EventSource(url);
        streamRef.current = eventSource;

        eventSource.addEventListener('trace', (e) => {
            try {
                const data = JSON.parse(e.data);
                setTraces(prev => {
                    const msg = data.message || JSON.stringify(data);
                    if (!prev.includes(msg)) return [...prev, msg];
                    return prev;
                });
            } catch (err) { }
        });

        eventSource.addEventListener('result', (e) => {
            try {
                setResult(JSON.parse(e.data));
            } catch (err) {
                setError('Failed to parse final result.');
            } finally {
                setLoading(false);
                setJobId(null);
                eventSource.close();
                streamRef.current = null;
            }
        });

        eventSource.addEventListener('error', (e: any) => {
            try {
                const data = e.data ? JSON.parse(e.data) : { message: 'Stream connection error' };
                if (data.message !== 'Job vanished from memory.') setError(data.message || 'Stream connection error');
            } catch (err) { setError('Stream connection closed unexpectedly.'); }
            setLoading(false);
            setJobId(null);
            eventSource.close();
            streamRef.current = null;
        });
    }

    async function handleSearch() {
        setLoading(true); setError(''); setResult(null); setTraces([]); setJobId(null); setSummaries({});
        try {
            if (streamRef.current) streamRef.current.close();
            const url = `/api/news/search?topic=${encodeURIComponent(topic)}&hours=${hours}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (!data.jobId) throw new Error("No Job ID returned from server");
            setJobId(data.jobId);
            attachToJob(data.jobId);
        } catch (err: any) { setError(err.message || String(err)); setLoading(false); }
    }

    async function handleStop() {
        if (streamRef.current) { streamRef.current.close(); streamRef.current = null; }
        if (jobId) try { await fetch(`/api/news/stop/${jobId}`, { method: 'POST' }); } catch (e) { }
        setLoading(false); setJobId(null); setError('Analysis stopped by user.');
    }

    return (
        <div className="news-page">
            <div className="news-header">
                <div>
                    <h1 className="news-header__title">AI News Hub</h1>
                    <p className="news-header__sub">Search real-time headlines and get instant AI-generated article summaries.</p>
                </div>
            </div>

            <div className="glass-card news-search-bar">
                <input
                    type="text"
                    className="os-input news-topic-input"
                    placeholder="Optional: Enter a topic, or leave blank for Top Global News"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    disabled={loading}
                />

                <div className="news-time-slider-container">
                    <label className="news-time-slider-label">Past {hours} Hour{hours > 1 ? 's' : ''}</label>
                    <input
                        type="range"
                        className="news-time-slider"
                        min="0"
                        max="3"
                        step="1"
                        value={[1, 6, 12, 24].indexOf(hours) !== -1 ? [1, 6, 12, 24].indexOf(hours) : 3}
                        onChange={e => {
                            const marks = [1, 6, 12, 24];
                            setHours(marks[parseInt(e.target.value)]);
                        }}
                        disabled={loading}
                    />
                    <div className="slider-marks">
                        <span>1h</span>
                        <span>6h</span>
                        <span>12h</span>
                        <span>24h</span>
                    </div>
                </div>

                {!loading ? (
                    <button className="btn btn-primary news-search-btn" onClick={handleSearch}>Search & Classify</button>
                ) : (
                    <button className="btn btn-secondary news-search-btn" onClick={handleStop} style={{ color: '#ff4444' }}>
                        Stop
                    </button>
                )}
            </div>

            {error && <div className="news-error glass-card"><p>{error}</p></div>}

            <div className="news-content">
                {loading && (
                    <div className="news-loading">
                        <div className="spinner"></div>
                        <p>Fetching RSS and running AI classification... This may take a moment.</p>
                        <div className="news-traces">
                            {traces.map((t, i) => <div key={i} className="news-trace-item"><span className="trace-dot"></span>{t}</div>)}
                        </div>
                    </div>
                )}

                {result && !loading && (
                    <div className="news-results-list">
                        {result.headlines.length === 0 && <p className="news-empty">No recent news found for this topic.</p>}
                        {result.headlines.map((hl, idx) => {
                            const summaryData = summaries[idx];
                            return (
                                <div key={idx} className="glass-card news-article-card">
                                    <div className="news-article-header">
                                        <div className="news-article-badges">
                                            {hl.type && <span className="news-badge type-badge">{hl.type}</span>}
                                            {hl.tag && <span className="news-badge tag-badge">{hl.tag}</span>}
                                            {hl.label && <span className="news-badge label-badge">{hl.label}</span>}
                                        </div>
                                        <span className="news-article-source">{hl.source}</span>
                                    </div>
                                    <h3 className="news-article-title">
                                        <a href={hl.link || '#'} target="_blank" rel="noopener noreferrer">{hl.title}</a>
                                    </h3>

                                    <div className="news-article-actions">
                                        <button
                                            className="btn btn-secondary btn-small"
                                            onClick={() => handleSummarize(hl.link, hl.title, idx)}
                                            disabled={summaryData?.loading}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                                            {summaryData?.loading ? 'Summarizing...' : summaryData?.text ? 'Re-Summarize' : 'AI Summary'}
                                        </button>
                                    </div>

                                    {/* Summary Block */}
                                    {(summaryData?.text || summaryData?.error) && (
                                        <div className="news-summary-block">
                                            {summaryData.error ? (
                                                <p className="news-summary-error">⚠ {summaryData.error}</p>
                                            ) : (
                                                <p className="news-summary-text">{summaryData.text}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
