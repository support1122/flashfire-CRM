import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useCrmAuth } from './auth/CrmAuthContext';

const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const AdminDashboardPage = React.lazy(() => import('./pages/admin/AdminDashboardPage'));
const CrmDashboardPage = React.lazy(() => import('./pages/CrmDashboardPage'));
const BdaAnalysisPage = React.lazy(() => import('./pages/admin/BdaAnalysisPage'));

export function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-orange-500 rounded-full animate-pulse" />
        </div>
        <p className="mt-5 text-sm text-slate-600 text-center">Loading your access…</p>
      </div>
    </div>
  );
}

function RequireUser({ children }: { children: React.ReactNode }) {
  const { status } = useCrmAuth();
  if (status === 'loading') {
    return <LoadingSpinner />;
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  let adminToken: string | null = null;
  try {
    adminToken = localStorage.getItem('flashfire_crm_admin_token');
  } catch {
    adminToken = null;
  }
  if (!adminToken) {
    try {
      adminToken = sessionStorage.getItem('flashfire_crm_admin_token');
    } catch {
      adminToken = null;
    }
  }
  if (!adminToken) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}

// Prevents the main CRM login page from being shown when already authenticated
function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useCrmAuth();
  if (status === 'loading') return <LoadingSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Main CRM login — goes to /login, redirects to / after success */}
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />

        {/* Main CRM dashboard — requires user auth, else → /login */}
        <Route
          path="/"
          element={
            <RequireUser>
              <CrmDashboardPage />
            </RequireUser>
          }
        />

        {/* Admin panel — completely separate, has its own OTP login built-in */}
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route
          path="/admin/analysis"
          element={
            <RequireAdmin>
              <BdaAnalysisPage />
            </RequireAdmin>
          }
        />

        {/* Any unknown URL → main CRM login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
