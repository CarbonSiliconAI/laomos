import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Email, MailStatus } from '../../lib/api';
import './Mail.css';

interface ComposeForm { to: string; subject: string; body: string; }

type ConfigTab = 'oauth' | 'apppass';

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

    // Config modal state
    const [showConfig, setShowConfig] = useState(false);
    const [configTab, setConfigTab] = useState<ConfigTab>('apppass');
    const [oauthForm, setOauthForm] = useState({ clientId: '', clientSecret: '' });
    const [appPassForm, setAppPassForm] = useState({ email: '', password: '' });
    const [configuring, setConfiguring] = useState(false);
    const [configError, setConfigError] = useState('');

    useEffect(() => {
        api.mailStatus().then(s => {
            setStatus(s);
            if (s.configured) fetchInbox();
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

    // ── Config: App Password ────────────────────────────────────────────
    async function saveAppPassword() {
        const emailAddress = appPassForm.email.trim();
        const appPassword = appPassForm.password.trim();
        if (!emailAddress || !appPassword) { setConfigError('Please provide both Email and App Password'); return; }
        setConfiguring(true);
        setConfigError('');
        try {
            await api.mailConfig({ emailAddress, appPassword });
            const s = await api.mailStatus();
            setStatus(s);
            setShowConfig(false);
            fetchInbox();
        } catch (e: any) { setConfigError(e.message ?? 'Failed to save'); }
        finally { setConfiguring(false); }
    }

    // ── Config: OAuth ───────────────────────────────────────────────────
    async function startOAuth() {
        const clientId = oauthForm.clientId.trim();
        const clientSecret = oauthForm.clientSecret.trim();
        if (!clientId || !clientSecret) { setConfigError('Please provide both Client ID and Client Secret'); return; }
        setConfiguring(true);
        setConfigError('');
        try {
            await api.mailConfig({ clientId, clientSecret });
            const authRes = await fetch('/api/mail/auth-url');
            const { url } = await authRes.json();
            if (!url) throw new Error('Failed to retrieve authentication URL.');

            window.open(url, 'Google OAuth', `width=500,height=600,left=${window.screenX + 200},top=${window.screenY + 100}`);

            // Poll for completion
            let polls = 0;
            const timer = setInterval(async () => {
                polls++;
                try {
                    const s = await api.mailStatus();
                    if (s.configured) {
                        clearInterval(timer);
                        setStatus(s);
                        setShowConfig(false);
                        setConfiguring(false);
                        fetchInbox();
                    }
                } catch { /* keep polling */ }
                if (polls >= 120) { clearInterval(timer); setConfiguring(false); setConfigError('OAuth timed out. Please try again.'); }
            }, 1500);
        } catch (e: any) {
            setConfigError(e.message ?? 'OAuth failed');
            setConfiguring(false);
        }
    }

    // ── Config Modal ────────────────────────────────────────────────────
    function renderConfigModal() {
        return (
            <div className="mail-config-overlay" onClick={() => !configuring && setShowConfig(false)}>
                <div className="mail-config-modal glass-card" onClick={e => e.stopPropagation()}>
                    <div className="mail-config__header">
                        <span className="mail-config__title">Gmail Sync</span>
                        <button className="btn btn-ghost mail-config__close" onClick={() => setShowConfig(false)}>&times;</button>
                    </div>

                    <div className="mail-config__body">
                        <svg className="mail-config__icon" viewBox="0 0 48 48" width="48" height="48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        <h3 className="mail-config__heading">Sign in to Sync</h3>
                        <p className="mail-config__desc">Securely grant Agent OS native IMAP and SMTP access to your real Gmail inbox.</p>

                        {/* Tabs */}
                        <div className="mail-config-tabs">
                            <button className={`mail-config-tab${configTab === 'oauth' ? ' mail-config-tab--active' : ''}`}
                                onClick={() => { setConfigTab('oauth'); setConfigError(''); }}>OAuth</button>
                            <button className={`mail-config-tab${configTab === 'apppass' ? ' mail-config-tab--active' : ''}`}
                                onClick={() => { setConfigTab('apppass'); setConfigError(''); }}>App Password</button>
                        </div>

                        {configTab === 'oauth' ? (
                            <div className="mail-config-form">
                                <div className="mail-config-field">
                                    <label>Google Client ID</label>
                                    <input className="os-input" type="password" placeholder="...apps.googleusercontent.com"
                                        value={oauthForm.clientId} onChange={e => setOauthForm(f => ({ ...f, clientId: e.target.value }))} />
                                    <span className="mail-config-hint">
                                        Create OAuth credentials in <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a>
                                    </span>
                                </div>
                                <div className="mail-config-field">
                                    <label>Google Client Secret</label>
                                    <input className="os-input" type="password" placeholder="GOCSPX-..."
                                        value={oauthForm.clientSecret} onChange={e => setOauthForm(f => ({ ...f, clientSecret: e.target.value }))} />
                                </div>
                                {configError && <p className="mail-config-error">{configError}</p>}
                                <button className="btn btn-primary mail-config-submit" onClick={startOAuth} disabled={configuring}>
                                    {configuring ? <><div className="spinner" /> Connecting...</> : 'Continue with Google'}
                                </button>
                            </div>
                        ) : (
                            <div className="mail-config-form">
                                <div className="mail-config-field">
                                    <label>Gmail Address</label>
                                    <input className="os-input" type="email" placeholder="you@gmail.com"
                                        value={appPassForm.email} onChange={e => setAppPassForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="mail-config-field">
                                    <label>16-Character App Password</label>
                                    <input className="os-input" type="password" placeholder="xxxx xxxx xxxx xxxx"
                                        value={appPassForm.password} onChange={e => setAppPassForm(f => ({ ...f, password: e.target.value }))} />
                                    <span className="mail-config-hint">
                                        Create one in your <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google Account Security</a> settings
                                    </span>
                                </div>
                                {configError && <p className="mail-config-error">{configError}</p>}
                                <button className="btn btn-primary mail-config-submit" onClick={saveAppPassword} disabled={configuring}>
                                    {configuring ? <><div className="spinner" /> Saving...</> : 'Connect'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Not configured: show setup prompt ───────────────────────────────
    if (!status?.configured) {
        return (
            <div className="mail-page">
                <div className="mail-header">
                    <h1 className="mail-header__title">Mail</h1>
                    <p className="mail-header__sub">Connect your email account to get started</p>
                </div>
                <div className="mail-setup glass-card">
                    <svg className="mail-config__icon" viewBox="0 0 48 48" width="48" height="48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <h2 className="mail-setup__title">Gmail Sync</h2>
                    <p className="mail-setup__desc">Securely connect your Gmail account to Agent OS</p>
                    <button className="btn btn-primary" onClick={() => setShowConfig(true)}>Set Up Mail</button>
                </div>
                {showConfig && renderConfigModal()}
            </div>
        );
    }

    // ── Connected: show inbox ───────────────────────────────────────────
    return (
        <div className="mail-page">
            <div className="mail-header">
                <div>
                    <h1 className="mail-header__title">Mail</h1>
                    <p className="mail-header__sub">
                        {status.address ?? 'Connected'}&nbsp;
                        <span className="badge badge-ok">Connected</span>
                    </p>
                </div>
                <div className="mail-header__actions">
                    <button className="btn btn-ghost" onClick={fetchInbox} disabled={loading}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                        Refresh
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowConfig(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
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
                                        {summarizing ? <><div className="spinner" /> Summarizing...</> : 'AI Summarize'}
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

            {showConfig && renderConfigModal()}

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
                        <textarea className="os-input mail-compose__body" placeholder="Message..." rows={8}
                            value={compose.body} onChange={e => setCompose(f => ({ ...f, body: e.target.value }))} />
                        {sendMsg && <p className={sendMsg.startsWith('Error') ? 'mail-setup__error' : 'mail-send-ok'}>{sendMsg}</p>}
                        <div className="mail-compose__footer">
                            <button className="btn btn-ghost" onClick={() => {
                                api.mailDraft({ to: compose.to, subject: compose.subject, context: compose.body }).then(r => setCompose(f => ({ ...f, body: r.draft }))).catch(() => {});
                            }}>AI Draft</button>
                            <button className="btn btn-primary" onClick={sendMail} disabled={sending}>
                                {sending ? <><div className="spinner" /> Sending...</> : 'Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
