import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ChevronLeft, ChevronRight, Lock, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const STRIPE_DATA_PASSWORD = 'flashfire@1122334455';

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

interface ManualRow {
  id: string;
  date: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  planName: string;
  paymentMethod: string;
  referenceId: string;
  notes: string;
  manual: true;
}

interface CombinedRow {
  id: string;
  date: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  planName: string;
  cardLabel: string;
  manual: boolean;
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

const PLAN_BUCKETS = [
  { key: 'executive',    label: 'Executive',    match: (p: string) => p.toLowerCase().includes('executive') && !p.toLowerCase().includes('upgrade') },
  { key: 'professional', label: 'Professional', match: (p: string) => p.toLowerCase().includes('professional') && !p.toLowerCase().includes('upgrade') },
  { key: 'ignite',       label: 'Ignite',       match: (p: string) => p.toLowerCase().includes('ignite') && !p.toLowerCase().includes('upgrade') },
  { key: 'prime',        label: 'Prime',        match: (p: string) => p.toLowerCase().includes('prime') && !p.toLowerCase().includes('upgrade') },
  { key: 'addon',        label: 'Add-on',       match: (p: string) => p.toLowerCase().includes('add-on') || p.toLowerCase().includes('add on') },
  { key: 'upgrade',      label: 'Upgrade',      match: (p: string) => p.toLowerCase().includes('upgrade') },
] as const;

const PLAN_OPTIONS = ['Executive', 'Professional', 'Ignite', 'Prime', 'Add-on', 'Upgrade'];
const PAYMENT_METHOD_OPTIONS = ['UPI', 'Bank Transfer', 'Card', 'Cash', 'Other'];

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StripeDataPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === STRIPE_DATA_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex items-center justify-center py-28 px-6">
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 w-full max-w-sm text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
          <Lock size={20} className="text-orange-500" />
        </div>
        <h3 className="text-lg font-extrabold text-slate-900">Stripe Data is locked</h3>
        <p className="text-xs text-slate-500 mt-1 mb-5">Enter the password to view this section.</p>
        <input
          type="password"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(false); }}
          autoFocus
          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${error ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-200 focus:ring-orange-200'}`}
          placeholder="Password"
        />
        {error && <p className="text-rose-600 text-xs mt-2">Incorrect password.</p>}
        <button
          type="submit"
          className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg py-2 transition"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

interface ManualPaymentFormValues {
  date: string;
  amount: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  paymentMethod: string;
  referenceId: string;
  notes: string;
}

function ManualPaymentModal({
  initial,
  submitting,
  onSubmit,
  onClose,
}: {
  initial: ManualPaymentFormValues;
  submitting: boolean;
  onSubmit: (values: ManualPaymentFormValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ManualPaymentFormValues>(initial);

  const set = <K extends keyof ManualPaymentFormValues>(key: K, val: ManualPaymentFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-slate-900">Add INR Payment</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Date</label>
            <input
              type="datetime-local"
              required
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Amount (INR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={values.amount}
              onChange={(e) => set('amount', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Customer Name</label>
            <input
              type="text"
              required
              value={values.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Customer Email</label>
            <input
              type="email"
              required
              value={values.customerEmail}
              onChange={(e) => set('customerEmail', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Plan</label>
            <select
              required
              value={values.planName}
              onChange={(e) => set('planName', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200 bg-white"
            >
              <option value="" disabled>Select a plan</option>
              {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Payment Method</label>
            <select
              required
              value={values.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200 bg-white"
            >
              <option value="" disabled>Select a method</option>
              {PAYMENT_METHOD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Reference / Transaction ID (optional)</label>
            <input
              type="text"
              value={values.referenceId}
              onChange={(e) => set('referenceId', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Notes (optional)</label>
            <textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold py-2 transition"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function StripeDataView() {
  const [unlocked, setUnlocked] = useState(false);
  const { token } = useCrmAuth();
  const [month, setMonth] = useState<string>(currentYearMonth());
  const [data, setData] = useState<StripeMonthPayload | null>(null);
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRow, setEditingRow] = useState<ManualRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const [stripeRes, manualRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/crm/stripe/payments?month=${month}`, { headers }),
        fetch(`${API_BASE_URL}/api/crm/stripe/manual-payments?month=${month}`, { headers }),
      ]);
      const stripeJson = await stripeRes.json();
      if (!stripeRes.ok || !stripeJson.success) throw new Error(stripeJson.error || `HTTP ${stripeRes.status}`);
      setData(stripeJson.data as StripeMonthPayload);

      const manualJson = await manualRes.json();
      if (manualRes.ok && manualJson.success) {
        setManualRows(manualJson.data.rows as ManualRow[]);
      } else {
        setManualRows([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Stripe data');
      setData(null);
      setManualRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, month]);

  useEffect(() => { if (unlocked) fetchData(); }, [fetchData, unlocked]);

  const combinedRows: CombinedRow[] = useMemo(() => {
    const stripeCombined: CombinedRow[] = (data?.rows || []).map((r) => ({
      id: r.id,
      date: r.date,
      amount: r.amount,
      currency: r.currency,
      email: r.email,
      name: r.name,
      planName: r.planName,
      cardLabel: r.cardBrand ? `${r.cardBrand} ····${r.cardLast4}` : '—',
      manual: false,
    }));
    const manualCombined: CombinedRow[] = manualRows.map((r) => ({
      id: r.id,
      date: r.date,
      amount: r.amount,
      currency: r.currency,
      email: r.email,
      name: r.name,
      planName: r.planName,
      cardLabel: r.referenceId ? `${r.paymentMethod} · ${r.referenceId}` : r.paymentMethod,
      manual: true,
    }));
    return [...stripeCombined, ...manualCombined];
  }, [data, manualRows]);

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of combinedRows) {
      totals[r.currency] = (totals[r.currency] || 0) + r.amount;
    }
    return totals;
  }, [combinedRows]);

  const sortedRows = useMemo(() => {
    const rows = [...combinedRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortKey === 'amount') cmp = a.amount - b.amount;
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [combinedRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const isCurrentMonth = month === currentYearMonth();

  const planBreakdown = useMemo(() => {
    return PLAN_BUCKETS.map((bucket) => {
      const rows = combinedRows.filter((r) => bucket.match(r.planName));
      const usd = rows.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.amount, 0);
      const cad = rows.filter((r) => r.currency === 'CAD').reduce((s, r) => s + r.amount, 0);
      const inr = rows.filter((r) => r.currency === 'INR').reduce((s, r) => s + r.amount, 0);
      return { ...bucket, count: rows.length, usd, cad, inr };
    }).filter((b) => b.count > 0);
  }, [combinedRows]);

  const emptyFormValues: ManualPaymentFormValues = {
    date: toDatetimeLocalValue(new Date()),
    amount: '',
    customerName: '',
    customerEmail: '',
    planName: '',
    paymentMethod: '',
    referenceId: '',
    notes: '',
  };

  const editFormValues: ManualPaymentFormValues | null = editingRow ? {
    date: toDatetimeLocalValue(new Date(editingRow.date)),
    amount: String(editingRow.amount),
    customerName: editingRow.name,
    customerEmail: editingRow.email,
    planName: editingRow.planName,
    paymentMethod: editingRow.paymentMethod,
    referenceId: editingRow.referenceId,
    notes: editingRow.notes,
  } : null;

  const handleCreate = async (values: ManualPaymentFormValues) => {
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/crm/stripe/manual-payments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          date: new Date(values.date).toISOString(),
          amount: Number(values.amount),
          customerName: values.customerName,
          customerEmail: values.customerEmail,
          planName: values.planName,
          paymentMethod: values.paymentMethod,
          referenceId: values.referenceId,
          notes: values.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setShowAddModal(false);
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (values: ManualPaymentFormValues) => {
    if (!editingRow) return;
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/crm/stripe/manual-payments/${editingRow.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          date: new Date(values.date).toISOString(),
          amount: Number(values.amount),
          customerName: values.customerName,
          customerEmail: values.customerEmail,
          planName: values.planName,
          paymentMethod: values.paymentMethod,
          referenceId: values.referenceId,
          notes: values.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setEditingRow(null);
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: CombinedRow) => {
    if (!confirm(`Delete this ${row.amount} ${row.currency} payment from ${row.name}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/stripe/manual-payments/${row.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete payment');
    }
  };

  if (!unlocked) {
    return <StripeDataPasswordGate onUnlock={() => setUnlocked(true)} />;
  }

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
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-1.5 transition"
          >
            <Plus size={14} /> Add INR Payment
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
            {Object.entries(totalsByCurrency).map(([currency, total]) => (
              <div key={currency} className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">{currency}</div>
                <div className="text-lg font-extrabold text-slate-900">
                  {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">Payments</div>
              <div className="text-lg font-extrabold text-slate-900">{combinedRows.length}</div>
            </div>
          </div>

          {planBreakdown.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Plan Breakdown</p>
              <div className="flex flex-wrap gap-3">
                {planBreakdown.map((b) => (
                  <div key={b.key} className="bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm min-w-[140px]">
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{b.label}</div>
                    {b.usd > 0 && (
                      <div className="text-sm font-bold text-slate-900">
                        ${b.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">USD</span>
                      </div>
                    )}
                    {b.cad > 0 && (
                      <div className="text-sm font-bold text-slate-900">
                        ${b.cad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">CAD</span>
                      </div>
                    )}
                    {b.inr > 0 && (
                      <div className="text-sm font-bold text-slate-900">
                        ₹{b.inr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">INR</span>
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-1">{b.count} payment{b.count !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 w-20"></th>
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
                      {r.cardLabel}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.manual && (
                        <div className="flex items-center gap-2">
                          <button
                            title="Edit"
                            onClick={() => setEditingRow(manualRows.find((m) => m.id === r.id) || null)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => handleDelete(r)}
                            className="p-1 rounded hover:bg-rose-100 text-rose-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No payments this month</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAddModal && (
        <ManualPaymentModal
          initial={emptyFormValues}
          submitting={submitting}
          onSubmit={handleCreate}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingRow && editFormValues && (
        <ManualPaymentModal
          initial={editFormValues}
          submitting={submitting}
          onSubmit={handleUpdate}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  );
}
