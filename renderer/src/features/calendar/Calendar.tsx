import React, { useState, useEffect } from 'react';
import { api, ScheduledJob } from '../../lib/api';
import './Calendar.css';

export default function CalendarPage() {
    const [jobs, setJobs] = useState<ScheduledJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [savedChains, setSavedChains] = useState<string[]>([]);

    // Form state
    const [type, setType] = useState<'skill' | 'flow' | 'task-chain'>('skill');
    const [targetId, setTargetId] = useState('');
    const [payloadInput, setPayloadInput] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const fetchJobs = () => {
        setLoading(true);
        api.calendarJobs()
            .then((res: any) => setJobs(res.jobs || []))
            .catch((err: any) => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchJobs();
        const intv = setInterval(fetchJobs, 10000);
        // Load saved chains for the dropdown
        api.taskChainList().then(res => setSavedChains(res.chains || [])).catch(() => { });
        return () => clearInterval(intv);
    }, []);

    // When switching to task-chain type, load chains and reset targetId
    useEffect(() => {
        if (type === 'task-chain') {
            api.taskChainList().then(res => {
                const chains = res.chains || [];
                setSavedChains(chains);
                if (chains.length > 0 && !targetId) setTargetId(chains[0]);
            }).catch(() => { });
        }
    }, [type]);

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dateStr = `${scheduleDate}T${scheduleTime}:00`;
            const isoTime = new Date(dateStr).toISOString();

            let finalPayload: any;
            if (type === 'skill') {
                finalPayload = { userInput: payloadInput, preferredProvider: 'cloud' };
            } else if (type === 'task-chain') {
                finalPayload = { chainName: targetId };
            } else {
                try {
                    finalPayload = JSON.parse(payloadInput);
                } catch {
                    finalPayload = { userInput: payloadInput };
                }
            }

            await api.calendarCreateJob({
                type,
                targetId,
                inputPayload: finalPayload,
                scheduledTime: isoTime
            });

            setTargetId('');
            setPayloadInput('');
            fetchJobs();
        } catch (err: any) {
            alert('Error creating job: ' + err.message);
        }
    };

    const handleDeleteJob = async (id: string) => {
        try {
            await api.calendarDeleteJob(id);
            fetchJobs();
        } catch (err: any) {
            alert('Error deleting job: ' + err.message);
        }
    };

    const typeIcon = (t: string) => t === 'skill' ? '🔧' : t === 'flow' ? '🔀' : '⛓';

    return (
        <div className="calendar-container">
            <header className="calendar-header">
                <h2>Job Calendar</h2>
                <p>Schedule backend skills, flows, or task chains to run at specific times.</p>
            </header>

            <div className="calendar-content">
                <div className="calendar-scheduler">
                    <h3>Schedule New Job</h3>
                    <form onSubmit={handleCreateJob} className="schedule-form">
                        <div className="form-group">
                            <label>Run Type</label>
                            <select value={type} onChange={e => setType(e.target.value as any)}>
                                <option value="skill">🔧 Skill</option>
                                <option value="flow">🔀 Flow</option>
                                <option value="task-chain">⛓ Task Chain</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>{type === 'task-chain' ? 'Select Task Chain' : 'Target ID (Skill Name or Flow ID)'}</label>
                            {type === 'task-chain' ? (
                                <select value={targetId} onChange={e => setTargetId(e.target.value)} required>
                                    {savedChains.length === 0 && <option value="">No saved chains</option>}
                                    {savedChains.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={targetId}
                                    onChange={e => setTargetId(e.target.value)}
                                    required
                                    placeholder="e.g. Weather or flow-123"
                                />
                            )}
                        </div>

                        {type !== 'task-chain' && (
                            <div className="form-group">
                                <label>Human Language Task</label>
                                <textarea
                                    value={payloadInput}
                                    onChange={e => setPayloadInput(e.target.value)}
                                    rows={4}
                                    placeholder="e.g. Check the weather in Tokyo and notify me"
                                />
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={e => setScheduleDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Time</label>
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={e => setScheduleTime(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn-primary">Schedule Job</button>
                    </form>
                </div>

                <div className="calendar-jobs">
                    <h3>Scheduled Jobs {loading && <span className="loading-spinner">...</span>}</h3>
                    {jobs.length === 0 ? (
                        <p className="no-jobs">No jobs currently scheduled or recorded.</p>
                    ) : (
                        <ul className="job-list">
                            {jobs.map(job => (
                                <li key={job.id} className="job-card">
                                    <div className="job-header">
                                        <h4>{typeIcon(job.type)} {job.type.toUpperCase()}: {job.targetId}</h4>
                                        <span className={`job-status status-${job.status.toLowerCase()}`}>{job.status}</span>
                                    </div>
                                    <div className="job-details">
                                        <p><strong>Scheduled:</strong> {new Date(job.scheduledTime).toLocaleString()}</p>
                                        <p><strong>Created:</strong> {new Date(job.createdAt).toLocaleString()}</p>
                                    </div>
                                    {job.result && (
                                        <div className="job-result">
                                            <strong>Result:</strong>
                                            <pre>{job.result}</pre>
                                        </div>
                                    )}
                                    <div className="job-actions">
                                        <button onClick={() => handleDeleteJob(job.id)} className="btn-delete">Delete</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
