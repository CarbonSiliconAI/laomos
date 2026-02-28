import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import './Telegram.css';

interface Message {
    id: number;
    text: string;
    isSelf: boolean;
    date: number;
    sender: string;
}

export default function Telegram() {
    const [token, setToken] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [chatId, setChatId] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Normally would fetch token securely from IdentityManager or local storage if saved
    // For simplicity, we just ask the user for it on mount.

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function login() {
        if (!token.trim()) return;
        setIsLoggedIn(true);
        // Start polling or fetch initial messages (will implement backend route next)
        fetchUpdates();
    }

    async function fetchUpdates() {
        if (!token) return;
        try {
            // Placeholder: we will implement this API call to the backend
            const res = await apiFetch(`/api/telegram/updates?token=${encodeURIComponent(token)}`);
            // Parse updates and append to messages state
        } catch (e) {
            console.error('Failed to fetch updates', e);
        }
    }

    async function send() {
        if (!input.trim() || !chatId.trim() || !token) return;

        const text = input.trim();
        setInput('');

        const newMsg: Message = { id: Date.now(), text, isSelf: true, date: Date.now(), sender: 'Bot' };
        setMessages(prev => [...prev, newMsg]);

        try {
            // Placeholder: implement backend send route
            await apiFetch('/api/telegram/send', {
                method: 'POST',
                body: JSON.stringify({ token, chatId, text })
            });
        } catch (e: any) {
            const newMsgError: Message = { id: Date.now() + 1, text: `Error: ${e.message}`, isSelf: false, date: Date.now(), sender: 'System' };
            setMessages(prev => [...prev, newMsgError]);
        }
    }

    // A helper apiFetch locally until we add it to the main api.ts
    async function apiFetch(url: string, opts?: RequestInit) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...opts?.headers },
            ...opts,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') send();
    }

    if (!isLoggedIn) {
        return (
            <div className="telegram-page">
                <div className="telegram-header">
                    <h1 className="telegram-header__title">Telegram Bot Access</h1>
                    <p className="telegram-header__sub">Connect your Telegram Bot to Agent OS.</p>
                </div>
                <div className="glass-card" style={{ padding: '24px', maxWidth: '400px', margin: '40px auto' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <label className="os-label">Bot Token (from @BotFather)</label>
                        <input
                            type="password"
                            className="os-input"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="123456789:ABCdefGhI..."
                        />
                    </div>
                    <button className="btn btn-primary" onClick={login} style={{ width: '100%' }}>
                        Connect
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="telegram-page chat-interface">
            <div className="telegram-header chat-header">
                <div>
                    <h1 className="telegram-header__title">Telegram Bot</h1>
                    <p className="telegram-header__sub">Connected</p>
                </div>
                <div className="telegram-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="os-input"
                        placeholder="Target Chat ID..."
                        value={chatId}
                        onChange={e => setChatId(e.target.value)}
                        style={{ width: '150px' }}
                    />
                    <button className="btn btn-secondary" onClick={fetchUpdates} disabled={loading}>
                        Refresh
                    </button>
                    <button className="btn btn-secondary btn-danger" onClick={() => setIsLoggedIn(false)}>
                        Disconnect
                    </button>
                </div>
            </div>

            <div className="chat-messages telegram-messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <span>No messages yet. Set Target Chat ID and send a message.</span>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`chat-bubble chat-bubble--${msg.isSelf ? 'user' : 'assistant'}`}>
                        <div className="chat-bubble__label">{msg.sender}</div>
                        <div className="chat-bubble__content">{msg.text}</div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-bar glass-card">
                <input
                    type="text"
                    className="chat-input"
                    placeholder={chatId ? "Type a message…" : "Enter a target Chat ID above first..."}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={!chatId}
                />
                <button
                    className="btn btn-primary chat-send-btn"
                    onClick={send}
                    disabled={!chatId || !input.trim()}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </div>
        </div>
    );
}
