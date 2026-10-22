import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type View = 'month' | 'quarter' | 'day' | 'mtd';

interface FunnelRow {
  key: string;
  label: string;
  current?: boolean;
  forms: number;
  scheduled: number;
  canceled: number;
  attended: number;
  completed: number;
  noShow: number;
  paid: number;
  revenue: number;
}

interface FunnelResponse {
  view: View;
  timezone: string;
  from: string | null;
  to: string | null;
  rows: FunnelRow[];
  total: FunnelRow | Omit<FunnelRow, 'key' | 'label'>;
}

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'day', label: 'Day' },
  { id: 'mtd', label: 'MTD' },
];

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const daysAgoIso = (n: number) => {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Count with its small grey % beside it. `tone` colours the % (higher-is-better or worse). */
function Cell({ value, rate, tone = 'good' }: { value: number; rate: number | null; tone?: 'good' | 'bad' | 'none' }) {
  let color = 'text-slate-400';
  if (rate !== null && tone !== 'none') {
    const bad = tone === 'bad' ? rate >= 30 : rate < 25;
    const great = tone === 'bad' ? rate <= 15 : rate >= 60;
    color = bad ? 'text-rose-500' : great ? 'text-emerald-600' : 'text-slate-400';
  }
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      <span className="font-semibold text-slate-900">{value.toLocaleString()}</span>
      {rate !== null && <span className={`ml-1.5 text-[11px] ${color}`}>{rate.toFixed(1)}%</span>}
    </td>
  );
}

export default function FunnelTable() {
  const { token } = useCrmAuth();
  const [view, setView] = useState<View>('month');
  const [from, setFrom] = useState(() => daysAgoIso(29));
  const [to, setTo] = useState(() => todayIso());
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const qs = new URLSearchParams({ view });
      if (view === 'day') {
        qs.set('from', from);
        qs.set('to', to);
      }
      const res = await fetch(`${API_BASE_URL}/api/crm/analytics/funnel?${qs}`, { headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Failed to load funnel');
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel');
    } finally {
      setLoading(false);
    }
  }, [token, view, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const renderRow = (r: Omit<FunnelRow, 'key' | 'label'> & { key?: string; label: string }, isTotal = false) => {
    const due = r.attended + r.noShow; // calls that actually came due
    const avgDeal = r.paid > 0 ? r.revenue / r.paid : null;
    const perLead = r.forms > 0 ? r.revenue / r.forms : null;
    return (
      <tr
        key={r.key ?? 'total'}
        className={isTotal ? 'bg-slate-50 font-semibold border-t-2 border-slate-300' : r.key && (r as FunnelRow).current ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
      >
        <td className="px-3 py-2 whitespace-nowrap text-slate-800 font-medium sticky left-0 bg-inherit">{r.label}</td>
        <Cell value={r.forms} rate={null} />
        <Cell value={r.scheduled} rate={pct(r.scheduled, r.forms)} />
        <Cell value={r.canceled} rate={pct(r.canceled, r.scheduled)} tone="bad" />
        <Cell value={r.attended} rate={pct(r.attended, due)} />
        <Cell value={r.completed} rate={pct(r.completed, r.attended)} tone="none" />
        <Cell value={r.noShow} rate={pct(r.noShow, due)} tone="bad" />
        <Cell value={r.paid} rate={pct(r.paid, r.attended)} />
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
          {pct(r.paid, r.forms) === null ? '–' : `${pct(r.paid, r.forms)!.toFixed(1)}%`}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{money(r.revenue)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{avgDeal === null ? '–' : money(avgDeal)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{perLead === null ? '–' : money(perLead)}</td>
      </tr>
    );
  };

  const headers: Array<[string, string, string]> = [
    ['Period', 'text-left', 'The day (month, quarter) the lead FIRST filled a form, in ET. Every other column follows those same leads.'],
    ['Form fills', 'text-right', 'People who filled any form: the website signup form or a Meta / other lead form. Counted once per email, on their first form date. Leads whose bookings are all marked Ignored are left out.'],
    ['Scheduled', 'text-right', 'Form fills who booked a call. Status is anything except Not-scheduled (Scheduled, Rescheduled, Completed, Paid, No-show or Canceled).\n% = share of Form fills.'],
    ['Canceled', 'text-right', 'Scheduled leads who never attended and never no-showed, and whose latest booking status is Canceled.\n% = share of Scheduled.'],
    ['Attended', 'text-right', 'Leads whose call happened. Status is Completed or Paid.\n% = share of calls that came due (Attended + No-show). Future and canceled calls are not in that base.'],
    ['Completed', 'text-right', 'Attended leads who have NOT paid. Status is Completed (and not Paid). Attended = Completed + Paid.\n% = share of Attended.'],
    ['No-show', 'text-right', 'Leads who never attended and have a booking with status No-show.\n% = no-show rate, share of calls that came due (Attended + No-show).'],
    ['Paid', 'text-right', 'Leads whose booking status is Paid.\n% = share of Attended.'],
    ['Form → Paid', 'text-right', 'Overall conversion: Paid ÷ Form fills.'],
    ['Revenue', 'text-right', 'Sum of the plan price (or payment breakdown) of Paid bookings.'],
    ['Avg deal', 'text-right', 'Revenue ÷ Paid.'],
    ['Revenue / lead', 'text-right', 'Revenue ÷ Form fills.'],
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Sales Funnel</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Leads grouped by the day they filled the form (ET). Small % = share of the previous step; Attended / No-show
            are out of calls that came due. Completed = attended but not yet paid (Attended = Completed + Paid).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view === 'day' && (
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1" />
              <span className="text-slate-400">to</span>
              <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1" />
            </div>
          )}
          <div className="flex bg-slate-100 rounded-lg p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`px-3 py-1 text-sm rounded-md font-medium transition ${view === v.id ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Refresh">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
          </button>
        </div>
      </div>

      {error && <div className="m-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map(([h, align, help]) => (
                <th
                  key={h}
                  className={`px-3 py-2 font-semibold whitespace-nowrap cursor-help ${align}`}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setTip({ text: help, x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), y: r.bottom + 6 });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  <span className="border-b border-dotted border-slate-400">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.rows.map((r) => renderRow(r))}
            {data && renderRow({ ...data.total, label: view === 'mtd' ? 'Month to date' : 'Total' }, true)}
            {!data && !loading && !error && (
              <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-slate-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {tip && (
        <div
          className="fixed z-50 w-72 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white shadow-lg whitespace-pre-line pointer-events-none"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
    </section>
  );
}
