import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, SkillDef } from '../../lib/api';
import './SkillOnboard.css';

type Mode = 'auto' | 'manual';
type Phase = 'idle' | 'init' | 'running' | 'done';

export default function SkillOnboardPage() {
    const [searchParams] = useSearchParams();
    const [skills, setSkills] = useState<SkillDef[]>([]);
    const [selectedSkill, setSelectedSkill] = useState('');
    const [mode, setMode] = useState<Mode>('auto');
    const [phase, setPhase] = useState<Phase>('idle');
    const [maxIter, setMaxIter] = useState(3);

    // Init results
    const [skillMd, setSkillMd] = useState('');
    const [selfDebug, setSelfDebug] = useState('');
    const [analysis, setAnalysis] = useState('');

    // Auto results
    const [iterations, setIterations] = useState<any[]>([]);
    const [improved, setImproved] = useState(false);

    // Manual state
    const [manualSelection, setManualSelection] = useState('');
    const [manualInstruction, setManualInstruction] = useState('');
    const [manualResult, setManualResult] = useState('');

    const [error, setError] = useState('');

    useEffect(() => {
        api.skills().then(r => setSkills(r.skills ?? [])).catch(() => { });
    }, []);

    // Auto-select skill from query param
    useEffect(() => {
        const name = searchParams.get('skill');
        if (name) setSelectedSkill(name);
    }, [searchParams]);

    const handleInit = async () => {
        if (!selectedSkill) return;
        setPhase('init');
        setError('');
        try {
            const res = await api.onboardInit(selectedSkill);
            setSkillMd(res.skillMd);
            setSelfDebug(res.selfDebug);
            setAnalysis(res.analysis);
            setPhase('idle');
        } catch (e: any) {
            setError(e.message);
            setPhase('idle');
        }
    };

    const handleAutoRun = async () => {
        if (!selectedSkill) return;
        setPhase('running');
        setError('');
        setIterations([]);
        setImproved(false);
        try {
            const res = await api.onboardAuto(selectedSkill, maxIter);
            setIterations(res.iterations);
            setImproved(res.improved);
            setSkillMd(res.skillMd);
            setPhase('done');
        } catch (e: any) {
            setError(e.message);
            setPhase('done');
        }
    };

    const handleManualRun = async () => {
        if (!selectedSkill || !manualSelection.trim()) return;
        setPhase('running');
        setError('');
        setManualResult('');
        try {
            const res = await api.onboardManual(selectedSkill, manualSelection, manualInstruction);
            setManualResult(res.updated ? 'SKILL.md updated successfully!' : 'No changes made.');
            setSkillMd(res.skillMd);
            setPhase('done');
        } catch (e: any) {
            setError(e.message);
            setPhase('done');
        }
    };

    return (
        <div className="onboard-page">
            <header className="onboard-header">
                <h2>🚀 Skill Onboarding</h2>
                <p>Test, debug, and optimize skills for local deployment</p>
            </header>

            <div className="onboard-content">
                {/* Top bar: skill select + init */}
                <div className="onboard-top">
                    <select className="onboard-select" value={selectedSkill}
                        onChange={e => { setSelectedSkill(e.target.value); setPhase('idle'); setSkillMd(''); setIterations([]); }}>
                        <option value="">Select a skill...</option>
                        {skills.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                    </select>
                    <button className="onboard-btn onboard-btn--init" onClick={handleInit}
                        disabled={!selectedSkill || phase === 'init'}>
                        {phase === 'init' ? '⏳ Initializing...' : '📋 Initialize Onboarding'}
                    </button>
                    <div className="onboard-mode-switch">
                        <button className={`onboard-mode ${mode === 'auto' ? 'onboard-mode--active' : ''}`}
                            onClick={() => setMode('auto')}>🤖 Auto</button>
                        <button className={`onboard-mode ${mode === 'manual' ? 'onboard-mode--active' : ''}`}
                            onClick={() => setMode('manual')}>✏️ Manual</button>
                    </div>
                </div>

                {error && <div className="onboard-error">❌ {error}</div>}

                {/* SKILL.md / Debug / Analysis preview */}
                {skillMd && (
                    <div className="onboard-preview">
                        <div className="onboard-preview__tabs">
                            <Details title="SKILL.md" content={skillMd} />
                            {selfDebug && <Details title="self-debug.md" content={selfDebug} />}
                            {analysis && <Details title="analysis.md" content={analysis} />}
                        </div>
                    </div>
                )}

                {/* Auto Mode */}
                {mode === 'auto' && (
                    <div className="onboard-auto">
                        <div className="onboard-auto__controls">
                            <label>Max iterations:</label>
                            <input type="number" min={1} max={10} value={maxIter}
                                onChange={e => setMaxIter(Number(e.target.value))} className="onboard-input--small" />
                            <button className="onboard-btn onboard-btn--run" onClick={handleAutoRun}
                                disabled={!selectedSkill || phase === 'running'}>
                                {phase === 'running' ? '⏳ Running Auto-Onboard...' : '▶ Run Auto-Onboard'}
                            </button>
                        </div>

                        {iterations.length > 0 && (
                            <div className="onboard-iterations">
                                <h4>Test Results {improved && <span className="onboard-improved">✅ SKILL.md Improved</span>}</h4>
                                {iterations.map((it, i) => (
                                    <div key={i} className={`onboard-iter ${it.error ? 'onboard-iter--error' : it.evaluation?.score >= 7 ? 'onboard-iter--good' : 'onboard-iter--warn'}`}>
                                        <div className="onboard-iter__head">
                                            <span>Iteration {it.iteration}</span>
                                            <span className="onboard-iter__score">Score: {it.evaluation?.score ?? '?'}/10</span>
                                            {it.improved && <span className="onboard-iter__badge">🔄 Improved</span>}
                                        </div>
                                        <div className="onboard-iter__input"><strong>Input:</strong> {it.input}</div>
                                        {it.error && <div className="onboard-iter__error">Error: {it.error}</div>}
                                        {it.output && <div className="onboard-iter__output">{it.output}</div>}
                                        {it.evaluation?.issues?.length > 0 && (
                                            <div className="onboard-iter__issues">
                                                Issues: {it.evaluation.issues.join('; ')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Manual Mode */}
                {mode === 'manual' && (
                    <div className="onboard-manual">
                        <div className="onboard-manual__section">
                            <label>Select SKILL.md content to optimize:</label>
                            <textarea className="onboard-textarea" rows={6} value={manualSelection}
                                onChange={e => setManualSelection(e.target.value)}
                                placeholder="Paste or type the section of SKILL.md you want to improve..." />
                        </div>
                        <div className="onboard-manual__section">
                            <label>Optimization instruction (optional):</label>
                            <textarea className="onboard-textarea" rows={3} value={manualInstruction}
                                onChange={e => setManualInstruction(e.target.value)}
                                placeholder="e.g. 'Add better error handling' or 'Make output more concise'" />
                        </div>
                        <button className="onboard-btn onboard-btn--run" onClick={handleManualRun}
                            disabled={!selectedSkill || !manualSelection.trim() || phase === 'running'}>
                            {phase === 'running' ? '⏳ Optimizing...' : '🔧 Optimize Section'}
                        </button>
                        {manualResult && <div className="onboard-manual__result">{manualResult}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

function Details({ title, content }: { title: string; content: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="onboard-details">
            <button className="onboard-details__toggle" onClick={() => setOpen(!open)}>
                {open ? '▾' : '▸'} {title}
            </button>
            {open && <pre className="onboard-details__content">{content}</pre>}
        </div>
    );
}
