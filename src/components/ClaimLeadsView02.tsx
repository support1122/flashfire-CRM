import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Loader2,
  Search,
  Save,
  Pencil,
  CheckCircle2,
  AlertCircle,
  X,
  Check,
  UserCheck,
} from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { CURRENCY_SYMBOLS } from '../utils/currency';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

// The four currencies a BDA may record for what they collected.
const BDA_CURRENCY_OPTIONS: Array<{ code: 'GBP' | 'USD' | 'INR' | 'CAD'; label: string }> = [
  { code: 'GBP', label: `${CURRENCY_SYMBOLS.GBP} British Pound` },
  { code: 'USD', label: `${CURRENCY_SYMBOLS.USD} USD` },
  { code: 'INR', label: `${CURRENCY_SYMBOLS.INR} Rupee` },
  { code: 'CAD', label: `${CURRENCY_SYMBOLS.CAD} CAD` },
];

const sym = (code: string | null | undefined) =>
  (code && CURRENCY_SYMBOLS[code]) || '';

const money = (amount: number | null | undefined, code: string | null | undefined) =>
  amount == null ? '—' : `${sym(code)}${Number(amount).toLocaleString()}`;

const inr = (amount: number | null | undefined) =>
  amount == null ? '—' : `₹${Math.round(Number(amount)).toLocaleString()}`;

type SearchResult = {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  bookingStatus: string;
  alreadyClaimed: boolean;
  claimedByName: string | null;
  claimedByMe: boolean;
};

type Claim = {
  _id: string;
  bookingId: string;
  clientName: string;
  crmEmail: string;
  clientPhone?: string;
  registeredPlan: string;
  bdaCurrency: 'GBP' | 'USD' | 'INR' | 'CAD' | null;
  bdaAmountCollected: number | null;
  incentiveInr: number;
  claimedBy: { email: string; name: string };
  claimedAt: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  updatedAt: string;
  // admin-only
  registeredCurrency?: string | null;
  registeredAmountPaid?: number | null;
  approvedBy?: { email: string; name: string };
  approvedAt?: string | null;
  mismatch?: boolean;
};

type StatusBadge = { text: string; cls: string };
const statusBadge = (s: Claim['status']): StatusBadge => {
  switch (s) {
    case 'approved':
      return { text: 'Approved', cls: 'bg-green-100 text-green-700' };
    case 'denied':
      return { text: 'Denied', cls: 'bg-red-100 text-red-700' };
    default:
      return { text: 'Pending', cls: 'bg-amber-100 text-amber-700' };
  }
};

