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
  LabelList,
} from 'recharts';
import {
  Loader2, RefreshCcw, CalendarCheck, PhoneCall, AlertTriangle, Table2, PhoneOutgoing, ClipboardCheck,
} from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

// ── Palette ────────────────────────────────────────────────────────
// Validated against the white card surface (all four checks pass):
//   completed/paid  ΔE 104.4   ·  called/notCalled  ΔE 96.7
// Green+red was rejected for chart 2 — it only cleared deutan ΔE 12.4.
const C_COMPLETED  = '#2a78d6';
const C_PAID       = '#008300';
const C_CALLED     = '#2a78d6';
const C_NOT_CALLED = '#eb6834';

// Per-agent identity hues, fixed slot order. Two of these sit under 3:1 on white, so
// the relief rule applies — the Table toggle is the required secondary encoding.
const AGENT_SLOTS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948'];

// Call length and plan tier are ORDERED, not nominal, so they take a one-hue ordinal
// ramp (light = smallest). Both validated with --ordinal against the white surface.
const D_UNDER10 = '#86b6ef';
const D_10_60   = '#3987e5';
const D_OVER60  = '#184f95';
const PLAN_RAMP: Record<string, string> = {
  IGNITE: '#86b6ef', PRIME: '#5598e7', PROFESSIONAL: '#2a78d6', EXECUTIVE: '#184f95',
};

// "Unmarked" is absence of data, not a third outcome — a neutral, never a hue.
const C_UNMARKED = '#c3c2b7';

/**
 * Below this many observations a rate is noise, not signal: Kalpataru's attendance is
 * a single row, which would render as a confident "0%" beside Siddhartha's 98.3%.
 */
const MIN_SAMPLE = 5;

const INK_MUTED = '#898781';
const GRID      = '#e1e0d9';
const AXIS      = '#c3c2b7';

const UNASSIGNED = 'unassigned';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Types ──────────────────────────────────────────────────────────
type Granularity = 'day' | 'week';
type BdaLite = { email: string; name: string };
type Coverage = { total: number; attributed: number; unattributed: number; attributedPct: number };

type MeetingsPayload = {
  granularity: Granularity;
  timezone: string;
  bdas: BdaLite[];
  buckets: { bucket: string; byBda: Record<string, { completed: number; paid: number }> }[];
  totals: Record<string, { completed: number; paid: number; conversionRate: number }>;
  overall: { completed: number; paid: number; conversionRate: number };
  coverage: Coverage;
};

type NoShowPayload = {
  days: number;
  bdas: { email: string; name: string; called: number; notCalled: number; total: number; calledPct: number }[];
  calledBy: { email: string; name: string; calls: number }[];
  overall: { called: number; notCalled: number; total: number; calledPct: number };
  coverage: Coverage;
  excludedNoPhone: number;
};

type Agent = {
  email: string; name: string; role: string; isBda: boolean;
  calls: number; connected: number; talkSec: number;
  talkMinutes: number; avgCallSec: number; connectRate: number;
  under10s: number; s10to60: number; over60s: number;
  conversations: number; conversationRate: number;
};

type AttendanceRow = {
  email: string; name: string; role: string; isBda: boolean;
  present: number; absent: number; unmarked: number; manual: number;
  marked: number; total: number; presentRate: number;
};

type SalesCycleRow = {
  email: string; name: string; role: string; isBda: boolean;
  paid: number; cycleN: number;
  avgCycleDays: number | null; medianCycleDays: number | null;
  fastestDays: number | null; slowestDays: number | null;
  planMix: Record<string, number>; unknownPlan: number;
};

type ScorecardPayload = {
  days: number;
  planTiers: string[];
  attendance: AttendanceRow[];
  salesCycle: SalesCycleRow[];
  overall: { paid: number; avgCycleDays: number | null; cycleN: number };
  coverage: Coverage;
  excludedOutliers: number;
};

