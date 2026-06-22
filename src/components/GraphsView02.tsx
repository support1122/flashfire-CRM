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

interface AnalyticsPayload {
  monthlyStatus       : MonthlyStatus[];
  metaLeadsMonthly    : MetaMonthly[];
  utmMediumMonthly    : UtmMedRow[];
  utmSourceMonthly    : Array<{ month: string; source: string; count: number }>;
  utmSourceStatus     : UtmStatusRow[];
  monthlySourceType   : SrcTypeRow[];
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
            <span className="font-bold text-slate-900">{(d[k]||0).toLocaleString()}</span>
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

// ── Main ───────────────────────────────────────────────────────────
export default function GraphsView02() {
  const { token } = useCrmAuth();
  const [data,    setData]    = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res  = await fetch(`${API_BASE_URL}/api/leads/analytics`, { headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json.data as AnalyticsPayload);
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
        _total      : r.completed + r.paid + r.noShow + r.cancelled + r.rescheduled,
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
  // CHART 2 — Completed → Paid conversion rate per month
  // Rate = Paid ÷ (Completed + Paid) × 100
  // Both "completed" and "paid" statuses had their meeting; "paid" also bought.
  // ──────────────────────────────────────────────────────────────────
  const convData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    return data.monthlyStatus
      .filter(r => r.month && r.month <= currentYM)
      .sort((a,b) => a.month.localeCompare(b.month))
      .map(r => {
        const meetingsDone = r.completed + r.paid;
        const rate = meetingsDone > 0 ? Math.round((r.paid / meetingsDone) * 1000) / 10 : 0;
        return {
          monthLabel   : fmtMonth(r.month),
          'Meetings Done': meetingsDone,
          'Paid'         : r.paid,
          rate,
        };
      });
  }, [data]);

  const convTotals = useMemo(() => {
    const done = convData.reduce((s,r) => s + r['Meetings Done'], 0);
    const paid = convData.reduce((s,r) => s + r.Paid, 0);
    return { done, paid, rate: done > 0 ? Math.round((paid/done)*1000)/10 : 0 };
  }, [convData]);

  // ──────────────────────────────────────────────────────────────────
  // CHART 3 — Meta leads vs booked meetings monthly
  // Uses metaLeadsMonthly from the API — same source as the Meta Leads
  // tab chart (leadSource = 'meta_lead_ad' OR metaLeadId exists).
  // Total = 1,685. "Booked" = any status except not-scheduled.
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
    <div className="space-y-8 p-6 max-w-7xl mx-auto">

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

      {/* ── 1. Completed Meetings Monthly ─────────────────────────── */}
      <Card
        title="Completed Meetings — Monthly"
        subtitle="What happened to meetings each month: Completed (done) · Paid (done + bought) · No-Show · Cancelled · Rescheduled"
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
            <div className="h-80">
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

        <StatusLegendTable rows={[
          { metric: 'Completed',   color: COLORS.completed,   included: ['completed'],  excluded: ['scheduled','not-scheduled','no-show','canceled','rescheduled','paid'] },
          { metric: 'Paid',        color: COLORS.paid,        included: ['paid'],       excluded: ['scheduled','not-scheduled','no-show','canceled','rescheduled','completed'] },
          { metric: 'No-Show',     color: COLORS.noShow,      included: ['no-show'],    excluded: ['scheduled','not-scheduled','completed','canceled','rescheduled','paid'] },
          { metric: 'Cancelled',   color: COLORS.cancelled,   included: ['canceled'],   excluded: ['scheduled','not-scheduled','completed','no-show','rescheduled','paid'] },
          { metric: 'Rescheduled', color: COLORS.rescheduled, included: ['rescheduled'],excluded: ['scheduled','not-scheduled','completed','no-show','canceled','paid'] },
        ]} />
      </Card>

