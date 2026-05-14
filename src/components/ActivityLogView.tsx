import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, AlertCircle, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const PAGE_SIZE = 50;

type ActivityLog = {
  _id: string;
  actorEmail: string;
  actorName: string | null;
  actorRole: string;
  action: string;
  label: string | null;
  category: string;
  method: string | null;
  path: string | null;
  url: string | null;
  statusCode: number | null;
  success: boolean;
  durationMs: number | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Filters = {
  search: string;
  actorEmail: string;
  category: string;
  actorRole: string;
  success: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  actorEmail: '',
  category: '',
  actorRole: '',
  success: '',
  from: '',
  to: '',
};

const ROLE_LABELS: Record<string, string> = {
  crm_user: 'CRM User',
  crm_admin: 'Admin',
  bda_extension: 'BDA',
  system: 'System',
  anonymous: 'Anonymous',
};

function methodColor(method: string | null): string {
  switch (method) {
    case 'POST':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'DELETE':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function ActivityRow({ log }: { log: ActivityLog }) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(log.createdAt);

  return (
    <div
      className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 sm:px-6 py-3 flex items-start gap-3"
      >
        <span className="mt-1 text-slate-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${methodColor(log.method)}`}>
              {log.method || '—'}
            </span>
            <span className="text-sm font-semibold text-slate-900 truncate">
              {log.label || log.action}
            </span>
            {!log.success && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                <AlertCircle size={11} /> {log.statusCode || 'error'}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {log.actorName ? `${log.actorName} · ` : ''}
              {log.actorEmail}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {ROLE_LABELS[log.actorRole] || log.actorRole}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{log.category}</span>
            {log.targetId && (
              <span className="truncate max-w-[220px]">
                {log.targetType || 'target'}: <span className="text-slate-700">{log.targetId}</span>
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-xs font-medium text-slate-600" title={format(created, 'PPpp')}>
            {formatDistanceToNow(created, { addSuffix: true })}
          </div>
          {log.durationMs != null && (
            <div className="text-[10px] text-slate-400 mt-0.5">{log.durationMs}ms</div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-6 pb-4 pl-12 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <Detail label="Action key" value={log.action} />
          <Detail label="Path" value={log.path} />
          <Detail label="URL" value={log.url} />
          <Detail label="Status" value={log.statusCode != null ? String(log.statusCode) : null} />
          <Detail label="IP" value={log.ip} />
          <Detail label="Timestamp" value={format(created, 'PPpp')} />
          <Detail label="User agent" value={log.userAgent} full />
          {log.metadata != null && (
            <div className="sm:col-span-2 mt-1">
              <div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px] mb-1">
                Metadata
              </div>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <span className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">{label}: </span>
      <span className="text-slate-700 break-all">{value}</span>
    </div>
  );
}

export default function ActivityLogView() {
  const { token } = useCrmAuth();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');

  const [filterOptions, setFilterOptions] = useState<{
    actorEmails: string[];
    categories: string[];
    roles: string[];
  }>({ actorEmails: [], categories: [], roles: [] });

  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce the free-text search into the filters object.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }));
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const buildQuery = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (cursor) params.set('cursor', cursor);
      if (filters.search) params.set('search', filters.search);
      if (filters.actorEmail) params.set('actorEmail', filters.actorEmail);
      if (filters.category) params.set('category', filters.category);
      if (filters.actorRole) params.set('actorRole', filters.actorRole);
      if (filters.success) params.set('success', filters.success);
      if (filters.from) params.set('from', new Date(filters.from).toISOString());
      if (filters.to) params.set('to', new Date(filters.to).toISOString());
      return params.toString();
    },
    [filters]
  );

  const fetchLogs = useCallback(
    async (cursor: string | null) => {
      if (!token) {
        setError('Session not found. Please log in again.');
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE_URL}/api/crm/activity-logs?${buildQuery(cursor)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
          throw new Error(body?.error || 'Failed to load activity logs');
        }
        setLogs((prev) => (cursor ? [...prev, ...body.items] : body.items));
        setNextCursor(body.nextCursor || null);
        setHasMore(Boolean(body.hasMore));
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load activity logs');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, buildQuery]
  );

  // Reload from scratch whenever filters change.
  useEffect(() => {
    fetchLogs(null);
    return () => abortRef.current?.abort();
  }, [fetchLogs]);

  // Load filter dropdown options once.
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/crm/activity-logs/filters`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((b) => {
        if (b?.success) {
          setFilterOptions({
            actorEmails: b.actorEmails || [],
            categories: b.categories || [],
            roles: b.roles || [],
          });
        }
      })
      .catch(() => {});
  }, [token]);

  // Infinite scroll: observe the sentinel, fetch the next page when it nears viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && nextCursor) {
          fetchLogs(nextCursor);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, nextCursor, fetchLogs]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
  };

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([, v]) => v).length,
    [filters]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white rounded-xl p-3">
            <Activity size={18} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Activity Log</h2>
            <p className="text-sm text-slate-600">Every action across the CRM — who, what, when</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs(null)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search email, action, target…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <select
            value={filters.actorEmail}
            onChange={(e) => updateFilter('actorEmail', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All users</option>
            {filterOptions.actorEmails.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <select
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All categories</option>
            {filterOptions.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filters.actorRole}
            onChange={(e) => updateFilter('actorRole', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All roles</option>
            {filterOptions.roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>

          <select
            value={filters.success}
            onChange={(e) => updateFilter('success', e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Any result</option>
            <option value="true">Success only</option>
            <option value="false">Failed only</option>
          </select>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">From</label>
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">To</label>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Clear{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {error && (
          <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600" />
            <p className="text-red-700 text-sm font-semibold">{error}</p>
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading activity…</div>
        ) : logs.length === 0 && !error ? (
          <div className="p-12 text-center text-slate-500 text-sm">No activity matches these filters.</div>
        ) : (
          <div>
            {logs.map((log) => (
              <ActivityRow key={log._id} log={log} />
            ))}
          </div>
        )}

        {/* Infinite-scroll sentinel */}
        <div ref={sentinelRef} />

        {loadingMore && <div className="p-4 text-center text-slate-400 text-xs">Loading more…</div>}
        {!hasMore && logs.length > 0 && (
          <div className="p-4 text-center text-slate-300 text-xs">End of activity</div>
        )}
      </div>
    </div>
  );
}
