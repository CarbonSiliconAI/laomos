import React from 'react';
import './WhatsApp.css';

export default function WhatsApp() {
    return (
        <div className="whatsapp-page">
            <div className="whatsapp-header">
                <div>
                    <h1 className="whatsapp-header__title">WhatsApp</h1>
                    <p className="whatsapp-header__sub">Scan the QR code to connect your personal WhatsApp account.</p>
                </div>
            </div>

            <div className="whatsapp-webview-container">
                {/* 
                  Using an Electron webview to embed WhatsApp without CORS or Frame-Ancestor blocking.
                  The useragent is spoofed to Chrome to satisfy WhatsApp Web's browser requirements.
                */}
                <webview
                    src="https://web.whatsapp.com/"
                    useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    className="whatsapp-webview"
                />
            </div>
        </div>
    );
}