      {/* ── 2. Completed → Paid Conversion Rate ───────────────────── */}
      <Card
        title="Completed → Paid Conversion Rate"
        subtitle='Rate = Paid ÷ (Completed + Paid). "Meetings Done" includes both statuses since both had their call.'
        icon={TrendingUp}
        iconColor="text-indigo-600"
        badge={RefreshBtn}
      >
        <KpiStrip items={[
          { label:'Meetings Done',  value: convTotals.done,              color: COLORS.completed },
          { label:'Converted Paid', value: convTotals.paid,              color: COLORS.paid },
          { label:'Conversion Rate',value: `${convTotals.rate}%`,        color: COLORS.rate },
        ]} />

        {convData.length === 0
          ? <Empty msg="No data" />
          : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={convData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                  <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                  <Tooltip
                    cursor={CS}
                    contentStyle={TS}
                    formatter={(v:number, name:string) =>
                      name === 'rate' ? [`${v}%`, 'Conversion %'] : [v.toLocaleString(), name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="left" dataKey="Meetings Done" fill={COLORS.completed} radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="Paid"          fill={COLORS.paid}      radius={[4,4,0,0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Conversion %"
                    stroke={COLORS.rate}
                    strokeWidth={2.5}
                    dot={{ r:4, fill:COLORS.rate, strokeWidth:0 }}
                    activeDot={{ r:6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )
        }

        <StatusLegendTable rows={[
          { metric: 'Meetings Done',   color: COLORS.completed, included: ['completed', 'paid'],  excluded: ['scheduled','not-scheduled','no-show','canceled','rescheduled'] },
          { metric: 'Paid',            color: COLORS.paid,      included: ['paid'],               excluded: ['scheduled','not-scheduled','no-show','canceled','rescheduled','completed'] },
          { metric: 'Conversion %',    color: COLORS.rate,      included: ['paid ÷ (completed + paid) × 100'], excluded: [] },
        ]} />
        <p className="mt-2 text-[11px] text-slate-400">A rising orange line = sales closing better after calls. Drop in recent months = leads still scheduled, not yet updated to Paid.</p>
      </Card>

      {/* ── 3. Meta Leads vs Booked ─────────────────────────────────── */}
      <Card
        title="Meta Leads vs Booked Meetings"
        subtitle="Same source as the Meta Leads tab — leadSource = meta_lead_ad OR metaLeadId exists. Booked = any status except not-scheduled."
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
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metaData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                  <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                  <Tooltip
                    cursor={CS}
                    contentStyle={TS}
                    formatter={(v:number, name:string) =>
                      name === 'rate' ? [`${v}%`, 'Booking Rate %'] : [v.toLocaleString(), name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="left" dataKey="Not Booked"    stackId="m" fill={COLORS.metaNot} />
                  <Bar yAxisId="left" dataKey="Booked Meeting" stackId="m" fill={COLORS.meta} radius={[5,5,0,0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Booking Rate %"
                    stroke={COLORS.rate}
                    strokeWidth={2.5}
                    dot={{ r:4, fill:COLORS.rate, strokeWidth:0 }}
                    activeDot={{ r:6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )
        }

        <StatusLegendTable rows={[
          { metric: 'Meta Leads',    color: COLORS.meta,      included: [],  field: 'leadSource = "meta_lead_ad" OR metaLeadId exists — same as Meta Leads tab' },
          { metric: 'Booked',        color: COLORS.completed, included: ['completed','paid','scheduled','no-show','canceled','rescheduled'], excluded: ['not-scheduled'] },
          { metric: 'Not Booked',    color: COLORS.metaNot,   included: ['not-scheduled'], excluded: ['completed','paid','scheduled','no-show','canceled','rescheduled'] },
          { metric: 'Booking Rate %',color: COLORS.rate,      included: ['booked ÷ total meta leads × 100'], excluded: [] },
        ]} />
        <p className="mt-2 text-[11px] text-slate-400">Same data source as the Meta Leads tab chart — total should match 1,685.</p>
      </Card>

      {/* ── 4. Monthly Leads by UTM Medium ──────────────────────────── */}
      <Card
        title="Monthly Leads by UTM Medium"
        subtitle="How leads arrived (utmMedium). Top 8 mediums shown; rest grouped as Other."
        icon={BarChart2}
        iconColor="text-violet-600"
        badge={RefreshBtn}
      >
        {/* Colour key */}
        {utmMediumChart.keys.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {utmMediumChart.keys.map((k, i) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: UTM_PALETTE[i % UTM_PALETTE.length] }}
                />
                {k}
              </span>
            ))}
          </div>
        )}

        {utmMediumChart.chartData.length === 0
          ? <Empty msg="No UTM medium data" />
          : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utmMediumChart.chartData} margin={{ top:10, right:12, left:0, bottom:6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                  <YAxis tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                  <Tooltip cursor={CS} contentStyle={TS}
                    formatter={(v:number, name:string) => [v.toLocaleString(), name]}
                  />
                  <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                  {utmMediumChart.keys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="utm"
                      fill={UTM_PALETTE[i % UTM_PALETTE.length]}
                      radius={i === utmMediumChart.keys.length-1 ? [5,5,0,0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }

        <StatusLegendTable rows={[
          { metric: 'Each bar segment', color: '#94A3B8', included: [], field: 'ALL statuses — no status filter applied' },
          { metric: 'paid (medium)',     color: UTM_PALETTE[0], included: [], field: 'utmMedium = "paid" → Meta/Facebook ad leads' },
          { metric: 'mailc / email',     color: UTM_PALETTE[1], included: [], field: 'utmMedium = "mailc" or "email" → email outreach' },
          { metric: 'Hero_Section / Website_*', color: UTM_PALETTE[2], included: [], field: 'utmMedium = website CTA buttons → organic visits' },
          { metric: 'direct',            color: UTM_PALETTE[3], included: [], field: 'utmMedium = "direct" → typed URL / no referrer' },
        ]} />
      </Card>

      {/* ── 5. Paid vs Organic Leads Monthly ────────────────────────── */}
      <Card
        title="Paid vs Organic Leads — Monthly"
        subtitle='Paid = utmMedium is "paid" / "cpc" / "ppc" / "paid_social". Organic = everything else (email, direct, website, social).'
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
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paidOrganicData} margin={{ top:10, right:44, left:0, bottom:6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize:11 }} tickLine={false} axisLine={{ stroke:'#E2E8F0' }} />
                    <YAxis yAxisId="left"  tick={{ fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize:11 }} tickLine={false} axisLine={false} unit="%" width={44} domain={[0,100]} />
                    <Tooltip
                      cursor={CS}
                      contentStyle={TS}
                      formatter={(v:number, name:string) =>
                        name === 'paidPct' ? [`${v}%`, 'Ad Share %'] : [v.toLocaleString(), name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize:11 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="Paid Ads" stackId="src" fill={COLORS.adPaid} />
                    <Bar yAxisId="left" dataKey="Organic"  stackId="src" fill={COLORS.organic} radius={[5,5,0,0]} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="paidPct"
                      name="Ad Share %"
                      stroke={COLORS.slate}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r:3, fill:COLORS.slate, strokeWidth:0 }}
                      activeDot={{ r:5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <StatusLegendTable rows={[
                { metric: 'Paid Ads',  color: COLORS.adPaid,  included: [], field: 'utmMedium = "paid" / "cpc" / "ppc" / "paid_social" — ALL statuses counted' },
                { metric: 'Organic',   color: COLORS.organic, included: [], field: 'everything else: mailc, email, direct, Hero_Section, Website_*, manual, CSV — ALL statuses counted' },
                { metric: 'Ad Share %',color: COLORS.slate,   included: [], field: 'paid ads ÷ total leads × 100 — no status filter' },
              ]} />
            </>
          )
        }
      </Card>

    </div>
  );
}
