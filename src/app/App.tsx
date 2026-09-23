import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useStore } from '@/storage/store';
import { useApplyAppearance } from '@/hooks/useTheme';
import HomePage from '@/pages/HomePage';

// Secondary pages are split out of the initial bundle.
const ToolPage = lazy(() => import('@/pages/ToolPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const DiagnosticsPage = lazy(() => import('@/pages/DiagnosticsPage'));
const AllToolsPage = lazy(() => import('@/pages/ToolsPage').then((m) => ({ default: m.AllToolsPage })));
const CategoryPage = lazy(() => import('@/pages/ToolsPage').then((m) => ({ default: m.CategoryPage })));
const HistoryPage = lazy(() => import('@/pages/ActivityPages').then((m) => ({ default: m.HistoryPage })));
const WorkspacePage = lazy(() => import('@/pages/ActivityPages').then((m) => ({ default: m.WorkspacePage })));
const PrivacyPage = lazy(() => import('@/pages/InfoPages').then((m) => ({ default: m.PrivacyPage })));
const AboutPage = lazy(() => import('@/pages/InfoPages').then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import('@/pages/InfoPages').then((m) => ({ default: m.NotFoundPage })));

const page = (el: JSX.Element) => (
  <ErrorBoundary>
    <Suspense fallback={<div className="py-10 text-sm text-muted" role="status">Loading…</div>}>{el}</Suspense>
  </ErrorBoundary>
);

const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: '/', element: page(<HomePage />) },
        { path: '/tools', element: page(<AllToolsPage />) },
        { path: '/tools/:id', element: page(<ToolPage />) },
        { path: '/category/:id', element: page(<CategoryPage />) },
        { path: '/workspace', element: page(<WorkspacePage />) },
        { path: '/history', element: page(<HistoryPage />) },
        { path: '/settings', element: page(<SettingsPage />) },
        { path: '/diagnostics', element: page(<DiagnosticsPage />) },
        { path: '/privacy', element: page(<PrivacyPage />) },
        { path: '/about', element: page(<AboutPage />) },
        { path: '*', element: page(<NotFoundPage />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export function App() {
  const hydrate = useStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useApplyAppearance();
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
