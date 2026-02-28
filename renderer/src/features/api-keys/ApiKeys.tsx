import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import './ApiKeys.css';

const PROVIDERS = [
    { id: 'openai', label: 'OpenAI', color: '#10a37f', placeholder: 'sk-...' },
    { id: 'anthropic', label: 'Anthropic', color: '#d97706', placeholder: 'sk-ant-...' },
    { id: 'google', label: 'Google AI', color: '#4285f4', placeholder: 'AIza...' },
    { id: 'xai', label: 'xAI', color: '#1d1d1f', placeholder: 'xai-...' },
];

export default function ApiKeys() {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [statuses, setStatuses] = useState<Record<string, 'idle' | 'saving' | 'verifying' | 'valid' | 'invalid'>>({});

    useEffect(() => {
        api.keysGet().then(k => setKeys(k ?? {})).catch(() => {});
    }, []);

    async function save(provider: string) {
        const key = inputs[provider]?.trim();
        if (!key) return;
        setStatuses(s => ({ ...s, [provider]: 'saving' }));
        try {
            await api.keysSet(provider, key);
            setKeys(k => ({ ...k, [provider]: '••••••••' }));
            setInputs(i => ({ ...i, [provider]: '' }));
            setStatuses(s => ({ ...s, [provider]: 'idle' }));
        } catch { setStatuses(s => ({ ...s, [provider]: 'idle' })); }
    }

    async function verify(provider: string) {
        setStatuses(s => ({ ...s, [provider]: 'verifying' }));
        try {
            const res = await api.keysVerify(provider, inputs[provider] ?? '');
            setStatuses(s => ({ ...s, [provider]: res.valid ? 'valid' : 'invalid' }));
        } catch { setStatuses(s => ({ ...s, [provider]: 'invalid' })); }
    }

    async function del(provider: string) {
        await api.keysDelete(provider).catch(() => {});
        setKeys(k => { const next = { ...k }; delete next[provider]; return next; });
    }

    return (
        <div className="apikeys-page">
            <div className="apikeys-header">
                <h1 className="apikeys-header__title">API Keys</h1>
                <p className="apikeys-header__sub">Manage provider credentials securely</p>
            </div>
            <div className="apikeys-body">
                {PROVIDERS.map(p => {
                    const status = statuses[p.id] ?? 'idle';
                    const hasKey = !!keys[p.id];
                    return (
                        <div key={p.id} className="apikey-card glass-card">
                            <div className="apikey-card__header">
                                <div className="apikey-card__dot" style={{ background: p.color }} />
                                <div className="apikey-card__label">{p.label}</div>
                                {hasKey && <span className="badge badge-ok">Set</span>}
                                {!hasKey && <span className="badge badge-muted">Not set</span>}
                            </div>
                            {hasKey && (
                                <div className="apikey-card__current">
                                    <span className="mono" style={{ color: 'var(--muted)' }}>{keys[p.id]}</span>
                                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => del(p.id)}>Remove</button>
                                </div>
                            )}
                            <div className="apikey-card__row">
                                <input
                                    className="os-input"
                                    type="password"
                                    placeholder={p.placeholder}
                                    value={inputs[p.id] ?? ''}
                                    onChange={e => setInputs(i => ({ ...i, [p.id]: e.target.value }))}
                                />
                                <button className="btn btn-ghost" onClick={() => verify(p.id)} disabled={status === 'verifying' || !inputs[p.id]?.trim()}>
                                    {status === 'verifying' ? <><div className="spinner" /> Checking…</> : 'Verify'}
                                </button>
                                <button className="btn btn-primary" onClick={() => save(p.id)} disabled={status === 'saving' || !inputs[p.id]?.trim()}>
                                    {status === 'saving' ? <><div className="spinner" /> Saving…</> : 'Save'}
                                </button>
                            </div>
                            {status === 'valid' && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)', marginTop: 4 }}>Key is valid</p>}
                            {status === 'invalid' && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--bad)', marginTop: 4 }}>Key is invalid</p>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