type CallActivityPayload = {
  granularity: Granularity;
  agents: Agent[];
  buckets: { bucket: string; byBda: Record<string, { calls: number; talkMinutes: number }> }[];
  overall: {
    calls: number; connected: number; talkSec: number; talkMinutes: number;
    avgCallSec: number; connectRate: number; conversations: number; conversationRate: number;
  };
  inboundCalls: number;
  unattributedOutbound: number;
};

// ── Helpers ────────────────────────────────────────────────────────
// Parse as a local calendar date — `new Date('2026-07-09')` would be read as UTC
// and can render as the previous day west of Greenwich.
const fmtBucket = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

/** 8577 → "2h 23m", 900 → "15m", 45 → "45s". */
const fmtDuration = (sec: number) => {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${Math.round(sec)}s`;
};

/**
 * Hue follows the agent, not their rank — keyed on a stable alphabetical index so a
 * BDA keeps their colour when the busiest agent changes or the range is switched.
 */
const makeColorFor = (emails: string[]) => {
  const order = [...emails].sort();
  return (email: string) => AGENT_SLOTS[Math.max(0, order.indexOf(email)) % AGENT_SLOTS.length];
};

const TS: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  borderColor: '#E2E8F0',
  fontSize: 12,
};

// ── Shared chrome ──────────────────────────────────────────────────
const Card = memo(({
  title, subtitle, icon: Icon, iconColor, children, badge,
}: {
  title: string; subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconColor: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200">
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

const KpiStrip = ({ items }: { items: { label: string; value: string | number; color: string }[] }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    {items.map((it) => (
      <div key={it.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <p className="text-[11px] text-slate-500 font-medium">{it.label}</p>
        <p className={`text-xl font-bold mt-0.5 ${it.color}`}>{it.value}</p>
      </div>
    ))}
  </div>
);

/** Honest banner: how much of the data actually carries a BDA. */
const CoverageNote = ({ coverage, what }: { coverage: Coverage; what: string }) => {
  if (!coverage || coverage.total === 0 || coverage.unattributed === 0) return null;
  return (
    <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
      <span>
        <strong>{coverage.unattributed}</strong> of <strong>{coverage.total}</strong> {what}
        {' '}({(100 - coverage.attributedPct).toFixed(1)}%) have no BDA on record and are shown as
        {' '}<em>Unassigned</em>. A BDA is recorded from the Calendly round-robin host, or a manual
        claim. Older bookings pre-date host capture — running the
        {' '}<code className="font-mono">backfill-calendly-hosts</code> admin job fills them in.
      </span>
    </div>
  );
};

/** Minimal shape of what Recharts hands a custom tooltip. */
type TipProps<T> = {
  active?: boolean;
  payload?: { payload?: T }[];
  label?: string | number;
};

type MeetingsRow = { label: string; Completed: number; Paid: number };

const MeetingsTip = ({ active, payload, label }: TipProps<MeetingsRow>) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const rate = d.Completed > 0 ? Math.round((d.Paid / d.Completed) * 1000) / 10 : 0;
  return (
    <div style={TS} className="border p-3 min-w-[160px]">
      <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: C_COMPLETED }} />
            <span className="text-slate-600 font-medium">Completed</span>
          </span>
          <span className="font-bold text-slate-900">{d.Completed}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: C_PAID }} />
            <span className="text-slate-600 font-medium">Paid</span>
          </span>
          <span className="font-bold text-slate-900">{d.Paid}</span>
        </div>
        <div className="border-t border-slate-100 pt-1 flex justify-between">
          <span className="text-slate-500 font-semibold">Conversion</span>
          <span className="font-bold text-slate-900">{rate}%</span>
        </div>
      </div>
    </div>
  );
};

type NoShowRow = { name: string; Called: number; 'Not Called': number; calledPct: number };

const NoShowTip = ({ active, payload, label }: TipProps<NoShowRow>) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={TS} className="border p-3 min-w-[170px]">
      <p className="font-bold text-slate-800 mb-2 text-xs">{label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: C_CALLED }} />
            <span className="text-slate-600 font-medium">Called</span>
          </span>
          <span className="font-bold text-slate-900">{d.Called}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: C_NOT_CALLED }} />
            <span className="text-slate-600 font-medium">Not Called</span>
          </span>
          <span className="font-bold text-slate-900">{d['Not Called']}</span>
        </div>
        <div className="border-t border-slate-100 pt-1 flex justify-between">
          <span className="text-slate-500 font-semibold">Follow-up rate</span>
          <span className="font-bold text-slate-900">{d.calledPct}%</span>
        </div>
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────────
export default function GraphsView03() {
  const { token } = useCrmAuth();
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [meetings, setMeetings] = useState<MeetingsPayload | null>(null);
  const [noShow, setNoShow] = useState<NoShowPayload | null>(null);
  const [callActivity, setCallActivity] = useState<CallActivityPayload | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const days = granularity === 'week' ? 84 : 30;
      const [mRes, nRes, cRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/crm/graphs03/bda-meetings?granularity=${granularity}&days=${days}`, { headers }),
        fetch(`${API_BASE_URL}/api/crm/graphs03/no-show-followup?days=120`, { headers }),
        fetch(`${API_BASE_URL}/api/crm/graphs03/bda-call-activity?granularity=${granularity}&days=${days}`, { headers }),
        // Paid volume is low, so the scorecard needs a wider window than the toggle.
        fetch(`${API_BASE_URL}/api/crm/graphs03/bda-scorecard?days=180`, { headers }),
      ]);
      const mJson = await mRes.json();
      const nJson = await nRes.json();
      const cJson = await cRes.json();
      const sJson = await sRes.json();
      if (!mRes.ok || !mJson.success) throw new Error(mJson.message || `HTTP ${mRes.status}`);
      setMeetings(mJson.data as MeetingsPayload);
      if (nRes.ok && nJson.success) setNoShow(nJson.data as NoShowPayload);
      if (cRes.ok && cJson.success) setCallActivity(cJson.data as CallActivityPayload);
      if (sRes.ok && sJson.success) setScorecard(sJson.data as ScorecardPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, granularity]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // One panel per BDA (small multiples) — 2 series per panel stays inside the
  // comfortable CVD band, where 3 BDAs x 2 measures in one plot would not.
  const panels = useMemo(() => {
    if (!meetings) return [];
    return meetings.bdas.map((bda) => ({
      bda,
      totals: meetings.totals[bda.email] ?? { completed: 0, paid: 0, conversionRate: 0 },
      rows: meetings.buckets.map((b) => ({
        label: fmtBucket(b.bucket),
        Completed: b.byBda[bda.email]?.completed ?? 0,
        Paid: b.byBda[bda.email]?.paid ?? 0,
      })),
    }));
  }, [meetings]);

  const noShowRows = useMemo(() => {
    if (!noShow) return [];
    return noShow.bdas
      .filter((b) => b.total > 0)
      .map((b) => ({
        name: b.name,
        Called: b.called,
        'Not Called': b.notCalled,
        calledPct: b.calledPct,
      }));
  }, [noShow]);

  const bdaAgents = useMemo(() => callActivity?.agents.filter((a) => a.isBda) ?? [], [callActivity]);
  const otherAgents = useMemo(() => callActivity?.agents.filter((a) => !a.isBda) ?? [], [callActivity]);
  const colorFor = useMemo(
    () => makeColorFor((callActivity?.agents ?? []).map((a) => a.email)),
    [callActivity]
  );

  // Calls and minutes are different units, so they get their own plot each — a single
  // chart with two y-scales would invent a relationship that isn't in the data.
  const callRows = useMemo(() => {
    if (!callActivity) return [];
    return callActivity.buckets.map((b) => {
      const row: Record<string, string | number> = { label: fmtBucket(b.bucket) };
      for (const a of bdaAgents) row[a.name] = b.byBda[a.email]?.calls ?? 0;
      return row;
    });
  }, [callActivity, bdaAgents]);

  const talkRows = useMemo(() => {
    if (!callActivity) return [];
    return callActivity.buckets.map((b) => {
      const row: Record<string, string | number> = { label: fmtBucket(b.bucket) };
      for (const a of bdaAgents) row[a.name] = b.byBda[a.email]?.talkMinutes ?? 0;
      return row;
    });
  }, [callActivity, bdaAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-red-800">Could not load Graphs 03</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Graphs 03 — BDA Performance</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Meetings vs paid per BDA, and no-show follow-up coverage.
            {meetings?.timezone ? ` Days and weeks are ${meetings.timezone} (weeks start Monday).` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {(['day', 'week'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  granularity === g ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {g === 'day' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTable((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            title="Show the numbers behind the charts"
          >
            <Table2 size={13} /> {showTable ? 'Hide' : 'Table'}
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCcw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      {meetings && noShow && (
        <KpiStrip
          items={[
            { label: 'Completed Meetings', value: meetings.overall.completed, color: 'text-slate-900' },
            { label: 'Paid', value: meetings.overall.paid, color: 'text-emerald-700' },
            { label: 'Conversion', value: `${meetings.overall.conversionRate}%`, color: 'text-blue-700' },
            { label: 'No-Shows Followed Up', value: `${noShow.overall.calledPct}%`, color: 'text-orange-600' },
          ]}
        />
      )}
      {callActivity && (
        <KpiStrip
          items={[
            { label: 'Calls Made', value: callActivity.overall.calls, color: 'text-slate-900' },
            { label: 'Time on Calls', value: fmtDuration(callActivity.overall.talkSec), color: 'text-blue-700' },
            {
              label: 'Conversations (>60s)',
              value: `${callActivity.overall.conversations} (${callActivity.overall.conversationRate}%)`,
              color: 'text-emerald-700',
            },
            { label: 'Avg Call Length', value: `${callActivity.overall.avgCallSec}s`, color: 'text-slate-900' },
          ]}
        />
      )}

      {/* ── Chart 1 — Completed vs Paid, per BDA ── */}
      {meetings && (
        <Card
          title={`Completed Meetings vs Paid — ${granularity === 'day' ? 'Daily' : 'Weekly'}`}
          subtitle="Bucketed by when the meeting happened. A paid client also sat the meeting, so Paid is a subset of Completed."
          icon={CalendarCheck}
          iconColor="text-blue-600"
          badge={
            <span className="text-[11px] font-semibold text-slate-500">
              {meetings.overall.completed} meetings · {meetings.overall.paid} paid
            </span>
          }
        >
          <CoverageNote coverage={meetings.coverage} what="completed meetings" />

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {panels.map(({ bda, totals, rows }) => (
              <div key={bda.email} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <p className={`text-xs font-bold ${bda.email === UNASSIGNED ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                    {bda.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {totals.completed} · <span className="text-emerald-700 font-semibold">{totals.paid} paid</span> ·{' '}
                    {totals.conversionRate}%
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={rows} margin={{ top: 6, right: 4, left: -22, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: INK_MUTED }}
                      stroke={AXIS}
                      interval="preserveStartEnd"
                      minTickGap={12}
                    />
                    <YAxis tick={{ fontSize: 9, fill: INK_MUTED }} stroke={AXIS} allowDecimals={false} />
                    <Tooltip content={<MeetingsTip />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={7} />
                    <Bar dataKey="Completed" fill={C_COMPLETED} radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="Paid" fill={C_PAID} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          {showTable && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-3 font-semibold">{granularity === 'day' ? 'Day' : 'Week of'}</th>
                    {meetings.bdas.map((b) => (
                      <th key={b.email} className="text-right py-1.5 px-3 font-semibold">{b.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {meetings.buckets.map((bk) => (
                    <tr key={bk.bucket} className="border-b border-slate-50">
                      <td className="py-1 pr-3 text-slate-600">{fmtBucket(bk.bucket)}</td>
                      {meetings.bdas.map((b) => {
                        const v = bk.byBda[b.email] ?? { completed: 0, paid: 0 };
                        return (
                          <td key={b.email} className="text-right py-1 px-3 text-slate-700">
                            {v.completed} / <span className="text-emerald-700 font-semibold">{v.paid}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 mt-1">Each cell is completed / paid.</p>
            </div>
          )}
        </Card>
      )}

      {/* ── Calls made & time spent, per BDA ── */}
      {callActivity && (
        <Card
          title="Calls Made & Time Spent — per BDA"
          subtitle="Outbound Zoom calls. A call over 60s is a conversation; under 10s is almost always voicemail or no answer."
          icon={PhoneOutgoing}
          iconColor="text-emerald-700"
          badge={
            <span className="text-[11px] font-semibold text-slate-500">
              {callActivity.overall.calls} calls · {callActivity.overall.conversations} conversations · {fmtDuration(callActivity.overall.talkSec)}
            </span>
          }
        >
          {bdaAgents.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No BDA calls in this window.</p>
          ) : (
            <>
              {/* Per-BDA summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                {bdaAgents.map((a) => (
                  <div key={a.email} className="border border-slate-100 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorFor(a.email) }} />
                      <p className="text-xs font-bold text-slate-800">{a.name}</p>
                      <span className="text-[10px] text-slate-400 truncate" title={a.email}>{a.email}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 tabular-nums">
                      {[
                        { l: 'Calls', v: a.calls },
                        { l: 'Conversations', v: `${a.conversations} (${a.conversationRate}%)` },
                        { l: 'Time Spent', v: fmtDuration(a.talkSec) },
                        { l: 'Avg Call', v: `${a.avgCallSec}s` },
                      ].map((s) => (
                        <div key={s.l}>
                          <p className="text-[10px] text-slate-500">{s.l}</p>
                          <p className="text-sm font-bold text-slate-900">{s.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Call length is ordered, so the ramp goes light (quick) → dark
                        (real conversation). Widths are proportional to call count. */}
                    <div className="mt-3">
                      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
                        {[
                          { k: '<10s', n: a.under10s, c: D_UNDER10 },
                          { k: '10–60s', n: a.s10to60, c: D_10_60 },
                          { k: '>60s', n: a.over60s, c: D_OVER60 },
                        ].map((seg) => seg.n > 0 && (
                          <div
                            key={seg.k}
                            style={{ width: `${(seg.n / Math.max(a.calls, 1)) * 100}%`, background: seg.c }}
                            title={`${seg.k}: ${seg.n} calls`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-slate-500 tabular-nums">
                        <span>&lt;10s: <strong className="text-slate-700">{a.under10s}</strong></span>
                        <span>10–60s: <strong className="text-slate-700">{a.s10to60}</strong></span>
                        <span>&gt;60s: <strong className="text-slate-700">{a.over60s}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Two units → two plots. Never one chart with two y-scales. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {[
                  { title: 'Calls Made', rows: callRows, unit: '' },
                  { title: 'Time Spent on Calls (minutes)', rows: talkRows, unit: 'm' },
                ].map((chart) => (
                  <div key={chart.title} className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-800 mb-2">{chart.title}</p>
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={chart.rows} margin={{ top: 6, right: 6, left: -20, bottom: 0 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: INK_MUTED }}
                          stroke={AXIS}
                          interval="preserveStartEnd"
                          minTickGap={12}
                        />
                        <YAxis tick={{ fontSize: 9, fill: INK_MUTED }} stroke={AXIS} allowDecimals={false} />
                        <Tooltip
                          contentStyle={TS}
                          labelStyle={{ fontWeight: 700, fontSize: 11, color: '#0b0b0b' }}
                          itemStyle={{ fontSize: 11 }}
                          formatter={(v: number) => `${v}${chart.unit}`}
                          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={7} />
                        {bdaAgents.map((a) => (
                          <Bar key={a.email} dataKey={a.name} fill={colorFor(a.email)} radius={[4, 4, 0, 0]} maxBarSize={14} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>

              {/* Everything excluded from "calls made", stated rather than dropped. */}
              {(otherAgents.length > 0 || callActivity.inboundCalls > 0 || callActivity.unattributedOutbound > 0) && (
                <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  {otherAgents.length > 0 && (
                    <p>
                      <span className="font-semibold text-slate-700">Not counted as BDA calls:</span>{' '}
                      {otherAgents.map((a) => `${a.name} (${a.calls} calls, ${fmtDuration(a.talkSec)})`).join(', ')}
                      {' '}— these CRM users are not marked with the <code className="font-mono">bda</code> role.
                    </p>
                  )}
                  {callActivity.inboundCalls > 0 && (
                    <p>{callActivity.inboundCalls} inbound call{callActivity.inboundCalls === 1 ? '' : 's'} excluded — a lead calling in is not a call the BDA made.</p>
                  )}
                  {callActivity.unattributedOutbound > 0 && (
                    <p>{callActivity.unattributedOutbound} outbound call{callActivity.unattributedOutbound === 1 ? '' : 's'} had no agent on record and could not be attributed.</p>
                  )}
                </div>
              )}

              {showTable && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="text-left py-1.5 pr-3 font-semibold">Agent</th>
                        <th className="text-left py-1.5 px-3 font-semibold">Role</th>
                        <th className="text-right py-1.5 px-3 font-semibold">Calls</th>
                        <th className="text-right py-1.5 px-3 font-semibold">&lt;10s</th>
                        <th className="text-right py-1.5 px-3 font-semibold">10–60s</th>
                        <th className="text-right py-1.5 px-3 font-semibold">&gt;60s</th>
                        <th className="text-right py-1.5 px-3 font-semibold">Connected</th>
                        <th className="text-right py-1.5 px-3 font-semibold">Time Spent</th>
                        <th className="text-right py-1.5 pl-3 font-semibold">Avg Call</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {callActivity.agents.map((a) => (
                        <tr key={a.email} className="border-b border-slate-50">
                          <td className="py-1 pr-3 text-slate-700">{a.name}</td>
                          <td className="py-1 px-3 text-slate-500">{a.role}</td>
                          <td className="text-right py-1 px-3 text-slate-700">{a.calls}</td>
                          <td className="text-right py-1 px-3 text-slate-700">{a.under10s}</td>
                          <td className="text-right py-1 px-3 text-slate-700">{a.s10to60}</td>
                          <td className="text-right py-1 px-3 font-semibold text-slate-900">{a.over60s}</td>
                          <td className="text-right py-1 px-3 text-slate-500">{a.connected} ({a.connectRate}%)</td>
                          <td className="text-right py-1 px-3 text-slate-700">{fmtDuration(a.talkSec)}</td>
                          <td className="text-right py-1 pl-3 text-slate-700">{a.avgCallSec}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Scorecard — attendance, sales cycle, plan mix ── */}
      {scorecard && (
        <Card
          title="BDA Scorecard — Attendance, Sales Cycle & Plan Mix"
          subtitle={`Last ${scorecard.days} days. Rates from fewer than ${MIN_SAMPLE} observations are withheld as too small to read.`}
          icon={ClipboardCheck}
          iconColor="text-violet-700"
          badge={
            <span className="text-[11px] font-semibold text-slate-500">
              {scorecard.overall.paid} paid
              {scorecard.overall.avgCycleDays !== null && ` · ${scorecard.overall.avgCycleDays}d avg cycle`}
            </span>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance — keyed on bdaEmail directly, so it does not depend on
                the sparse Calendly-host attribution the other charts rely on. */}
            <div>
              <p className="text-xs font-bold text-slate-800 mb-1">Meeting Attendance</p>
              <p className="text-[11px] text-slate-500 mb-3">
                Present vs absent on booked meetings. <em>Unmarked</em> means nobody recorded an outcome — it is not
                counted as a miss. Time-in-meeting is not shown: <code className="font-mono">joinedAt</code> is never
                recorded, so it cannot be computed.
              </p>
              <div className="space-y-2.5">
                {scorecard.attendance.filter((a) => a.total > 0).map((a) => {
                  const enough = a.marked >= MIN_SAMPLE;
                  return (
                    <div key={a.email}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-[11px] font-semibold ${a.isBda ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                          {a.name}
                          {!a.isBda && <span className="ml-1 font-normal">({a.role})</span>}
                        </span>
                        <span className="text-[11px] tabular-nums">
                          {enough ? (
                            <span className="font-bold text-slate-900">{a.presentRate}% present</span>
                          ) : (
                            <span className="text-slate-400">n={a.marked}, too few to rate</span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] bg-slate-50">
                        {[
                          { k: 'Present', n: a.present + a.manual, c: C_CALLED },
                          { k: 'Absent', n: a.absent, c: C_NOT_CALLED },
                          { k: 'Unmarked', n: a.unmarked, c: C_UNMARKED },
                        ].map((seg) => seg.n > 0 && (
                          <div key={seg.k} style={{ width: `${(seg.n / Math.max(a.total, 1)) * 100}%`, background: seg.c }} title={`${seg.k}: ${seg.n}`} />
                        ))}
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px] text-slate-500 tabular-nums">
                        <span>Present {a.present + a.manual}</span>
                        <span>Absent {a.absent}</span>
                        {a.unmarked > 0 && <span>Unmarked {a.unmarked}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                {[['Present', C_CALLED], ['Absent', C_NOT_CALLED], ['Unmarked', C_UNMARKED]].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} /> {l}
                  </span>
                ))}
              </div>
            </div>

            {/* Sales cycle + plan mix */}
            <div>
              <p className="text-xs font-bold text-slate-800 mb-1">Sales Cycle & Plan Mix</p>
              <p className="text-[11px] text-slate-500 mb-3">
                Days from the meeting to payment. Plan mix is <strong>counts only</strong> — revenue is omitted because{' '}
                <code className="font-mono">paymentPlan.price</code> mixes USD, CAD and INR in one field. Use the Stripe
                Data tab for money.
              </p>

              <div className="space-y-3">
                {scorecard.salesCycle.filter((b) => b.paid > 0).map((b) => {
                  const enough = b.cycleN >= MIN_SAMPLE;
                  const mixTotal = Object.values(b.planMix).reduce((s, v) => s + v, 0);
                  return (
                    <div key={b.email} className="border border-slate-100 rounded-lg p-2.5">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className={`text-[11px] font-semibold ${b.email === UNASSIGNED ? 'text-slate-400 italic' : b.isBda ? 'text-slate-800' : 'text-slate-500'}`}>
                          {b.name}
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums">{b.paid} paid</span>
                      </div>

                      {enough ? (
                        <div className="grid grid-cols-3 gap-2 mb-2 tabular-nums">
                          {[
                            { l: 'Median', v: `${b.medianCycleDays}d` },
                            { l: 'Average', v: `${b.avgCycleDays}d` },
                            { l: 'Range', v: `${b.fastestDays}–${b.slowestDays}d` },
                          ].map((s) => (
                            <div key={s.l}>
                              <p className="text-[10px] text-slate-500">{s.l}</p>
                              <p className="text-xs font-bold text-slate-900">{s.v}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 mb-2">
                          Cycle from n={b.cycleN} — too few to average.
                        </p>
                      )}

                      {mixTotal > 0 && (
                        <>
                          <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
                            {scorecard.planTiers.map((t) => (b.planMix[t] > 0) && (
                              <div key={t} style={{ width: `${(b.planMix[t] / mixTotal) * 100}%`, background: PLAN_RAMP[t] }} title={`${t}: ${b.planMix[t]}`} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] text-slate-500 tabular-nums">
                            {scorecard.planTiers.map((t) => (b.planMix[t] > 0) && (
                              <span key={t} className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLAN_RAMP[t] }} />
                                {t.slice(0, 4)} {b.planMix[t]}
                              </span>
                            ))}
                            {b.unknownPlan > 0 && <span>No plan {b.unknownPlan}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 mt-2">
                Plans low→high: {scorecard.planTiers.join(' · ')}
                {scorecard.excludedOutliers > 0 &&
                  ` — ${scorecard.excludedOutliers} booking${scorecard.excludedOutliers === 1 ? '' : 's'} excluded with an impossible meeting→payment gap.`}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <CoverageNote coverage={scorecard.coverage} what="paid bookings" />
          </div>
        </Card>
      )}

      {/* ── Chart 2 — No-show follow-up ── */}
      {noShow && (
        <Card
          title="No-Show Follow-Up — Called vs Not Called"
          subtitle="Per BDA who owns the lead. A no-show counts as called when a Zoom call was placed at or after the missed meeting."
          icon={PhoneCall}
          iconColor="text-orange-600"
          badge={
            <span className="text-[11px] font-semibold text-slate-500">
              {noShow.overall.called}/{noShow.overall.total} followed up · {noShow.overall.calledPct}%
            </span>
          }
        >
          <CoverageNote coverage={noShow.coverage} what="no-show leads" />

          {noShowRows.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No no-show leads in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, noShowRows.length * 54)}>
              <BarChart data={noShowRows} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }} barCategoryGap={14}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: INK_MUTED }} stroke={AXIS} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#52514e' }} stroke={AXIS} />
                <Tooltip content={<NoShowTip />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Called" stackId="s" fill={C_CALLED} radius={[4, 0, 0, 4]} maxBarSize={26}>
                  <LabelList dataKey="Called" position="center" style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }} />
                </Bar>
                <Bar dataKey="Not Called" stackId="s" fill={C_NOT_CALLED} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  <LabelList dataKey="Not Called" position="center" style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }} />
                  <LabelList dataKey="calledPct" position="right" formatter={(v: number) => `${v}%`} style={{ fill: INK_MUTED, fontSize: 10, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {noShow.excludedNoPhone > 0 && (
            <p className="text-[11px] text-slate-500 mt-3">
              {noShow.excludedNoPhone} no-show lead{noShow.excludedNoPhone === 1 ? '' : 's'} had no phone number on
              record and cannot be matched to a call log — excluded from the totals above rather than counted as
              &ldquo;not called&rdquo;.
            </p>
          )}

          {/* Who actually placed the follow-up calls — populated even when lead ownership isn't. */}
          {noShow.calledBy.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-800 mb-1">Follow-up calls placed by</p>
              <p className="text-[11px] text-slate-500 mb-3">
                Who made the call, independent of who owned the lead. This is recorded on every Zoom call, so it stays
                accurate even while lead ownership is backfilled.
              </p>
              <div className="space-y-1.5">
                {noShow.calledBy.map((c) => {
                  const max = Math.max(...noShow.calledBy.map((x) => x.calls), 1);
                  return (
                    <div key={c.email} className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-600 w-36 truncate" title={c.email}>{c.name}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(c.calls / max) * 100}%`, background: C_CALLED }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 w-8 text-right tabular-nums">{c.calls}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showTable && noShowRows.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-3 font-semibold">BDA</th>
                    <th className="text-right py-1.5 px-3 font-semibold">Called</th>
                    <th className="text-right py-1.5 px-3 font-semibold">Not Called</th>
                    <th className="text-right py-1.5 px-3 font-semibold">Total</th>
                    <th className="text-right py-1.5 pl-3 font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {noShow.bdas.map((b) => (
                    <tr key={b.email} className="border-b border-slate-50">
                      <td className="py-1 pr-3 text-slate-700">{b.name}</td>
                      <td className="text-right py-1 px-3 text-slate-700">{b.called}</td>
                      <td className="text-right py-1 px-3 text-slate-700">{b.notCalled}</td>
                      <td className="text-right py-1 px-3 text-slate-700">{b.total}</td>
                      <td className="text-right py-1 pl-3 font-semibold text-slate-900">{b.calledPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
