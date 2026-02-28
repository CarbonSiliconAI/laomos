import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import './Chat.css';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [model, setModel] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.ollamaModels().then(r => {
            setModels(r.models ?? []);
            if (r.models?.length) setModel(r.models[0]);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    async function send() {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        setError('');
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setLoading(true);
        try {
            const res = await api.aiChat({ message: text, model: model || undefined });
            setMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
        } catch (e: any) {
            setError(e.message ?? 'Request failed');
        } finally {
            setLoading(false);
        }
    }

    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
        }
    }

    return (
        <div className="chat-page">
            <div className="chat-header">
                <div>
                    <h1 className="chat-header__title">AI Chat</h1>
                    <p className="chat-header__sub">Converse with local and cloud AI models</p>
                </div>
                {models.length > 0 && (
                    <select
                        className="os-input chat-model-select"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                    >
                        {models.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                )}
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        <span>Start a conversation — press ⌘↵ or click Send</span>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-bubble chat-bubble--${msg.role}`}>
                        <div className="chat-bubble__label">{msg.role === 'user' ? 'You' : 'AI'}</div>
                        <div className="chat-bubble__content">{msg.content}</div>
                    </div>
                ))}
                {loading && (
                    <div className="chat-bubble chat-bubble--assistant">
                        <div className="chat-bubble__label">AI</div>
                        <div className="chat-bubble__content chat-bubble__content--loading">
                            <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                        </div>
                    </div>
                )}
                {error && <div className="chat-error">{error}</div>}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-bar glass-card">
                <textarea
                    className="chat-input"
                    placeholder="Type a message… (⌘↵ to send)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    rows={2}
                />
                <button
                    className="btn btn-primary chat-send-btn"
                    onClick={send}
                    disabled={loading || !input.trim()}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </div>
        </div>
    );
}
