import React, { useState, useEffect, useRef } from 'react';
import { api, apiFetch } from '../../lib/api';
import './WhatsApp.css';

declare global {
    interface Window {
        electronAPI?: {
            clearWhatsAppSession: () => Promise<{ cleared: boolean }>;
        };
    }
}

interface DaemonLog {
    timestamp: number;
    type: string;
    message: string;
}

export default function WhatsApp() {
    const [status, setStatus] = useState('Loading WhatsApp Web…');
    const [daemonRunning, setDaemonRunning] = useState(false);
    const [daemonProcessing, setDaemonProcessing] = useState(false);
    const [daemonLog, setDaemonLog] = useState<DaemonLog[]>([]);
    const [showLog, setShowLog] = useState(false);
    const [observerInjected, setObserverInjected] = useState(false);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Poll daemon status
    useEffect(() => {
        statusPollRef.current = setInterval(async () => {
            try {
                const s = await api.whatsappDaemonStatus();
                setDaemonRunning(s.running);
                setDaemonProcessing(s.processing);
                if (s.log && s.log.length > 0) {
                    setDaemonLog(s.log);
                }
            } catch { }
        }, 3000);
        return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
    }, []);

    // Auto-scroll log
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [daemonLog]);

    useEffect(() => {
        const check = setInterval(() => {
            const wv = document.getElementById('whatsapp-wv') as any;
            if (wv && wv.addEventListener) {
                clearInterval(check);

                wv.addEventListener('dom-ready', () => {
                    setStatus('Connected — scan QR code if prompted');
                });

                wv.addEventListener('did-fail-load', (e: any) => {
                    if (e.errorCode !== -3) {
                        setStatus(`Load failed (error ${e.errorCode}). Click ↻ to retry.`);
                    }
                });

                wv.addEventListener('did-start-loading', () => {
                    setStatus('Loading WhatsApp Web…');
                });
            }
        }, 200);

        return () => clearInterval(check);
    }, []);

    // Inject the message observer when daemon is toggled on
    useEffect(() => {
        if (daemonRunning && !observerInjected) {
            injectObserver();
        }
        if (!daemonRunning && observerInjected) {
            removeObserver();
        }
    }, [daemonRunning]);

    function injectObserver() {
        const wv = document.getElementById('whatsapp-wv') as any;
        if (!wv || !wv.executeJavaScript) return;

        // Inject a MutationObserver that watches for new incoming messages
        wv.executeJavaScript(`
            (function() {
                if (window.__aiosWAObserver) return 'already-injected';

                // Track seen messages to avoid duplicates
                window.__aiosSeenMsgs = new Set();
                window.__aiosObserverActive = true;

                // Periodically check for the currently open chat and new messages
                window.__aiosWAObserver = setInterval(() => {
                    if (!window.__aiosObserverActive) return;

                    try {
                        // Find all incoming message rows (messages NOT from self)
                        const msgRows = document.querySelectorAll('[data-id]');
                        
                        for (const row of msgRows) {
                            const dataId = row.getAttribute('data-id');
                            if (!dataId) continue;
                            // Skip outgoing messages (they start with "true_")
                            if (dataId.startsWith('true_')) continue;
                            // Skip already seen
                            if (window.__aiosSeenMsgs.has(dataId)) continue;

                            // Only process recent messages (check for copyable-text)
                            const copyable = row.querySelector('[data-pre-plain-text]');
                            if (!copyable) continue;

                            const textEl = row.querySelector('.selectable-text');
                            if (!textEl) continue;
                            const text = textEl.innerText?.trim();
                            if (!text) continue;

                            // Extract sender from data-pre-plain-text
                            const prePlain = copyable.getAttribute('data-pre-plain-text') || '';
                            const senderMatch = prePlain.match(/\\]\\s*(.+?):/);
                            const sender = senderMatch ? senderMatch[1] : 'Unknown';

                            // Mark as seen
                            window.__aiosSeenMsgs.add(dataId);

                            // Only forward messages that start with /ai or @ai trigger
                            if (text.toLowerCase().startsWith('/ai ') || text.toLowerCase().startsWith('@ai ')) {
                                const cleanText = text.replace(/^\\/ai\\s+/i, '').replace(/^@ai\\s+/i, '');
                                
                                // POST to backend
                                fetch('http://127.0.0.1:3123/api/whatsapp/skill-daemon/process', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: cleanText, sender: sender })
                                })
                                .then(r => r.json())
                                .then(data => {
                                    if (data.reply) {
                                        // Type the reply into the WhatsApp input box
                                        const inputBox = document.querySelector('[contenteditable="true"][data-tab="10"]')
                                            || document.querySelector('footer [contenteditable="true"]')
                                            || document.querySelector('[contenteditable="true"]');
                                        
                                        if (inputBox) {
                                            // Focus and set content
                                            inputBox.focus();
                                            // Use execCommand to properly trigger WhatsApp's input handlers
                                            document.execCommand('insertText', false, '🤖 ' + data.reply);
                                            
                                            // Wait a moment for WhatsApp to process the input
                                            setTimeout(() => {
                                                const sendBtn = document.querySelector('[data-icon="send"]')
                                                    || document.querySelector('button[aria-label="Send"]')
                                                    || document.querySelector('span[data-icon="send"]');
                                                if (sendBtn) {
                                                    sendBtn.closest('button')?.click() || sendBtn.click();
                                                }
                                            }, 300);
                                        }
                                    }
                                })
                                .catch(err => console.error('[AiOS WA Observer] Error:', err));
                            }
                        }
                    } catch (err) {
                        console.error('[AiOS WA Observer] Error:', err);
                    }
                }, 2000);

                return 'observer-injected';
            })();
        `).then((result: string) => {
            console.log('[WhatsApp] Observer injection result:', result);
            setObserverInjected(true);
        }).catch((err: Error) => {
            console.error('[WhatsApp] Failed to inject observer:', err);
        });
    }

    function removeObserver() {
        const wv = document.getElementById('whatsapp-wv') as any;
        if (!wv || !wv.executeJavaScript) return;

        wv.executeJavaScript(`
            (function() {
                if (window.__aiosWAObserver) {
                    clearInterval(window.__aiosWAObserver);
                    window.__aiosWAObserver = null;
                }
                window.__aiosObserverActive = false;
                return 'observer-removed';
            })();
        `).then(() => {
            setObserverInjected(false);
        }).catch(() => { });
    }

    async function toggleDaemon() {
        try {
            if (daemonRunning) {
                await api.whatsappDaemonStop();
                setDaemonRunning(false);
            } else {
                await api.whatsappDaemonStart();
                setDaemonRunning(true);
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
    }

    function reload() {
        const wv = document.getElementById('whatsapp-wv') as any;
        if (wv?.reload) { wv.reload(); setStatus('Reloading…'); }
    }

    function goBack() {
        (document.getElementById('whatsapp-wv') as any)?.goBack();
    }

    function openDevTools() {
        (document.getElementById('whatsapp-wv') as any)?.openDevTools();
    }

    async function clearSession() {
        const wv = document.getElementById('whatsapp-wv') as any;
        if (!wv) return;

        setStatus('Clearing session and cookies…');

        if (window.electronAPI?.clearWhatsAppSession) {
            await window.electronAPI.clearWhatsAppSession();
        }

        try {
            await wv.executeJavaScript(`
                try { localStorage.clear(); } catch(e) {}
                try { sessionStorage.clear(); } catch(e) {}
                'cleared';
            `);
        } catch (e) { }

        setStatus('Session cleared. Reloading…');
        wv.loadURL('https://web.whatsapp.com/');
    }

    const webviewHTML = `<webview
        id="whatsapp-wv"
        src="https://web.whatsapp.com/"
        partition="persist:whatsapp"
        useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        allowpopups=""
        class="whatsapp-webview"
    ></webview>`;

    function logTypeIcon(type: string) {
        switch (type) {
            case 'info': return 'ℹ️';
            case 'match': return '🎯';
            case 'execute': return '⚡';
            case 'reply': return '💬';
            case 'error': return '❌';
            default: return '•';
        }
    }

    return (
        <div className="whatsapp-page">
            <div className="whatsapp-header">
                <div>
                    <h1 className="whatsapp-header__title">WhatsApp</h1>
                    <p className="whatsapp-header__sub">{status}</p>
                </div>
                <div className="whatsapp-actions">
                    <button
                        className={`btn ${daemonRunning ? 'btn-danger' : 'btn-primary'}`}
                        onClick={toggleDaemon}
                        title={daemonRunning ? 'Stop AI Skills Daemon' : 'Start AI Skills Daemon'}
                    >
                        {daemonRunning ? '🛑 AI Skills Active' : '🤖 AI Skills'}
                        {daemonProcessing && <div className="spinner" style={{ width: 12, height: 12, marginLeft: 6, borderWidth: 2 }} />}
                    </button>
                    {daemonRunning && (
                        <button
                            className={`btn btn-secondary ${showLog ? 'btn-active' : ''}`}
                            onClick={() => setShowLog(!showLog)}
                            title="Toggle Activity Log"
                        >
                            📋 Log
                        </button>
                    )}
                    <button className="btn btn-secondary" onClick={goBack} title="Go Back">←</button>
                    <button className="btn btn-secondary" onClick={reload} title="Reload">↻</button>
                    <button className="btn btn-secondary" onClick={openDevTools} title="DevTools">🔧</button>
                    <button className="btn btn-secondary btn-danger" onClick={clearSession}>Clear Session</button>
                </div>
            </div>

            {daemonRunning && (
                <div className="wa-daemon-status-bar">
                    <span className="wa-daemon-dot" />
                    AI Skills listening — send <code>/ai</code> or <code>@ai</code> followed by your request in any chat
                    {daemonProcessing && <span className="wa-daemon-processing"> • Processing...</span>}
                </div>
            )}

            <div className="whatsapp-main-area">
                <div
                    className="whatsapp-webview-container"
                    dangerouslySetInnerHTML={{ __html: webviewHTML }}
                />

                {showLog && daemonRunning && (
                    <div className="wa-daemon-log-panel">
                        <div className="wa-daemon-log-header">
                            <span>Activity Log</span>
                            <button className="btn btn-ghost" onClick={() => setShowLog(false)} style={{ padding: '2px 6px', fontSize: 12 }}>✕</button>
                        </div>
                        <div className="wa-daemon-log-entries">
                            {daemonLog.length === 0 ? (
                                <div className="wa-daemon-log-empty">Waiting for messages...</div>
                            ) : (
                                daemonLog.map((entry, i) => (
                                    <div key={i} className={`wa-daemon-log-entry wa-daemon-log-${entry.type}`}>
                                        <span className="wa-daemon-log-time">
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="wa-daemon-log-icon">{logTypeIcon(entry.type)}</span>
                                        <span className="wa-daemon-log-msg">{entry.message}</span>
                                    </div>
                                ))
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
