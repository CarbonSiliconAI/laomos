import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Email, MailStatus } from '../../lib/api';
import './Mail.css';

interface ComposeForm { to: string; subject: string; body: string; }

export default function Mail() {
    const [status, setStatus] = useState<MailStatus | null>(null);
    const [emails, setEmails] = useState<Email[]>([]);
    const [selected, setSelected] = useState<Email | null>(null);
    const [loading, setLoading] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [summary, setSummary] = useState('');
    const [composing, setComposing] = useState(false);
    const [compose, setCompose] = useState<ComposeForm>({ to: '', subject: '', body: '' });
    const [sending, setSending] = useState(false);
    const [sendMsg, setSendMsg] = useState('');
    const [configForm, setConfigForm] = useState({ provider: 'gmail', email: '', password: '' });
    const [configuring, setConfiguring] = useState(false);
    const [configError, setConfigError] = useState('');

    useEffect(() => {
        api.mailStatus().then(s => {
            setStatus(s);
            if (s.connected) fetchInbox();
        }).catch(() => {});
    }, []);

    function fetchInbox() {
        setLoading(true);
        api.mailInbox(30).then(r => setEmails(r.emails ?? [])).catch(() => {}).finally(() => setLoading(false));
    }

    function selectEmail(email: Email) {
        setSelected(email);
        setSummary('');
        if (!email.read) {
            api.mailRead(email.uid).catch(() => {});
            setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, read: true } : e));
        }
    }

    async function summarize() {
        if (!selected) return;
        setSummarizing(true);
        setSummary('');
        try {
            const res = await api.mailSummarize(selected.uid);
            setSummary(res.summary);
        } catch (e: any) { setSummary('Error: ' + (e.message ?? 'failed')); }
        finally { setSummarizing(false); }
    }

    async function deleteEmail(uid: string) {
        await api.mailDelete(uid).catch(() => {});
        setEmails(prev => prev.filter(e => e.uid !== uid));
        if (selected?.uid === uid) setSelected(null);
    }

    async function sendMail() {
        setSending(true);
        setSendMsg('');
        try {
            await api.mailSend(compose);
            setSendMsg('Sent!');
            setTimeout(() => { setComposing(false); setSendMsg(''); setCompose({ to: '', subject: '', body: '' }); }, 1200);
        } catch (e: any) { setSendMsg('Error: ' + (e.message ?? 'failed')); }
        finally { setSending(false); }
    }

    async function saveConfig() {
        setConfiguring(true);
        setConfigError('');
        try {
            await api.mailConfig(configForm);
            const s = await api.mailStatus();
            setStatus(s);
            if (s.connected) fetchInbox();
        } catch (e: any) { setConfigError(e.message ?? 'Failed to connect'); }
        finally { setConfiguring(false); }
    }

    if (!status?.connected) {
        return (
            <div className="mail-page">
                <div className="mail-header">
                    <h1 className="mail-header__title">Mail</h1>
                    <p className="mail-header__sub">Connect your email account to get started</p>
                </div>
                <div className="mail-setup glass-card">
                    <h2 className="mail-setup__title">Connect Mail Account</h2>
                    <div className="mail-setup__field">
                        <label>Provider</label>
                        <select className="os-input" value={configForm.provider}
                            onChange={e => setConfigForm(f => ({ ...f, provider: e.target.value }))}>
                            <option value="gmail">Gmail</option>
                            <option value="imap">IMAP</option>
                        </select>
                    </div>
                    <div className="mail-setup__field">
                        <label>Email</label>
                        <input className="os-input" type="email" placeholder="you@example.com"
                            value={configForm.email}
                            onChange={e => setConfigForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="mail-setup__field">
                        <label>Password / App Password</label>
                        <input className="os-input" type="password" placeholder="••••••••"
                            value={configForm.password}
                            onChange={e => setConfigForm(f => ({ ...f, password: e.target.value }))} />
                    </div>
                    {configError && <p className="mail-setup__error">{configError}</p>}
                    <button className="btn btn-primary" onClick={saveConfig} disabled={configuring}>
                        {configuring ? <><div className="spinner" /> Connecting…</> : 'Connect'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mail-page">
            <div className="mail-header">
                <div>
                    <h1 className="mail-header__title">Mail</h1>
                    <p className="mail-header__sub">
                        {status.email ?? 'Connected'}&nbsp;
                        <span className="badge badge-ok">Connected</span>
                    </p>
                </div>
                <div className="mail-header__actions">
                    <button className="btn btn-ghost" onClick={fetchInbox} disabled={loading}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                        Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => setComposing(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        Compose
                    </button>
                </div>
            </div>

            <div className="mail-body">
                <div className="mail-list glass-card">
                    {loading ? (
                        <div className="empty-state"><div className="spinner" /></div>
                    ) : emails.length === 0 ? (
                        <div className="empty-state">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
                            <span>Inbox is empty</span>
                        </div>
                    ) : (
                        emails.map(email => (
                            <div key={email.uid}
                                className={`mail-item${selected?.uid === email.uid ? ' mail-item--selected' : ''}${!email.read ? ' mail-item--unread' : ''}`}
                                onClick={() => selectEmail(email)}>
                                <div className="mail-item__from">{email.from}</div>
                                <div className="mail-item__subject">{email.subject}</div>
                                <div className="mail-item__date">{new Date(email.date).toLocaleDateString()}</div>
                                <button className="mail-item__delete"
                                    onClick={e => { e.stopPropagation(); deleteEmail(email.uid); }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="mail-detail glass-card">
                    {selected ? (
                        <>
                            <div className="mail-detail__header">
                                <h2 className="mail-detail__subject">{selected.subject}</h2>
                                <div className="mail-detail__meta">
                                    <span>From: {selected.from}</span>
                                    <span>{new Date(selected.date).toLocaleString()}</span>
                                </div>
                                <div className="mail-detail__actions">
                                    <button className="btn btn-ghost" onClick={summarize} disabled={summarizing}>
                                        {summarizing ? <><div className="spinner" /> Summarizing…</> : 'AI Summarize'}
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => {
                                        api.mailDraft({ to: selected.from, subject: `Re: ${selected.subject}`, context: selected.body })
                                            .then(r => { setCompose({ to: selected.from, subject: `Re: ${selected.subject}`, body: r.draft }); setComposing(true); })
                                            .catch(() => {});
                                    }}>AI Reply Draft</button>
                                </div>
                            </div>
                            {summary && (
                                <div className="mail-summary">
                                    <span className="badge badge-accent">AI Summary</span>
                                    <p>{summary}</p>
                                </div>
                            )}
                            <div className="divider" />
                            <pre className="mail-detail__body">{selected.body ?? '(no content)'}</pre>
                        </>
                    ) : (
                        <div className="empty-state" style={{ height: '100%' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                            <span>Select an email to read it</span>
                        </div>
                    )}
                </div>
            </div>

            {composing && (
                <div className="mail-compose-overlay" onClick={() => setComposing(false)}>
                    <div className="mail-compose glass-card" onClick={e => e.stopPropagation()}>
                        <div className="mail-compose__header">
                            <h2>New Message</h2>
                            <button className="btn btn-ghost" style={{ padding: '4px' }} onClick={() => setComposing(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <input className="os-input" placeholder="To" value={compose.to} onChange={e => setCompose(f => ({ ...f, to: e.target.value }))} />
                        <input className="os-input" placeholder="Subject" value={compose.subject} onChange={e => setCompose(f => ({ ...f, subject: e.target.value }))} />
                        <textarea className="os-input mail-compose__body" placeholder="Message…" rows={8}
                            value={compose.body} onChange={e => setCompose(f => ({ ...f, body: e.target.value }))} />
                        {sendMsg && <p className={sendMsg.startsWith('Error') ? 'mail-setup__error' : 'mail-send-ok'}>{sendMsg}</p>}
                        <div className="mail-compose__footer">
                            <button className="btn btn-ghost" onClick={() => {
                                api.mailDraft({ to: compose.to, subject: compose.subject, context: compose.body }).then(r => setCompose(f => ({ ...f, body: r.draft }))).catch(() => {});
                            }}>AI Draft</button>
                            <button className="btn btn-primary" onClick={sendMail} disabled={sending}>
                                {sending ? <><div className="spinner" /> Sending…</> : 'Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
