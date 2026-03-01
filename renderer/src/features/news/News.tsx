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

    // Save everything to localStorage whenever meaningful state changes
    React.useEffect(() => {
        localStorage.setItem('aos_news_state', JSON.stringify({ topic, hours, result, traces, jobId }));
    }, [topic, hours, result, traces, jobId]);

    // Unmount cleanup logic (critical for severing active text/event-stream sockets)
    React.useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.close();
                streamRef.current = null;
            }
        };
    }, []);

    // Reattach on mount if we have an active job that was loading
    React.useEffect(() => {
        if (jobId && loading) {
            attachToJob(jobId);
        }
    }, []);

    function attachToJob(targetJobId: string) {
        if (streamRef.current) streamRef.current.close();

        const url = `/api/news/stream/${targetJobId}`;
        const eventSource = new EventSource(url);
        streamRef.current = eventSource;

        eventSource.addEventListener('trace', (e) => {
            try {
                const data = JSON.parse(e.data);
                // We don't want to duplicate traces on re-attach
                setTraces(prev => {
                    const msg = data.message || JSON.stringify(data);
                    if (!prev.includes(msg)) return [...prev, msg];
                    return prev;
                });
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
                setJobId(null);
                eventSource.close();
                streamRef.current = null;
            }
        });

        eventSource.addEventListener('error', (e: any) => {
            console.error('SSE Error:', e);
            try {
                const data = e.data ? JSON.parse(e.data) : { message: 'Stream connection error' };
                if (data.message !== 'Job vanished from memory.') {
                    setError(data.message || 'Stream connection error');
                }
            } catch (err) {
                setError('Stream connection closed unexpectedly.');
            }
            setLoading(false);
            setJobId(null);
            eventSource.close();
            streamRef.current = null;
        });
    }

    async function handleSearch() {
        setLoading(true);
        setError('');
        setResult(null);
        setTraces([]);
        setJobId(null);

        try {
            if (streamRef.current) streamRef.current.close();

            const url = `/api/news/search?topic=${encodeURIComponent(topic)}&hours=${hours}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            if (!data.jobId) throw new Error("No Job ID returned from server");

            setJobId(data.jobId);
            attachToJob(data.jobId);

        } catch (err: any) {
            setError(err.message || String(err));
            setLoading(false);
        }
    }

    async function handleStop() {
        if (streamRef.current) {
            streamRef.current.close();
            streamRef.current = null;
        }
        if (jobId) {
            try {
                await fetch(`/api/news/stop/${jobId}`, { method: 'POST' });
            } catch (e) {
                console.error("Failed to stop job on server", e);
            }
        }
        setLoading(false);
        setJobId(null);
        setError('Analysis stopped by user.');
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
                {!loading ? (
                    <button
                        className="btn btn-primary news-search-btn"
                        onClick={handleSearch}
                    >
                        Search & Analyze
                    </button>
                ) : (
                    <button
                        className="btn btn-secondary news-search-btn"
                        onClick={handleStop}
                        style={{ color: '#ff4444' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                        Stop
                    </button>
                )}
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
