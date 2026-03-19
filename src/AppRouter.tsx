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

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route
          path="/admin/analysis"
          element={
            <RequireAdmin>
              <BdaAnalysisPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/"
          element={
            <RequireUser>
              <CrmDashboardPage />
            </RequireUser>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
