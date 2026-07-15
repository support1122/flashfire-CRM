import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
  Phone,
  StickyNote,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Loader2,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import CallButton from './CallButton';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

const PAGE_SIZE = 25;

interface Caller {
  email: string | null;
  name: string | null;
  calls: number;
  durationSec: number;
}

interface CallHistoryItem {
  callId: string;
  startedAt: string | null;
  durationSec: number;
  direction: string;
  status: string;
  salesName: string | null;
  salesEmail: string | null;
}

interface CallSummary {
  count: number;
  totalDurationSec: number;
  lastCallAt: string | null;
  callers: Caller[];
  history: CallHistoryItem[];
}

interface LeadNote {
  text: string;
  authorEmail: string | null;
  authorName: string;
  createdAt: string;
}

interface Assignee {
  email: string;
  name: string;
  assignedAt: string | null;
}

/**
 * Call progress. NOT the booking status — every lead on this tab is 'not-scheduled'
 * by definition, so showing that would repeat one value down every row.
 */
type CallStatus = 'new' | 'attempted' | 'contacted';

interface CallLead {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  type: string | null;
  typeLabel: string | null;
  status: CallStatus;
  bookingCreatedAt: string;
  ageHours: number | null;
  campaign: string | null;
  platform: string | null;
  assignedBda: Assignee | null;
  notes: LeadNote[];
  notesCount: number;
  calls: CallSummary;
}

interface Facet {
  value: string;
  label: string;
  count: number;
}

interface SummaryPayload {
  summary: {
    total: number;
    new: number;
    attempted: number;
    contacted: number;
    assigned: number;
    unassigned: number;
    noPhone: number;
  };
  types: Facet[];
  statuses: Facet[];
  dateQuick: Facet[];
  dateBounds: { min: string | null; max: string | null };
  assignees: { email: string; name: string; leads: number }[];
  /** Set when the caller is a BDA seeing only their own queue. */
  scopedTo: string | null;
  coolOffHours: number;
}

const STATUS_META: Record<CallStatus, { label: string; cls: string; hint: string }> = {
  new: {
    label: 'New',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    hint: 'Zoom has no call to this number.',
  },
  attempted: {
    label: 'Attempted',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    hint: 'Zoom logged a call, but none reached 60s — rang out, voicemail, or hung up.',
  },
  contacted: {
    label: 'Contacted',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    hint: 'A real conversation happened — a call of 60s or more.',
  },
};

