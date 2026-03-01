import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { AVAILABLE_MODELS } from '../models/Models';
import './Chat.css';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = localStorage.getItem('aos_chat_messages');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.warn('Failed to parse saved chat messages.', e);
            return [];
        }
    });
    const [input, setInput] = useState('');
    const [model, setModel] = useState('');
    const [localModels, setLocalModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const cloudModels = AVAILABLE_MODELS.filter(m => m.cloud);
    const staticLocalModels = AVAILABLE_MODELS.filter(m => !m.cloud);

    // Merge dynamic local models with static ones to ensure no duplicates
    const allLocalModelIds = Array.from(new Set([
        ...staticLocalModels.map(m => m.id),
        ...localModels
    ]));

    useEffect(() => {
        api.ollamaModels().then(r => {
            const locals = r.models ?? [];
            setLocalModels(locals);

            // Set initial model
            const mergedLocals = Array.from(new Set([...staticLocalModels.map(m => m.id), ...locals]));
            if (mergedLocals.length) setModel(mergedLocals[0]);
            else if (cloudModels.length) setModel(cloudModels[0].id);
        }).catch(() => {
            if (staticLocalModels.length) setModel(staticLocalModels[0].id);
            else if (cloudModels.length) setModel(cloudModels[0].id);
        });
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Save messages to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('aos_chat_messages', JSON.stringify(messages));
        } catch (e) {
            console.error('Failed to save chat messages to local storage.', e);
        }
    }, [messages]);

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

        const controller = new AbortController();
        setAbortController(controller);

        try {
            // Determine if the selected model is cloud or local
            const isCloud = cloudModels.some(m => m.id === model);

            let res;
            if (isCloud) {
                // To support multi-cloud models natively on the backend router
                // We extract the provider from the model ID
                let provider = 'openai';
                if (model.includes('claude')) provider = 'anthropic';
                if (model.includes('gemini')) provider = 'google';

                res = await api.aiChat({ prompt: text, preferredProvider: provider, model }, { signal: controller.signal });
                const content = res.response ?? 'No response.';
                setMessages(prev => [...prev, { role: 'assistant', content }]);
            } else {
                res = await api.ollamaChat({
                    model: model,
                    messages: allMessages.map(m => ({ role: m.role, content: m.content })),
                }, { signal: controller.signal });
                const content = res.message?.content ?? res.response ?? 'No response.';
                setMessages(prev => [...prev, { role: 'assistant', content }]);
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Generation stopped by user.' }]);
            } else {
                // Show errors as assistant messages in the chat flow
                const errMsg = e.message ?? 'Request failed';
                setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }]);
            }
        } finally {
            setLoading(false);
            setAbortController(null);
        }
    }

    function stopGeneration() {
        if (abortController) {
            abortController.abort();
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {(allLocalModelIds.length > 0 || cloudModels.length > 0) && (
                        <select
                            className="os-input chat-model-select"
                            value={model}
                            onChange={e => setModel(e.target.value)}
                        >
                            {allLocalModelIds.length > 0 && (
                                <optgroup label="Local Models">
                                    {allLocalModelIds.map(id => {
                                        const staticModel = staticLocalModels.find(m => m.id === id);
                                        return <option key={id} value={id}>{staticModel ? staticModel.name : id}</option>;
                                    })}
                                </optgroup>
                            )}
                            {cloudModels.length > 0 && (
                                <optgroup label="Cloud Models">
                                    {cloudModels.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    )}
                    {messages.length > 0 && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                if (window.confirm('Clear all chat history?')) {
                                    setMessages([]);
                                }
                            }}
                        >
                            Clear Chat
                        </button>
                    )}
                </div>
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
                {loading && (
                    <button
                        className="btn btn-secondary chat-stop-btn"
                        onClick={stopGeneration}
                        style={{ marginRight: '8px', color: '#ff4444' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                        Stop
                    </button>
                )}
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
