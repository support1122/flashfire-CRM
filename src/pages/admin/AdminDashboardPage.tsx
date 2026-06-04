import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, Shield, Trash2, UserRound, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const ADMIN_TOKEN_KEY = 'flashfire_crm_admin_token';

type CrmModule =
  | 'email_campaign'
  | 'campaign_manager'
  | 'whatsapp_campaign'
  | 'analytics'
  | 'all_data'
  | 'workflows'
  | 'leads'
  | 'meta_leads'
  | 'claim_leads'
  | 'meeting_links'
  | 'bda_admin'
  | 'activity_logs'
  | 'lead_analytics'
  | 'phone_calls';

type CrmPermission = CrmModule | `${CrmModule}_edit`;

const PERMISSIONS: Array<{ key: CrmModule; label: string; description: string; viewOnly?: boolean }> = [
  { key: 'campaign_manager', label: 'Campaign Manager', description: 'UTM campaigns + bookings overview' },
  { key: 'email_campaign', label: 'Email Campaign', description: 'SendGrid email campaigns' },
  { key: 'whatsapp_campaign', label: 'WhatsApp Campaign', description: 'WhatsApp campaigns + scheduling' },
  { key: 'analytics', label: 'Analytics', description: 'Performance dashboards + insights', viewOnly: true },
  { key: 'all_data', label: 'All Data', description: 'Unified data view + notes/actions' },
  { key: 'workflows', label: 'Workflows', description: 'Workflow builder + logs' },
  { key: 'leads', label: 'Leads', description: 'MQL / SQL / Converted management + revenue tracking' },
  { key: 'meta_leads', label: 'Meta Leads', description: 'Facebook & Instagram Lead Ads (dedicated tab)' },
  { key: 'claim_leads', label: 'Claim Leads', description: 'BDA lead claiming and management' },
  { key: 'meeting_links', label: 'Meeting Info', description: 'Meeting recordings and Google Drive video URLs' },
  { key: 'bda_admin', label: 'BDA Admin', description: 'Approve BDA claims and review notifications' },
  { key: 'activity_logs', label: 'Activity Log', description: 'View every action across the CRM — who did what, when', viewOnly: true },
  { key: 'lead_analytics', label: 'Graphs', description: 'Lead graphs — monthly status, paid vs organic, paid clients', viewOnly: true },
  { key: 'phone_calls', label: 'Phone Calls', description: 'Access Zoom Phone call recordings and per-lead call history', viewOnly: true },
];

type CrmUserRow = {
  _id: string;
  email: string;
  name: string;
  permissions: CrmPermission[];
  isActive: boolean;
  isAdmin?: boolean;
  createdAt?: string;
};

