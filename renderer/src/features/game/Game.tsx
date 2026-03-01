import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { GameState } from '../../lib/api';
import './Game.css';

// ── Chess engine (chess.js-compatible minimal impl) ─────────────────────────
// We use a dynamically loaded chess.js from CDN for move validation.
// The type is declared loosely to avoid needing @types/chess.js.
declare const Chess: any;

const UNICODE_PIECES: Record<string, string> = {
    P: '\u2659', N: '\u2658', B: '\u2657', R: '\u2656', Q: '\u2655', K: '\u2654',
    p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A',
};

const PIECE_VALUES: Record<string, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

type GameMode = 'adventure' | 'chess';

// ── Chess Component ─────────────────────────────────────────────────────────
function ChessGame() {
    const [ready, setReady] = useState(typeof (window as any).Chess !== 'undefined');
    const gameRef = useRef<any>(null);
    const [board, setBoard] = useState<any[][]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [legalMoves, setLegalMoves] = useState<any[]>([]);
    const [status, setStatus] = useState('White to move');
    const [statusStyle, setStatusStyle] = useState<{ color: string; bg: string }>({ color: '#666', bg: 'rgba(255,255,255,0.1)' });
    const [history, setHistory] = useState<string[]>([]);
    const [aiEnabled, setAiEnabled] = useState(true);
    const historyRef = useRef<HTMLDivElement>(null);

    // Load chess.js
    useEffect(() => {
        if (typeof (window as any).Chess !== 'undefined') { setReady(true); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js';
        s.onload = () => setReady(true);
        document.head.appendChild(s);
    }, []);

    useEffect(() => {
        if (!ready) return;
        gameRef.current = new (window as any).Chess();
        syncState();
    }, [ready]);

    useEffect(() => {
        if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }, [history]);

    function syncState() {
        const g = gameRef.current;
        if (!g) return;
        setBoard(g.board());
        setHistory([...g.history()]);

        const turn = g.turn() === 'w' ? 'White' : 'Black';
        if (g.in_checkmate()) {
            setStatus(`Game over, ${turn} is in checkmate.`);
            setStatusStyle({ color: '#ef4444', bg: 'rgba(239,68,68,0.15)' });
        } else if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition()) {
            setStatus('Game over, drawn position');
            setStatusStyle({ color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' });
        } else {
            let s = `${turn} to move`;
            if (g.in_check()) {
                s += `, ${turn} is in check`;
                setStatusStyle({ color: '#ef4444', bg: 'rgba(239,68,68,0.15)' });
            } else {
                setStatusStyle({ color: 'var(--muted)', bg: 'rgba(255,255,255,0.06)' });
            }
            setStatus(s);
        }
    }

    function evaluateBoard(): number {
        const g = gameRef.current;
        const b = g.board();
        let val = 0;
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
                const p = b[r][c];
                if (p) val += (p.color === 'w' ? 1 : -1) * (PIECE_VALUES[p.type] ?? 0);
            }
        return val;
    }

    function minimax(depth: number, isMax: boolean): number {
        const g = gameRef.current;
        if (depth === 0 || g.game_over()) return evaluateBoard();
        const moves = g.moves();
        let best = isMax ? -9999 : 9999;
        for (const m of moves) {
            g.move(m);
            const v = minimax(depth - 1, !isMax);
            g.undo();
            best = isMax ? Math.max(best, v) : Math.min(best, v);
        }
        return best;
    }

    function makeBestMove() {
        const g = gameRef.current;
        if (!g || g.game_over()) return;
        const moves = g.moves();
        if (!moves.length) return;
        let bestMove = moves[0];
        let bestVal = 9999;
        for (const m of moves) {
            g.move(m);
            const v = minimax(1, true);
            g.undo();
            if (v < bestVal) { bestVal = v; bestMove = m; }
        }
        g.move(bestMove);
        setSelected(null);
        setLegalMoves([]);
        syncState();
    }

    function handleClick(sq: string) {
        const g = gameRef.current;
        if (!g || g.game_over()) return;
        if (g.turn() === 'b' && aiEnabled) return;

        if (!selected) {
            const piece = g.get(sq);
            if (piece && piece.color === g.turn()) {
                setSelected(sq);
                setLegalMoves(g.moves({ square: sq, verbose: true }));
            }
            return;
        }

        const move = g.move({ from: selected, to: sq, promotion: 'q' });
        setSelected(null);
        setLegalMoves([]);

        if (!move) {
            const piece = g.get(sq);
            if (piece && piece.color === g.turn()) {
                setSelected(sq);
                setLegalMoves(g.moves({ square: sq, verbose: true }));
            }
            return;
        }

        syncState();
        if (!g.game_over() && aiEnabled) {
            setTimeout(makeBestMove, 250);
        }
    }

    function resetChess() {
        const g = gameRef.current;
        if (!g) return;
        g.reset();
        setSelected(null);
        setLegalMoves([]);
        syncState();
    }

    const sqColor = (r: number, c: number) => (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863';
    const isLegal = (sq: string) => legalMoves.some((m: any) => m.to === sq);

    if (!ready) return <div className="empty-state"><div className="spinner" /><span>Loading chess engine...</span></div>;

    return (
        <div className="chess-layout">
            <div className="chess-board-area">
                <div className="chess-board">
                    {board.map((row, r) =>
                        row.map((piece, c) => {
                            const sq = String.fromCharCode(97 + c) + (8 - r);
                            const isSel = selected === sq;
                            const legal = isLegal(sq);
                            let bg = sqColor(r, c);
                            if (isSel) bg = '#baca44';
                            return (
                                <div
                                    key={sq}
                                    className="chess-cell"
                                    style={{ background: bg }}
                                    onClick={() => handleClick(sq)}
                                >
                                    {legal && <div className="chess-legal-dot" />}
                                    {piece && (
                                        <span className="chess-piece">
                                            {UNICODE_PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div className="chess-sidebar glass-card">
                <div className="chess-status-section">
                    <div className="section-title">Game Status</div>
                    <div className="chess-status" style={{ color: statusStyle.color, background: statusStyle.bg }}>{status}</div>
                </div>
                <div className="divider" />
                <div className="chess-history-section">
                    <div className="section-title">Move Log</div>
                    <div className="chess-history" ref={historyRef}>
                        {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                            <div key={i} className="chess-history-row">
                                <span className="chess-move-num">{i + 1}.</span>
                                <span className="chess-move">{history[i * 2]}</span>
                                <span className="chess-move">{history[i * 2 + 1] ?? ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="divider" />
                <div className="chess-controls">
                    <button className="btn btn-ghost chess-reset-btn" onClick={resetChess}>New Game</button>
                    <label className="chess-ai-label">
                        <input type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)} />
                        Play against AI (Black)
                    </label>
                </div>
            </div>
        </div>
    );
}

// ── Adventure Component ─────────────────────────────────────────────────────
function Adventure() {
    const navigate = useNavigate();
    const [state, setGameState] = useState<GameState | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [model, setModel] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const [selectedText, setSelectedText] = useState('');
    const [selectionRect, setSelectionRect] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        api.gameState().then(s => setGameState(s)).catch(() => { });
        api.ollamaModels().then(r => {
            setModels(r.models ?? []);
            if (r.models?.length) setModel(r.models[0]);
        }).catch(() => { });
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state?.history]);

    useEffect(() => {
        function handleSelection() {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !logRef.current) {
                setSelectedText('');
                setSelectionRect(null);
                return;
            }

            // Ensure selection is inside the game log area
            if (!logRef.current.contains(sel.anchorNode)) return;

            const text = sel.toString().trim();
            if (!text) {
                setSelectedText('');
                setSelectionRect(null);
                return;
            }

            try {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const logRect = logRef.current.getBoundingClientRect();

                setSelectedText(text);
                setSelectionRect({
                    top: rect.bottom - logRect.top + logRef.current.scrollTop + 8,
                    left: rect.left - logRect.left + (rect.width / 2) - 40 // Centered roughly
                });
            } catch (e) { }
        }

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, []);

    async function sendAction() {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        setError('');
        setLoading(true);
        try {
            const res = await api.gameChat(text, model || undefined);
            const s = res.state;
            setGameState(s ?? null);
        } catch (e: any) {
            setError(e.message ?? 'Request failed');
        } finally {
            setLoading(false);
        }
    }

    async function generateImage() {
        if (!selectedText) return;

        const promptToPass = selectedText;
        setSelectedText('');
        setSelectionRect(null);

        navigate(`/operations/draw?prompt=${encodeURIComponent(promptToPass)}&auto=true&returnTo=game`);
    }

    async function resetGame() {
        if (!confirm('Reset game? All progress will be lost.')) return;
        await api.gameReset().catch(() => { });
        api.gameState().then(s => setGameState(s)).catch(() => { });
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') { e.preventDefault(); sendAction(); }
    }

    return (
        <>
            <div className="game-header__controls">
                {models.length > 0 && (
                    <select className="os-input game-model-select" value={model} onChange={e => setModel(e.target.value)}>
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                )}
                <button className="btn btn-ghost" onClick={resetGame}>Reset Game</button>
            </div>
            <div className="game-body">
                <div className="game-sidebar glass-card">
                    <div className="game-sidebar__section">
                        <div className="section-title">World State</div>
                        <p className="game-sidebar__text">{state?.context ?? '...'}</p>
                    </div>
                    <div className="divider" />
                    <div className="game-sidebar__section">
                        <div className="section-title">Inventory</div>
                        <pre className="game-sidebar__text">{(state?.inventory ?? '...').replace(/\\n/g, '\n')}</pre>
                    </div>
                </div>
                <div className="game-main">
                    <div className="game-log glass-card" ref={logRef} style={{ position: 'relative' }}>
                        {selectionRect && selectedText && (
                            <div
                                className="game-selection-tooltip"
                                style={{
                                    position: 'absolute',
                                    top: selectionRect.top,
                                    left: selectionRect.left,
                                    zIndex: 10,
                                }}
                            >
                                <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); generateImage(); }}>
                                    🎨 Draw
                                </button>
                            </div>
                        )}

                        {(!state?.history || state.history.length === 0) && (
                            <div className="game-log__empty"><span>Your adventure begins... type an action below</span></div>
                        )}
                        {state?.history.map((msg, i) => (
                            <div key={i} className={`game-msg game-msg--${msg.role}`}>
                                {msg.role === 'user' && <span className="game-msg__prefix">&gt; </span>}
                                {msg.role === 'system' && <span className="game-msg__prefix" style={{ color: 'var(--accent)' }}>[System] </span>}
                                <span className="game-msg__content">{msg.content}</span>
                                {msg.image && msg.image === 'loading' && (
                                    <div className="game-msg--loading" style={{ marginTop: '8px' }}>
                                        <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                                    </div>
                                )}
                                {msg.image && msg.image !== 'loading' && (
                                    <img src={msg.image} className="game-msg-image" alt="Visualized scene" />
                                )}
                            </div>
                        ))}
                        {loading && !state?.history.some(h => h.image === 'loading') && (
                            <div className="game-msg game-msg--assistant game-msg--loading">
                                <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                            </div>
                        )}
                        {error && <div className="game-msg game-msg--error">{error}</div>}
                        <div ref={bottomRef} />
                    </div>
                    <div className="game-input-bar glass-card">
                        <span className="game-prompt">&gt;</span>
                        <input className="game-input" placeholder="What do you do?" value={input}
                            onChange={e => setInput(e.target.value)} onKeyDown={handleKey} disabled={loading} autoFocus />
                        <button className="btn btn-primary game-send-btn" onClick={sendAction} disabled={loading || !input.trim()}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Main Game Page ──────────────────────────────────────────────────────────
export default function Game() {
    const [mode, setMode] = useState<GameMode>('adventure');

    return (
        <div className="game-page">
            <div className="game-header">
                <div>
                    <h1 className="game-header__title">Games</h1>
                    <p className="game-header__sub">AI-powered games and entertainment</p>
                </div>
                <div className="game-tab-bar">
                    <button className={`game-tab${mode === 'adventure' ? ' game-tab--active' : ''}`}
                        onClick={() => setMode('adventure')}>Adventure</button>
                    <button className={`game-tab${mode === 'chess' ? ' game-tab--active' : ''}`}
                        onClick={() => setMode('chess')}>Chess</button>
                </div>
            </div>
            {mode === 'adventure' ? <Adventure /> : <ChessGame />}
        </div>
    );
}
