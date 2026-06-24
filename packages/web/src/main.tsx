import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/Dashboard';
import { GoalsPage } from './pages/Goals';
import { GoalDetailPage } from './pages/GoalDetail';
import { TasksPage } from './pages/Tasks';
import { WalletPage } from './pages/Wallet';
import { SettingsPage } from './pages/SettingsPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goals/:id" element={<GoalDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
