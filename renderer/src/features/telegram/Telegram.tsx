import React, { useState, useEffect, useRef } from 'react';
import './Telegram.css';

interface Message {
    id: number;
    text: string;
    isSelf: boolean;
    date: number;
    sender: string;
}

interface SavedToken { label: string; token: string; }
interface SavedChatId { label: string; chatId: string; }

export default function Telegram() {
    // ── Saved Config ─────────────────────────────────────────────────
    const [savedTokens, setSavedTokens] = useState<SavedToken[]>([]);
    const [savedChatIds, setSavedChatIds] = useState<SavedChatId[]>([]);

    // ── Active State ─────────────────────────────────────────────────
    const [token, setToken] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [chatId, setChatId] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const offsetRef = useRef<number | undefined>(undefined);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Add-new Inputs ───────────────────────────────────────────────
    const [showAddToken, setShowAddToken] = useState(false);
    const [newTokenLabel, setNewTokenLabel] = useState('');
    const [newTokenValue, setNewTokenValue] = useState('');
    const [showAddChatId, setShowAddChatId] = useState(false);
    const [newChatIdLabel, setNewChatIdLabel] = useState('');
    const [newChatIdValue, setNewChatIdValue] = useState('');

    // ── Load saved config on mount ───────────────────────────────────
    useEffect(() => {
        fetchConfig();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function fetchConfig() {
        try {
            const res = await apiFetch('/api/telegram/config');
            setSavedTokens(res.tokens || []);
            setSavedChatIds(res.chatIds || []);
        } catch (e) { console.error('Failed to load telegram config', e); }
    }

    // ── Token CRUD ───────────────────────────────────────────────────
    async function addToken() {
        if (!newTokenLabel.trim() || !newTokenValue.trim()) return;
        try {
            await apiFetch('/api/telegram/config/token', {
                method: 'POST',
                body: JSON.stringify({ label: newTokenLabel.trim(), token: newTokenValue.trim() }),
            });
            setNewTokenLabel('');
            setNewTokenValue('');
            setShowAddToken(false);
            await fetchConfig();
        } catch (e: any) { alert('Error: ' + e.message); }
    }

    async function deleteToken(label: string) {
        if (!confirm(`Delete token "${label}"?`)) return;
        try {
            await apiFetch(`/api/telegram/config/token?label=${encodeURIComponent(label)}`, { method: 'DELETE' });
            await fetchConfig();
        } catch (e: any) { alert('Error: ' + e.message); }
    }

    // ── Chat ID CRUD ─────────────────────────────────────────────────
    async function addChatId() {
        if (!newChatIdLabel.trim() || !newChatIdValue.trim()) return;
        try {
            await apiFetch('/api/telegram/config/chatid', {
                method: 'POST',
                body: JSON.stringify({ label: newChatIdLabel.trim(), chatId: newChatIdValue.trim() }),
            });
            setNewChatIdLabel('');
            setNewChatIdValue('');
            setShowAddChatId(false);
            await fetchConfig();
        } catch (e: any) { alert('Error: ' + e.message); }
    }

    async function deleteChatId(label: string) {
        if (!confirm(`Delete chat ID "${label}"?`)) return;
        try {
            await apiFetch(`/api/telegram/config/chatid?label=${encodeURIComponent(label)}`, { method: 'DELETE' });
            if (savedChatIds.find(c => c.label === label)?.chatId === chatId) setChatId('');
            await fetchConfig();
        } catch (e: any) { alert('Error: ' + e.message); }
    }

    // ── Connect / Send ───────────────────────────────────────────────
    function login() {
        if (!token.trim()) return;
        setIsLoggedIn(true);
        offsetRef.current = undefined;
        fetchUpdates();
    }

    // ── Start/stop polling when logged in ─────────────────────────
    useEffect(() => {
        if (isLoggedIn && token) {
            pollingRef.current = setInterval(() => fetchUpdates(), 3000);
            return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
        }
    }, [isLoggedIn, token]);

    async function fetchUpdates() {
        if (!token) return;
        try {
            let url = `/api/telegram/updates?token=${encodeURIComponent(token)}`;
            if (offsetRef.current !== undefined) url += `&offset=${offsetRef.current}`;
            const res = await apiFetch(url);
            if (res.nextOffset) offsetRef.current = res.nextOffset;
            if (res.results && res.results.length > 0) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const newMsgs = res.results.filter((m: Message) => !existingIds.has(m.id));
                    return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
                });
            }
        } catch (e) { console.error('Failed to fetch updates', e); }
    }

    async function send() {
        if (!input.trim() || !chatId.trim() || !token) return;
        const text = input.trim();
        setInput('');
        const newMsg: Message = { id: Date.now(), text, isSelf: true, date: Date.now(), sender: 'Bot' };
        setMessages(prev => [...prev, newMsg]);
        try {
            await apiFetch('/api/telegram/send', {
                method: 'POST',
                body: JSON.stringify({ token, chatId, text }),
            });
        } catch (e: any) {
            setMessages(prev => [...prev, { id: Date.now() + 1, text: `Error: ${e.message}`, isSelf: false, date: Date.now(), sender: 'System' }]);
        }
    }

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

    // ── LOGIN SCREEN ─────────────────────────────────────────────────
    if (!isLoggedIn) {
        return (
            <div className="telegram-page">
                <div className="telegram-header">
                    <h1 className="telegram-header__title">Telegram Bot Access</h1>
                    <p className="telegram-header__sub">Select a saved bot or add a new one.</p>
                </div>
                <div className="glass-card" style={{ padding: '24px', maxWidth: '440px', margin: '40px auto' }}>
                    {/* Saved Tokens */}
                    {savedTokens.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                            <label className="os-label">Saved Bots</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {savedTokens.map(t => (
                                    <div key={t.label} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '8px 12px', borderRadius: '8px',
                                        background: token === t.token ? 'var(--accent)' : 'var(--glass-strong)',
                                        color: token === t.token ? '#fff' : 'var(--text)',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                        border: '1px solid ' + (token === t.token ? 'var(--accent)' : 'var(--line)')
                                    }} onClick={() => setToken(t.token)}>
                                        <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{t.label}</span>
                                        <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.6 }}>{t.token.slice(0, 8)}…</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteToken(t.label); }}
                                            style={{
                                                background: 'none', border: 'none', color: token === t.token ? '#fff' : 'var(--bad)',
                                                cursor: 'pointer', padding: '2px 6px', fontSize: '14px', opacity: 0.7,
                                            }}
                                            title="Delete"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add New Token */}
                    {!showAddToken ? (
                        <button className="btn btn-secondary" onClick={() => setShowAddToken(true)}
                            style={{ width: '100%', marginBottom: '16px' }}>
                            ＋ Add New Bot Token
                        </button>
                    ) : (
                        <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--glass-strong)', border: '1px solid var(--line)' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <label className="os-label">Bot Name</label>
                                <input type="text" className="os-input" placeholder="e.g. My News Bot"
                                    value={newTokenLabel} onChange={e => setNewTokenLabel(e.target.value)} />
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label className="os-label">Bot Token</label>
                                <input type="password" className="os-input" placeholder="123456789:ABCdefGhI..."
                                    value={newTokenValue} onChange={e => setNewTokenValue(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-primary" onClick={addToken}
                                    disabled={!newTokenLabel.trim() || !newTokenValue.trim()}
                                    style={{ flex: 1 }}>Save</button>
                                <button className="btn btn-secondary" onClick={() => { setShowAddToken(false); setNewTokenLabel(''); setNewTokenValue(''); }}
                                    style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Manual Token Input */}
                    <div style={{ marginBottom: '16px' }}>
                        <label className="os-label">Or paste a token directly</label>
                        <input type="password" className="os-input" value={token}
                            onChange={e => setToken(e.target.value)} placeholder="Paste token here…" />
                    </div>

                    <button className="btn btn-primary" onClick={login} disabled={!token.trim()} style={{ width: '100%' }}>
                        Connect
                    </button>
                </div>
            </div>
        );
    }

    // ── CHAT SCREEN ──────────────────────────────────────────────────
    return (
        <div className="telegram-page chat-interface">
            <div className="telegram-header chat-header">
                <div>
                    <h1 className="telegram-header__title">Telegram Bot</h1>
                    <p className="telegram-header__sub">Connected</p>
                </div>
                <div className="telegram-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={fetchUpdates} disabled={loading}>Refresh</button>
                    <button className="btn btn-secondary btn-danger" onClick={() => setIsLoggedIn(false)}>Disconnect</button>
                </div>
            </div>

            {/* ── Chat ID Selector ── */}
            <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            }}>
                <label style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Chat ID:</label>

                {/* Saved Chat IDs as chips */}
                {savedChatIds.map(c => (
                    <div key={c.label} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '16px', fontSize: 'var(--fs-xs)', cursor: 'pointer',
                        background: chatId === c.chatId ? 'var(--accent)' : 'var(--glass-strong)',
                        color: chatId === c.chatId ? '#fff' : 'var(--text)',
                        border: '1px solid ' + (chatId === c.chatId ? 'var(--accent)' : 'var(--line)'),
                        transition: 'all 0.15s',
                    }} onClick={() => setChatId(c.chatId)}>
                        <span>{c.label}</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteChatId(c.label); }}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                                color: chatId === c.chatId ? '#fff' : 'var(--bad)', fontSize: '11px', opacity: 0.7
                            }}>✕</button>
                    </div>
                ))}

                {/* Manual input */}
                <input type="text" className="os-input" placeholder="or type ID…" value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    style={{ width: '120px', fontSize: 'var(--fs-xs)', padding: '4px 8px' }} />

                {/* Add new chat ID */}
                {!showAddChatId ? (
                    <button className="btn btn-secondary" onClick={() => setShowAddChatId(true)}
                        style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)' }}>＋ Save</button>
                ) : (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input type="text" className="os-input" placeholder="Label" value={newChatIdLabel}
                            onChange={e => setNewChatIdLabel(e.target.value)}
                            style={{ width: '80px', fontSize: 'var(--fs-xs)', padding: '4px 8px' }} />
                        <input type="text" className="os-input" placeholder="Chat ID" value={newChatIdValue}
                            onChange={e => setNewChatIdValue(e.target.value)}
                            style={{ width: '100px', fontSize: 'var(--fs-xs)', padding: '4px 8px' }} />
                        <button className="btn btn-primary" onClick={addChatId}
                            disabled={!newChatIdLabel.trim() || !newChatIdValue.trim()}
                            style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)' }}>✓</button>
                        <button className="btn btn-secondary" onClick={() => { setShowAddChatId(false); setNewChatIdLabel(''); setNewChatIdValue(''); }}
                            style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)' }}>✕</button>
                    </div>
                )}
            </div>

            {!chatId.trim() && (
                <div style={{
                    margin: '8px 16px 0', padding: '8px 14px', borderRadius: '8px',
                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-xs)',
                }}>
                    <span>⚠️</span><span>Select or enter a <strong>Chat ID</strong> above to send messages.</span>
                </div>
            )}

            <div className="chat-messages telegram-messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <span>{chatId ? 'No messages yet. Type a message below.' : 'Select a Chat ID above, then send a message.'}</span>
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
                <input type="text" className="chat-input"
                    placeholder={chatId ? "Type a message…" : "Set Chat ID above first…"}
                    value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} />
                <button className="btn btn-primary chat-send-btn" onClick={send}
                    disabled={!chatId || !input.trim()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </div>
        </div>
    );
}
