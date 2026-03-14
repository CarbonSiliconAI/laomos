import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import './Debug.css';

interface DebugEvent {
    timestamp: number;
    type: 'input' | 'ingress' | 'egress' | 'tool_call' | 'tool_result' | 'system';
    source: string;
    message: string;
    payload?: any;
}

export default function DebugPage() {
    const [events, setEvents] = useState<DebugEvent[]>([]);
    const [input, setInput] = useState('');
    const [provider, setProvider] = useState('anthropic');
    const [isSending, setIsSending] = useState(false);
    const endOfLogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const evtSource = new EventSource('/api/debug/stream');

        evtSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                setEvents((prev) => [...prev, data]);
            } catch (err) {
                console.error('Failed to parse debug event', err);
            }
        };

        evtSource.onerror = (err) => {
            console.error('EventSource error:', err);
        };

        return () => {
            evtSource.close();
        };
    }, []);

    useEffect(() => {
        endOfLogRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    const handleSend = async () => {
        if (!input.trim() || isSending) return;
        setIsSending(true);
        try {
            await api.debugInput(input, provider);
            setInput('');
        } catch (err) {
            console.error('Failed to send debug input', err);
            setEvents(prev => [...prev, {
                timestamp: Date.now(),
                type: 'system',
                source: 'Frontend',
                message: `Failed to send input: ${(err as Error).message}`
            }]);
        } finally {
            setIsSending(false);
        }
    };

    const handleExecute = async () => {
        if (isSending) return;
        setIsSending(true);
        try {
            await api.debugExecute(provider);
        } catch (err) {
            console.error('Failed to trigger execution', err);
            setEvents(prev => [...prev, {
                timestamp: Date.now(),
                type: 'system',
                source: 'Frontend',
                message: `Failed to execute chain: ${(err as Error).message}`
            }]);
        } finally {
            setIsSending(false);
        }
    };

    const handleRunBash = async () => {
        if (!input.trim() || isSending) return;
        setIsSending(true);
        try {
            await api.debugBash(input);
            setInput('');
        } catch (err) {
            console.error('Failed to execute bash', err);
            setEvents(prev => [...prev, {
                timestamp: Date.now(),
                type: 'system',
                source: 'Frontend',
                message: `Failed to run bash: ${(err as Error).message}`
            }]);
        } finally {
            setIsSending(false);
        }
    };

    const getEventColor = (type: string) => {
        switch (type) {
            case 'input': return '#34d399';
            case 'ingress': return '#fbbf24';
            case 'egress': return '#60a5fa';
            case 'tool_call': return '#f87171';
            case 'tool_result': return '#a78bfa';
            case 'system': return '#9ca3af';
            default: return '#ffffff';
        }
    };

    return (
        <div className="debug-container">
            <div className="debug-header">
                <h2>System Debug</h2>
                <p>Live telemetry from Kernel and ModelRouter</p>
                <div className="debug-controls">
                     <button onClick={() => setEvents([])} className="debug-btn-clear">Clear Scope</button>
                </div>
            </div>

            <div className="debug-terminal">
                {events.length === 0 ? (
                    <div className="debug-empty">Waiting for events...</div>
                ) : (
                    events.map((ev, i) => (
                        <div key={i} className="debug-event">
                            <span className="debug-time">[{new Date(ev.timestamp).toLocaleTimeString()}]</span>
                            <span className="debug-type" style={{ color: getEventColor(ev.type) }}>[{ev.type.toUpperCase()}]</span>
                            <span className="debug-source">({ev.source})</span>
                            <span className="debug-message">{ev.message}</span>
                            {ev.payload && (
                                <pre className="debug-payload">
                                    {typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))
                )}
                <div ref={endOfLogRef} />
            </div>

            <div className="debug-input-area">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Send raw text directly to Kernel RouteChat..."
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />
                <select 
                    value={provider} 
                    onChange={e => setProvider(e.target.value)}
                    style={{ background: 'var(--panel-bg)', color: 'var(--text-color)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '0 12px' }}>
                    <option value="anthropic">Claude (Anthropic)</option>
                    <option value="openai">GPT (OpenAI)</option>
                    <option value="google">Gemini (Google)</option>
                    <option value="local">Ollama (Local)</option>
                </select>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={handleRunBash} disabled={isSending || !input.trim()} style={{ background: '#10b981', color: '#fff' }} title="Directly run prompt as a Bash string">
                        {isSending ? 'Sending...' : 'Run Native Bash'}
                    </button>
                    <button onClick={handleSend} disabled={isSending || !input.trim()} style={{ background: '#3b82f6', color: '#fff' }} title="Analyze Goal & generate chain.json">
                        {isSending ? 'Sending...' : 'Decompose Target'}
                    </button>
                    <button onClick={handleExecute} disabled={isSending} style={{ background: '#8b5cf6', color: '#fff' }} title="Execute the tasks in chain.json">
                        Execute Graph
                    </button>
                </div>
            </div>
        </div>
    );
}
