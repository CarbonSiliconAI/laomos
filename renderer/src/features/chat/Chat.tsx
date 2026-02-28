import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import './Chat.css';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const CLOUD_MODELS = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'grok-2', name: 'Grok 2' },
];

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [model, setModel] = useState('');
    const [localModels, setLocalModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        api.ollamaModels().then(r => {
            const locals = r.models ?? [];
            setLocalModels(locals);
            if (locals.length) setModel(locals[0]);
            else if (CLOUD_MODELS.length) setModel(CLOUD_MODELS[0].id);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        }
    }, [input]);

    async function send() {
        const text = input.trim();
        if (!text || loading) return;

        // Guard: no model selected
        if (!model) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Please select a model above.' }]);
            return;
        }

        setInput('');
        const userMsg: Message = { role: 'user', content: text };
        const allMessages = [...messages, userMsg];
        setMessages(allMessages);
        setLoading(true);
        try {
            const res = await api.ollamaChat({
                model: model,
                messages: allMessages.map(m => ({ role: m.role, content: m.content })),
            });
            const content = res.message?.content ?? res.response ?? 'No response.';
            setMessages(prev => [...prev, { role: 'assistant', content }]);
        } catch (e: any) {
            // Show errors as assistant messages in the chat flow
            const errMsg = e.message ?? 'Request failed';
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }]);
        } finally {
            setLoading(false);
        }
    }

    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
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
                {(localModels.length > 0 || CLOUD_MODELS.length > 0) && (
                    <select
                        className="os-input chat-model-select"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                    >
                        {localModels.length > 0 && (
                            <optgroup label="Local Models">
                                {localModels.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </optgroup>
                        )}
                        <optgroup label="Cloud Models">
                            {CLOUD_MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </optgroup>
                    </select>
                )}
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        <span>Start a conversation — press Enter to send</span>
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
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-bar glass-card">
                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    rows={1}
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
