import React, { useState } from 'react';
import { api } from '../../lib/api';
import '../../pages/SectionPage.css';

export default function AutoConfigPage() {
    const [configRunning, setConfigRunning] = useState(false);
    const [configLog, setConfigLog] = useState('');

    async function runAutoConfig() {
        setConfigRunning(true);
        setConfigLog('Starting system auto-configuration...\nThis will install node, python, and ollama using your system\'s default package manager (brew/winget/apt).\nThis might take a few minutes.');
        try {
            const res = await api.systemAutoConfig();
            setConfigLog(prev => prev + '\n\n' + (res.log || 'Completed successfully.'));
        } catch (err: any) {
            setConfigLog(prev => prev + '\n\nError: ' + err.message);
        } finally {
            setConfigRunning(false);
        }
    }

    return (
        <div className="section-page">
            <div className="section-header">
                <h2 className="section-header__title">Auto-Config</h2>
                <p className="section-header__sub">Install and configure all dependencies needed for local AI Agents</p>
            </div>

            <div className="section-cards" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="section-card glass-card" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default', pointerEvents: 'auto', display: 'flex' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <div className="section-card__icon" style={{ background: 'rgba(16, 185, 129, 0.85)' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                        </div>
                        <div className="section-card__body">
                            <div className="section-card__title">System Auto-Config</div>
                            <div className="section-card__desc">Install necessary environment dependencies (Node/npm, Python, Ollama) via your system's package manager</div>
                        </div>
                        <button className="btn btn-primary" onClick={runAutoConfig} disabled={configRunning} style={{ marginLeft: 'auto', textTransform: 'none', padding: '0 16px', height: '36px' }}>
                            {configRunning ? <><div className="spinner" /> Configuring…</> : 'Run Auto-Config'}
                        </button>
                    </div>
                    {configLog && (
                        <div className="settings-log-box mono" style={{
                            marginTop: '16px',
                            padding: '12px',
                            background: 'var(--bg-3)',
                            borderRadius: '6px',
                            fontSize: 'var(--fs-xs)',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            width: '100%',
                            boxSizing: 'border-box'
                        }}>
                            {configLog}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
