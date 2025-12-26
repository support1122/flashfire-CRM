import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, Shield, Trash2, UserRound } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const ADMIN_TOKEN_KEY = 'flashfire_crm_admin_token';

type CrmPermission =
  | 'email_campaign'
  | 'campaign_manager'
  | 'whatsapp_campaign'
  | 'analytics'
  | 'all_data'
  | 'workflows'
  | 'leads';

const PERMISSIONS: Array<{ key: CrmPermission; label: string; description: string }> = [
  { key: 'campaign_manager', label: 'Campaign Manager', description: 'UTM campaigns + bookings overview' },
  { key: 'email_campaign', label: 'Email Campaign', description: 'SendGrid email campaigns' },
  { key: 'whatsapp_campaign', label: 'WhatsApp Campaign', description: 'WhatsApp campaigns + scheduling' },
  { key: 'analytics', label: 'Analytics', description: 'Performance dashboards + insights' },
  { key: 'all_data', label: 'All Data', description: 'Unified data view + notes/actions' },
  { key: 'workflows', label: 'Workflows', description: 'Workflow builder + logs' },
  { key: 'leads', label: 'Leads', description: 'Paid clients management + revenue tracking' },
];

type CrmUserRow = {
  _id: string;
  email: string;
  name: string;
  permissions: CrmPermission[];
  isActive: boolean;
  createdAt?: string;
};

function permissionLabel(key: CrmPermission) {
  return PERMISSIONS.find((p) => p.key === key)?.label || key;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const [adminToken, setAdminToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [users, setUsers] = useState<CrmUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [editorEmail, setEditorEmail] = useState('');
  const [editorName, setEditorName] = useState('');
  const [editorPermissions, setEditorPermissions] = useState<CrmPermission[]>([]);
  const [editorIsActive, setEditorIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.createdAt && b.createdAt ? b.createdAt.localeCompare(a.createdAt) : 0));
  }, [users]);

  const loadUsers = async (token: string) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body?.error || 'Failed to load users');
      setUsers(body?.users || []);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) loadUsers(adminToken);
  }, [adminToken]);

  const logoutAdmin = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setPassword('');
    setUsers([]);
  };

  const onAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await safeJson(res);
      if (!res.ok || !body?.token) throw new Error(body?.error || 'Invalid password');
      sessionStorage.setItem(ADMIN_TOKEN_KEY, body.token);
      setAdminToken(body.token);
      setPassword('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Invalid password');
    } finally {
      setAuthLoading(false);
    }
  };

  const togglePermission = (perm: CrmPermission) => {
    setEditorPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const resetEditor = () => {
    setEditorEmail('');
    setEditorName('');
    setEditorPermissions([]);
    setEditorIsActive(true);
  };

  const onSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setSaving(true);
    setUsersError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email: editorEmail.trim(),
          name: editorName.trim(),
          permissions: editorPermissions,
          isActive: editorIsActive,
        }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body?.error || 'Failed to save user');
      await loadUsers(adminToken);
      resetEditor();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteUser = async (id: string) => {
    if (!adminToken) return;
    const ok = confirm('Delete this user?');
    if (!ok) return;
    setUsersError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body?.error || 'Failed to delete user');
      await loadUsers(adminToken);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to delete user');
    }
  };

  const onLoadIntoEditor = (u: CrmUserRow) => {
    setEditorEmail(u.email);
    setEditorName(u.name);
    setEditorPermissions(u.permissions || []);
    setEditorIsActive(u.isActive !== false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-7 py-7">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 rounded-xl p-3">
                  <Shield className="text-white" size={22} />
                </div>
                <div>
                  <h1 className="text-white text-2xl font-bold leading-tight">Admin Dashboard</h1>
                  <p className="text-slate-300 text-sm">Create users and grant module access</p>
                </div>
              </div>
            </div>

            <div className="px-7 py-7">
              {authError && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-700 text-sm font-semibold">{authError}</p>
                </div>
              )}

              <form onSubmit={onAdminLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="admin-password">
                    Admin Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      id="admin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full pl-11 pr-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    This is the same password you mentioned: <span className="font-semibold">flashfire@2025</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {authLoading ? 'Signing in…' : 'Access Admin Dashboard'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 text-white rounded-xl p-3">
              <UserRound size={18} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">CRM Admin</h1>
              <p className="text-sm text-slate-600">Users, permissions, access control</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logoutAdmin}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            <CheckCircle2 size={16} />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {usersError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 text-sm font-semibold">{usersError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-900">Create / Update User</h2>
                <button
                  type="button"
                  onClick={resetEditor}
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                >
                  Clear
                </button>
              </div>

              <form onSubmit={onSaveUser} className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="u-email">
                    Email
                  </label>
                  <input
                    id="u-email"
                    value={editorEmail}
                    onChange={(e) => setEditorEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="user@company.com"
                    type="email"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="u-name">
                    Name
                  </label>
                  <input
                    id="u-name"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Full name"
                    type="text"
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="u-active"
                    type="checkbox"
                    checked={editorIsActive}
                    onChange={(e) => setEditorIsActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="u-active" className="text-sm font-semibold text-slate-700">
                    Active user
                  </label>
                </div>

                <div>
                  <div className="text-sm font-extrabold text-slate-900">Module Access</div>
                  <p className="text-xs text-slate-500 mt-1">Select which sections appear after OTP login.</p>
                  <div className="mt-3 space-y-2">
                    {PERMISSIONS.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-orange-200 hover:bg-orange-50/40 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editorPermissions.includes(p.key)}
                          onChange={() => togglePermission(p.key)}
                          className="mt-1 h-4 w-4"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900">{p.label}</div>
                          <div className="text-xs text-slate-600">{p.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Plus size={18} />
                  {saving ? 'Saving…' : 'Save User'}
                </button>
              </form>
            </div>
          </section>

          <section className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">Users</h2>
                <button
                  type="button"
                  onClick={() => adminToken && loadUsers(adminToken)}
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                >
                  Refresh
                </button>
              </div>

              {usersLoading ? (
                <div className="p-8 text-center text-slate-600">Loading users…</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {sortedUsers.length === 0 ? (
                    <div className="p-8 text-center text-slate-600">No users yet. Create your first user on the left.</div>
                  ) : (
                    sortedUsers.map((u) => (
                      <div key={u._id} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-base font-extrabold text-slate-900">{u.name}</div>
                              {u.isActive ? (
                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-600 break-all">{u.email}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(u.permissions || []).length === 0 ? (
                                <span className="text-xs font-semibold text-slate-500">No permissions</span>
                              ) : (
                                u.permissions.map((p) => (
                                  <span
                                    key={p}
                                    className="text-xs font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200"
                                  >
                                    {permissionLabel(p)}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onLoadIntoEditor(u)}
                              className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteUser(u._id)}
                              className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}