/** Talk time, in the units a human would say it. */
function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtAge(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/* Notes modal — append-only, so past notes are shown, never edited.    */
/* ------------------------------------------------------------------ */

function CallLeadNotesModal({
  lead,
  onClose,
  onAdd,
  canEdit,
}: {
  lead: CallLead;
  onClose: () => void;
  onAdd: (text: string) => Promise<void>;
  canEdit: boolean;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(t);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">Notes</h3>
            <p className="text-sm text-slate-500 truncate">
              {lead.clientName} · {lead.clientPhone || 'no phone'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {lead.notes.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-6">
              No notes yet. Add the first one below.
            </p>
          ) : (
            <ul className="space-y-3">
              {lead.notes.map((n, i) => (
                <li
                  key={`${n.createdAt}-${i}`}
                  className="border border-slate-200 rounded-xl p-3 bg-slate-50"
                >
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.text}</p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    <span className="font-semibold text-slate-600">{n.authorName}</span>
                    {' · '}
                    {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit ? (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did the client say? Add a note…"
              className="w-full h-24 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm text-slate-700"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-600 text-sm font-semibold hover:bg-slate-200 rounded-lg transition"
                disabled={saving}
              >
                Close
              </button>
              <button
                onClick={submit}
                disabled={saving || !text.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Add Note
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
            <p className="text-xs text-slate-500">You have read-only access — notes cannot be added.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** A funnel tile that doubles as the status filter — the number and the way to see it. */
function StatCard({
  label,
  value,
  hint,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'warn' | 'good';
  onClick?: () => void;
  active?: boolean;
}) {
  const valueCls =
    tone === 'warn' ? 'text-orange-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-900';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left bg-white border rounded-xl px-4 py-3 transition ${
        active
          ? 'border-orange-400 ring-2 ring-orange-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${valueCls}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{hint}</p>}
    </button>
  );
}

/** A labelled dropdown whose options carry their own counts. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Facet[];
  allLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${
          value === 'all'
            ? 'border-slate-200 text-slate-700'
            : 'border-orange-300 text-orange-800 font-semibold'
        }`}
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}

export default function CallLeadsView() {
  const { token, canEdit } = useCrmAuth();
  const mayEdit = canEdit('leads') || canEdit('all_data') || canEdit('phone_calls') || canEdit('meta_leads');

  const [rows, setRows] = useState<CallLead[]>([]);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  // Date filtering is either a quick preset OR an explicit day range, never both.
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [scopedTo, setScopedTo] = useState<string | null>(null);

  // A preset and a custom range are mutually exclusive: choosing one clears the other,
  // so the UI never shows two date filters fighting over the same query param.
  const pickDatePreset = useCallback((value: string) => {
    setDatePreset((prev) => (prev === value ? 'all' : value));
    setDateFrom('');
    setDateTo('');
  }, []);
  const pickDateFrom = useCallback((value: string) => {
    setDateFrom(value);
    setDatePreset('all');
  }, []);
  const pickDateTo = useCallback((value: string) => {
    setDateTo(value);
    setDatePreset('all');
  }, []);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notesFor, setNotesFor] = useState<string | null>(null);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort,
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (dateFrom || dateTo) {
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', dateTo);
      } else if (datePreset !== 'all') {
        params.set('datePreset', datePreset);
      }
      if (assigneeFilter !== 'all') params.set('assignee', assigneeFilter);

      const res = await fetch(`${API_BASE_URL}/api/crm/call-leads?${params}`, {
        headers: authHeaders,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server ${res.status}`);

      setRows(json.data || []);
      setTotalCount(json.pagination?.totalCount ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setScopedTo(json.scopedTo ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load call leads');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, page, search, statusFilter, typeFilter, datePreset, dateFrom, dateTo, assigneeFilter, sort]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/call-leads/summary`, { headers: authHeaders });
      const json = await res.json();
      if (res.ok && json.success) setSummary(json);
    } catch {
      // The table is the feature; a missing header strip is not worth an error state.
    }
  }, [authHeaders]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, datePreset, dateFrom, dateTo, assigneeFilter, sort]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addNote = useCallback(
    async (lead: CallLead, text: string) => {
      const res = await fetch(
        `${API_BASE_URL}/api/crm/call-leads/${encodeURIComponent(lead.bookingId)}/notes`,
        { method: 'POST', headers: authHeaders, body: JSON.stringify({ text }) }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server ${res.status}`);

      setRows((prev) =>
        prev.map((r) =>
          r.bookingId === lead.bookingId
            ? {
                ...r,
                notes: json.notes || [],
                notesCount: (json.notes || []).length,
                assignedBda: json.assignedBda ?? r.assignedBda,
              }
            : r
        )
      );
    },
    [authHeaders]
  );

  const activeLead = notesFor ? rows.find((r) => r.bookingId === notesFor) ?? null : null;

  const dateActive = datePreset !== 'all' || dateFrom !== '' || dateTo !== '';

  // Sort is a view preference, not a filter — it never hides a row, so it is not counted
  // here and "Clear filters" leaves it alone. A preset and a range are one date filter,
  // counted once.
  const activeFilterCount = [
    search.trim() !== '',
    statusFilter !== 'all',
    typeFilter !== 'all',
    dateActive,
    assigneeFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setAssigneeFilter('all');
  }, []);

  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);
  const coolOff = summary?.coolOffHours ?? 24;
  // The BDA column is dropped for a scoped BDA, so the full-width rows must follow.
  const colCount = scopedTo ? 7 : 8;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {scopedTo ? 'My Call Leads' : 'Call Leads'}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {scopedTo ? (
            <>
              Meta leads assigned to you that filled the form but never booked a meeting, {coolOff}h
              or more later. Call them, and log what they said. New leads are shared out between the
              BDAs automatically, so this list grows on its own.
            </>
          ) : (
            <>
              Meta leads that filled the form but never booked a meeting, {coolOff}h or more later.
              Every lead is shared out round-robin between the active BDAs, who each see only their
              own. Admins see everyone&apos;s.
            </>
          )}
        </p>
      </div>

      {/* The funnel. These three are mutually exclusive and sum to the total, so a
          reader can trust them as a breakdown rather than overlapping tallies. */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label={scopedTo ? 'My leads to call' : 'Leads to call'}
            value={summary.summary.total}
            onClick={() => setStatusFilter('all')}
            active={statusFilter === 'all'}
          />
          <StatCard
            label="New"
            hint="Nobody has dialled these yet"
            value={summary.summary.new}
            tone="warn"
            onClick={() => setStatusFilter('new')}
            active={statusFilter === 'new'}
          />
          <StatCard
            label="Attempted"
            hint="Dialled, but never reached"
            value={summary.summary.attempted}
            onClick={() => setStatusFilter('attempted')}
            active={statusFilter === 'attempted'}
          />
          <StatCard
            label="Contacted"
            hint="A real conversation happened"
            value={summary.summary.contacted}
            tone="good"
            onClick={() => setStatusFilter('contacted')}
            active={statusFilter === 'contacted'}
          />
        </div>
      )}

      {!scopedTo && summary && summary.assignees.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500 uppercase tracking-wide text-[11px]">
            Split
          </span>
          {summary.assignees.map((a) => (
            <span
              key={a.email}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 border border-slate-200"
            >
              <UserCheck size={11} className="text-emerald-600" />
              <span className="font-semibold text-slate-700">{a.name}</span>
              <span className="text-slate-500">{a.leads}</span>
            </span>
          ))}
        </div>
      )}

      {summary && summary.summary.noPhone > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <strong>{summary.summary.noPhone}</strong> of these leads have no phone number on record
            and cannot be called from here. They are still listed, with the Call action disabled.
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
        {/* Search + global actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or phone…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Always here when anything is filtered, so "clear everything" is one obvious
              click regardless of which filters are set. */}
          <button
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border transition ${
              activeFilterCount > 0
                ? 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'
                : 'text-slate-300 bg-white border-slate-200 cursor-not-allowed'
            }`}
          >
            <X size={14} />
            {activeFilterCount > 0
              ? `Clear filters (${activeFilterCount})`
              : 'Clear filters'}
          </button>

          <button
            onClick={() => {
              fetchLeads();
              fetchSummary();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Quick date filters + day range. Both drive the same date filter, so choosing a
            chip clears the range and vice versa. */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            When
          </span>
          {(summary?.dateQuick ?? []).map((q) => {
            const active = datePreset === q.value;
            return (
              <button
                key={q.value}
                onClick={() => pickDatePreset(q.value)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                  active
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                }`}
              >
                {q.label}
                <span className={active ? 'text-orange-100' : 'text-slate-400'}>{q.count}</span>
              </button>
            );
          })}

          <span className="mx-1 h-4 w-px bg-slate-200" />

          <label className="text-[11px] text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            min={summary?.dateBounds.min ?? undefined}
            max={dateTo || summary?.dateBounds.max || undefined}
            onChange={(e) => pickDateFrom(e.target.value)}
            className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${
              dateFrom ? 'border-orange-300 text-orange-800' : 'border-slate-200 text-slate-600'
            }`}
          />
          <label className="text-[11px] text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || summary?.dateBounds.min || undefined}
            max={summary?.dateBounds.max ?? undefined}
            onChange={(e) => pickDateTo(e.target.value)}
            className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${
              dateTo ? 'border-orange-300 text-orange-800' : 'border-slate-200 text-slate-600'
            }`}
          />
          {dateActive && (
            <button
              onClick={() => pickDatePreset('all')}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg text-slate-500 hover:text-orange-700 hover:bg-orange-50 transition"
              title="Clear the date filter"
            >
              <X size={11} /> Date
            </button>
          )}
        </div>

        {/* Attribute filters */}
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            allLabel="Any status"
            options={summary?.statuses ?? []}
          />
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            allLabel="Any type"
            options={summary?.types ?? []}
          />
          {/* Pointless when you only ever see your own leads. */}
          {!scopedTo && (
            <FilterSelect
              label="BDA"
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              allLabel="All BDAs"
              options={[
                ...(summary?.assignees ?? []).map((a) => ({
                  value: a.email,
                  label: a.name,
                  count: a.leads,
                })),
                ...(summary && summary.summary.unassigned > 0
                  ? [
                      {
                        value: 'unassigned',
                        label: 'Unassigned',
                        count: summary.summary.unassigned,
                      },
                    ]
                  : []),
              ]}
            />
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Sort
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Longest waiting</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* table-fixed is what makes truncation work: without it the Lead column sizes
            to its longest email and pushes the table off-screen. Every column but Lead
            is pinned, so Lead absorbs the remaining width and its text ellipsises. */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-500">
                <th className="py-2.5 pl-3 pr-1 font-semibold w-7" />
                <th className="py-2.5 px-2 font-semibold">Lead</th>
                <th className="py-2.5 px-2 font-semibold w-[130px]">Phone</th>
                <th className="py-2.5 px-2 font-semibold w-[104px]">Type</th>
                <th className="py-2.5 px-2 font-semibold w-[92px]">Status</th>
                {!scopedTo && <th className="py-2.5 px-2 font-semibold w-[104px]">BDA</th>}
                <th className="py-2.5 px-2 font-semibold w-[150px]">Calls</th>
                <th className="py-2.5 pl-2 pr-3 font-semibold text-right w-[150px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-slate-400">
                    <Loader2 size={20} className="animate-spin inline-block" />
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-12 text-center">
                    {activeFilterCount > 0 ? (
                      <>
                        <p className="text-slate-500 text-sm">No leads match these filters.</p>
                        <button
                          onClick={clearFilters}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition"
                        >
                          <X size={12} /> Clear filters
                        </button>
                      </>
                    ) : (
                      <p className="text-slate-500 text-sm">
                        Nothing to call. Every Meta lead older than {coolOff}h has booked a meeting.
                      </p>
                    )}
                  </td>
                </tr>
              )}

              {rows.map((lead) => {
                const isOpen = expanded.has(lead.bookingId);
                const hasPhone = Boolean(lead.clientPhone);
                return (
                  <Fragment key={lead.bookingId}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pl-3 pr-1 align-top">
                        <button
                          onClick={() => toggleExpanded(lead.bookingId)}
                          className="text-slate-400 hover:text-slate-700 mt-0.5"
                          title={isOpen ? 'Hide detail' : 'Show notes and call history'}
                        >
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>

                      {/* Name and email are one identity, so they get one cell. Both
                          truncate rather than widen the table past the viewport. */}
                      <td className="py-2 px-2 align-top min-w-0">
                        <p className="font-semibold text-slate-800 truncate" title={lead.clientName}>
                          {lead.clientName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate" title={lead.clientEmail}>
                          {lead.clientEmail}
                        </p>
                        <p className="text-[10px] text-slate-400">{fmtAge(lead.ageHours)}</p>
                      </td>

                      <td className="py-2 px-2 align-top text-slate-600 whitespace-nowrap">
                        {lead.clientPhone || <span className="text-slate-300">—</span>}
                      </td>

                      <td className="py-2 px-2 align-top">
                        {lead.typeLabel ? (
                          <span
                            className="inline-block max-w-full truncate px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium"
                            title={lead.typeLabel}
                          >
                            {lead.typeLabel}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="py-2 px-2 align-top">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${
                            STATUS_META[lead.status].cls
                          }`}
                          title={STATUS_META[lead.status].hint}
                        >
                          {STATUS_META[lead.status].label}
                        </span>
                      </td>

                      {!scopedTo && (
                        <td className="py-2 px-2 align-top">
                          {lead.assignedBda ? (
                            <span
                              className="inline-flex items-center gap-1 text-slate-700 font-medium max-w-full"
                              title={lead.assignedBda.email}
                            >
                              <UserCheck size={12} className="text-emerald-600 shrink-0" />
                              <span className="truncate">{lead.assignedBda.name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>
                      )}

                      {/* Count, talk time and who called are one fact about one lead —
                          three columns for it was what forced the table off-screen. */}
                      <td className="py-2 px-2 align-top">
                        {lead.calls.count === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div>
                            <p className="font-semibold text-slate-800 whitespace-nowrap">
                              {lead.calls.count} {lead.calls.count === 1 ? 'call' : 'calls'} ·{' '}
                              {fmtDuration(lead.calls.totalDurationSec)}
                            </p>
                            <p
                              className="text-[10px] text-slate-500 truncate"
                              title={lead.calls.callers
                                .map((c) => `${c.name || c.email || 'Unknown'} ×${c.calls}`)
                                .join(', ')}
                            >
                              {lead.calls.callers
                                .map((c) => c.name || c.email || 'Unknown')
                                .join(', ')}
                            </p>
                            <p className="text-[10px] text-slate-400 whitespace-nowrap">
                              {fmtDateTime(lead.calls.lastCallAt)}
                            </p>
                          </div>
                        )}
                      </td>

                      <td className="py-2 pl-2 pr-3 align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setNotesFor(lead.bookingId)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                            title="Add or read notes"
                          >
                            <StickyNote size={11} /> Notes
                            {lead.notesCount > 0 && (
                              <span className="ml-0.5 px-1 rounded-full bg-slate-800 text-white text-[9px] leading-4">
                                {lead.notesCount}
                              </span>
                            )}
                          </button>

                          {hasPhone ? (
                            <CallButton
                              leadPhone={lead.clientPhone}
                              showPicker={false}
                              showPresence={false}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600 transition"
                              title={`Call ${lead.clientPhone} via Zoom Phone`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Phone size={11} /> Call
                              </span>
                            </CallButton>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-400 cursor-not-allowed"
                              title="No phone number on record"
                            >
                              <Phone size={11} /> Call
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td colSpan={colCount} className="px-6 py-4">
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                                Notes ({lead.notesCount})
                              </p>
                              {lead.notes.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No notes yet.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {lead.notes.map((n, i) => (
                                    <li
                                      key={`${n.createdAt}-${i}`}
                                      className="bg-white border border-slate-200 rounded-lg p-2.5"
                                    >
                                      <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                                        {n.text}
                                      </p>
                                      <p className="text-[10px] text-slate-500 mt-1.5">
                                        <span className="font-semibold">{n.authorName}</span> ·{' '}
                                        {fmtDateTime(n.createdAt)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                                Call history ({lead.calls.count})
                              </p>
                              {lead.calls.history.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">
                                  This lead has never been called.
                                </p>
                              ) : (
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-left text-slate-400">
                                      <th className="pb-1 font-semibold">When</th>
                                      <th className="pb-1 font-semibold">Who</th>
                                      <th className="pb-1 font-semibold">Duration</th>
                                      <th className="pb-1 font-semibold">Result</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lead.calls.history.map((h) => (
                                      <tr key={h.callId} className="border-t border-slate-200">
                                        <td className="py-1 text-slate-600 whitespace-nowrap">
                                          {fmtDateTime(h.startedAt)}
                                        </td>
                                        <td className="py-1 text-slate-700">
                                          {h.salesName || h.salesEmail || 'Unknown'}
                                        </td>
                                        <td className="py-1 text-slate-700 font-semibold whitespace-nowrap">
                                          {fmtDuration(h.durationSec)}
                                        </td>
                                        <td className="py-1 text-slate-500">{h.status}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-600">
              Showing <span className="font-semibold">{startItem}</span>–
              <span className="font-semibold">{endItem}</span> of{' '}
              <span className="font-semibold">{totalCount}</span> leads
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-xs text-slate-600 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {activeLead && (
        <CallLeadNotesModal
          lead={activeLead}
          canEdit={mayEdit}
          onClose={() => setNotesFor(null)}
          onAdd={(text) => addNote(activeLead, text)}
        />
      )}
    </div>
  );
}
