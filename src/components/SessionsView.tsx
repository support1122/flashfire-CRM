import { useCallback, useEffect, useState } from 'react';
import { Loader2, Monitor, RefreshCcw, ShieldOff } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

interface SessionRow {
  id: string;
  sessionId: string;
  email: string;
  ip: string;
  country: string;
  countryCode: string;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  revoked: boolean;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function SessionsView() {
  const { token } = useCrmAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/api/crm/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setSessions(json.data as SessionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleRevoke = async (session: SessionRow) => {
    const label = session.isCurrent ? 'this device (you will be logged out)' : session.deviceLabel;
    if (!confirm(`Log out ${label}?`)) return;
    try {
      setRevokingId(session.sessionId);
      const res = await fetch(`${API_BASE_URL}/api/crm/sessions/${session.sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      if (session.isCurrent) {
        window.location.reload();
        return;
      }
      fetchSessions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Active Sessions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Devices currently signed into your CRM account</p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition"
          title="Refresh"
        >
          <RefreshCcw size={13} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && sessions.length === 0 && (
        <div className="flex items-center justify-center py-28">
          <Loader2 className="animate-spin text-orange-500" size={26} />
          <span className="ml-3 text-sm text-slate-500">Loading sessions…</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <p className="text-rose-700 font-semibold text-sm">{error}</p>
          <button onClick={fetchSessions} className="mt-3 text-rose-600 text-xs underline">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Device</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">IP</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Logged in</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Last active</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-900">{s.deviceLabel}</span>
                    </div>
                    {s.isCurrent && (
                      <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide ml-6">This device</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{s.ip || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{s.country || 'Unknown'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{timeAgo(s.lastSeenAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => handleRevoke(s)}
                      disabled={revokingId === s.sessionId}
                      title="Log out this device"
                      className="flex items-center gap-1 text-rose-600 hover:text-rose-700 disabled:opacity-50 text-xs font-semibold"
                    >
                      <ShieldOff size={13} /> Log out
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No active sessions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
