import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  ComposedChart,
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown, RefreshCcw, Search } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

// ── Color palette ──────────────────────────────────────────────────
const COLORS = {
  mql: '#6366F1',
  sql: '#0EA5E9',
  converted: '#22C55E',
  revenue: '#F59E0B',
  mqlLight: '#A5B4FC',
  sqlLight: '#7DD3FC',
  convertedLight: '#86EFAC',
  slate: '#64748B',
  rose: '#F43F5E',
  violet: '#8B5CF6',
  amber: '#F59E0B',
  emerald: '#10B981',
  orange: '#F97316',
  cyan: '#06B6D4',
  pink: '#EC4899',
  lime: '#84CC16',
  indigo: '#6366F1',
  teal: '#14B8A6',
};

const STATUS_COLORS: Record<string, string> = {
  'not-scheduled': '#9CA3AF',
  scheduled: '#F59E0B',
  completed: '#22C55E',
  canceled: '#EF4444',
  rescheduled: '#3B82F6',
  'no-show': '#FB7185',
  ignored: '#6B7280',
  paid: '#6366F1',
};

// ── Types ──────────────────────────────────────────────────────────
interface AnalyticsData {
  funnel: { mql: number; sql: number; converted: number; total: number; mqlToSqlRate: number; sqlToConvertedRate: number; overallConversion: number };
  volumeTrend: Array<{ date: string; total: number; MQL: number; SQL: number; Converted: number }>;
  conversionTrend: Array<{ week: string; sqlRate: number; convertedRate: number; total: number }>;
  revenueByPlan: Array<{ plan: string; revenue: number; count: number; avgDeal: number }>;
  revenueTrend: Array<{ month: string; revenue: number; deals: number }>;
  sourceBreakdown: Array<{ source: string; total: number; mql: number; sql: number; converted: number }>;
  sourceConversion: Array<{ source: string; total: number; conversionRate: number; sqlRate: number }>;
  dayOfWeek: Array<{ day: string; dayNum: number; total: number; converted: number }>;
  hourOfDay: Array<{ hour: number; label: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  avgDealSize: Array<{ plan: string; avgDeal: number; minDeal: number; maxDeal: number; count: number }>;
  leadAging: Array<{ bucket: string; count: number }>;
  planDistribution: Array<{ plan: string; count: number }>;
  planConversion: Array<{ plan: string; total: number; paidRate: number; sqlRate: number }>;
  velocity: Array<{ month: string; avgDays: number; minDays: number; maxDays: number; count: number }>;
  bdaPerformance: Array<{ name: string; email: string; claimed: number; converted: number; completed: number; revenue: number; conversionRate: number }>;
  leadSourceType: Array<{ source: string; total: number; mql: number; sql: number; converted: number }>;
  monthlyComparison: Array<{ month: string; total: number; mql: number; sql: number; converted: number; revenue: number }>;
  monthlyStatus: Array<{ month: string; total: number; completed: number; noShow: number; cancelled: number; rescheduled: number; paid: number; scheduled: number; notScheduled: number }>;
  monthlySourceType: Array<{ month: string; total: number; paid: number; organic: number }>;
  utmSourceMonthly: Array<{ month: string; source: string; count: number }>;
  utmMediumMonthly: Array<{ month: string; medium: string; count: number }>;
  utmSourceStatus: Array<UtmStatusRow & { month: string; source: string }>;
  utmMediumStatus: Array<UtmStatusRow & { month: string; medium: string }>;
  metaLeadsMonthly: Array<{ month: string; total: number; booked: number; notBooked: number }>;
}

interface UtmStatusRow {
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
  rescheduled: number;
  paid: number;
  scheduled: number;
  notScheduled: number;
}

// Colour palette for dynamic UTM stacked-bar segments.
const UTM_PALETTE = [
  '#F97316', '#6366F1', '#22C55E', '#0EA5E9', '#EC4899',
  '#F59E0B', '#14B8A6', '#8B5CF6', '#94A3B8',
];

const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return `${MON_ABBR[parseInt(mo, 10) - 1] || mo} ${y}`;
};

type DateRange = 'all' | '7d' | '30d' | '90d' | '6m' | '1y';

export interface QualifiedLeadsGraphsFilters {
  fromDate?: string;
  toDate?: string;
  qualification?: string;
  status?: string;
  planName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  minAmount?: string;
  maxAmount?: string;
  leadSource?: string;
  bdaEmail?: string;
  sourceType?: string;
}

const LEAD_SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'calendly', label: 'Calendly' },
  { value: 'meta_lead_ad', label: 'Meta Lead Ad' },
  { value: 'manual', label: 'Manual' },
  { value: 'frontend_direct', label: 'Frontend Direct' },
  { value: 'bulk_import', label: 'Bulk Import' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'all', label: 'Paid + Organic' },
  { value: 'paid', label: 'Paid only' },
  { value: 'organic', label: 'Organic only' },
];

interface Props {
  className?: string;
  filters?: QualifiedLeadsGraphsFilters;
  monthlyStatusBreakdown?: Array<Record<string, number | string>>;
  // Per-month paid-client counts from the clients-tracking DB. When supplied,
  // the "Paid" bar in Monthly Lead Status uses these instead of CRM bookingStatus.
  paidClientsMonthly?: Array<{ month: string; total: number }>;
}

// ── Shared tooltip style ───────────────────────────────────────────
const tooltipStyle = { borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };
const cursorStyle = { fill: 'rgba(15,23,42,0.04)' };

