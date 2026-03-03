import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import './Models.css';

export const AVAILABLE_MODELS = [
    // Local models (Ollama)
    { id: 'qwen3.5:0.6b', name: 'Qwen 3.5 (0.6B)', size: '400MB', desc: "Alibaba's latest nano model", cloud: false },
    { id: 'qwen3.5:1.5b', name: 'Qwen 3.5 (1.5B)', size: '1.0GB', desc: "Alibaba's latest micro model", cloud: false },
    { id: 'qwen3.5:4b', name: 'Qwen 3.5 (4B)', size: '2.6GB', desc: "Alibaba's strong small model", cloud: false },
    { id: 'qwen3.5:8b', name: 'Qwen 3.5 (8B)', size: '5.2GB', desc: "Alibaba's powerful 8B model", cloud: false },
    { id: 'llama4-scout', name: 'Llama 4 Scout (17B)', size: '12GB', desc: "Meta's latest open model", cloud: false },
    { id: 'llama3.3', name: 'Llama 3.3 (70B)', size: '40GB', desc: "Meta's refined 70B model", cloud: false },
    { id: 'llama3.1', name: 'Llama 3.1 (8B)', size: '4.7GB', desc: "Meta's reliable 8B workhorse", cloud: false },
    { id: 'gemma3', name: 'Gemma 3 (4B)', size: '3.3GB', desc: "Google's latest open model", cloud: false },
    { id: 'gemma3:12b', name: 'Gemma 3 (12B)', size: '8.1GB', desc: "Google's capable 12B model", cloud: false },
    { id: 'deepseek-r1:8b', name: 'DeepSeek R1 (8B)', size: '4.9GB', desc: "DeepSeek's open reasoning model", cloud: false },
    { id: 'deepseek-r1:14b', name: 'DeepSeek R1 (14B)', size: '9.0GB', desc: "DeepSeek's larger reasoning model", cloud: false },
    { id: 'phi4', name: 'Phi-4 (14B)', size: '9.1GB', desc: "Microsoft's latest reasoning model", cloud: false },
    { id: 'phi4-mini', name: 'Phi-4 Mini (3.8B)', size: '2.5GB', desc: "Microsoft's efficient small model", cloud: false },
    { id: 'mistral-small3.2', name: 'Mistral Small 3.2 (24B)', size: '15GB', desc: "Mistral's latest small model", cloud: false },
    { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', size: '8.9GB', desc: 'Top-tier coding model', cloud: false },
    // Cloud models (require API keys)
    { id: 'gpt-5.2', name: 'GPT-5.2', size: 'Cloud', desc: "OpenAI's latest flagship model", cloud: true },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', size: 'Cloud', desc: "OpenAI's highest precision model", cloud: true },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', size: 'Cloud', desc: "OpenAI's fast and efficient model", cloud: true },
    { id: 'o3-mini', name: 'o3-mini', size: 'Cloud', desc: "OpenAI's fast reasoning model", cloud: true },
    { id: 'o1', name: 'o1', size: 'Cloud', desc: "OpenAI's advanced reasoning model", cloud: true },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', size: 'Cloud', desc: "Anthropic's latest flagship model", cloud: true },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', size: 'Cloud', desc: "Anthropic's hybrid reasoning model", cloud: true },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', size: 'Cloud', desc: "Anthropic's fastest model", cloud: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', size: 'Cloud', desc: "Google's most capable model", cloud: true },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', size: 'Cloud', desc: "Google's fast and efficient model", cloud: true },
    { id: 'grok-3', name: 'Grok 3', size: 'Cloud', desc: "xAI's latest powerful model", cloud: true },
];

export default function Models() {
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [pullName, setPullName] = useState('');
    const [pulling, setPulling] = useState<string>(''); // model id being pulled
    const [pullStatus, setPullStatus] = useState('');
    const [recommended, setRecommended] = useState<string[]>([]);

    function fetchModels() {
        setLoading(true);
        api.ollamaModels().then(r => setModels(r.models ?? [])).catch(() => setModels([])).finally(() => setLoading(false));
    }

    useEffect(() => {
        fetchModels();
        api.systemSpecs().then(s => setRecommended(s.recommendedModels ?? [])).catch(() => { });
    }, []);

    async function pullModel(modelId?: string) {
        const name = modelId || pullName.trim();
        if (!name) return;
        setPulling(name);
        if (!modelId) setPullStatus('Pulling...');
        try {
            const res = await api.ollamaPull(name);
            if (!modelId) setPullStatus(res.status ?? 'Done');
            fetchModels();
        } catch (e: any) {
            if (!modelId) setPullStatus('Error: ' + (e.message ?? 'failed'));
        } finally {
            setPulling('');
        }
    }

    const isRec = (id: string) => recommended.some(r => id.includes(r) || r.includes(id));
    const isInstalled = (id: string) => models.some(m => m.startsWith(id) || id.startsWith(m.split(':')[0]));

    // Sort: recommended first
    const sortedCatalog = [...AVAILABLE_MODELS].sort((a, b) => {
        const ar = isRec(a.id) ? 1 : 0;
        const br = isRec(b.id) ? 1 : 0;
        return br - ar;
    });

    return (
        <div className="models-page">
            <div className="models-header">
                <div>
                    <h1 className="models-header__title">Model Manager</h1>
                    <p className="models-header__sub">Manage local Ollama models</p>
                </div>
                <button className="btn btn-ghost" onClick={fetchModels} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Refresh
                </button>
            </div>

            <div className="models-body">
                {/* Custom pull */}
                <div className="models-pull glass-card">
                    <div className="models-pull__title">Pull a Model</div>
                    <div className="models-pull__row">
                        <input className="os-input" placeholder="e.g. llama3.2, mistral, phi3" value={pullName} onChange={e => setPullName(e.target.value)} onKeyDown={e => e.key === 'Enter' && pullModel()} />
                        <button className="btn btn-primary" onClick={() => pullModel()} disabled={!!pulling || !pullName.trim()}>
                            {pulling === pullName.trim() ? <><div className="spinner" /> Pulling...</> : 'Pull'}
                        </button>
                    </div>
                    {pullStatus && <p className="models-pull__status">{pullStatus}</p>}
                </div>

                {/* Model Catalog */}
                <div className="models-list-wrap">
                    <div className="section-title">Available Models</div>
                    <div className="models-catalog">
                        {sortedCatalog.map(m => (
                            <div key={m.id} className="model-catalog-item glass-card">
                                <div className="model-catalog-item__info">
                                    <div className="model-catalog-item__name">
                                        {m.name}
                                        <span className="model-catalog-item__size">({m.size})</span>
                                        {isRec(m.id) && <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: 10 }}>Recommended</span>}
                                        {m.cloud && <span className="badge" style={{ marginLeft: 6, fontSize: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>Cloud</span>}
                                    </div>
                                    <div className="model-catalog-item__desc">{m.desc}</div>
                                </div>
                                {m.cloud ? (
                                    <span className="badge" style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--muted)', fontSize: 11 }}>Cloud Model</span>
                                ) : isInstalled(m.id) ? (
                                    <span className="badge badge-ok">Installed</span>
                                ) : (
                                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => pullModel(m.id)} disabled={!!pulling}>
                                        {pulling === m.id ? <><div className="spinner" /> Pulling...</> : 'Pull'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Installed Models */}
                <div className="models-list-wrap">
                    <div className="section-title">Installed Models ({models.length})</div>
                    {loading ? (
                        <div className="empty-state"><div className="spinner" /></div>
                    ) : models.length === 0 ? (
                        <div className="empty-state">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                            <span>No models installed. Pull one above.</span>
                        </div>
                    ) : (
                        <div className="models-grid">
                            {models.map(m => (
                                <div key={m} className="model-card glass-card">
                                    <div className="model-card__icon">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
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