export default function ClaimLeadsView02() {
  const { user, token, canEdit } = useCrmAuth();
  const editable = canEdit('claim_leads_02');
  const isAdmin = user?.role === 'admin';

  const authHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Per-row edit state: rowId -> { currency, amount }
  const [editing, setEditing] = useState<Record<string, { currency: string; amount: string }>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  // Admin filters
  const [bdaFilter, setBdaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');
  const [bdas, setBdas] = useState<Array<{ email: string; name: string; count: number }>>([]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 2500);
  };

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/api/bda/claim02/admin/all`
        : `${API_BASE_URL}/api/bda/claim02/my`;
      const res = await fetch(url, { headers: authHeaders });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message || 'Failed to load');
      setClaims(body.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claimed leads');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isAdmin]);

  const loadBdas = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bda/claim02/bdas`, { headers: authHeaders });
      const body = await res.json();
      if (res.ok && body.success) setBdas(body.data || []);
    } catch {
      /* non-critical */
    }
  }, [authHeaders, isAdmin]);

  useEffect(() => {
    loadClaims();
    loadBdas();
  }, [loadClaims, loadBdas]);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/bda/claim02/search?q=${encodeURIComponent(query.trim())}`,
          { headers: authHeaders }
        );
        const body = await res.json();
        if (res.ok && body.success) {
          setResults(body.data || []);
          setShowResults(true);
        }
      } catch {
        /* ignore */
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, authHeaders]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleClaim = async (r: SearchResult) => {
    if (r.alreadyClaimed) return;
    setClaimingId(r.bookingId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bda/claim02/claim/${encodeURIComponent(r.bookingId)}`, {
        method: 'POST',
        headers: authHeaders,
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message || 'Failed to claim');
      setClaims((prev) => [body.data, ...prev]);
      setQuery('');
      setResults([]);
      setShowResults(false);
      flashSuccess(`Claimed ${r.clientName || r.clientEmail}`);
      loadBdas();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to claim lead');
    } finally {
      setClaimingId(null);
    }
  };

  const startEdit = (c: Claim) => {
    setEditing((prev) => ({
      ...prev,
      [c._id]: {
        currency: c.bdaCurrency || '',
        amount: c.bdaAmountCollected != null ? String(c.bdaAmountCollected) : '',
      },
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const saveRow = async (c: Claim) => {
    const draft = editing[c._id];
    if (!draft) return;
    if (!draft.currency) {
      setError('Pick a currency before saving');
      return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid amount');
      return;
    }
    setSavingRow(c._id);
    setError(null);
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/api/bda/claim02/admin/${c._id}`
        : `${API_BASE_URL}/api/bda/claim02/${c._id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ bdaCurrency: draft.currency, bdaAmountCollected: amount }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message || 'Failed to save');
      setClaims((prev) => prev.map((x) => (x._id === c._id ? body.data : x)));
      cancelEdit(c._id);
      flashSuccess('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingRow(null);
    }
  };

  const approve = async (c: Claim, status: 'approved' | 'denied' | 'pending') => {
    setSavingRow(c._id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bda/claim02/admin/${c._id}/approve`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message || 'Failed to update status');
      setClaims((prev) => prev.map((x) => (x._id === c._id ? body.data : x)));
      flashSuccess(status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'Reset to pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSavingRow(null);
    }
  };

  const visibleClaims = useMemo(() => {
    if (!isAdmin) return claims;
    return claims.filter((c) => {
      if (bdaFilter !== 'all' && c.claimedBy?.email !== bdaFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      return true;
    });
  }, [claims, isAdmin, bdaFilter, statusFilter]);

  // ---- render helpers ----

  const bdaColCount = isAdmin ? 14 : 9;

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <UserCheck className="text-purple-600" size={22} />
        <h2 className="text-xl font-extrabold text-gray-900">Claim Leads 02</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {isAdmin
          ? 'Every BDA’s claimed leads. Approve with the tick; edit the BDA amount to recompute incentive. Rows in red: the BDA amount does not match the registered amount.'
          : 'Search a paid client, claim the lead, then record the currency and amount you collected.'}
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {/* Search (BDA + admin can both claim; gated by claim_leads_02_edit) */}
      {editable && (
        <div ref={searchWrapRef} className="relative mb-5 max-w-xl">
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500">
            <Search size={16} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Search client by email, name, or phone…"
              className="flex-1 outline-none text-sm"
            />
            {searching && <Loader2 size={16} className="animate-spin text-gray-400" />}
          </div>

          {showResults && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-80 overflow-auto">
              {results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500">No matching paid clients.</div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.bookingId}
                    disabled={r.alreadyClaimed || claimingId === r.bookingId}
                    onClick={() => handleClaim(r)}
                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 border-gray-100 text-sm transition ${
                      r.alreadyClaimed ? 'bg-gray-50 cursor-not-allowed' : 'hover:bg-purple-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {r.clientName || '—'}
                        </div>
                        <div className="text-gray-500 truncate">
                          {r.clientEmail}
                          {r.clientPhone ? ` · ${r.clientPhone}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs">
                        {claimingId === r.bookingId ? (
                          <Loader2 size={14} className="animate-spin text-purple-600" />
                        ) : r.alreadyClaimed ? (
                          <span className="text-gray-500">
                            {r.claimedByMe ? 'Claimed by you' : `Claimed by ${r.claimedByName || '—'}`}
                          </span>
                        ) : (
                          <span className="text-purple-600 font-semibold">Claim</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin filters */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-gray-500">BDA</span>
            <select
              value={bdaFilter}
              onChange={(e) => setBdaFilter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="all">All</option>
              {bdas.map((b) => (
                <option key={b.email} value={b.email}>
                  {b.name} ({b.count})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-gray-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </label>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Client Name</th>
              <th className="px-3 py-2 text-left font-semibold">CRM Email</th>
              <th className="px-3 py-2 text-left font-semibold">Phone</th>
              <th className="px-3 py-2 text-left font-semibold">Registered Plan</th>
              {isAdmin && (
                <>
                  <th className="px-3 py-2 text-left font-semibold">Registered Currency</th>
                  <th className="px-3 py-2 text-left font-semibold">Registered Amount Paid</th>
                </>
              )}
              <th className="px-3 py-2 text-left font-semibold">
                {isAdmin ? 'BDA Currency' : 'Currency'}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {isAdmin ? 'BDA Amount Collected' : 'Amount Collected'}
              </th>
              <th className="px-3 py-2 text-left font-semibold">Incentive (INR)</th>
              <th className="px-3 py-2 text-left font-semibold">Claimed By</th>
              {isAdmin && <th className="px-3 py-2 text-left font-semibold">Claimed At</th>}
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Actions</th>
              {isAdmin && <th className="px-3 py-2 text-left font-semibold">Approve</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={bdaColCount} className="px-3 py-8 text-center text-gray-400">
                  <Loader2 className="inline animate-spin mr-2" size={16} />
                  Loading…
                </td>
              </tr>
            ) : visibleClaims.length === 0 ? (
              <tr>
                <td colSpan={bdaColCount} className="px-3 py-8 text-center text-gray-400">
                  No claimed leads yet.
                </td>
              </tr>
            ) : (
              visibleClaims.map((c) => {
                const isEditing = Boolean(editing[c._id]);
                const draft = editing[c._id];
                const badge = statusBadge(c.status);
                const rowRed = isAdmin && c.mismatch;
                return (
                  <tr
                    key={c._id}
                    className={`border-t border-gray-100 ${
                      rowRed ? 'bg-red-50' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">{c.clientName || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{c.crmEmail || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{c.clientPhone || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{c.registeredPlan || '—'}</td>

                    {isAdmin && (
                      <>
                        <td className="px-3 py-2 text-gray-600">{c.registeredCurrency || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {money(c.registeredAmountPaid, c.registeredCurrency)}
                        </td>
                      </>
                    )}

                    {/* BDA currency */}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          value={draft.currency}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [c._id]: { ...prev[c._id], currency: e.target.value },
                            }))
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">Select…</option>
                          {BDA_CURRENCY_OPTIONS.map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-700">{c.bdaCurrency || '—'}</span>
                      )}
                    </td>

                    {/* BDA amount */}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={draft.amount}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [c._id]: { ...prev[c._id], amount: e.target.value },
                            }))
                          }
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="0"
                        />
                      ) : (
                        <span className={rowRed ? 'font-semibold text-red-700' : 'text-gray-700'}>
                          {money(c.bdaAmountCollected, c.bdaCurrency)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-gray-700">{inr(c.incentiveInr)}</td>
                    <td className="px-3 py-2 text-gray-600">{c.claimedBy?.name || '—'}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {c.claimedAt ? new Date(c.claimedAt).toLocaleDateString() : '—'}
                      </td>
                    )}

                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>

                    {/* Save / Edit */}
                    <td className="px-3 py-2">
                      {editable ? (
                        isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => saveRow(c)}
                              disabled={savingRow === c._id}
                              className="inline-flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                              {savingRow === c._id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Save size={12} />
                              )}
                              Save
                            </button>
                            <button
                              onClick={() => cancelEdit(c._id)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(c)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Admin approve */}
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            title="Approve"
                            onClick={() => approve(c, 'approved')}
                            disabled={savingRow === c._id || c.status === 'approved'}
                            className={`rounded p-1.5 ${
                              c.status === 'approved'
                                ? 'bg-green-100 text-green-600 cursor-default'
                                : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
                            }`}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            title="Deny"
                            onClick={() => approve(c, 'denied')}
                            disabled={savingRow === c._id || c.status === 'denied'}
                            className={`rounded p-1.5 ${
                              c.status === 'denied'
                                ? 'bg-red-100 text-red-600 cursor-default'
                                : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                            }`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
