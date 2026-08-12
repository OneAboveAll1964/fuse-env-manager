import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { RouteErrorElement } from '@/components/RouteErrorElement';
import { VaultPage } from '@/pages/VaultPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SearchPage } from '@/pages/SearchPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { TransferPage } from '@/pages/TransferPage';
import { CliPage } from '@/pages/CliPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage } from '@/pages/AboutPage';

export const router = createHashRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorElement />,
    children: [
      { index: true, element: <Navigate to="/vault" replace /> },
      { path: '/vault', element: <VaultPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/transfer', element: <TransferPage /> },
      { path: '/cli', element: <CliPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/about', element: <AboutPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/vault" replace /> },
]);