function permissionLabel(key: CrmPermission) {
  if (key.endsWith('_edit')) {
    const base = key.slice(0, -'_edit'.length) as CrmModule;
    const m = PERMISSIONS.find((p) => p.key === base);
    return m ? `${m.label} (edit)` : key;
  }
  return PERMISSIONS.find((p) => p.key === (key as CrmModule))?.label || key;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [adminEmail, setAdminEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [users, setUsers] = useState<CrmUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [editorEmail, setEditorEmail] = useState('');
  const [editorName, setEditorName] = useState('');
  const [editorPermissions, setEditorPermissions] = useState<CrmPermission[]>([]);
  const [editorIsActive, setEditorIsActive] = useState(true);
  const [editorIsAdmin, setEditorIsAdmin] = useState(false);
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
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {}
    setAdminToken(null);
    setAdminEmail('');
    setOtp('');
    setOtpSent(false);
    setUsers([]);
  };

  const requestAdminOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim().toLowerCase() }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body?.error || 'Failed to send code');
      setOtpSent(true);
      setAuthInfo('A 6-digit code was sent to your email.');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyAdminOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim().toLowerCase(), otp: otp.trim() }),
      });
      const body = await safeJson(res);
      if (!res.ok || !body?.token) throw new Error(body?.error || 'Invalid code');
      try {
        localStorage.setItem(ADMIN_TOKEN_KEY, body.token);
      } catch {}
      setAdminToken(body.token);
      setOtp('');
      setOtpSent(false);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Invalid code');
      setOtp('');
    } finally {
      setAuthLoading(false);
    }
  };

  const toggleView = (module: CrmModule) => {
    setEditorPermissions((prev) => {
      const hasView = prev.includes(module);
      if (hasView) {
        // Removing view also removes edit (edit without view is meaningless).
        return prev.filter((p) => p !== module && p !== (`${module}_edit` as CrmPermission));
      }
      return [...prev, module];
    });
  };

  const toggleEdit = (module: CrmModule) => {
    const editKey = `${module}_edit` as CrmPermission;
    setEditorPermissions((prev) => {
      const hasEdit = prev.includes(editKey);
      if (hasEdit) {
        return prev.filter((p) => p !== editKey);
      }
      // Granting edit auto-grants view.
      const next = prev.includes(module) ? prev : [...prev, module];
      return [...next, editKey];
    });
  };

  const resetEditor = () => {
    setEditorEmail('');
    setEditorName('');
    setEditorPermissions([]);
    setEditorIsActive(true);
    setEditorIsAdmin(false);
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
          isAdmin: editorIsAdmin,
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
    setEditorIsAdmin(u.isAdmin === true);
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
              {!authError && authInfo && (
                <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-emerald-700 text-sm font-semibold">{authInfo}</p>
                </div>
              )}

              {!otpSent ? (
                <form onSubmit={requestAdminOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="admin-email">
                      Admin Email
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        id="admin-email"
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="you@flashfirehq.com"
                        className="w-full pl-11 pr-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {authLoading ? 'Sending code…' : 'Send code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyAdminOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="admin-otp">
                      Verification code
                    </label>
                    <input
                      id="admin-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      className="w-full text-center tracking-[0.4em] text-lg font-semibold px-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white"
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading || otp.length < 6}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {authLoading ? 'Verifying…' : 'Access Admin Dashboard'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(''); setAuthError(null); setAuthInfo(null); }}
                    className="w-full text-sm text-slate-500 hover:text-slate-700"
                  >
                    Use a different email
                  </button>
                </form>
              )}
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
          <div className="flex items-center gap-3">
            <Link
              to="/admin/analysis"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              <BarChart3 size={16} />
              BDA Analysis
            </Link>
            <button
              type="button"
              onClick={logoutAdmin}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
            >
              <CheckCircle2 size={16} />
              Logout
            </button>
          </div>
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

                <div className="flex items-center gap-3">
                  <input
                    id="u-admin"
                    type="checkbox"
                    checked={editorIsAdmin}
                    onChange={(e) => setEditorIsAdmin(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="u-admin" className="text-sm font-semibold text-slate-700">
                    Admin access
                    <span className="block text-xs font-normal text-slate-500">Can sign into this Admin Dashboard via emailed OTP.</span>
                  </label>
                </div>

                <div>
                  <div className="text-sm font-extrabold text-slate-900">Module Access</div>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-bold">View</span> shows the tab (read-only).
                    <span className="font-bold"> Edit</span> allows create/update/delete inside that tab.
                    Edit implies View.
                  </p>
                  <div className="mt-3 space-y-2">
                    {PERMISSIONS.map((p) => {
                      const hasView = editorPermissions.includes(p.key);
                      const hasEdit = editorPermissions.includes(`${p.key}_edit` as CrmPermission);
                      return (
                        <div
                          key={p.key}
                          className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-orange-200 hover:bg-orange-50/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-900">{p.label}</div>
                            <div className="text-xs text-slate-600">{p.description}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasView}
                                onChange={() => toggleView(p.key)}
                                className="h-4 w-4"
                              />
                              <span className="text-xs font-semibold text-slate-700">View</span>
                            </label>
                            {p.viewOnly ? (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                View-only module
                              </span>
                            ) : (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={hasEdit}
                                  onChange={() => toggleEdit(p.key)}
                                  className="h-4 w-4"
                                />
                                <span className="text-xs font-semibold text-orange-700">Edit</span>
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                              {u.isAdmin && (
                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-600 break-all">{u.email}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(u.permissions || []).length === 0 ? (
                                <span className="text-xs font-semibold text-slate-500">No permissions</span>
                              ) : (
                                u.permissions.map((p) => {
                                  const isEdit = p.endsWith('_edit');
                                  const cls = isEdit
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200';
                                  return (
                                    <span
                                      key={p}
                                      className={`text-xs font-bold px-2 py-1 rounded-lg border ${cls}`}
                                      title={isEdit ? 'Can edit (mutate)' : 'Can view (read-only)'}
                                    >
                                      {permissionLabel(p)}
                                    </span>
                                  );
                                })
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


