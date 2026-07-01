import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

interface StripeRow {
  id: string;
  date: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  cardBrand: string;
  cardLast4: string;
  planName: string;
}

interface StripeMonthPayload {
  month: string;
  rows: StripeRow[];
  totalsByCurrency: Record<string, number>;
  count: number;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

type SortKey = 'date' | 'amount' | 'email' | 'planName';

export default function StripeDataView() {
  const { token } = useCrmAuth();
  const [month, setMonth] = useState<string>(currentYearMonth());
  const [data, setData] = useState<StripeMonthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/stripe/payments?month=${month}`, { headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json.data as StripeMonthPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Stripe data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortKey === 'amount') cmp = a.amount - b.amount;
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const isCurrentMonth = month === currentYearMonth();

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Stripe Data</h2>
          <p className="text-xs text-slate-500 mt-0.5">Succeeded Stripe payments, month-wise</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition"
            title="Previous month"
          >
            <ChevronLeft size={16} className="text-slate-600" />
          </button>
          <span className="text-sm font-semibold text-slate-800 min-w-[140px] text-center">
            {fmtMonthLabel(month)}
          </span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition"
            title="Next month"
          >
            <ChevronRight size={16} className="text-slate-600" />
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition"
            title="Refresh"
          >
            <RefreshCcw size={13} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-28">
          <Loader2 className="animate-spin text-orange-500" size={26} />
          <span className="ml-3 text-sm text-slate-500">Loading Stripe data…</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
          <p className="text-rose-700 font-semibold text-sm">{error}</p>
          <button onClick={fetchData} className="mt-3 text-rose-600 text-xs underline">Retry</button>
        </div>
      )}

      {data && !error && (
        <>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.totalsByCurrency).map(([currency, total]) => (
              <div key={currency} className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">{currency}</div>
                <div className="text-lg font-extrabold text-slate-900">
                  {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">Payments</div>
              <div className="text-lg font-extrabold text-slate-900">{data.count}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th onClick={() => toggleSort('date')} className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none">
                    Date {sortKey === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => toggleSort('amount')} className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none">
                    Amount {sortKey === 'amount' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => toggleSort('email')} className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none">
                    Customer {sortKey === 'email' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => toggleSort('planName')} className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none">
                    Plan {sortKey === 'planName' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Card</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {new Date(r.date).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{r.name || '—'}</div>
                      <div className="text-xs text-slate-400">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.planName || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {r.cardBrand ? `${r.cardBrand} ····${r.cardLast4}` : '—'}
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No payments this month</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
