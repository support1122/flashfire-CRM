import { useEffect, useState, useCallback } from 'react';
import { Loader2, ExternalLink, Video, RefreshCcw, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const DEFAULT_PAGE_SIZE = 15;

interface MeetingInfoRow {
  bookingId: string;
  clientName: string;
  dateOfMeet: string | null;
  meetingVideoUrl: string | null;
  bdaAbsent: boolean;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export default function MeetingInfoView() {
  const { token } = useCrmAuth();
  const [rows, setRows] = useState<MeetingInfoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [bdaAbsentCount, setBdaAbsentCount] = useState<number>(0);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    fetch(`${API_BASE_URL}/api/meeting-links?${params}`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setRows(data.data);
          setPagination(data.pagination || null);
          setBdaAbsentCount(typeof data.bdaAbsentCount === 'number' ? data.bdaAbsentCount : 0);
        } else {
          setError(data.message || 'Failed to load');
        }
      })
      .catch(() => setError('Failed to load meeting info'))
      .finally(() => setLoading(false));
  }, [token, fromDate, toDate, page, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePageChange = useCallback((newPage: number) => {
    if (pagination && newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  }, [pagination]);

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const startItem = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalCount);

  return (
    <div className="p-6 space-y-6 bg-white">
      <div className="bg-gray-50 border border-slate-200 px-6 py-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Video className="text-orange-500" size={28} />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Meeting Info</p>
            <h1 className="text-3xl font-bold text-slate-900">Meeting Info</h1>
            <p className="text-slate-600 max-w-2xl mt-1">
              Completed meetings with client names, dates, and video recordings. Rows highlighted in red indicate BDA was absent (no recording 2+ hours after meet).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-slate-200 px-5 py-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="border border-slate-200 px-3 py-2 bg-white rounded-lg text-slate-800"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="border border-slate-200 px-3 py-2 bg-white rounded-lg text-slate-800"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
            className="text-[11px] text-orange-600 font-semibold px-3 py-2 hover:bg-orange-50 rounded-lg transition"
          >
            Clear dates
          </button>
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold">Per page</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="border border-slate-200 px-2 py-2 bg-white rounded-lg text-slate-800"
            >
              {[10, 15, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-[11px] font-semibold disabled:opacity-60"
          >
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {totalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle size={14} className="text-red-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-red-700">
                {bdaAbsentCount} BDA absent
                {(fromDate || toDate) && ' in filter range'}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-orange-50 border border-orange-200 p-4 text-orange-700">{error}</div>
      )}

      <div className="overflow-hidden bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] sm:text-xs table-auto">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Client Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Date of Meet</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Google Drive Video URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin text-orange-500 mx-auto" size={28} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.bookingId}
                    className={`transition-colors ${
                      row.bdaAbsent
                        ? 'bg-red-50 hover:bg-red-100/80'
                        : 'bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{row.clientName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.dateOfMeet
                        ? format(parseISO(row.dateOfMeet), 'MMM d, yyyy • h:mm a')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.meetingVideoUrl ? (
                        <a
                          href={row.meetingVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-orange-600 hover:text-orange-700 font-semibold truncate max-w-[320px]"
                          title={row.meetingVideoUrl}
                        >
                          <ExternalLink size={12} />
                          {(() => {
                            const d = row.meetingVideoUrl.replace(/^https?:\/\//, '');
                            return d.length > 45 ? `${d.slice(0, 45)}…` : d;
                          })()}
                        </a>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            row.bdaAbsent ? 'text-red-700' : 'text-slate-500'
                          }`}
                        >
                          {row.bdaAbsent && <AlertTriangle size={14} />}
                          {row.bdaAbsent ? 'BDA absent for meet' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-500 text-sm">
                    No completed meetings yet. Meetings will appear here once they have ended.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-600">
              Showing <span className="font-semibold">{startItem}</span>–<span className="font-semibold">{endItem}</span> of{' '}
              <span className="font-semibold">{totalCount}</span> meetings
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={!canPrev}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-slate-600 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
