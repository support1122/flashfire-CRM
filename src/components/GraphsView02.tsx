import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart,
  Line,
} from 'recharts';
import {
  Loader2, RefreshCcw, CalendarCheck, TrendingUp,
  Facebook, BarChart2, Activity,
} from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

// ── Date helpers ───────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-');
  return `${MONTHS[parseInt(mo,10)-1]||mo} '${y?.slice(2)}`;
};
const currentYM = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
})();

// Working days in a month = total days − Sundays.
// For the current month, count only days that have already elapsed (up to today).
// For future months, returns 0.
const workingDaysInMonth = (ym: string): number => {
  const [yStr, mStr] = ym.split('-');
  const year  = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  if (Number.isNaN(year) || Number.isNaN(month)) return 0;

  const now       = new Date();
  const isCurrent = ym === currentYM;
  const isFuture  = ym > currentYM;
  if (isFuture) return 0;

  const lastDay = isCurrent ? now.getDate() : new Date(year, month + 1, 0).getDate();
  let working = 0;
  for (let d = 1; d <= lastDay; d++) {
    const wd = new Date(year, month, d).getDay(); // 0 = Sunday
    if (wd !== 0) working++;
  }
  return working;
};

// ── Shared styles ─────────────────────────────────────────────────
const TS = {
  borderRadius: 10,
  borderColor: '#E2E8F0',
  fontSize: 12,
  boxShadow: '0 4px 12px -2px rgb(0 0 0/0.12)',
  backgroundColor: '#fff',
};
const CS = { fill: 'rgba(15,23,42,0.03)' };

const COLORS = {
  completed : '#22C55E',
  paid      : '#6366F1',
  noShow    : '#FB7185',
  cancelled : '#EF4444',
  rescheduled:'#3B82F6',
  scheduled : '#A78BFA',
  rate      : '#F97316',
  meta      : '#1877F2',
  metaNot   : '#BFDBFE',
  adPaid    : '#F97316',
  organic   : '#10B981',
  slate     : '#64748B',
};

const UTM_PALETTE = [
  '#F97316','#6366F1','#22C55E','#0EA5E9',
  '#EC4899','#F59E0B','#14B8A6','#8B5CF6','#94A3B8',
];

// ── Types ─────────────────────────────────────────────────────────
interface MonthlyStatus {
  month: string;
  completed: number;
  paid: number;
  noShow: number;
  cancelled: number;
  rescheduled: number;
  scheduled: number;
  notScheduled: number;
  ignored: number;
  total: number;
}
interface MetaMonthly   { month: string; total: number; booked: number; notBooked: number }
interface UtmMedRow     { month: string; medium: string; count: number }
interface SrcTypeRow    { month: string; total: number; paid: number; organic: number }

interface UtmStatusRow {
  month: string; source: string;
  total: number; booked?: number; notBooked?: number;
  completed: number; paid: number; noShow: number;
  cancelled: number; rescheduled: number; scheduled: number; notScheduled: number;
}

interface OutcomeRow {
  completed: number; noShow: number; canceled: number; rescheduled: number; scheduled: number;
  metaCompleted: number; metaNoShow: number; metaCanceled: number; metaRescheduled: number; metaScheduled: number;
}
interface DailyOutcome   extends OutcomeRow { day:   string }
interface WeeklyOutcome  extends OutcomeRow { week:  string }
interface MonthlyOutcome extends OutcomeRow { month: string }

interface NoShowRow     { period: string; noShow: number; total: number; rate: number }
interface NoShowCallRow { month: string; called: number; notCalled: number; total: number }

interface PaidClientMonth {
  month: string;
  total: number;
  ignite: number;
  professional: number;
  executive: number;
  prime: number;
}

interface PaidClientsPayload {
  totalPaidClients: number;
  plans: string[];
  monthly: PaidClientMonth[];
  byPlan: Array<{ plan: string; count: number }>;
}

interface AnalyticsPayload {
  monthlyStatus       : MonthlyStatus[];
  metaLeadsMonthly    : MetaMonthly[];
  utmMediumMonthly    : UtmMedRow[];
  utmSourceMonthly    : Array<{ month: string; source: string; count: number }>;
  utmSourceStatus     : UtmStatusRow[];
  monthlySourceType   : SrcTypeRow[];
  weeklyOutcomes      : WeeklyOutcome[];
  dailyOutcomes       : DailyOutcome[];
  monthlyOutcomes     : MonthlyOutcome[];
  noShowMonthly       : NoShowRow[];
  noShowDaily         : NoShowRow[];
  noShowCalls         : NoShowCallRow[];
  noShowCallsDaily    : Array<{ day: string; called: number; notCalled: number; total: number }>;
}

