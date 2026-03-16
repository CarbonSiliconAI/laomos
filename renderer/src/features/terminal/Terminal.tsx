import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

export default function TerminalPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const [connected, setConnected] = useState(false);
    const [disconnected, setDisconnected] = useState(false);

    const connect = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || '127.0.0.1:3123';
        const ws = new WebSocket(`${protocol}//${host}/ws/terminal`);
        wsRef.current = ws;
        setDisconnected(false);

        ws.onopen = () => {
            setConnected(true);
            termRef.current?.focus();
            // Send initial resize
            if (fitRef.current) {
                fitRef.current.fit();
                const dims = fitRef.current.proposeDimensions();
                if (dims) {
                    ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                }
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'output' && msg.data) {
                    termRef.current?.write(msg.data);
                }
            } catch {
                // Raw text fallback
                termRef.current?.write(event.data);
            }
        };

        ws.onclose = () => {
            setConnected(false);
            setDisconnected(true);
        };

        ws.onerror = () => {
            setConnected(false);
            setDisconnected(true);
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, Monaco, monospace',
            theme: {
                background: '#0a0a0a',
                foreground: '#e4e4e7',
                cursor: '#a78bfa',
                cursorAccent: '#0a0a0a',
                selectionBackground: 'rgba(167,139,250,0.3)',
                black: '#18181b',
                red: '#f87171',
                green: '#4ade80',
                yellow: '#facc15',
                blue: '#60a5fa',
                magenta: '#c084fc',
                cyan: '#22d3ee',
                white: '#e4e4e7',
                brightBlack: '#52525b',
                brightRed: '#fca5a5',
                brightGreen: '#86efac',
                brightYellow: '#fde68a',
                brightBlue: '#93c5fd',
                brightMagenta: '#d8b4fe',
                brightCyan: '#67e8f9',
                brightWhite: '#fafafa',
            },
            allowProposedApi: true,
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.open(containerRef.current);

        termRef.current = term;
        fitRef.current = fitAddon;

        // Fit to container
        setTimeout(() => fitAddon.fit(), 50);

        // Handle user input → send to WebSocket
        term.onData((data: string) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
        });

        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
            const dims = fitAddon.proposeDimensions();
            if (dims && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(containerRef.current);

        // Connect
        connect();

        return () => {
            resizeObserver.disconnect();
            wsRef.current?.close();
            term.dispose();
        };
    }, [connect]);

    const handleReconnect = () => {
        termRef.current?.clear();
        connect();
    };

    return (
        <div className="terminal-page">
            <div className="terminal-page__header">
                <div>
                    <h2>Terminal</h2>
                    <p>Direct system shell access</p>
                </div>
                <div className="terminal-page__status">
                    <span className={`terminal-page__dot ${connected ? 'terminal-page__dot--connected' : ''}`} />
                    {connected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            <div className="terminal-page__container">
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
                {disconnected && !connected && (
                    <div className="terminal-page__reconnect">
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Session ended</span>
                        <button onClick={handleReconnect}>Reconnect</button>
                    </div>
                )}
            </div>
        </div>
    );
}
