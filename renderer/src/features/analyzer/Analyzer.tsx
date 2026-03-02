import React, { useState } from 'react';
import { api } from '../../lib/api';
import type { AnalyzedTask } from '../../lib/api';
import './Analyzer.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content?: string;
    parsed?: AnalyzedTask;
    isTyping?: boolean;
}

export default function Analyzer() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleSend = async () => {
        if (!input.trim() || isAnalyzing) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
        const loadingMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', isTyping: true };

        setMessages(prev => [...prev, userMsg, loadingMsg]);
        setInput('');
        setIsAnalyzing(true);

        try {
            const res = await api.kernelAnalyze(userMsg.content!);

            setMessages(prev => prev.map(m =>
                m.id === loadingMsg.id
                    ? { ...m, isTyping: false, parsed: res }
                    : m
            ));
        } catch (error: any) {
            setMessages(prev => prev.map(m =>
                m.id === loadingMsg.id
                    ? { ...m, isTyping: false, parsed: { target: 'Error', expected_output: 'None', success_criteria: 'None', error: error.message } }
                    : m
            ));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="analyzer-app">
            <header className="analyzer-header">
                <div>
                    <h2 className="analyzer-title">Task Analyzer</h2>
                    <p className="analyzer-subtitle">Goal-Driven Kernel Parsing Engine</p>
                </div>
            </header>

            <div className="analyzer-chat-area">
                {messages.length === 0 ? (
                    <div className="analyzer-empty">
                        <div className="analyzer-empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="4 14 10 14 10 20" />
                                <polyline points="20 10 14 10 14 4" />
                                <line x1="14" y1="10" x2="21" y2="3" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        </div>
                        <h3>Test Kernel Task Synthesis</h3>
                        <p>Type an ambiguous or complex goal below to see how the OS Kernel breaks it down into explicit targets, outputs, and success statuses.</p>
                    </div>
                ) : (
                    messages.map(msg => (
                        <div key={msg.id} className={`analyzer-message \${msg.role}`}>
                            <div className="analyzer-message-avatar">
                                {msg.role === 'user' ? 'U' : 'OS'}
                            </div>
                            <div className="analyzer-message-bubble">
                                {msg.role === 'user' ? (
                                    <div className="analyzer-message-text">{msg.content}</div>
                                ) : msg.isTyping ? (
                                    <div className="analyzer-typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                ) : msg.parsed ? (
                                    <div className="analyzer-parsed-card glass-card">
                                        {msg.parsed.error ? (
                                            <div className="analyzer-error">Error: {msg.parsed.error}</div>
                                        ) : (
                                            <>
                                                <div className="analyzer-field">
                                                    <div className="analyzer-label">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
                                                        Target Goal
                                                    </div>
                                                    <div className="analyzer-value">{msg.parsed.target}</div>
                                                </div>
                                                <div className="analyzer-field">
                                                    <div className="analyzer-label">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                                        Expected Output
                                                    </div>
                                                    <div className="analyzer-value">{msg.parsed.expected_output}</div>
                                                </div>
                                                <div className="analyzer-field">
                                                    <div className="analyzer-label success-label">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                                        Success Status
                                                    </div>
                                                    <div className="analyzer-value">{msg.parsed.success_criteria}</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="analyzer-input-area">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="E.g., Investigate the recent logs for build errors and notify the sysadmin..."
                    rows={1}
                    disabled={isAnalyzing}
                />
                <button
                    className="analyzer-send-btn"
                    onClick={handleSend}
                    disabled={!input.trim() || isAnalyzing}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </div>
        </div>
    );
}
