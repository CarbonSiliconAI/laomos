import React, { useState, useEffect, useMemo } from 'react';
import { api, AgencySkill, AgencyExperienceEntry } from '../../lib/api';
import './AgencyKnowledge.css';

type Tab = 'skills' | 'experience';

export default function AgencyKnowledge() {
    const [tab, setTab] = useState<Tab>('skills');
    const [skills, setSkills] = useState<AgencySkill[]>([]);
    const [experience, setExperience] = useState<AgencyExperienceEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        setLoading(true);
        if (tab === 'skills') {
            api.agencySkills()
                .then(r => setSkills(r.skills ?? []))
                .catch(() => setSkills([]))
                .finally(() => setLoading(false));
        } else {
            api.agencyExperience()
                .then(r => setExperience(r.experience ?? []))
                .catch(() => setExperience([]))
                .finally(() => setLoading(false));
        }
    }, [tab]);

    // Division filters
    const divisions = useMemo(() => {
        if (tab === 'skills') {
            return Array.from(new Set(skills.map(s => s.division))).sort();
        }
        return Array.from(new Set(experience.map(e => e.division))).sort();
    }, [tab, skills, experience]);

    const filteredSkills = useMemo(() => {
        if (filter === 'all') return skills;
        return skills.filter(s => s.division === filter);
    }, [skills, filter]);

    const filteredExperience = useMemo(() => {
        if (filter === 'all') return experience;
        return experience.filter(e => e.division === filter);
    }, [experience, filter]);

    const skillCount = skills.length;
    const expCount = experience.length;

    return (
        <div className="agency-knowledge">
            <div className="agency-knowledge__header">
                <div className="agency-knowledge__header-left">
                    <h1 className="agency-knowledge__title">Agency Knowledge</h1>
                    <p className="agency-knowledge__sub">Skills and experience extracted from installed agents</p>
                </div>
                <div className="agency-knowledge__header-right">
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                        {skillCount} skills &middot; {expCount} experiences
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="agency-knowledge__tabs">
                <button
                    className={`agency-knowledge__tab${tab === 'skills' ? ' agency-knowledge__tab--active' : ''}`}
                    onClick={() => { setTab('skills'); setFilter('all'); }}
                >
                    Skills ({skillCount})
                </button>
                <button
                    className={`agency-knowledge__tab${tab === 'experience' ? ' agency-knowledge__tab--active' : ''}`}
                    onClick={() => { setTab('experience'); setFilter('all'); }}
                >
                    Experience ({expCount})
                </button>
            </div>

            {/* Body */}
            <div className="agency-knowledge__body">
                {/* Division filter row */}
                {divisions.length > 1 && (
                    <div className="agency-knowledge__filters">
                        <button
                            className={`agency-knowledge__filter-btn${filter === 'all' ? ' agency-knowledge__filter-btn--active' : ''}`}
                            onClick={() => setFilter('all')}
                        >
                            All
                        </button>
                        {divisions.map(d => (
                            <button
                                key={d}
                                className={`agency-knowledge__filter-btn${filter === d ? ' agency-knowledge__filter-btn--active' : ''}`}
                                onClick={() => setFilter(d)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div className="agency-knowledge__empty">Loading...</div>
                ) : tab === 'skills' ? (
                    filteredSkills.length === 0 ? (
                        <div className="agency-knowledge__empty">
                            <span>No skills extracted yet</span>
                            <span style={{ fontSize: 'var(--fs-xs)' }}>Install agents from the Agent Store to see their skills here</span>
                        </div>
                    ) : (
                        <div className="agency-knowledge__grid">
                            {filteredSkills.map(skill => (
                                <div key={skill.id} className="ak-skill-card glass-card">
                                    <div className="ak-skill-card__top">
                                        <span className={`ak-skill-card__badge ak-skill-card__badge--${skill.source}`}>
                                            {skill.source}
                                        </span>
                                        <span className="ak-skill-card__cat">{skill.category}</span>
                                    </div>
                                    <div className="ak-skill-card__name">{skill.name}</div>
                                    <div className="ak-skill-card__desc">{skill.description}</div>
                                    <div className="ak-skill-card__footer">
                                        <span style={{ color: '#d97706' }}>{skill.division}</span>
                                        <span>&middot;</span>
                                        <span>{skill.agentName}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    filteredExperience.length === 0 ? (
                        <div className="agency-knowledge__empty">
                            <span>No experience data yet</span>
                            <span style={{ fontSize: 'var(--fs-xs)' }}>Run agents to accumulate experience (generated every 5 runs)</span>
                        </div>
                    ) : (
                        <div className="agency-knowledge__grid">
                            {filteredExperience.map(exp => (
                                <div key={exp.id} className="ak-exp-card glass-card">
                                    <div className="ak-exp-card__header">
                                        <span className="ak-exp-card__agent">{exp.agentName}</span>
                                        <span className="ak-exp-card__division">{exp.division}</span>
                                    </div>
                                    <div className="ak-exp-card__stats">
                                        <span className="ak-exp-card__stat">
                                            <span className="ak-exp-card__stat-val">{exp.totalRuns}</span> runs
                                        </span>
                                        <span className="ak-exp-card__stat">
                                            <span className="ak-exp-card__stat-val">{Math.round(exp.successRate * 100)}%</span> success
                                        </span>
                                    </div>
                                    <div className="ak-exp-card__summary">{exp.summary}</div>
                                    {exp.insight && (
                                        <div className="ak-exp-card__insight">{exp.insight}</div>
                                    )}
                                    <div className="ak-exp-card__date">
                                        {new Date(exp.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
