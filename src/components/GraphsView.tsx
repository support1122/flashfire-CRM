import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ChevronDown, ChevronRight, Loader2, Phone, RefreshCcw, Users } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import QualifiedLeadsGraphs from './QualifiedLeadsGraphs';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

const PLAN_COLORS: Record<string, string> = {
  Ignite: '#F59E0B',
  Professional: '#6366F1',
  Executive: '#0EA5E9',
  Prime: '#22C55E',
};

interface PaidClientsData {
  totalPaidClients: number;
  plans: string[];
  monthly: Array<{ month: string; total: number; ignite: number; professional: number; executive: number; prime: number }>;
  byPlan: Array<{ plan: string; count: number }>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-');
  return `${MONTHS[parseInt(mo, 10) - 1] || mo} ${y}`;
};
const currentYM = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
})();

const tooltipStyle = { borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

export default function GraphsView() {
  const { token } = useCrmAuth();
  const [pc, setPc] = useState<PaidClientsData | null>(null);
  const [pcError, setPcError] = useState<string | null>(null);
  const [pcLoading, setPcLoading] = useState(true);

  // No-show leads never called gap panel — same data as Phone Calls tab.
  const [gaps, setGaps] = useState<Array<{ bookingId: string; clientName?: string; clientEmail?: string; clientPhone?: string; scheduledEventStartTime?: string }>>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);

  const fetchGaps = useCallback(async () => {
    try {
      setGapsLoading(true);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/phone-gaps/no-show?days=60&limit=200`, { headers });
      const json = await res.json();
      if (res.ok && json.success) setGaps(json.data || []);
    } catch {
      /* ignore */
    } finally {
      setGapsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchGaps(); }, [fetchGaps]);

  const fetchPaidClients = useCallback(async () => {
    try {
      setPcLoading(true);
      setPcError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/paid-clients/analytics`, { headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server error: ${res.status}`);
      setPc(json.data);
    } catch (err) {
      setPcError(err instanceof Error ? err.message : 'Failed to load paid clients');
    } finally {
      setPcLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPaidClients();
  }, [fetchPaidClients]);

  const monthlyChart = useMemo(() => {
    if (!pc?.monthly) return [];
    return pc.monthly
      .filter((m) => m.month && m.month <= currentYM)
      .map((m) => ({
        monthLabel: fmtMonth(m.month),
        Ignite: m.ignite,
        Professional: m.professional,
        Executive: m.executive,
        Prime: m.prime,
      }));
  }, [pc]);

  return (
    <div className="space-y-8">
      {/* ── Lead graphs (status, paid vs organic, scheduled) ── */}
      {/* Paid bar in Monthly Lead Status uses real paid-client counts once loaded. */}
      <QualifiedLeadsGraphs paidClientsMonthly={pc ? pc.monthly.map((m) => ({ month: m.month, total: m.total })) : undefined} />

      {/* ── No-show leads never called — surfaced as its own section ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setGapsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-100/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-700 text-base">📵</span>
            <div>
              <div className="text-sm font-bold text-amber-900">
                {gapsLoading ? 'Checking…' : `${gaps.length} no-show lead${gaps.length === 1 ? '' : 's'} never called`}
              </div>
              <div className="text-[11px] text-amber-700">
                Last 60 days · bookingStatus = no-show, zero outbound calls on file.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); fetchGaps(); }}
              className="p-1 rounded hover:bg-amber-100 text-amber-700"
              title="Re-check now"
            >
              <RefreshCcw size={12} className={gapsLoading ? 'animate-spin' : ''} />
            </span>
            {gapsOpen ? <ChevronDown size={14} className="text-amber-700" /> : <ChevronRight size={14} className="text-amber-700" />}
          </div>
        </button>
        {gapsOpen && gaps.length > 0 && (
          <div className="max-h-72 overflow-auto border-t border-amber-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-amber-50">
                <tr className="text-left text-amber-800 border-b border-amber-200">
                  <th className="py-2 px-3 font-semibold">Lead</th>
                  <th className="py-2 px-3 font-semibold">Email</th>
                  <th className="py-2 px-3 font-semibold">Phone</th>
                  <th className="py-2 px-3 font-semibold">Meeting (no-show)</th>
                  <th className="py-2 px-3 font-semibold w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.bookingId} className="border-b border-amber-100 hover:bg-amber-100/40">
                    <td className="py-2 px-3 text-slate-800 font-semibold">{g.clientName || '—'}</td>
                    <td className="py-2 px-3 text-slate-700">{g.clientEmail || '—'}</td>
                    <td className="py-2 px-3 text-slate-700 font-mono">{g.clientPhone || '—'}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {g.scheduledEventStartTime ? new Date(g.scheduledEventStartTime).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-3">
                      {g.clientPhone ? (
                        <a
                          href={`zoomphonecall://${g.clientPhone.replace(/[^\d+]/g, '')}`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600"
                          title={`Call ${g.clientPhone} via Zoom Phone`}
                        >
                          <Phone size={11} /> Call
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paid Clients (from clients-tracking DB) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Paid Clients</h2>
              <p className="text-xs text-slate-500">
                Clients on a paid plan (Ignite / Professional / Executive / Prime). Source: clients-tracking DB.
              </p>
            </div>
          </div>
          <button
            onClick={fetchPaidClients}
            disabled={pcLoading}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
          >
            <RefreshCcw size={14} className={`text-slate-600 ${pcLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {pcLoading && !pc ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-orange-500" size={24} />
            <span className="ml-3 text-sm text-slate-500">Loading paid clients…</span>
          </div>
        ) : pcError ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
            <p className="font-semibold">Paid-client data unavailable</p>
            <p className="mt-1">{pcError}</p>
            <p className="mt-1 text-amber-700">
              The backend needs <code className="bg-white px-1 rounded">CLIENTS_TRACKING_MONGODB_URI</code> set in its .env to read the clients-tracking database.
            </p>
            <button onClick={fetchPaidClients} className="mt-2 text-amber-700 underline">Retry</button>
          </div>
        ) : pc ? (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="border rounded-xl p-4 bg-slate-50 border-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Paid Clients</p>
                <p className="text-3xl font-extrabold mt-1 text-slate-900">{pc.totalPaidClients.toLocaleString()}</p>
              </div>
              {pc.plans.map((plan) => {
                const found = pc.byPlan.find((p) => p.plan === plan);
                return (
                  <div key={plan} className="border rounded-xl p-4 bg-white border-slate-200">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{plan}</p>
                    <p className="text-3xl font-extrabold mt-1" style={{ color: PLAN_COLORS[plan] || '#0F172A' }}>
                      {(found?.count || 0).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly stacked bar */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900">New Paid Clients — Monthly</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-4">Stacked by plan • by client join month</p>
                {monthlyChart.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No paid clients yet</div>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChart} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                        <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                        <Bar dataKey="Ignite" stackId="p" fill={PLAN_COLORS.Ignite} />
                        <Bar dataKey="Professional" stackId="p" fill={PLAN_COLORS.Professional} />
                        <Bar dataKey="Executive" stackId="p" fill={PLAN_COLORS.Executive} />
                        <Bar dataKey="Prime" stackId="p" fill={PLAN_COLORS.Prime} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* By-plan donut */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900">Plan Distribution</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-4">Share of paid clients by plan</p>
                {pc.byPlan.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No data</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pc.byPlan} dataKey="count" nameKey="plan" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {pc.byPlan.map((p) => (
                            <Cell key={p.plan} fill={PLAN_COLORS[p.plan] || '#E5E7EB'} />
                          ))}
                        </Pie>
                        <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
