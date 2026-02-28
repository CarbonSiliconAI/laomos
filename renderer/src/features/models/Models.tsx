import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import './Models.css';

export default function Models() {
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [pullName, setPullName] = useState('');
    const [pulling, setPulling] = useState(false);
    const [pullStatus, setPullStatus] = useState('');

    function fetchModels() {
        setLoading(true);
        api.ollamaModels().then(r => setModels(r.models ?? [])).catch(() => setModels([])).finally(() => setLoading(false));
    }

    useEffect(() => { fetchModels(); }, []);

    async function pullModel() {
        if (!pullName.trim()) return;
        setPulling(true);
        setPullStatus('Pulling...');
        try {
            const res = await api.ollamaPull(pullName.trim());
            setPullStatus(res.status ?? 'Done');
            fetchModels();
        } catch (e: any) {
            setPullStatus('Error: ' + (e.message ?? 'failed'));
        } finally {
            setPulling(false);
        }
    }

    return (
        <div className="models-page">
            <div className="models-header">
                <div>
                    <h1 className="models-header__title">Model Manager</h1>
                    <p className="models-header__sub">Manage local Ollama models</p>
                </div>
                <button className="btn btn-ghost" onClick={fetchModels} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Refresh
                </button>
            </div>

            <div className="models-body">
                <div className="models-pull glass-card">
                    <div className="models-pull__title">Pull a Model</div>
                    <div className="models-pull__row">
                        <input className="os-input" placeholder="e.g. llama3.2, mistral, phi3" value={pullName} onChange={e => setPullName(e.target.value)} onKeyDown={e => e.key === 'Enter' && pullModel()} />
                        <button className="btn btn-primary" onClick={pullModel} disabled={pulling || !pullName.trim()}>
                            {pulling ? <><div className="spinner"/> Pulling…</> : 'Pull'}
                        </button>
                    </div>
                    {pullStatus && <p className="models-pull__status">{pullStatus}</p>}
                </div>

                <div className="models-list-wrap">
                    <div className="section-title">Installed Models ({models.length})</div>
                    {loading ? (
                        <div className="empty-state"><div className="spinner"/></div>
                    ) : models.length === 0 ? (
                        <div className="empty-state">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                            <span>No models installed. Pull one above.</span>
                        </div>
                    ) : (
                        <div className="models-grid">
                            {models.map(m => (
                                <div key={m} className="model-card glass-card">
                                    <div className="model-card__icon">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                                    </div>
                                    <div className="model-card__name">{m}</div>
                                    <span className="badge badge-ok">Ready</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
