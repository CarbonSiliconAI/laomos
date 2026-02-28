import React from 'react';
import { Outlet } from 'react-router-dom';
import Dock from './Dock';
import Sidebar from './Sidebar';
import './AppShell.css';

export default function AppShell() {
    return (
        <div className="app-shell">
            <Dock />
            <Sidebar />
            <main className="app-shell__main">
                <Outlet />
            </main>
        </div>
    );
}