// ── Chart card wrapper (memoized) ──────────────────────────────────
const ChartCard = memo(({ title, subtitle, children, className = '', headerRight }: { title: string; subtitle: string; children: React.ReactNode; className?: string; headerRight?: React.ReactNode }) => (
  <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>
    <div className={`mb-4 ${headerRight ? 'flex flex-wrap items-start justify-between gap-3' : ''}`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {headerRight}
    </div>
    {children}
  </div>
));
ChartCard.displayName = 'ChartCard';

// ── KPI Card ───────────────────────────────────────────────────────
const KpiCard = memo(({ label, value, sub, trend, color = 'text-slate-900' }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | null; color?: string }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="flex items-baseline gap-2 mt-1">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {trend === 'up' && <TrendingUp size={14} className="text-emerald-500" />}
      {trend === 'down' && <TrendingDown size={14} className="text-rose-500" />}
    </div>
    {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
  </div>
));
KpiCard.displayName = 'KpiCard';

// ── Custom Funnel Bar Shape ────────────────────────────────────────
const FunnelBar = (props: any) => {
  const { x, y, width, height, fill } = props;
  return <rect x={x} y={y} width={width} height={height} fill={fill} rx={6} ry={6} />;
};

// ── Status label mapping ───────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  'not-scheduled': 'Not Scheduled',
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
  'no-show': 'No-Show',
  ignored: 'Ignored',
  paid: 'Paid',
};

// ── Format helpers ─────────────────────────────────────────────────
const fmtCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ── UTM status table (search + sort + fixed-height internal scroll) ──
const UTM_STATUS_COLS: Array<{ key: keyof UtmStatusRow; label: string; cls: string }> = [
  { key: 'total', label: 'Total', cls: 'text-slate-900 font-bold' },
  { key: 'notScheduled', label: 'Not Scheduled', cls: 'text-slate-600' },
  { key: 'scheduled', label: 'Scheduled', cls: 'text-amber-600' },
  { key: 'completed', label: 'Completed', cls: 'text-green-600' },
  { key: 'noShow', label: 'No-Show', cls: 'text-rose-600' },
  { key: 'cancelled', label: 'Cancelled', cls: 'text-red-700' },
  { key: 'rescheduled', label: 'Rescheduled', cls: 'text-blue-600' },
  { key: 'paid', label: 'Paid', cls: 'text-indigo-600 font-semibold' },
];

const EMPTY_UTM_ROW: UtmStatusRow = {
  total: 0, completed: 0, noShow: 0, cancelled: 0, rescheduled: 0, paid: 0, scheduled: 0, notScheduled: 0,
};

