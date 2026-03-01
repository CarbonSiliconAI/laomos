import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Browser.css';

// Electron <webview> missing type definitions
export interface HTMLWebViewElement extends HTMLElement {
    src: string;
    partition: string;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    loadURL(url: string): void;
}

export default function Browser() {
    const [urlInput, setUrlInput] = useState('https://www.google.com');
    const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
    const [engines, setEngines] = useState<string[]>(['Google']);
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [isAiSearching, setIsAiSearching] = useState(false);

    // Webview reference and state
    const webviewRef = useRef<HTMLWebViewElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Search Engines
    const ENGINES: Record<string, string> = {
        Google: 'https://www.google.com/search?q=',
        Bing: 'https://www.bing.com/search?q=',
        DuckDuckGo: 'https://duckduckgo.com/?q=',
        Perplexity: 'https://www.perplexity.ai/search?q=',
    };

    const attachWebviewListeners = useCallback((wv: HTMLWebViewElement) => {
        wv.addEventListener('did-start-loading', () => setIsLoading(true));
        wv.addEventListener('did-stop-loading', () => {
            setIsLoading(false);
            setCanGoBack(wv.canGoBack());
            setCanGoForward(wv.canGoForward());
        });
        wv.addEventListener('did-navigate', (e: any) => {
            setCurrentUrl(e.url);
            setUrlInput(e.url);
        });
        wv.addEventListener('did-navigate-in-page', (e: any) => {
            setCurrentUrl(e.url);
            setUrlInput(e.url);
        });
        wv.addEventListener('page-title-updated', (e: any) => {
            // Optional: Show title somewhere?
        });
        wv.addEventListener('new-window', (e: any) => {
            // Force links opening in new window to load in THIS webview
            wv.loadURL(e.url);
        });
    }, []);

    // Inject Webview
    useEffect(() => {
        const createWebview = () => {
            if (!containerRef.current) return;
            const wv = document.createElement('webview') as unknown as HTMLWebViewElement;
            wv.src = currentUrl;
            wv.className = 'browser-webview';
            wv.partition = 'persist:browser';
            containerRef.current.appendChild(wv);
            webviewRef.current = wv;
            attachWebviewListeners(wv);
        };

        if (containerRef.current && !webviewRef.current) {
            createWebview();
        }

        return () => {
            if (webviewRef.current && containerRef.current) {
                containerRef.current.removeChild(webviewRef.current);
                webviewRef.current = null;
            }
        };
    }, []);

    const handleGo = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setAiResult(null); // Clear AI result if navigating normally
        if (!webviewRef.current) return;

        let target = urlInput.trim();

        if (!target.startsWith('http://') && !target.startsWith('https://')) {
            if (!target.includes('.') || target.includes(' ')) {
                const searchEngine = engines.length > 0 ? engines[0] : 'Google';
                target = ENGINES[searchEngine] + encodeURIComponent(target);
            } else {
                target = 'https://' + target;
            }
        }

        webviewRef.current.src = target;
    };

    const handleAiSearch = async () => {
        if (!urlInput.trim()) return;
        setIsAiSearching(true);
        setAiResult(null);

        try {
            const res = await fetch('http://127.0.0.1:3123/api/apps/browser-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: urlInput, engines: engines.length ? engines : ['Google'] })
            });
            const data = await res.json();
            if (data.result) {
                setAiResult(data.result);
            } else {
                setAiResult(`*Error: ${data.error || 'Failed to synthesize search'}*`);
            }
        } catch (err: any) {
            setAiResult(`*Error: request failed.*`);
        } finally {
            setIsAiSearching(false);
        }
    };

    const toggleEngine = (eng: string) => {
        setEngines(prev => {
            const isSelected = prev.includes(eng);
            const next = isSelected ? prev.filter(e => e !== eng) : [...prev, eng];

            // Auto-navigate to first selected engine if user is just switching (not searching)
            if (next.length > 0 && webviewRef.current) {
                const baseUrl = ENGINES[next[0]].split('/search?q=')[0].split('/?q=')[0];
                webviewRef.current.src = baseUrl;
            }

            return next.length ? next : ['Google']; // Ensure at least one is selected
        });
    };

    const handleBack = () => { setAiResult(null); webviewRef.current?.goBack(); };
    const handleForward = () => webviewRef.current?.goForward();
    const handleReload = () => webviewRef.current?.reload();

    // Helper to format simple markdown-like output
    const renderMarkdown = (text: string) => {
        // Just a simple wrapper, if react-markdown isn't available
        return <div style={{ padding: '20px', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '15px' }} dangerouslySetInnerHTML={{ __html: text.replace(/\n\n/g, '<br/><br/>') }} />;
    };

    return (
        <div className="browser-page">
            <div className="browser-header glass-card">
                <div className="browser-nav-group">
                    <button className="btn btn-icon browser-nav-btn" onClick={handleBack} disabled={!canGoBack}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                    </button>
                    <button className="btn btn-icon browser-nav-btn" onClick={handleForward} disabled={!canGoForward}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>
                    </button>
                    <button className="btn btn-icon browser-nav-btn" onClick={handleReload}>
                        {isLoading ? (
                            <svg className="browser-nav-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                        )}
                    </button>
                </div>

                <form className="browser-url-bar" onSubmit={handleGo}>
                    <div className="browser-engine-toggles">
                        {Object.keys(ENGINES).map(key => (
                            <button
                                key={key}
                                type="button"
                                className={`browser-engine-toggle ${engines.includes(key) ? 'active' : ''}`}
                                onClick={() => toggleEngine(key)}
                            >
                                {key}
                            </button>
                        ))}
                    </div>

                    <input
                        type="text"
                        className="os-input browser-url-input"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="Enter URL to browse, or topic for AI Search..."
                    />

                    <button type="submit" className="btn btn-secondary browser-go-btn" style={{ padding: '0 12px' }}>Browse</button>
                    <button type="button" className="btn btn-primary" onClick={handleAiSearch} disabled={isAiSearching}>
                        {isAiSearching ? 'Synthesizing...' : '🤖 AI Search'}
                    </button>
                </form>
            </div>

            <div className="browser-main-area" style={{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' }}>
                {aiResult && (
                    <div className="browser-ai-panel glass-card" style={{ flex: '0 0 400px', overflowY: 'auto' }}>
                        <h3 style={{ padding: '20px 20px 0', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                            AI Synthesized Results
                        </h3>
                        {renderMarkdown(aiResult)}
                    </div>
                )}

                <div className="browser-content-container" ref={containerRef} style={{ flex: 1 }}>
                    {/* Dynamically injected <webview> goes here */}
                </div>
            </div>
        </div>
    );
}
