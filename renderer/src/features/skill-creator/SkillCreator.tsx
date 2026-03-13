import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api';
import './SkillCreator.css';

interface ChatMsg {
    role: 'user' | 'assistant';
    text: string;
}

export default function SkillCreatorPage() {
    const [requirements, setRequirements] = useState('');
    const [skillMd, setSkillMd] = useState('');
    const [generating, setGenerating] = useState(false);
    const [refining, setRefining] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveMsg, setSaveMsg] = useState('');
    const [error, setError] = useState('');

    // Chat refinement
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleGenerate = async () => {
        if (!requirements.trim()) return;
        setGenerating(true);
        setError('');
        setSkillMd('');
        setChatMessages([]);
        setSaveMsg('');
        try {
            const res = await api.skillCreateGenerate(requirements);
            setSkillMd(res.skillMd);
            // Extract a default name from the YAML
            const nameMatch = res.skillMd.match(/^name:\s*(.+)$/m);
            if (nameMatch) setSaveName(nameMatch[1].trim());
        } catch (e: any) {
            setError(e.message);
        }
        setGenerating(false);
    };

    const handleRefine = async () => {
        if (!chatInput.trim() || !skillMd) return;
        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setRefining(true);
        setError('');
        try {
            const res = await api.skillCreateRefine(skillMd, userMsg);
            setSkillMd(res.skillMd);
            setChatMessages(prev => [...prev, { role: 'assistant', text: '✅ SKILL.md updated based on your request.' }]);
        } catch (e: any) {
            setError(e.message);
            setChatMessages(prev => [...prev, { role: 'assistant', text: `❌ Error: ${e.message}` }]);
        }
        setRefining(false);
    };

    const handleSave = async () => {
        if (!skillMd || !saveName.trim()) return;
        setSaving(true);
        setSaveMsg('');
        setError('');
        try {
            const res = await api.skillCreateSave(skillMd, saveName);
            setSaveMsg(`✅ Saved as "${res.skillName}" in skills folder!`);
        } catch (e: any) {
            setError(e.message);
        }
        setSaving(false);
    };

    return (
        <div className="sc-page">
            <header className="sc-header">
                <h2>🛠️ Skill Creator</h2>
                <p>Create custom skills from your requirements</p>
            </header>

            <div className="sc-content">
                {/* Input Panel */}
                <div className="sc-panel sc-panel--input">
                    <h3>📝 Requirements</h3>
                    <textarea
                        className="sc-textarea"
                        rows={8}
                        value={requirements}
                        onChange={e => setRequirements(e.target.value)}
                        placeholder="Describe what you want this skill to do...&#10;&#10;Example: Create a skill that can fetch stock prices for any ticker symbol using free APIs, with support for historical data and market summary."
                    />
                    <button className="sc-btn sc-btn--generate" onClick={handleGenerate}
                        disabled={!requirements.trim() || generating}>
                        {generating ? '⏳ Generating...' : '✨ Generate Skill'}
                    </button>
                </div>

                {error && <div className="sc-error">❌ {error}</div>}

                {/* Output Panel */}
                {skillMd && (
                    <div className="sc-panel sc-panel--output">
                        <div className="sc-output-header">
                            <h3>📄 Generated SKILL.md</h3>
                            <div className="sc-save-row">
                                <input className="sc-save-input" type="text" value={saveName}
                                    onChange={e => setSaveName(e.target.value)}
                                    placeholder="Skill name..." />
                                <button className="sc-btn sc-btn--save" onClick={handleSave}
                                    disabled={!saveName.trim() || saving}>
                                    {saving ? '⏳' : '💾'} Save
                                </button>
                            </div>
                        </div>
                        {saveMsg && <div className="sc-save-msg">{saveMsg}</div>}
                        <pre className="sc-preview">{skillMd}</pre>

                        {/* Chat Refinement */}
                        <div className="sc-chat">
                            <h4>💬 Refine with Chat</h4>
                            <div className="sc-chat__messages">
                                {chatMessages.length === 0 && (
                                    <div className="sc-chat__empty">Ask the AI to modify any part of the generated skill...</div>
                                )}
                                {chatMessages.map((msg, i) => (
                                    <div key={i} className={`sc-chat__msg sc-chat__msg--${msg.role}`}>
                                        <span className="sc-chat__role">{msg.role === 'user' ? '👤' : '🤖'}</span>
                                        <span className="sc-chat__text">{msg.text}</span>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="sc-chat__input-row">
                                <input className="sc-chat__input" type="text" value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleRefine(); }}
                                    placeholder="e.g. 'Add error handling for network timeouts' or 'Make the output more concise'"
                                    disabled={refining} />
                                <button className="sc-btn sc-btn--send" onClick={handleRefine}
                                    disabled={!chatInput.trim() || refining}>
                                    {refining ? '⏳' : '→'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
