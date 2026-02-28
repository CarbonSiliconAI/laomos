import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Dock.css';

interface DockItem {
    path: string;
    label: string;
    icon: React.ReactNode;
}

const MAIN_ITEMS: DockItem[] = [
    {
        path: '/home',
        label: 'Home',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
    },
    {
        path: '/operations',
        label: 'Operations',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <path d="M7 8h4M7 11h2" />
                <circle cx="16" cy="9" r="2" />
                <path d="M14 13h4" />
            </svg>
        ),
    },
    {
        path: '/workforce',
        label: 'Workforce',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="3" />
                <circle cx="17" cy="9" r="2" />
                <path d="M3 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
                <path d="M19 14a3 3 0 0 1 3 3v1" />
            </svg>
        ),
    },
    {
        path: '/knowledge',
        label: 'Knowledge',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="15" y2="7" />
                <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
        ),
    },
    {
        path: '/governance',
        label: 'Governance',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
            </svg>
        ),
    },
];

const SETTINGS_ITEM: DockItem = {
    path: '/governance/settings',
    label: 'Settings',
    icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    ),
};

export default function Dock() {
    const location = useLocation();

    const isActive = (path: string) => {
        if (path === '/home') return location.pathname === '/home';
        return location.pathname.startsWith(path);
    };

    return (
        <nav className="dock">
            <div className="dock__logo">
                <span className="dock__logo-mark">L</span>
            </div>

            <div className="dock__items">
                {MAIN_ITEMS.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={`dock__item ${isActive(item.path) ? 'dock__item--active' : ''}`}
                        title={item.label}
                    >
                        <span className="dock__item-icon">{item.icon}</span>
                        <span className="dock__item-label">{item.label}</span>
                        {isActive(item.path) && <span className="dock__item-indicator" />}
                    </NavLink>
                ))}
            </div>

            <div className="dock__bottom">
                <NavLink
                    to={SETTINGS_ITEM.path}
                    className={`dock__item ${location.pathname === SETTINGS_ITEM.path ? 'dock__item--active' : ''}`}
                    title={SETTINGS_ITEM.label}
                >
                    <span className="dock__item-icon">{SETTINGS_ITEM.icon}</span>
                    <span className="dock__item-label">{SETTINGS_ITEM.label}</span>
                </NavLink>
            </div>
        </nav>
    );
}
