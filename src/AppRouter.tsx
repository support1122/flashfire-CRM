import { Navigate, Route, Routes } from 'react-router-dom';
import { useCrmAuth } from './auth/CrmAuthContext';
import LoginPage from './pages/LoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import CrmDashboardPage from './pages/CrmDashboardPage';
import BdaAnalysisPage from './pages/admin/BdaAnalysisPage';

function RequireUser({ children }: { children: React.ReactNode }) {
  const { status } = useCrmAuth();
  if (status === 'loading') {
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
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const adminToken = sessionStorage.getItem('flashfire_crm_admin_token');
  
  if (!adminToken) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  
  return <>{children}</>;
}

export default function AppRouter() {
  return (
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
  );
}