// ── Card wrapper ───────────────────────────────────────────────────
const Card = memo(({
  title, subtitle, icon: Icon, iconColor, children, badge,
}: {
  title: string; subtitle: string;
  icon: React.ComponentType<{size?: number; className?: string}>;
  iconColor: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg bg-slate-50 border border-slate-200`}>
          <Icon size={16} className={iconColor} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 leading-tight">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {badge}
    </div>
    {children}
  </div>
));
Card.displayName = 'Card';

// ── KPI strip ─────────────────────────────────────────────────────
const KpiStrip = ({ items }: { items: { label: string; value: string|number; color: string }[] }) => (
  <div className="flex flex-wrap gap-2.5 mb-5">
    {items.map(({ label, value, color }) => (
      <div key={label} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 min-w-[80px]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 leading-tight mb-1">{label}</span>
        <span className="text-lg font-extrabold leading-none" style={{ color }}>{value}</span>
      </div>
    ))}
  </div>
);

// ── Custom tooltip: completed meetings breakdown ───────────────────
const CompletedTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  const total = (d.Completed||0) + (d.Paid||0) + (d['No-Show']||0) + (d.Cancelled||0) + (d.Rescheduled||0);
  return (
    <div style={TS} className="border p-3 min-w-[170px]">
      <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
      <div className="space-y-1 text-xs">
        {[
          { k:'Completed', c: COLORS.completed },
          { k:'Paid',      c: COLORS.paid },
          { k:'No-Show',   c: COLORS.noShow },
          { k:'Cancelled', c: COLORS.cancelled },
          { k:'Rescheduled',c:COLORS.rescheduled },
        ].map(({ k, c }) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
              <span className="text-slate-600 font-medium">{k}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{(d[k]||0).toLocaleString()}</span>
              <span className="text-slate-400 text-[10px]">({total > 0 ? Math.round((d[k]||0)/total*100) : 0}%)</span>
            </div>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-1 flex justify-between">
          <span className="text-slate-500 font-semibold">Total meetings</span>
          <span className="font-bold">{total}</span>
        </div>
      </div>
    </div>
  );
};

// ── Empty state ────────────────────────────────────────────────────
const Empty = ({ msg }: { msg: string }) => (
  <div className="h-40 flex items-center justify-center text-slate-400 text-sm">{msg}</div>
);

// ── Status legend table ────────────────────────────────────────────
// Shows exactly which DB statuses / fields feed each number in the chart.
type StatusRow = {
  metric: string;       // label shown in chart (bar / KPI name)
  color: string;        // dot colour matching the chart
  included: string[];   // bookingStatus values that are counted
  excluded?: string[];  // bookingStatus values explicitly NOT counted
  field?: string;       // if the filter is a field (not bookingStatus)
};

const StatusLegendTable = memo(({ rows }: { rows: StatusRow[] }) => (
  <div className="mt-4 border-t border-slate-100 pt-4">
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
      What's included in each number
    </p>
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-1.5 pr-4 font-semibold text-slate-500 whitespace-nowrap">Chart metric</th>
            <th className="text-left py-1.5 pr-4 font-semibold text-slate-500 whitespace-nowrap">Statuses / fields INCLUDED</th>
            <th className="text-left py-1.5 font-semibold text-slate-500 whitespace-nowrap">Statuses EXCLUDED</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.metric} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-1.5 pr-4 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  <span className="font-bold text-slate-800">{r.metric}</span>
                </div>
              </td>
              <td className="py-1.5 pr-4">
                <div className="flex flex-wrap gap-1">
                  {r.field
                    ? <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono">{r.field}</span>
                    : r.included.map(s => (
                      <span key={s} className="bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-mono">{s}</span>
                    ))
                  }
                </div>
              </td>
              <td className="py-1.5">
                <div className="flex flex-wrap gap-1">
                  {r.excluded?.length
                    ? r.excluded.map(s => (
                      <span key={s} className="bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-mono line-through opacity-70">{s}</span>
                    ))
                    : <span className="text-slate-300 italic">none</span>
                  }
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
));
StatusLegendTable.displayName = 'StatusLegendTable';

// Custom tooltip for individual status graphs
const StatusTip = ({ active, payload, label, color, statusLabel, denominatorLabel }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div style={TS} className="border p-3 min-w-[160px]">
      <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-slate-600 font-medium">{statusLabel}</span>
          </div>
          <span className="font-bold text-slate-900">{(d.count ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-500">% of total</span>
          <span className="font-bold" style={{ color: COLORS.rate }}>{d.pct ?? 0}%</span>
        </div>
        <div className="border-t border-slate-100 pt-1 flex justify-between">
          <span className="text-slate-400">Denominator</span>
          <span className="text-slate-600 font-semibold">{(d.denominator ?? 0).toLocaleString()}</span>
        </div>
        <div className="text-[10px] text-slate-400 pt-0.5">{denominatorLabel}</div>
      </div>
    </div>
  );
};

// Tooltip for the Completed "Average / day" view.
const AvgTip = ({ active, payload, label, color }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div style={TS} className="border p-3 min-w-[180px]">
      <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-slate-600 font-medium">Completed meetings</span>
          </div>
          <span className="font-bold text-slate-900">{(d.completed ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-500">Working days {label === fmtMonth(currentYM) ? '(till today)' : ''}</span>
          <span className="font-bold text-slate-700">{d.workingDays ?? 0}</span>
        </div>
        <div className="border-t border-slate-100 pt-1 flex justify-between">
          <span className="text-slate-500 font-semibold">Average / day</span>
          <span className="font-bold" style={{ color: COLORS.rate }}>{d.completedAvg ?? 0}</span>
        </div>
        <div className="text-[10px] text-slate-400 pt-0.5">excludes Sundays</div>
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────────
export default function GraphsView02() {
  const { token } = useCrmAuth();
  const [data,         setData]         = useState<AnalyticsPayload | null>(null);
  const [paidClients,  setPaidClients]  = useState<PaidClientsPayload | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [completedView, setCompletedView] = useState<'total' | 'average'>('total');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const [res, pcRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/leads/analytics`, { headers }),
        fetch(`${API_BASE_URL}/api/crm/paid-clients/analytics`, { headers }),
      ]);
      const json   = await res.json();
      const pcJson = await pcRes.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json.data as AnalyticsPayload);
      if (pcRes.ok && pcJson.success) setPaidClients(pcJson.data as PaidClientsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 1 — Completed meetings per month
  // Grouped by scheduledEventStartTime month (= when the meeting actually happened).
  // Each bar shows the breakdown: Completed / Paid / No-Show / Cancelled / Rescheduled.
  // ──────────────────────────────────────────────────────────────────
  const completedData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    // monthlyStatus from the API is grouped by bookingCreatedAt month.
    // We use it as-is since that's what the API returns — the key insight is
    // "completed" = meetings that were done (status=completed), "paid" = converted.
    return data.monthlyStatus
      .filter(r => r.month && r.month <= currentYM)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(r => ({
        monthLabel  : fmtMonth(r.month),
        Completed   : r.completed,
        Paid        : r.paid,
        'No-Show'   : r.noShow,
        Cancelled   : r.cancelled,
        Rescheduled : r.rescheduled,
        _total      : r.completed + r.paid + r.noShow + r.cancelled,
      }));
  }, [data]);

  const completedTotals = useMemo(() => completedData.reduce(
    (a,r) => ({
      completed : a.completed  + r.Completed,
      paid      : a.paid       + r.Paid,
      noShow    : a.noShow     + r['No-Show'],
      cancelled : a.cancelled  + r.Cancelled,
      rescheduled:a.rescheduled+ r.Rescheduled,
    }),
    { completed:0, paid:0, noShow:0, cancelled:0, rescheduled:0 }
  ), [completedData]);

  // ──────────────────────────────────────────────────────────────────
  // CHARTS — 5 individual status graphs, each with count + % per month
  // Formulas:
  //   Completed %  : (completed+ignored) ÷ (completed+paid+noShow+cancelled+rescheduled+ignored)
  //   Paid %       : paid ÷ (completed+paid)
  //   No-Show %    : noShow ÷ (completed+paid+noShow+ignored)
  //   Cancelled %  : cancelled ÷ (completed+paid+noShow+cancelled+rescheduled+ignored)
  //   Rescheduled %: rescheduled ÷ (completed+paid+noShow+cancelled+rescheduled+ignored)
  // ──────────────────────────────────────────────────────────────────
  const statusChartData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    // Paid = users created that month in the Dashboard DB (actual joined users),
    // same source as the conversion chart below. grandTotal/noShowBase keep leads
    // paid so the other status cards stay unchanged.
    const dashMap: Record<string, number> = {};
    (paidClients?.monthly ?? []).forEach(m => { dashMap[m.month] = m.total; });
    return data.monthlyStatus
      .filter(r => r.month && r.month >= '2025-10' && r.month <= currentYM)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(r => {
        const ign = r.ignored ?? 0;
        const dashPaid    = dashMap[r.month] ?? r.paid;
        const grandTotal  = r.completed + r.paid + r.noShow + r.cancelled + r.rescheduled + ign;
        const paidBase    = r.completed + dashPaid;
        const noShowBase  = r.completed + r.paid + r.noShow + ign;
        const pct = (val: number, base: number) => base > 0 ? Math.round((val / base) * 1000) / 10 : 0;
        const workingDays = workingDaysInMonth(r.month);
        const completedAvg = workingDays > 0 ? Math.round((r.completed / workingDays) * 10) / 10 : 0;
        return {
          monthLabel      : fmtMonth(r.month),
          monthKey        : r.month,
          workingDays,
          completedAvg,
          completed       : r.completed,
          paid            : dashPaid,
          noShow          : r.noShow,
          cancelled       : r.cancelled,
          rescheduled     : r.rescheduled,
          ignored         : ign,
          grandTotal,
          paidBase,
          noShowBase,
          completedPct    : pct(r.completed + ign, grandTotal),
          paidPct         : pct(dashPaid, paidBase),
          noShowPct       : pct(r.noShow, noShowBase),
          cancelledPct    : pct(r.cancelled, grandTotal),
          rescheduledPct  : pct(r.rescheduled, grandTotal),
        };
      });
  }, [data, paidClients]);

  const statusTotals = useMemo(() => {
    const tot = statusChartData.reduce(
      (a, r) => ({
        completed  : a.completed   + r.completed,
        paid       : a.paid        + r.paid,
        noShow     : a.noShow      + r.noShow,
        cancelled  : a.cancelled   + r.cancelled,
        rescheduled: a.rescheduled + r.rescheduled,
        ignored    : a.ignored     + r.ignored,
        grandTotal : a.grandTotal  + r.grandTotal,
        paidBase   : a.paidBase    + r.paidBase,
        noShowBase : a.noShowBase  + r.noShowBase,
      }),
      { completed: 0, paid: 0, noShow: 0, cancelled: 0, rescheduled: 0, ignored: 0, grandTotal: 0, paidBase: 0, noShowBase: 0 }
    );
    const pct = (v: number, base: number) => base > 0 ? Math.round((v / base) * 1000) / 10 : 0;
    return {
      ...tot,
      completedPct   : pct(tot.completed + tot.ignored, tot.grandTotal),
      paidPct        : pct(tot.paid,         tot.paidBase),
      noShowPct      : pct(tot.noShow,       tot.noShowBase),
      cancelledPct   : pct(tot.cancelled,    tot.grandTotal),
      rescheduledPct : pct(tot.rescheduled,  tot.grandTotal),
    };
  }, [statusChartData]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 2 — Completed → Paid conversion rate per month
  // "Paid" bar = users created that month in the Dashboard DB (actual paid clients).
  // Rate = Dashboard Paid ÷ (Completed + Dashboard Paid) × 100
  // ──────────────────────────────────────────────────────────────────
  const convData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    // Build a quick lookup: month → dashboard paid count
    const dashMap: Record<string, number> = {};
    (paidClients?.monthly ?? []).forEach(m => { dashMap[m.month] = m.total; });

    return data.monthlyStatus
      .filter(r => r.month && r.month <= currentYM)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(r => {
        const dashPaid     = dashMap[r.month] ?? r.paid;
        const meetingsDone = r.completed + dashPaid;
        const rate = meetingsDone > 0 ? Math.round((dashPaid / meetingsDone) * 1000) / 10 : 0;
        return {
          monthLabel     : fmtMonth(r.month),
          'Meetings Done': meetingsDone,
          'Paid'         : dashPaid,
          rate,
        };
      });
  }, [data, paidClients]);

  const convTotals = useMemo(() => {
    const done = convData.reduce((s,r) => s + r['Meetings Done'], 0);
    const paid = convData.reduce((s,r) => s + r.Paid, 0);
    return { done, paid, rate: done > 0 ? Math.round((paid/done)*1000)/10 : 0 };
  }, [convData]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 3 — Meta leads vs booked meetings monthly
  // Uses metaLeadsMonthly (leadSource='meta_lead_ad' OR metaLeadId exists).
  // Booked = completed + paid + scheduled + no-show + canceled + rescheduled
  //        = everything except not-scheduled.
  // ──────────────────────────────────────────────────────────────────
  const metaData = useMemo(() => {
    if (!data?.metaLeadsMonthly) return [];
    return data.metaLeadsMonthly
      .filter(r => r.month && r.month <= currentYM)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(r => ({
        monthLabel      : fmtMonth(r.month),
        'Meta Leads'    : r.total,
        'Booked Meeting': r.booked,
        'Not Booked'    : r.notBooked,
        rate            : r.total > 0 ? Math.round((r.booked / r.total) * 1000) / 10 : 0,
      }));
  }, [data]);

  const metaTotals = useMemo(() => {
    const total  = metaData.reduce((s, r) => s + r['Meta Leads'],    0);
    const booked = metaData.reduce((s, r) => s + r['Booked Meeting'], 0);
    return { total, booked, rate: total > 0 ? Math.round((booked / total) * 1000) / 10 : 0 };
  }, [metaData]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 4 — Monthly leads by UTM Medium
  // Top 8 mediums by total volume; rest → "Other".
  // ──────────────────────────────────────────────────────────────────
  const utmMediumChart = useMemo(() => {
    if (!data?.utmMediumMonthly) return { chartData: [], keys: [] as string[] };
    const byKey = new Map<string,number>();
    data.utmMediumMonthly.forEach(r => {
      const k = r.medium || '(none)';
      byKey.set(k, (byKey.get(k)||0) + r.count);
    });
    const top    = [...byKey.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]);
    const topSet = new Set(top);
    let hasOther = false;
    const months = new Map<string, Record<string,number>>();
    data.utmMediumMonthly.forEach(r => {
      if (r.month > currentYM) return;
      const raw = r.medium || '(none)';
      const k   = topSet.has(raw) ? raw : 'Other';
      if (k === 'Other') hasOther = true;
      const m = months.get(r.month) || {};
      m[k] = (m[k]||0) + r.count;
      months.set(r.month, m);
    });
    const chartData = [...months.entries()]
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([month, vals]) => ({ monthLabel: fmtMonth(month), ...vals }));
    const keys = [...top];
    if (hasOther) keys.push('Other');
    return { chartData, keys };
  }, [data]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 5 — Paid (ad) vs Organic leads monthly
  // Paid = utmMedium is 'paid' / 'cpc' / 'ppc' / 'paid_social' / 'CPC'
  //        (metaIsOrganic=false is unreliable — null for all non-meta leads).
  // The API's monthlySourceType already applies the server-side classification.
  // ──────────────────────────────────────────────────────────────────
  const paidOrganicData = useMemo(() => {
    if (!data?.monthlySourceType) return [];
    return data.monthlySourceType
      .filter(r => r.month && r.month <= currentYM)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(r => ({
        monthLabel : fmtMonth(r.month),
        'Paid Ads' : r.paid,
        Organic    : r.organic,
        total      : r.total,
        paidPct    : r.total > 0 ? Math.round((r.paid/r.total)*1000)/10 : 0,
      }));
  }, [data]);

  const paidOrganicTotals = useMemo(() => {
    const paid    = paidOrganicData.reduce((s,r) => s + r['Paid Ads'], 0);
    const organic = paidOrganicData.reduce((s,r) => s + r.Organic,    0);
    const total   = paid + organic;
    return { paid, organic, total, paidPct: total > 0 ? Math.round((paid/total)*1000)/10 : 0 };
  }, [paidOrganicData]);

  // ── Chart 6 — Meeting outcomes by granularity ──────────────────
  const [weeklyView,    setWeeklyView]    = useState<'all' | 'meta'>('all');
  const [granularity,   setGranularity]   = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const weeklyData = useMemo(() => {
    if (!data) return [];
    const isMeta = weeklyView === 'meta';

    if (granularity === 'daily') {
      return (data.dailyOutcomes ?? [])
        .filter(r => r.day >= '2026-01-01')
        .map(r => {
          const d = new Date(r.day);
          const label = `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
          return { weekLabel: label,
            Completed: isMeta ? r.metaCompleted : r.completed,
            'No-Show': isMeta ? r.metaNoShow    : r.noShow,
            Canceled:  isMeta ? r.metaCanceled  : r.canceled,
            Rescheduled: isMeta ? r.metaRescheduled : r.rescheduled,
            Scheduled: isMeta ? r.metaScheduled : r.scheduled,
          };
        });
    }

    if (granularity === 'monthly') {
      return (data.monthlyOutcomes ?? [])
        .map(r => {
          const label = fmtMonth(r.month);
          return { weekLabel: label,
            Completed: isMeta ? r.metaCompleted : r.completed,
            'No-Show': isMeta ? r.metaNoShow    : r.noShow,
            Canceled:  isMeta ? r.metaCanceled  : r.canceled,
            Rescheduled: isMeta ? r.metaRescheduled : r.rescheduled,
            Scheduled: isMeta ? r.metaScheduled : r.scheduled,
          };
        });
    }

    // weekly (default)
    return (data.weeklyOutcomes ?? [])
      .filter(r => r.week >= '2026')
      .map(r => {
        const [yr, wk] = r.week.split('-W');
        const label = `W${wk} '${yr?.slice(2)}`;
        return { weekLabel: label,
          Completed: isMeta ? r.metaCompleted : r.completed,
          'No-Show': isMeta ? r.metaNoShow    : r.noShow,
          Canceled:  isMeta ? r.metaCanceled  : r.canceled,
          Rescheduled: isMeta ? r.metaRescheduled : r.rescheduled,
          Scheduled: isMeta ? r.metaScheduled : r.scheduled,
        };
      });
  }, [data, weeklyView, granularity]);

  const weeklyTotals = useMemo(() => weeklyData.reduce(
    (a, r) => ({
      completed  : a.completed   + r.Completed,
      noShow     : a.noShow      + r['No-Show'],
      canceled   : a.canceled    + r.Canceled,
      rescheduled: a.rescheduled + r.Rescheduled,
      scheduled  : a.scheduled   + r.Scheduled,
    }),
    { completed: 0, noShow: 0, canceled: 0, rescheduled: 0, scheduled: 0 }
  ), [weeklyData]);

  // ── Chart 8 — No-Show vs Calls ────────────────────────────────
  const [callsGranularity, setCallsGranularity] = useState<'monthly' | 'daily'>('monthly');

  const noShowCallsData = useMemo(() => {
    if (callsGranularity === 'daily') {
      return (data?.noShowCallsDaily ?? []).map(r => {
        const d = new Date(r.day + 'T00:00:00');
        const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(' ', ' ');
        return { label, 'Called': r.called, 'Not Called': r.notCalled, total: r.total };
      });
    }
    return (data?.noShowCalls ?? []).map(r => ({
      label      : r.month === '2026-05' ? "22 May '26" : fmtMonth(r.month),
      'Called'   : r.called,
      'Not Called': r.notCalled,
      total      : r.total,
    }));
  }, [data, callsGranularity]);

  const noShowCallsTotals = useMemo(() => {
    const src = callsGranularity === 'daily' ? (data?.noShowCallsDaily ?? []) : (data?.noShowCalls ?? []);
    return src.reduce(
      (a, r) => ({ total: a.total + r.total, called: a.called + r.called, notCalled: a.notCalled + r.notCalled }),
      { total: 0, called: 0, notCalled: 0 }
    );
  }, [data, callsGranularity]);

  // ── Refresh button ─────────────────────────────────────────────
  const RefreshBtn = (
    <button
      onClick={fetchData}
      disabled={loading}
      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition"
      title="Refresh"
    >
      <RefreshCcw size={13} className={`text-slate-500 ${loading ? 'animate-spin':''}`} />
    </button>
  );

  // ── Loading / error ────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-28">
        <Loader2 className="animate-spin text-orange-500" size={26} />
        <span className="ml-3 text-sm text-slate-500">Loading analytics…</span>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="m-6 bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
        <p className="text-rose-700 font-semibold text-sm">{error}</p>
        <button onClick={fetchData} className="mt-3 text-rose-600 text-xs underline">Retry</button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Meeting &amp; Lead Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Direct from MongoDB · {(5707).toLocaleString()} total leads · Oct 2025 – present
          </p>
        </div>
        {RefreshBtn}
      </div>

      {/* ── 5 Individual Status Graphs — 2 per row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {([
        {
          key: 'completed', label: 'Completed', color: COLORS.completed,
          countKey: 'completed', pctKey: 'completedPct', denomKey: 'grandTotal',
          subtitle: 'completed + paid + no-show + cancelled + rescheduled + ignored',
        },
        {
          key: 'paid', label: 'Paid', color: COLORS.paid,
          countKey: 'paid', pctKey: 'paidPct', denomKey: 'paidBase',
          subtitle: 'completed + paid',
        },
        {
          key: 'noShow', label: 'No-Show', color: COLORS.noShow,
          countKey: 'noShow', pctKey: 'noShowPct', denomKey: 'noShowBase',
          subtitle: 'completed + paid + no-show + ignored',
        },
        {
          key: 'cancelled', label: 'Cancelled', color: COLORS.cancelled,
          countKey: 'cancelled', pctKey: 'cancelledPct', denomKey: 'grandTotal',
          subtitle: 'completed + paid + no-show + cancelled + rescheduled + ignored',
        },
        {
          key: 'rescheduled', label: 'Rescheduled', color: COLORS.rescheduled,
          countKey: 'rescheduled', pctKey: 'rescheduledPct', denomKey: 'grandTotal',
          subtitle: 'completed + paid + no-show + cancelled + rescheduled + ignored',
        },
      ] as const).map(({ key, label, color, countKey, pctKey, denomKey, subtitle }) => {
        const isCompletedAvg = key === 'completed' && completedView === 'average';
        const chartData = statusChartData.map(r => ({
          monthLabel  : r.monthLabel,
          count       : isCompletedAvg ? r.completedAvg : (r as any)[countKey] as number,
          pct         : (r as any)[pctKey]   as number,
          denominator : (r as any)[denomKey] as number,
          completed   : r.completed,
          workingDays : r.workingDays,
          completedAvg: r.completedAvg,
        }));
        const totalCount = (statusTotals as any)[countKey] as number;
        const totalPct   = (statusTotals as any)[pctKey]   as number;
        const totalWorkingDays = statusChartData.reduce((s, r) => s + r.workingDays, 0);
        const overallAvg = totalWorkingDays > 0 ? Math.round((statusTotals.completed / totalWorkingDays) * 10) / 10 : 0;
        return (
          <div key={key} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200">
                  <CalendarCheck size={16} style={{ color }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">{label} — Monthly</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isCompletedAvg
                      ? 'Avg/day = completed ÷ working days (excludes Sundays · current month uses elapsed days only)'
                      : key === 'completed'
                        ? `% = (Completed + Ignored) ÷ (${subtitle})`
                        : `% = ${label} ÷ (${subtitle})`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {key === 'completed' && (
                  <select
                    value={completedView}
                    onChange={e => setCompletedView(e.target.value as 'total' | 'average')}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="total">Total</option>
                    <option value="average">Average / day</option>
                  </select>
                )}
                <div className="flex flex-col items-end">
                  {isCompletedAvg ? (
                    <>
                      <span className="text-xl font-extrabold text-slate-900">{overallAvg}</span>
                      <span className="text-[11px] font-bold" style={{ color: COLORS.rate }}>avg/day overall</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-extrabold text-slate-900">{totalCount.toLocaleString()}</span>
                      <span className="text-[11px] font-bold" style={{ color: COLORS.rate }}>{totalPct}% overall</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {chartData.length === 0
              ? <Empty msg="No data" />
              : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                      <YAxis yAxisId="left"  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={isCompletedAvg} width={34} />
                      {!isCompletedAvg && (
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0, 100]} />
                      )}
                      <Tooltip
                        cursor={CS}
                        content={(props: any) => (
                          isCompletedAvg
                            ? <AvgTip {...props} color={color} />
                            : <StatusTip {...props} color={color} statusLabel={label} denominatorLabel={subtitle} />
                        )}
                      />
                      <Bar yAxisId="left" dataKey="count" name={isCompletedAvg ? 'Avg / day' : label} fill={color} radius={[5, 5, 0, 0]} maxBarSize={60} />
                      {!isCompletedAvg && (
                        <Line yAxisId="right" type="monotone" dataKey="pct" name="%" stroke={COLORS.rate} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.rate, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )
            }
          </div>
        );
      })}
      </div>

      {/* ── Row 1: Charts 1 & 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Completed Meetings Monthly */}
        <Card
          title="Completed Meetings — Monthly"
          subtitle="Completed · Paid · No-Show · Cancelled · Rescheduled per month"
          icon={CalendarCheck}
          iconColor="text-green-600"
          badge={RefreshBtn}
        >
          <KpiStrip items={[
            { label:'Completed',   value: completedTotals.completed,  color: COLORS.completed },
            { label:'Paid',        value: completedTotals.paid,        color: COLORS.paid },
            { label:'No-Show',     value: completedTotals.noShow,      color: COLORS.noShow },
            { label:'Cancelled',   value: completedTotals.cancelled,   color: COLORS.cancelled },
            { label:'Rescheduled', value: completedTotals.rescheduled, color: COLORS.rescheduled },
          ]} />
          {completedData.length === 0
            ? <Empty msg="No meeting data" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={completedData} margin={{ top:10, right:16, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <Tooltip content={<CompletedTip />} cursor={CS} />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="Rescheduled" stackId="s" fill={COLORS.rescheduled} />
                    <Bar dataKey="No-Show"     stackId="s" fill={COLORS.noShow} />
                    <Bar dataKey="Cancelled"   stackId="s" fill={COLORS.cancelled} />
                    <Bar dataKey="Paid"        stackId="s" fill={COLORS.paid} />
                    <Bar dataKey="Completed"   stackId="s" fill={COLORS.completed} radius={[5,5,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>

        {/* 2. Completed → Paid Conversion Rate */}
        <Card
          title="Paid — Monthly"
          subtitle='% = Paid ÷ (completed + paid) — Paid count from Dashboard DB (actual joined users)'
          icon={TrendingUp}
          iconColor="text-indigo-600"
          badge={RefreshBtn}
        >
          <KpiStrip items={[
            { label:'Meetings Done',  value: convTotals.done,                                              color: COLORS.completed },
            { label:'Converted Paid', value: (paidClients?.totalPaidClients ?? convTotals.paid).toLocaleString(), color: COLORS.paid },
            { label:'Conversion Rate',value: `${convTotals.rate}%`,                                        color: COLORS.rate },
          ]} />
          {convData.length === 0
            ? <Empty msg="No data" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={convData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                    <Tooltip cursor={CS} contentStyle={TS}
                      formatter={(v:number, name:string) =>
                        name === 'rate' ? [`${v}%`, 'Conversion %'] : [v.toLocaleString(), name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="Meetings Done" fill={COLORS.completed} radius={[4,4,0,0]} />
                    <Bar yAxisId="left" dataKey="Paid"          fill={COLORS.paid}      radius={[4,4,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="rate" name="Conversion %"
                      stroke={COLORS.rate} strokeWidth={2.5}
                      dot={{ r:4, fill:COLORS.rate, strokeWidth:0 }} activeDot={{ r:6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>
      </div>

      {/* ── Row 2: Charts 3 & 4 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 3. Meta Leads vs Booked */}
        <Card
          title="Meta Leads vs Booked Meetings"
          subtitle="leadSource = meta_lead_ad · Booked = all statuses except not-scheduled"
          icon={Facebook}
          iconColor="text-blue-600"
          badge={RefreshBtn}
        >
          <KpiStrip items={[
            { label:'Meta Leads',  value: metaTotals.total.toLocaleString(),  color: COLORS.meta },
            { label:'Booked',      value: metaTotals.booked.toLocaleString(), color: COLORS.completed },
            { label:'Not Booked',  value: (metaTotals.total - metaTotals.booked).toLocaleString(), color: COLORS.metaNot },
            { label:'Booking Rate',value: `${metaTotals.rate}%`,              color: COLORS.rate },
          ]} />
          {metaData.length === 0
            ? <Empty msg="No Meta lead data (started Feb 2026)" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={metaData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                    <Tooltip cursor={CS} content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload || {};
                      const total = (d['Not Booked'] || 0) + (d['Booked Meeting'] || 0);
                      return (
                        <div style={TS} className="border p-3 min-w-[180px]">
                          <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-6">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: COLORS.metaNot }} />
                                <span className="text-slate-500">Not Booked</span>
                              </div>
                              <span className="font-bold text-slate-900">{(d['Not Booked'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: COLORS.meta }} />
                                <span className="text-slate-500">Booked Meeting</span>
                              </div>
                              <span className="font-bold text-slate-900">{(d['Booked Meeting'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-500" style={{ color: COLORS.rate }}>Booking Rate %</span>
                              <span className="font-bold" style={{ color: COLORS.rate }}>{d.rate ?? 0}%</span>
                            </div>
                            <div className="border-t border-slate-100 pt-1 flex justify-between">
                              <span className="font-semibold text-slate-600">Total Meta Leads</span>
                              <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="Not Booked"     stackId="m" fill={COLORS.metaNot} />
                    <Bar yAxisId="left" dataKey="Booked Meeting" stackId="m" fill={COLORS.meta} radius={[5,5,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="rate" name="Booking Rate %"
                      stroke={COLORS.rate} strokeWidth={2.5}
                      dot={{ r:4, fill:COLORS.rate, strokeWidth:0 }} activeDot={{ r:6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>

        {/* 4. Monthly Leads by UTM Medium */}
        <Card
          title="Monthly Leads by UTM Medium"
          subtitle="How leads arrived (utmMedium). Top 8 mediums shown; rest grouped as Other."
          icon={BarChart2}
          iconColor="text-violet-600"
          badge={RefreshBtn}
        >
          {utmMediumChart.keys.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {utmMediumChart.keys.map((k, i) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: UTM_PALETTE[i % UTM_PALETTE.length] }} />
                  {k}
                </span>
              ))}
            </div>
          )}
          {utmMediumChart.chartData.length === 0
            ? <Empty msg="No UTM medium data" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utmMediumChart.chartData} margin={{ top:10, right:12, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <Tooltip cursor={CS} contentStyle={TS} formatter={(v:number, name:string) => [v.toLocaleString(), name]} />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    {utmMediumChart.keys.map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="utm" fill={UTM_PALETTE[i % UTM_PALETTE.length]}
                        radius={i === utmMediumChart.keys.length-1 ? [5,5,0,0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>
      </div>

      {/* ── Row 3: Charts 5 & 6 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 5. Paid vs Organic */}
        <Card
          title="Paid vs Organic Leads — Monthly"
          subtitle='Paid = utmMedium "paid/cpc/ppc/paid_social". Organic = everything else.'
          icon={Activity}
          iconColor="text-orange-500"
          badge={RefreshBtn}
        >
          <KpiStrip items={[
            { label:'Total Leads', value: paidOrganicTotals.total.toLocaleString(),   color: COLORS.slate },
            { label:'Paid Ads',    value: paidOrganicTotals.paid.toLocaleString(),    color: COLORS.adPaid },
            { label:'Organic',     value: paidOrganicTotals.organic.toLocaleString(), color: COLORS.organic },
            { label:'Ad Share',    value: `${paidOrganicTotals.paidPct}%`,            color: COLORS.rate },
          ]} />
          {paidOrganicData.length === 0
            ? <Empty msg="No source type data" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paidOrganicData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                    <Tooltip cursor={CS} contentStyle={TS}
                      formatter={(v:number, name:string) =>
                        name === 'paidPct' ? [`${v}%`, 'Ad Share %'] : [v.toLocaleString(), name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="Paid Ads" stackId="src" fill={COLORS.adPaid} />
                    <Bar yAxisId="left" dataKey="Organic"  stackId="src" fill={COLORS.organic} radius={[5,5,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="paidPct" name="Ad Share %"
                      stroke={COLORS.slate} strokeWidth={2} strokeDasharray="5 3"
                      dot={{ r:3, fill:COLORS.slate, strokeWidth:0 }} activeDot={{ r:5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>

        {/* 6. Meeting Outcomes */}
        <Card
          title="Meeting Outcomes"
          subtitle={`Bucketed by scheduled meeting date — ${granularity} view. Completed = completed + paid.`}
          icon={Activity}
          iconColor="text-green-500"
          badge={
            <div className="flex items-center gap-2">
              <select
                value={granularity}
                onChange={e => setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <div className="flex gap-1">
                <button onClick={() => setWeeklyView('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${weeklyView === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >All</button>
                <button onClick={() => setWeeklyView('meta')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${weeklyView === 'meta' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >Meta</button>
              </div>
            </div>
          }
        >
          <KpiStrip items={[
            { label: 'Completed',   value: weeklyTotals.completed.toLocaleString(),   color: COLORS.completed },
            { label: 'No-Show',     value: weeklyTotals.noShow.toLocaleString(),      color: COLORS.noShow },
            { label: 'Canceled',    value: weeklyTotals.canceled.toLocaleString(),    color: COLORS.cancelled },
            { label: 'Rescheduled', value: weeklyTotals.rescheduled.toLocaleString(), color: COLORS.rescheduled },
            { label: 'Scheduled',   value: weeklyTotals.scheduled.toLocaleString(),   color: COLORS.scheduled },
          ]} />
          {weeklyData.length === 0
            ? <Empty msg="No outcome data" />
            : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top:10, right:20, left:0, bottom:6 }} barCategoryGap={granularity === 'daily' ? '5%' : '20%'}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="weekLabel" tick={{ fontSize:10 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} interval={granularity === 'daily' ? 6 : 0} />
                    <YAxis tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                    <Tooltip cursor={{ fill:'rgba(15,23,42,0.03)' }} contentStyle={TS} />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="square" iconSize={10} />
                    <Bar dataKey="Completed"   stackId="o" fill={COLORS.completed}   />
                    <Bar dataKey="No-Show"     stackId="o" fill={COLORS.noShow}      />
                    <Bar dataKey="Canceled"    stackId="o" fill={COLORS.cancelled}   />
                    <Bar dataKey="Rescheduled" stackId="o" fill={COLORS.rescheduled} />
                    <Bar dataKey="Scheduled"   stackId="o" fill={COLORS.scheduled}   radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>
      </div>

      {/* ── Chart 8 — No-Show: Called vs Not Called ── */}
      <Card
        title="No-Show Follow-Up — Called vs Not Called"
        subtitle={callsGranularity === 'daily' ? "Last 10 days with no-show records · Daily breakdown" : "✱ May data is from 22 May 2026 (Zoom call logs start date) · June onwards = full month data."}
        icon={CalendarCheck}
        iconColor="text-red-500"
        badge={
          <div className="flex items-center gap-2">
            <select
              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={callsGranularity}
              onChange={e => setCallsGranularity(e.target.value as 'monthly' | 'daily')}
            >
              <option value="monthly">Monthly</option>
              <option value="daily">Daily (last 10 days)</option>
            </select>
            {RefreshBtn}
          </div>
        }
      >
        <KpiStrip items={[
          { label: 'Total No-Shows', value: noShowCallsTotals.total.toLocaleString(),     color: COLORS.noShow },
          { label: 'Called',         value: noShowCallsTotals.called.toLocaleString(),     color: COLORS.completed },
          { label: 'Not Called',     value: noShowCallsTotals.notCalled.toLocaleString(),  color: COLORS.cancelled },
        ]} />

        {noShowCallsData.length === 0
          ? <Empty msg="No data — call logs available from May 2026" />
          : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={noShowCallsData} margin={{ top:10, right:20, left:0, bottom:6 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                  <YAxis tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                  <Tooltip cursor={{ fill:'rgba(15,23,42,0.03)' }} contentStyle={TS}
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload || {};
                      return (
                        <div style={TS} className="border p-3 min-w-[150px]">
                          <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">Total No-Shows</span>
                              <span className="font-bold text-slate-900">{(d.total || 0)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span style={{ color: COLORS.completed }} className="font-medium">Called</span>
                              <span className="font-bold">{d['Called'] || 0}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span style={{ color: COLORS.cancelled }} className="font-medium">Not Called</span>
                              <span className="font-bold">{d['Not Called'] || 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize:11 }} iconType="square" iconSize={10} />
                  <Bar dataKey="Called"    stackId="s" fill={COLORS.completed} />
                  <Bar dataKey="Not Called" stackId="s" fill={COLORS.cancelled} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }
      </Card>

    </div>
  );
}
