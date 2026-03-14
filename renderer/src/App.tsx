import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import HomePage from './pages/Home';
import OperationsPage from './pages/Operations';
import WorkforcePage from './pages/Workforce';
import KnowledgePage from './pages/Knowledge';
import GovernancePage from './pages/Governance';

// Features
import CalendarPage from './features/calendar/Calendar';
import FlowPage from './features/flow/Flow';
import MailPage from './features/mail/Mail';
import GamePage from './features/game/Game';
import TelegramPage from './features/telegram/Telegram';
import WhatsAppPage from './features/whatsapp/WhatsApp';
import NewsPage from './features/news/News';
import DrawPage from './features/draw/Draw';
import VideoPage from './features/video/Video';
import BrowserPage from './features/browser/Browser';
import AnalyzerPage from './features/analyzer/Analyzer';
import ChatPage from './features/chat/Chat';
import TaskChainPage from './features/task-chain/TaskChain';
import DepartmentPage from './features/department/Department';
import CompanyPage from './features/company/Company';
import SkillOnboardPage from './features/skill-onboard/SkillOnboard';
import FilesPage from './features/files/Files';
import ModelsPage from './features/models/Models';
import ApiKeysPage from './features/api-keys/ApiKeys';
import RagPage from './features/rag/Rag';
import SearchPage from './features/search/Search';
import GraphPage from './features/graph/Graph';
import OpenClawPage from './features/openclaw/OpenClaw';
import MonitorPage from './features/monitor/Monitor';
import HistoryPage from './features/history/History';
import SettingsPage from './features/settings/Settings';
import AutoConfigPage from './features/auto-config/AutoConfig';
import AgentStorePage from './features/agent-store/AgentStore';
import AgencyKnowledgePage from './features/agency-knowledge/AgencyKnowledge';
import EvolutionTreePage from './pages/EvolutionTree';

export default function App() {
    return (
        <HashRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route index element={<Navigate to="/home" replace />} />
                    <Route path="/home" element={<HomePage />} />

                    <Route path="/operations" element={<OperationsPage />} />
                    <Route path="/operations/calendar" element={<CalendarPage />} />
                    <Route path="/operations/flow" element={<FlowPage />} />
                    <Route path="/operations/mail" element={<MailPage />} />
                    <Route path="/operations/game" element={<GamePage />} />
                    <Route path="/operations/telegram" element={<TelegramPage />} />
                    <Route path="/operations/whatsapp" element={<WhatsAppPage />} />
                    <Route path="/operations/news" element={<NewsPage />} />
                    <Route path="/operations/draw" element={<DrawPage />} />
                    <Route path="/operations/video" element={<VideoPage />} />
                    <Route path="/operations/browser" element={<BrowserPage />} />
                    <Route path="/operations/analyzer" element={<AnalyzerPage />} />
                    <Route path="/operations/task-chain" element={<TaskChainPage />} />
                    <Route path="/operations/department" element={<DepartmentPage />} />
                    <Route path="/operations/company" element={<CompanyPage />} />

                    <Route path="/workforce" element={<WorkforcePage />} />
                    <Route path="/workforce/chat" element={<ChatPage />} />
                    <Route path="/workforce/openclaw" element={<OpenClawPage />} />
                    <Route path="/workforce/skill-onboard" element={<SkillOnboardPage />} />
                    <Route path="/workforce/models" element={<ModelsPage />} />
                    <Route path="/workforce/agent-store" element={<AgentStorePage />} />

                    <Route path="/knowledge" element={<KnowledgePage />} />
                    <Route path="/knowledge/files" element={<FilesPage />} />
                    <Route path="/knowledge/rag" element={<RagPage />} />
                    <Route path="/knowledge/search" element={<SearchPage />} />
                    <Route path="/knowledge/graph" element={<GraphPage />} />
                    <Route path="/knowledge/agency" element={<AgencyKnowledgePage />} />

                    <Route path="/governance" element={<GovernancePage />} />
                    <Route path="/governance/monitor" element={<MonitorPage />} />
                    <Route path="/governance/history" element={<HistoryPage />} />
                    <Route path="/governance/auto-config" element={<AutoConfigPage />} />
                    <Route path="/governance/settings" element={<SettingsPage />} />
                    <Route path="/governance/evolution-tree" element={<EvolutionTreePage />} />
                    <Route path="/governance/api-keys" element={<ApiKeysPage />} />

                    <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
            </Routes>
        </HashRouter>
    );
}
