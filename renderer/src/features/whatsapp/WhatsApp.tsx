import React, { useState, useEffect } from 'react';
import './WhatsApp.css';

declare global {
    interface Window {
        electronAPI?: {
            clearWhatsAppSession: () => Promise<{ cleared: boolean }>;
        };
    }
}

export default function WhatsApp() {
    const [status, setStatus] = useState('Loading WhatsApp Web…');

    useEffect(() => {
        // Find the webview after React has injected the HTML
        const check = setInterval(() => {
            const wv = document.getElementById('whatsapp-wv') as any;
            if (wv && wv.addEventListener) {
                clearInterval(check);

                wv.addEventListener('dom-ready', () => {
                    setStatus('Connected — scan QR code if prompted');
                });

                wv.addEventListener('did-fail-load', (e: any) => {
                    if (e.errorCode !== -3) { // ignore ERR_ABORTED
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

        // 1. Clear session via main process IPC (clears persist:whatsapp storage)
        if (window.electronAPI?.clearWhatsAppSession) {
            await window.electronAPI.clearWhatsAppSession();
        }

        // 2. Clear local storage in the webview
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

    // Use dangerouslySetInnerHTML to bypass React's custom element handling entirely
    const webviewHTML = `<webview
        id="whatsapp-wv"
        src="https://web.whatsapp.com/"
        partition="persist:whatsapp"
        useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        allowpopups=""
        class="whatsapp-webview"
    ></webview>`;

    return (
        <div className="whatsapp-page">
            <div className="whatsapp-header">
                <div>
                    <h1 className="whatsapp-header__title">WhatsApp</h1>
                    <p className="whatsapp-header__sub">{status}</p>
                </div>
                <div className="whatsapp-actions">
                    <button className="btn btn-secondary" onClick={goBack} title="Go Back">←</button>
                    <button className="btn btn-secondary" onClick={reload} title="Reload">↻</button>
                    <button className="btn btn-secondary" onClick={openDevTools} title="DevTools">🔧</button>
                    <button className="btn btn-secondary btn-danger" onClick={clearSession}>Clear Session</button>
                </div>
            </div>

            <div
                className="whatsapp-webview-container"
                dangerouslySetInnerHTML={{ __html: webviewHTML }}
            />
        </div>
    );
}