const UtmStatusTable = memo(
  ({ label, subtitle, rows }: { label: string; subtitle: string; rows: Array<UtmStatusRow & { month: string; name: string }> }) => {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<keyof UtmStatusRow>('total');
    const [mFrom, setMFrom] = useState('');
    const [mTo, setMTo] = useState('');

    // Distinct months present in the data (for the From/To pickers).
    const monthOptions = useMemo(
      () => [...new Set(rows.map((r) => r.month).filter(Boolean))].sort(),
      [rows]
    );

    // Collapse the per-(month, name) rows into one row per name for the selected
    // month range — "All" when no range is picked.
    const aggregated = useMemo(() => {
      const map = new Map<string, UtmStatusRow & { name: string }>();
      for (const r of rows) {
        if (mFrom && r.month < mFrom) continue;
        if (mTo && r.month > mTo) continue;
        const cur = map.get(r.name) || { name: r.name, ...EMPTY_UTM_ROW };
        for (const c of UTM_STATUS_COLS) cur[c.key] += Number(r[c.key]) || 0;
        map.set(r.name, cur);
      }
      return [...map.values()];
    }, [rows, mFrom, mTo]);

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      return aggregated
        .filter((r) => !q || r.name.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]));
    }, [aggregated, search, sortKey]);

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{label} — Leads &amp; Status</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500">Month</label>
            <select
              value={mFrom}
              onChange={(e) => setMFrom(e.target.value)}
              className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
              title="From month"
            >
              <option value="">All</option>
              {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
            </select>
            <span className="text-[11px] text-slate-400">to</span>
            <select
              value={mTo}
              onChange={(e) => setMTo(e.target.value)}
              className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
              title="To month"
            >
              <option value="">All</option>
              {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-8 pl-7 pr-2.5 w-44 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as keyof UtmStatusRow)}
              className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
              title="Sort by"
            >
              {UTM_STATUS_COLS.map((c) => (
                <option key={c.key} value={c.key}>Sort: {c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            {rows.length === 0
              ? 'No data'
              : aggregated.length === 0
                ? 'No data for the selected months'
                : 'No matches'}
          </div>
        ) : (
          // Fixed height — scroll happens INSIDE this box, not the whole page.
          <div className="max-h-[340px] overflow-auto border border-slate-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 px-3 font-semibold bg-slate-50">{label}</th>
                  {UTM_STATUS_COLS.map((c) => (
                    <th key={c.key} className="py-2 px-2 font-semibold text-right bg-slate-50 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-slate-800 break-all max-w-[200px]">{r.name}</td>
                    {UTM_STATUS_COLS.map((c) => (
                      <td key={c.key} className={`py-2 px-2 text-right ${c.cls}`}>{r[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Showing {filtered.length} of {aggregated.length} {label.toLowerCase()}s
          {(mFrom || mTo) ? ' (month-filtered)' : ''} • counts are unique leads, current status
        </p>
      </div>
    );
  }
);
UtmStatusTable.displayName = 'UtmStatusTable';

// ── Main Component ─────────────────────────────────────────────────
export default function QualifiedLeadsGraphs({ className = '', filters = {}, monthlyStatusBreakdown = [], paidClientsMonthly }: Props) {
  const { token } = useCrmAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyChartFrom, setMonthlyChartFrom] = useState<string>('');
  const [monthlyChartTo, setMonthlyChartTo] = useState<string>('');
  // Internal filters (in addition to the ones inherited from the parent)
  const [fLeadSource, setFLeadSource] = useState<string>(filters.leadSource || 'all');
  const [fSourceType, setFSourceType] = useState<string>(filters.sourceType || 'all');
  const [fBdaEmail, setFBdaEmail] = useState<string>(filters.bdaEmail || 'all');

  // Use parent filters when provided; otherwise fall back to internal date range
  const dateParams = useMemo(() => {
    if (filters.fromDate || filters.toDate) {
      return {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      };
    }
    if (dateRange === 'all') return {};
    const to = new Date();
    const from = new Date();
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '6m': 180, '1y': 365 };
    from.setDate(from.getDate() - (daysMap[dateRange] || 0));
    return {
      fromDate: from.toISOString().split('T')[0],
      toDate: to.toISOString().split('T')[0],
    };
  }, [dateRange, filters.fromDate, filters.toDate]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async () => {
    // Cancel any in-flight request so rapid filter changes can't pile up.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setRefreshing(true);
      setError(null);
      const params = new URLSearchParams();
      if (dateParams.fromDate) params.append('fromDate', dateParams.fromDate);
      if (dateParams.toDate) params.append('toDate', dateParams.toDate);
      if (filters.qualification && filters.qualification !== 'all') params.append('qualification', filters.qualification);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.planName && filters.planName !== 'all') params.append('planName', filters.planName);
      if (filters.utmSource && filters.utmSource !== 'all') params.append('utmSource', filters.utmSource);
      if (filters.utmMedium && filters.utmMedium !== 'all') params.append('utmMedium', filters.utmMedium);
      if (filters.utmCampaign && filters.utmCampaign !== 'all') params.append('utmCampaign', filters.utmCampaign);
      if (filters.minAmount) params.append('minAmount', filters.minAmount);
      if (filters.maxAmount) params.append('maxAmount', filters.maxAmount);
      // Internal filters take precedence over the inherited ones.
      const leadSource = fLeadSource !== 'all' ? fLeadSource : filters.leadSource;
      const sourceType = fSourceType !== 'all' ? fSourceType : filters.sourceType;
      const bdaEmail = fBdaEmail !== 'all' ? fBdaEmail : filters.bdaEmail;
      if (leadSource && leadSource !== 'all') params.append('leadSource', leadSource);
      if (sourceType && sourceType !== 'all') params.append('sourceType', sourceType);
      if (bdaEmail && bdaEmail !== 'all') params.append('bdaEmail', bdaEmail);

      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/leads/analytics?${params}`, { headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch analytics');
      setData(json.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // superseded — ignore
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      if (abortRef.current === ctrl) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // Depend on primitive filter fields — NOT the `filters` object itself.
    // Callers (e.g. GraphsView) render <QualifiedLeadsGraphs /> with no prop, so
    // the `filters = {}` default is a new object every render; depending on it
    // would re-create fetchAnalytics each render and loop the effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token, dateParams, fLeadSource, fSourceType, fBdaEmail,
    filters.qualification, filters.status, filters.planName,
    filters.utmSource, filters.utmMedium, filters.utmCampaign,
    filters.minAmount, filters.maxAmount,
    filters.leadSource, filters.sourceType, filters.bdaEmail,
  ]);

  useEffect(() => {
    fetchAnalytics();
    return () => abortRef.current?.abort();
  }, [fetchAnalytics]);

  // ── Derived data ───────────────────────────────────────────────
  const funnelData = useMemo(() => {
    if (!data) return [];
    const { funnel } = data;
    return [
      { name: 'MQL', value: funnel.mql, fill: COLORS.mql },
      { name: 'SQL', value: funnel.sql, fill: COLORS.sql },
      { name: 'Converted', value: funnel.converted, fill: COLORS.converted },
    ];
  }, [data]);

  const monthlyGrowth = useMemo(() => {
    if (!data?.monthlyComparison || data.monthlyComparison.length < 2) return null;
    const arr = data.monthlyComparison;
    const curr = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    if (!prev || prev.total === 0) return null;
    const growth = ((curr.total - prev.total) / prev.total) * 100;
    return { pct: Math.round(growth * 10) / 10, direction: growth >= 0 ? 'up' as const : 'down' as const };
  }, [data]);

  const totalRevenue = useMemo(() => {
    if (!data?.revenueByPlan) return 0;
    return data.revenueByPlan.reduce((s, r) => s + r.revenue, 0);
  }, [data]);

  const bdaOptions = useMemo(() => {
    if (!data?.bdaPerformance) return [];
    return data.bdaPerformance
      .filter((b) => b.email)
      .map((b) => ({ value: b.email, label: b.name || b.email }));
  }, [data]);

  // Month labels + range filter shared by the monthly charts
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return `${MONTH_LABELS[parseInt(mo, 10) - 1] || mo} ${y}`;
  };
  // Current month as YYYY-MM — charts never render months ahead of this,
  // even when future meetings are already booked.
  const currentYM = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();
  const inMonthRange = (m: string) => {
    if (m > currentYM) return false;
    if (monthlyChartFrom && m < monthlyChartFrom) return false;
    if (monthlyChartTo && m > monthlyChartTo) return false;
    return true;
  };

  // When paid-client data (clients-tracking DB) is supplied, the Paid bar uses it.
  const usePaidClients = Array.isArray(paidClientsMonthly);
  const monthlyStatusData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    const pcMap = new Map((paidClientsMonthly || []).map((p) => [p.month, p.total]));
    return data.monthlyStatus
      .filter((r) => r.month && inMonthRange(r.month))
      .map((r) => ({
        monthLabel: fmtMonth(r.month),
        'Not Scheduled': r.notScheduled,
        Scheduled: r.scheduled,
        Completed: r.completed,
        'No-Show': r.noShow,
        Cancelled: r.cancelled,
        Rescheduled: r.rescheduled,
        Paid: usePaidClients ? (pcMap.get(r.month) || 0) : r.paid,
      }));
  }, [data, paidClientsMonthly, usePaidClients, monthlyChartFrom, monthlyChartTo]);

  const metaLeadsData = useMemo(() => {
    if (!data?.metaLeadsMonthly) return [];
    return data.metaLeadsMonthly
      .filter((r) => r.month && inMonthRange(r.month))
      .map((r) => ({
        monthLabel: fmtMonth(r.month),
        'Booked Meeting': r.booked,
        'Not Booked': r.notBooked,
      }));
  }, [data, monthlyChartFrom, monthlyChartTo]);

  // Plain-language summary. Status counts come from monthlyStatus (the same
  // per-status logic the Leads table uses when you change its Status filter) so
  // a card here always equals what the Leads table shows for that status.
  const summary = useMemo(() => {
    const sb = data?.statusBreakdown || [];
    const ms = data?.monthlyStatus || [];
    const sum = (k: keyof (typeof ms)[number]) => ms.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const organic = (data?.monthlySourceType || []).reduce((s, r) => s + r.organic, 0);
    const paidAds = (data?.monthlySourceType || []).reduce((s, r) => s + r.paid, 0);
    return {
      // Total = unique leads (one row per client). A lead can appear under more
      // than one status card, so the status cards may add up to more than this.
      totalLeads: sb.reduce((s, r) => s + r.count, 0),
      organic,
      paidAds,
      meetingsDone: sum('completed'),
      noShow: sum('noShow'),
      cancelled: sum('cancelled'),
      rescheduled: sum('rescheduled'),
      paidCustomers: sum('paid'),
      scheduled: sum('scheduled'),
      notScheduled: sum('notScheduled'),
      meetingsScheduled:
        sum('scheduled') + sum('completed') + sum('noShow') +
        sum('cancelled') + sum('rescheduled') + sum('paid'),
    };
  }, [data]);

  // Monthly conversion — Completed meetings vs Paid customers + conversion rate.
  const completedVsPaidData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    return data.monthlyStatus
      .filter((r) => r.month && inMonthRange(r.month))
      .map((r) => {
        const completed = r.completed || 0;
        const paid = r.paid || 0;
        const rate = completed > 0 ? Math.round((paid / completed) * 1000) / 10 : 0;
        return {
          monthLabel: fmtMonth(r.month),
          Completed: completed,
          Paid: paid,
          rate,
        };
      });
  }, [data, monthlyChartFrom, monthlyChartTo]);

  const completedVsPaidTotals = useMemo(() => {
    const c = completedVsPaidData.reduce((s, r) => s + r.Completed, 0);
    const p = completedVsPaidData.reduce((s, r) => s + r.Paid, 0);
    const pct = c > 0 ? Math.round((p / c) * 1000) / 10 : 0;
    return { completed: c, paid: p, pct };
  }, [completedVsPaidData]);

  // Monthly: meetings scheduled vs not scheduled (derived from monthlyStatus)
  const monthlyMeetingData = useMemo(() => {
    if (!data?.monthlyStatus) return [];
    return data.monthlyStatus
      .filter((r) => r.month && inMonthRange(r.month))
      .map((r) => ({
        monthLabel: fmtMonth(r.month),
        'Meeting Scheduled':
          r.scheduled + r.completed + r.noShow + r.cancelled + r.rescheduled + r.paid,
        'Not Scheduled': r.notScheduled,
      }));
  }, [data, monthlyChartFrom, monthlyChartTo]);

  const monthlySourceData = useMemo(() => {
    if (!data?.monthlySourceType) return [];
    return data.monthlySourceType
      .filter((r) => r.month && inMonthRange(r.month))
      .map((r) => ({
        monthLabel: fmtMonth(r.month),
        Paid: r.paid,
        Organic: r.organic,
        total: r.total,
      }));
  }, [data, monthlyChartFrom, monthlyChartTo]);

  // Pivot UTM monthly rows ({month, <key>, count}) into stacked-bar data.
  // Keeps the top 8 values by volume, the rest collapse into "Other".
  const pivotUtm = (rows: Array<{ month: string; count: number } & Record<string, string | number>>, keyField: string) => {
    const byKey = new Map<string, number>();
    rows.forEach((r) => {
      const k = String(r[keyField] || '—');
      byKey.set(k, (byKey.get(k) || 0) + r.count);
    });
    const top = [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
    const topSet = new Set(top);
    let hasOther = false;
    const months = new Map<string, Record<string, number>>();
    rows.forEach((r) => {
      if (!inMonthRange(r.month)) return;
      const raw = String(r[keyField] || '—');
      const k = topSet.has(raw) ? raw : 'Other';
      if (k === 'Other') hasOther = true;
      const m = months.get(r.month) || {};
      m[k] = (m[k] || 0) + r.count;
      months.set(r.month, m);
    });
    const dataRows = [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, vals]) => ({ monthLabel: fmtMonth(month), ...vals }));
    const keys = [...top];
    if (hasOther) keys.push('Other');
    return { data: dataRows, keys };
  };

  const utmSourceChart = useMemo(
    () => pivotUtm((data?.utmSourceMonthly || []) as never, 'source'),
    [data, monthlyChartFrom, monthlyChartTo]
  );
  const utmMediumChart = useMemo(
    () => pivotUtm((data?.utmMediumMonthly || []) as never, 'medium'),
    [data, monthlyChartFrom, monthlyChartTo]
  );

  // ── Render ─────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-orange-500" size={28} />
        <span className="ml-3 text-sm text-slate-500">Loading analytics...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
        <p className="text-rose-700 text-sm">{error}</p>
        <button onClick={fetchAnalytics} className="mt-3 text-sm text-rose-600 underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { funnel } = data;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Lead Analytics</h2>
          <p className="text-xs text-slate-500">
            {filters.fromDate || filters.toDate
              ? 'Using filters from above (date, qualification, status, etc.)'
              : 'MQL, SQL & Converted pipeline analysis'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Only show internal date toggle when parent has NO date filters */}
          {!filters.fromDate && !filters.toDate && (
            <>
              {(['all', '7d', '30d', '90d', '6m', '1y'] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                    dateRange === r
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r === 'all' ? 'All Time' : r.toUpperCase()}
                </button>
              ))}
            </>
          )}
          <button
            onClick={fetchAnalytics}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
          >
            <RefreshCcw size={14} className={`text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Simple Summary (plain language) ──────────────────── */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-2">Quick Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Leads', value: summary.totalLeads, color: 'text-slate-900', bg: 'bg-slate-50 border-slate-200', hint: 'Every lead in this view' },
            { label: 'Organic Leads', value: summary.organic, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', hint: 'Came in without paid ads' },
            { label: 'Paid (Ad) Leads', value: summary.paidAds, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', hint: 'Came from ad campaigns' },
            { label: 'Meetings Scheduled', value: summary.meetingsScheduled, color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', hint: 'Leads who booked a meeting (any status after)' },
            { label: 'Not Scheduled', value: summary.notScheduled, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', hint: 'Submitted details, no meeting booked yet' },
            { label: 'Scheduled', value: summary.scheduled, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', hint: 'Meeting booked, BDA not updated yet' },
            { label: 'Meetings Done', value: summary.meetingsDone, color: 'text-green-700', bg: 'bg-green-50 border-green-200', hint: 'Meeting completed' },
            { label: 'No Show', value: summary.noShow, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', hint: 'Lead did not join' },
            { label: 'Cancelled', value: summary.cancelled, color: 'text-red-800', bg: 'bg-red-50 border-red-200', hint: 'Meeting cancelled' },
            { label: 'Rescheduled', value: summary.rescheduled, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', hint: 'Moved to a new time' },
            { label: 'Paid Customers', value: summary.paidCustomers, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', hint: 'Converted to paying customer' },
          ].map((c) => (
            <div key={c.label} className={`border rounded-xl p-4 ${c.bg}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`text-3xl font-extrabold mt-1 ${c.color}`}>{c.value.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">{c.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead Source</label>
          <select
            value={fLeadSource}
            onChange={(e) => setFLeadSource(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          >
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Acquisition</label>
          <select
            value={fSourceType}
            onChange={(e) => setFSourceType(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          >
            {SOURCE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">BDA</label>
          <select
            value={fBdaEmail}
            onChange={(e) => setFBdaEmail(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          >
            <option value="all">All BDAs</option>
            {bdaOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {(fLeadSource !== 'all' || fSourceType !== 'all' || fBdaEmail !== 'all') && (
          <button
            onClick={() => { setFLeadSource('all'); setFSourceType('all'); setFBdaEmail('all'); }}
            className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── KPI Row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Leads" value={funnel.total.toLocaleString()} sub="All qualifications" trend={monthlyGrowth?.direction} />
        <KpiCard label="MQL" value={funnel.mql.toLocaleString()} sub={`${funnel.total > 0 ? Math.round((funnel.mql / funnel.total) * 100) : 0}% of total`} color="text-indigo-600" />
        <KpiCard label="SQL" value={funnel.sql.toLocaleString()} sub={`${fmtPct(funnel.mqlToSqlRate)} qualification rate`} color="text-sky-600" />
        <KpiCard label="Converted" value={funnel.converted.toLocaleString()} sub={`${fmtPct(funnel.overallConversion)} overall conversion`} color="text-emerald-600" />
        <KpiCard label="Revenue" value={fmtCurrency(totalRevenue)} sub={`${data.revenueByPlan.reduce((s, r) => s + r.count, 0)} deals closed`} color="text-amber-600" />
        <KpiCard
          label="MoM Growth"
          value={monthlyGrowth ? `${monthlyGrowth.pct > 0 ? '+' : ''}${monthlyGrowth.pct}%` : '—'}
          sub="vs previous month"
          trend={monthlyGrowth?.direction}
        />
      </div>

      {/* ── Row 1: Funnel + Pipeline Status ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Conversion Funnel */}
        <ChartCard title="Conversion Funnel" subtitle="MQL → SQL → Converted pipeline">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 600 }} width={80} />
                <Tooltip contentStyle={tooltipStyle} cursor={cursorStyle} />
                <Bar dataKey="value" shape={<FunnelBar />}>
                  {funnelData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
            <span>MQL→SQL: <strong className="text-slate-700">{fmtPct(funnel.mqlToSqlRate)}</strong></span>
            <span>SQL→Converted: <strong className="text-slate-700">{fmtPct(funnel.sqlToConvertedRate)}</strong></span>
            <span>Overall: <strong className="text-slate-700">{fmtPct(funnel.overallConversion)}</strong></span>
          </div>
        </ChartCard>

        {/* 2. Pipeline by Status (Donut) */}
        <ChartCard title="Pipeline by Status" subtitle="Lead distribution across all statuses">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.statusBreakdown.filter(s => s.count > 0).map(s => ({ ...s, label: STATUS_LABELS[s.status] || s.status }))}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {data.statusBreakdown.filter(s => s.count > 0).map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] || '#E5E7EB'} />
                  ))}
                </Pie>
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ── Row 2: Conversion Rate Trend ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Rate Trend (Line) */}
        <ChartCard title="Conversion Rate Trend" subtitle="Weekly SQL & Converted rates">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.conversionTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} cursor={cursorStyle} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="sqlRate" stroke={COLORS.sql} strokeWidth={2} dot={false} name="SQL Rate" />
                <Line type="monotone" dataKey="convertedRate" stroke={COLORS.converted} strokeWidth={2} dot={false} name="Converted Rate" />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ── Row 3: Timing Analysis ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 13. Leads by Day of Week */}
        <ChartCard title="Leads by Day of Week" subtitle="Which days generate the most leads">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.dayOfWeek} margin={{ bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={cursorStyle} />
                <Bar dataKey="total" fill={COLORS.mqlLight} name="Total Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" fill={COLORS.converted} name="Converted" radius={[4, 4, 0, 0]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 14. Leads by Hour of Day */}
        <ChartCard title="Leads by Hour of Day" subtitle="Peak hours for lead generation">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourOfDay} margin={{ bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval={1} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={cursorStyle} />
                <Bar dataKey="count" fill={COLORS.cyan} name="Leads" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ── Row 4: Monthly Status (Big chart below Leads by Hour) ───── */}
      {monthlyStatusBreakdown.length > 0 && (() => {
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthOptions = monthlyStatusBreakdown.map((m) => m.month as string).filter(Boolean);
        const filteredMonthly = monthlyStatusBreakdown.filter((m) => {
          const mo = m.month as string;
          if (!mo) return false;
          if (monthlyChartFrom && mo < monthlyChartFrom) return false;
          if (monthlyChartTo && mo > monthlyChartTo) return false;
          return true;
        });
        const chartData = filteredMonthly.map((m) => ({
          ...m,
          monthLabel: (() => {
            const [y, mo] = (m.month as string).split('-');
            return `${monthLabels[parseInt(mo, 10) - 1]} ${y}`;
          })(),
          NotScheduled: m['not-scheduled'] ?? 0,
          Booked: m.booked ?? 0,
          Cancelled: m.canceled ?? 0,
          NoShow: m['no-show'] ?? 0,
          Completed: m.completed ?? 0,
          Ignored: m.ignored ?? 0,
          Converted: m.paid ?? 0,
        }));
        const barWidth = 48;
        const chartMinWidth = Math.max(400, chartData.length * barWidth);
        if (chartData.length === 0) {
          return (
            <div className="w-full">
              <ChartCard title="Monthly Meetings by Status" subtitle="Booked, Cancelled, No-Show, Completed, Converted — hover for details" headerRight={
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] font-medium text-slate-500">From</label>
                  <select value={monthlyChartFrom} onChange={(e) => setMonthlyChartFrom(e.target.value)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white">
                    <option value="">All</option>
                    {monthOptions.map((mo) => { const [y, m] = mo.split('-'); return <option key={mo} value={mo}>{monthLabels[parseInt(m, 10) - 1]} {y}</option>; })}
                  </select>
                  <label className="text-[11px] font-medium text-slate-500">To</label>
                  <select value={monthlyChartTo} onChange={(e) => setMonthlyChartTo(e.target.value)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white">
                    <option value="">All</option>
                    {monthOptions.map((mo) => { const [y, m] = mo.split('-'); return <option key={mo} value={mo}>{monthLabels[parseInt(m, 10) - 1]} {y}</option>; })}
                  </select>
                </div>
              }>
                <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected month range</div>
              </ChartCard>
            </div>
          );
        }
        return (
          <div className="w-full">
            <ChartCard
              title="Monthly Meetings by Status"
              subtitle="Booked, Cancelled, No-Show, Completed, Converted — hover for details"
              headerRight={
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] font-medium text-slate-500">From</label>
                  <select
                    value={monthlyChartFrom}
                    onChange={(e) => setMonthlyChartFrom(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    <option value="">All</option>
                    {monthOptions.map((mo) => {
                      const [y, m] = mo.split('-');
                      return (
                        <option key={mo} value={mo}>
                          {monthLabels[parseInt(m, 10) - 1]} {y}
                        </option>
                      );
                    })}
                  </select>
                  <label className="text-[11px] font-medium text-slate-500">To</label>
                  <select
                    value={monthlyChartTo}
                    onChange={(e) => setMonthlyChartTo(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    <option value="">All</option>
                    {monthOptions.map((mo) => {
                      const [y, m] = mo.split('-');
                      return (
                        <option key={mo} value={mo}>
                          {monthLabels[parseInt(m, 10) - 1]} {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              }
            >
              <div className="h-96 min-h-[384px] overflow-x-auto overflow-y-hidden">
                <div style={{ minWidth: chartMinWidth }} className="h-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={chartMinWidth}>
                    <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                      <Tooltip
                        cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string) => [value, name]}
                        labelFormatter={(label) => label}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="NotScheduled" stackId="a" fill="#3B82F6" name="Not Scheduled" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Booked" stackId="a" fill="#F97316" name="Booked" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Cancelled" stackId="a" fill="#BE123C" name="Cancelled" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="NoShow" stackId="a" fill="#FB7185" name="No-Show" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Completed" stackId="a" fill="#22C55E" name="Completed" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Ignored" stackId="a" fill="#64748B" name="Ignored" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Converted" stackId="a" fill="#14B8A6" name="Converted" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </ChartCard>
          </div>
        );
      })()}

      {/* ── Row 5: Monthly Lead Status (from analytics, respects all filters) ── */}
      {(() => {
        const monthOptions = (data.monthlyStatus || []).map((m) => m.month).filter(Boolean);
        const monthRangePicker = (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500">From</label>
            <select value={monthlyChartFrom} onChange={(e) => setMonthlyChartFrom(e.target.value)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white">
              <option value="">All</option>
              {monthOptions.map((mo) => <option key={mo} value={mo}>{fmtMonth(mo)}</option>)}
            </select>
            <label className="text-[11px] font-medium text-slate-500">To</label>
            <select value={monthlyChartTo} onChange={(e) => setMonthlyChartTo(e.target.value)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white">
              <option value="">All</option>
              {monthOptions.map((mo) => <option key={mo} value={mo}>{fmtMonth(mo)}</option>)}
            </select>
          </div>
        );
        const barWidth = 56;
        const minW = Math.max(420, monthlyStatusData.length * barWidth);
        return (
          <div className="w-full">
            <ChartCard
              title="Monthly Lead Status — All Leads"
              subtitle="Not Scheduled, Scheduled, Completed, No-Show, Cancelled, Rescheduled, Paid — per month"
              headerRight={monthRangePicker}
            >
              {monthlyStatusData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
              ) : (
                <div className="h-96 min-h-[384px] overflow-x-auto overflow-y-hidden">
                  <div style={{ minWidth: minW }} className="h-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={minW}>
                      <BarChart data={monthlyStatusData} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                        <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                        <Bar dataKey="Not Scheduled" stackId="s" fill="#9CA3AF" />
                        <Bar dataKey="Scheduled" stackId="s" fill="#F59E0B" />
                        <Bar dataKey="Completed" stackId="s" fill="#22C55E" />
                        <Bar dataKey="No-Show" stackId="s" fill="#FB7185" />
                        <Bar dataKey="Cancelled" stackId="s" fill="#BE123C" />
                        <Bar dataKey="Rescheduled" stackId="s" fill="#3B82F6" />
                        <Bar dataKey="Paid" stackId="s" fill="#6366F1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {/* Status meaning explainer */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-slate-600 border-t border-slate-100 pt-3">
                <p className="sm:col-span-2 text-slate-500 italic">
                  Each count matches the Leads table when you set its Status filter. A lead that moved
                  through several statuses (e.g. rescheduled, then re-booked) is counted under each —
                  so the bars can add up to more than the unique lead count.
                </p>
                <p><span className="font-bold text-slate-800">Not Scheduled:</span> lead submitted their details but hasn't booked a meeting yet.</p>
                <p><span className="font-bold text-slate-800">Scheduled:</span> meeting is booked, but the BDA hasn't updated the status in the CRM yet.</p>
                <p><span className="font-bold text-slate-800">Completed:</span> meeting happened.</p>
                <p><span className="font-bold text-slate-800">No-Show:</span> lead didn't join the booked meeting.</p>
                <p><span className="font-bold text-slate-800">Cancelled:</span> meeting was cancelled.</p>
                <p><span className="font-bold text-slate-800">Rescheduled:</span> meeting moved to a new time.</p>
                <p><span className="font-bold text-slate-800">Paid:</span> {usePaidClients
                  ? 'paying clients for that month, taken from the clients-tracking system.'
                  : 'lead converted into a paying customer.'}</p>
              </div>
            </ChartCard>
          </div>
        );
      })()}

      {/* ── Row 5b: Meetings Scheduled vs Not Scheduled (Monthly) ── */}
      <div className="w-full">
        <ChartCard
          title="Meetings Scheduled vs Not Scheduled — Monthly"
          subtitle="Scheduled = lead booked a meeting. Not Scheduled = submitted details but no meeting booked yet."
        >
          {monthlyMeetingData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyMeetingData} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="Meeting Scheduled" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Not Scheduled" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 5c: Meta Leads — Booked vs Not Booked ───────── */}
      <div className="w-full">
        <ChartCard
          title="Meta Leads — Booked vs Not Booked a Meeting"
          subtitle="Meta (Facebook / Instagram) leads who submitted their details — how many went on to book a meeting and how many did not."
        >
          {metaLeadsData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No Meta leads in range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metaLeadsData} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="Booked Meeting" stackId="meta" fill={COLORS.emerald} />
                  <Bar dataKey="Not Booked" stackId="meta" fill="#9CA3AF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">Booked Meeting</span> — Meta lead progressed past "not scheduled" (booked a slot).
            <span className="font-bold text-slate-800"> Not Booked</span> — Meta lead submitted details but never booked a meeting.
          </p>
        </ChartCard>
      </div>

      {/* ── Row 6: Paid vs Organic Leads (Monthly) ───────────── */}
      <div className="w-full">
        <ChartCard
          title="Paid vs Organic Leads — Monthly"
          subtitle="How each lead is classified is explained below the chart."
        >
          {monthlySourceData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySourceData} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="Paid" stackId="src" fill={COLORS.orange} />
                  <Bar dataKey="Organic" stackId="src" fill={COLORS.emerald} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Calculation explainer */}
          <div className="mt-4 border-t border-slate-100 pt-3 space-y-2 text-[11px] text-slate-600">
            <p className="font-bold text-slate-800">How a lead is counted as Paid vs Organic:</p>
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-2.5">
              <span className="font-bold text-orange-700">Paid</span> — lead came from a paid ad. A lead is Paid if <span className="font-semibold">any</span> of these is true:
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li><code className="bg-white px-1 rounded">metaIsOrganic = false</code> — a Meta (Facebook/Instagram) paid-ad lead</li>
                <li><code className="bg-white px-1 rounded">utmMedium</code> is <code className="bg-white px-1 rounded">cpc</code>, <code className="bg-white px-1 rounded">ppc</code>, <code className="bg-white px-1 rounded">paid</code> or <code className="bg-white px-1 rounded">paid_social</code></li>
                <li><code className="bg-white px-1 rounded">metaAdId</code> is present — lead is tied to a specific ad</li>
              </ul>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
              <span className="font-bold text-emerald-700">Organic</span> — everything else: website forms, direct traffic, organic social, referrals, manual entries. No paid-ad marker on the lead.
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ── Row 6b: Completed Meetings → Paid Conversion ────── */}
      <div className="w-full">
        <ChartCard
          title="Completed Meetings → Paid Conversion (Monthly)"
          subtitle={`Bars = unique leads in each status, per month. Line = Paid ÷ Completed conversion rate. Overall: ${completedVsPaidTotals.completed} completed, ${completedVsPaidTotals.paid} paid → ${completedVsPaidTotals.pct}%.`}
        >
          {completedVsPaidData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={completedVsPaidData} margin={{ top: 12, right: 24, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={42} domain={[0, 100]} />
                  <Tooltip
                    cursor={cursorStyle}
                    contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => name === 'rate' ? [`${v}%`, 'Conversion'] : [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="left" dataKey="Completed" fill={COLORS.converted} radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="Paid" fill={COLORS.indigo} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="Conversion %" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
            <p><span className="font-bold text-slate-800">Completed:</span> lead's meeting happened.</p>
            <p><span className="font-bold text-slate-800">Paid:</span> lead became a paying customer.</p>
            <p><span className="font-bold text-slate-800">Conversion %</span> = Paid ÷ Completed for the month. Higher = sales closing better after meetings.</p>
          </div>
        </ChartCard>
      </div>

      {/* ── Row 7: Monthly Leads by UTM Source ───────────────── */}
      <div className="w-full">
        <ChartCard
          title="Monthly Leads by UTM Source"
          subtitle="Where leads came from (utmSource) — stacked per month. Top 8 sources shown, rest grouped as Other."
        >
          {utmSourceChart.data.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utmSourceChart.data} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  {utmSourceChart.keys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="utmsrc"
                      fill={UTM_PALETTE[i % UTM_PALETTE.length]}
                      radius={i === utmSourceChart.keys.length - 1 ? [6, 6, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* UTM Source — leads & status table */}
      <UtmStatusTable
        label="UTM Source"
        subtitle="How many unique leads came from each source and their current status."
        rows={(data.utmSourceStatus || []).map((r) => ({ ...r, name: r.source }))}
      />

      {/* ── Row 8: Monthly Leads by UTM Medium ───────────────── */}
      <div className="w-full">
        <ChartCard
          title="Monthly Leads by UTM Medium"
          subtitle="How leads arrived (utmMedium) — stacked per month. Top 8 mediums shown, rest grouped as Other."
        >
          {utmMediumChart.data.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No data for selected range</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utmMediumChart.data} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip cursor={cursorStyle} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  {utmMediumChart.keys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="utmmed"
                      fill={UTM_PALETTE[i % UTM_PALETTE.length]}
                      radius={i === utmMediumChart.keys.length - 1 ? [6, 6, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* UTM Medium — leads & status table */}
      <UtmStatusTable
        label="UTM Medium"
        subtitle="How many unique leads came via each medium and their current status."
        rows={(data.utmMediumStatus || []).map((r) => ({ ...r, name: r.medium }))}
      />
    </div>
  );
}
