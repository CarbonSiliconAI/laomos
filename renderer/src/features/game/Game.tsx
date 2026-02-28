import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import type { GameState } from '../../lib/api';
import './Game.css';

export default function Game() {
    const [state, setGameState] = useState<GameState | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [model, setModel] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.gameState().then(s => setGameState(s)).catch(() => {});
        api.ollamaModels().then(r => {
            setModels(r.models ?? []);
            if (r.models?.length) setModel(r.models[0]);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state?.history]);

    async function sendAction() {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        setError('');
        setLoading(true);
        try {
            const res = await api.gameChat(text, model || undefined);
            setGameState(prev => prev ? {
                context: res.context ?? prev.context,
                inventory: res.inventory ?? prev.inventory,
                history: [...prev.history, { role: 'user', content: text }, { role: 'assistant', content: res.response }],
            } : prev);
        } catch (e: any) {
            setError(e.message ?? 'Request failed');
        } finally {
            setLoading(false);
        }
    }

    async function resetGame() {
        if (!confirm('Reset game? All progress will be lost.')) return;
        await api.gameReset().catch(() => {});
        api.gameState().then(s => setGameState(s)).catch(() => {});
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendAction();
        }
    }

    return (
        <div className="game-page">
            <div className="game-header">
                <div>
                    <h1 className="game-header__title">Adventure</h1>
                    <p className="game-header__sub">AI-powered text adventure game</p>
                </div>
                <div className="game-header__controls">
                    {models.length > 0 && (
                        <select className="os-input game-model-select" value={model} onChange={e => setModel(e.target.value)}>
                            {models.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    )}
                    <button className="btn btn-ghost" onClick={resetGame}>Reset Game</button>
                </div>
            </div>

            <div className="game-body">
                <div className="game-sidebar glass-card">
                    <div className="game-sidebar__section">
                        <div className="section-title">World State</div>
                        <p className="game-sidebar__text">{state?.context ?? '…'}</p>
                    </div>
                    <div className="divider" />
                    <div className="game-sidebar__section">
                        <div className="section-title">Inventory</div>
                        <pre className="game-sidebar__text">{state?.inventory ?? '…'}</pre>
                    </div>
                </div>

                <div className="game-main">
                    <div className="game-log glass-card">
                        {(!state?.history || state.history.length === 0) && (
                            <div className="game-log__empty">
                                <span>Your adventure begins… type an action below</span>
                            </div>
                        )}
                        {state?.history.map((msg, i) => (
                            <div key={i} className={`game-msg game-msg--${msg.role}`}>
                                {msg.role === 'user' && (
                                    <span className="game-msg__prefix">&gt; </span>
                                )}
                                <span className="game-msg__content">{msg.content}</span>
                            </div>
                        ))}
                        {loading && (
                            <div className="game-msg game-msg--assistant game-msg--loading">
                                <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                            </div>
                        )}
                        {error && <div className="game-msg game-msg--error">{error}</div>}
                        <div ref={bottomRef} />
                    </div>

                    <div className="game-input-bar glass-card">
                        <span className="game-prompt">&gt;</span>
                        <input
                            className="game-input"
                            placeholder="What do you do?"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            disabled={loading}
                            autoFocus
                        />
                        <button
                            className="btn btn-primary game-send-btn"
                            onClick={sendAction}
                            disabled={loading || !input.trim()}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
