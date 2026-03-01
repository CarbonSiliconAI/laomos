import React, { useState, useCallback } from 'react';
import './WhatsApp.css';

export default function WhatsApp() {
    const [status, setStatus] = useState('Scan QR code to connect your WhatsApp account.');

    // Use a callback ref — React calls this with the DOM element when it mounts
    const webviewCallbackRef = useCallback((node: any) => {
        if (!node) return;
        // Electron webview events
        node.addEventListener('dom-ready', () => {
            setStatus('Connected — scan QR code if prompted');
        });
        node.addEventListener('did-fail-load', (e: any) => {
            if (e.errorCode !== -3) { // ignore ERR_ABORTED
                setStatus(`Failed to load (error ${e.errorCode}). Click ↻ to retry.`);
            }
        });
    }, []);

    function getWebview(): any {
        return document.getElementById('whatsapp-wv');
    }

    function reload() {
        const wv = getWebview();
        if (wv) {
            wv.reload();
            setStatus('Reloading…');
        }
    }

    function goBack() {
        getWebview()?.goBack();
    }

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
                </div>
            </div>

            <div className="whatsapp-webview-container">
                {/* @ts-ignore — Electron webview custom element */}
                <webview
                    id="whatsapp-wv"
                    ref={webviewCallbackRef}
                    src="https://web.whatsapp.com/"
                    partition="persist:whatsapp"
                    useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    allowpopups=""
                    className="whatsapp-webview"
                />
            </div>
        </div>
    );
}
