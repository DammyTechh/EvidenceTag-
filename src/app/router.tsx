import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomeRedirect } from './HomeRedirect';
import { NotFoundPage } from './NotFoundPage';
import { RequireAuth } from './guards/RequireAuth';
import { RequireRole } from './guards/RequireRole';

import { PassportPage } from '@/features/public-passport/PassportPage';
import { LabBoardPage } from '@/features/lab-board/LabBoardPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { StaffHomePage } from '@/features/equipment/StaffHomePage';
import { RegisterEquipmentPage } from '@/features/equipment/RegisterEquipmentPage';
import { LabelsPage } from '@/features/equipment/LabelsPage';
import { EventFormPage } from '@/features/events/EventFormPage';
import { ReplacementOutcomePage } from '@/features/service-reports/ReplacementOutcomePage';

/** Heavy, signed-in-only screens: fetched when they are first opened. */
const defer = (load: () => Promise<{ default: ComponentType }>) => {
  const Deferred = lazy(load);
  return (
    <Suspense fallback={<p className="p-4 text-ink-muted">Loading…</p>}>
      <Deferred />
    </Suspense>
  );
};

const DashboardPage = () =>
  defer(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ReportsPage = () =>
  defer(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
import { AlertsPage } from '@/features/notifications/AlertsPage';
import { AdminPage } from '@/features/admin/AdminPage';

/**
 * Route access mirrors the RLS policies exactly. The guard is a courtesy to
 * the user; the database is what actually enforces it.
 */
export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      // Anything the router throws lands here instead of React Router's
      // developer page.
      errorElement: <NotFoundPage />,
      children: [
        // Nobody navigates to "/" on purpose; they scan a label. Forward them.
        { index: true, element: <HomeRedirect /> },

        // Public. No session, no redirect, no account.
        { path: '/e/:qrToken', element: <PassportPage /> },
        { path: '/l/:labToken', element: <LabBoardPage /> },
        { path: '/login', element: <LoginPage /> },

        {
          element: <RequireAuth />,
          children: [
            { path: '/change-password', element: <ChangePasswordPage /> },
            { path: '/notifications', element: <AlertsPage /> },

            {
              element: <RequireRole roles={['technician', 'lab_hod']} />,
              children: [
                { path: '/staff', element: <StaffHomePage /> },
                { path: '/staff/equipment/new', element: <RegisterEquipmentPage /> },
                { path: '/staff/equipment/:id/event/:type', element: <EventFormPage /> },
                { path: '/staff/equipment/:id/replacement', element: <ReplacementOutcomePage /> },
                { path: '/staff/labels', element: <LabelsPage /> },
              ],
            },
            {
              element: <RequireRole roles={['lab_hod', 'senior_leader']} />,
              children: [{ path: '/dashboard', element: <DashboardPage /> }],
            },
            {
              element: <RequireRole roles={['technician', 'lab_hod', 'senior_leader']} />,
              children: [{ path: '/reports', element: <ReportsPage /> }],
            },
            {
              element: <RequireRole roles={['admin']} />,
              children: [{ path: '/admin', element: <AdminPage /> }],
            },
          ],
        },

        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  {
    // Opt in early so the v7 upgrade is a version bump, not a migration.
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
