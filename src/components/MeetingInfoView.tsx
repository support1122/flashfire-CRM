import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, ExternalLink, Video, RefreshCcw, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useCrmAuth } from '../auth/CrmAuthContext';
import type { MeetingAttendanceFields } from '../types/attendance';
import {
  CallChip,
  DeductionChips,
  FlagChips,
  InOutCell,
  MarkedCell,
  StatusUpdatedCell,
  TimeSpentCell,
  TranscriptLink,
} from './attendance/AttendanceCells';
import { legacyToAttendance } from './attendance/legacy';
import { isCrmAdminUser } from './attendance/deductionHelpers';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const DEFAULT_PAGE_SIZE = 15;

interface BdaAttendanceInfo {
  status: 'present' | 'absent' | 'manual' | 'unmarked';
  source: 'auto' | 'manual' | 'scheduler' | 'meet_api';
  bdaName: string;
  bdaEmail: string;
  joinedAt?: string;
  leftAt?: string;
  markedAt?: string;
  durationMs?: number | null;
  cumulativeDurationMs?: number | null;
  /** true when the numbers come from Google Meet conference records */
  verified?: boolean;
  /** firstJoin - scheduledStart; negative = early */
  lateByMs?: number | null;
  sessions?: { startTime?: string | null; endTime?: string | null; durationMs?: number }[];
  participantsAtJoin?: { displayName?: string | null; kind?: string | null }[];
  notes?: string | null;
}

interface MeetingInfoRow extends Partial<MeetingAttendanceFields> {
  bookingId: string;
  clientName: string;
  dateOfMeet: string | null;
  meetingVideoUrl: string | null;
  bdaAbsent: boolean;
  bdaAttendance?: BdaAttendanceInfo | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface MissedMeetingLogRow {
  bookingId: string;
  bdaName: string;
  bdaEmail: string;
  status?: 'absent' | 'unmarked' | string | null;
  source?: string | null;
  notes?: string | null;
  markedAt?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  durationMs?: number | null;
  cumulativeDurationMs?: number | null;
  lateByMs?: number | null;
  verified?: boolean;
  meetLink?: string | null;
  meetingScheduledStart?: string | null;
  meetingScheduledEnd?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  bookingStatus?: string | null;
  meetingVideoUrl?: string | null;
}

/** ms → "1h 12m", "8m", "45s", or "—" */
function formatDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return '—';
  }
}

/** Exact-to-the-second clock time for Google-verified rows */
function fmtTimeExact(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'h:mm:ss a');
  } catch {
    return '—';
  }
}

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MeetingInfoView() {
  const { token, user } = useCrmAuth();
  // Admins see the diagnostic flags; BDAs only see what concerns them.
  // Same rule as the backend: role admin or the isAdmin flag. Holding the bda_admin permission does not make a BDA an admin here.
  const viewerIsAdmin = isCrmAdminUser(user);
  const [rows, setRows] = useState<MeetingInfoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [bdaAbsentCount, setBdaAbsentCount] = useState<number>(0);
  const [missedLogs, setMissedLogs] = useState<MissedMeetingLogRow[]>([]);
  const [loadingMissedLogs, setLoadingMissedLogs] = useState(false);

  const getBookingStatusChip = (status?: string | null) => {
    const value = String(status || '').toLowerCase();
    if (value === 'no-show') return 'bg-rose-100 text-rose-800';
    if (value === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (value === 'scheduled') return 'bg-blue-100 text-blue-800';
    if (value === 'paid') return 'bg-violet-100 text-violet-800';
    return 'bg-slate-100 text-slate-700';
  };

  // A newer request cancels the older one, so changing dates or pages quickly can never let a slow old answer
  // overwrite the newer table or switch the loading spinner off early.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    setLoadingMissedLogs(true);
    setError(null);
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    fetch(`${API_BASE_URL}/api/meeting-links?${params}`, { headers, signal })
      .then((res) => res.json())
      .then(async (data) => {
        // A newer request (page or date change) owns the state from here; every await below re-checks this.
        if (signal.aborted) return;
        if (data.success && Array.isArray(data.data)) {
          // Fetch real BDA attendance data
          const bookingIds = data.data.map((r: MeetingInfoRow) => r.bookingId).filter(Boolean);
          let attendanceMap: Record<string, BdaAttendanceInfo | null> = {};
          if (bookingIds.length > 0) {
            try {
              const attRes = await fetch(
                `${API_BASE_URL}/api/bda-attendance/bulk?bookingIds=${bookingIds.join(',')}`,
                { headers, signal }
              );
              const attData = await attRes.json();
              if (attData.success) attendanceMap = attData.attendanceMap || {};
            } catch {
              // Silently fall back to old heuristic
            }
          }
          if (signal.aborted) return;
          // Merge attendance into rows
          const enrichedRows = data.data.map((row: MeetingInfoRow) => ({
            ...row,
            bdaAttendance: attendanceMap[row.bookingId] || null,
          }));
          setRows(enrichedRows);
          setPagination(data.pagination || null);
          setBdaAbsentCount(typeof data.bdaAbsentCount === 'number' ? data.bdaAbsentCount : 0);
          try {
            const logsRes = await fetch(
              `${API_BASE_URL}/api/bda-attendance/missed-logs?${params.toString()}`,
              { headers, signal }
            );
            const logsData = await logsRes.json();
            if (signal.aborted) return;
            if (logsData.success && Array.isArray(logsData.data)) {
              setMissedLogs(logsData.data);
            } else {
              setMissedLogs([]);
            }
          } catch {
            if (!signal.aborted) setMissedLogs([]);
          } finally {
            if (!signal.aborted) setLoadingMissedLogs(false);
          }
        } else {
          setError(data.message || 'Failed to load');
          setLoadingMissedLogs(false);
        }
      })
      .catch(() => {
        if (signal.aborted) return; // superseded by a newer request, which owns the state now
        setError('Failed to load meeting info');
        setLoadingMissedLogs(false);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [token, fromDate, toDate, page, limit]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const handlePageChange = useCallback((newPage: number) => {
    if (pagination && newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  }, [pagination]);

  const tableColumns = viewerIsAdmin ? 8 : 7;
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
              Completed meetings with client names, dates, recordings and BDA time-in-meeting.
              <span className="text-red-700 font-semibold"> Red</span> = BDA marked absent.
              <span className="text-amber-700 font-semibold"> Amber</span> = no response captured (BDA may have forgotten to mark — not a confirmed absence).
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
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-bold text-slate-900">Missed Meeting Logs</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            DB-stored rows where the BDA was <span className="font-semibold text-red-700">Absent</span> (explicitly marked)
            or <span className="font-semibold text-amber-700">No Response</span> (no attendance captured — BDA may have
            forgotten to mark; not a confirmed absence). In/out time and duration shown when available.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] sm:text-xs table-auto">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Meeting Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Client</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Client Email</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">BDA</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">In Time</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Out Time</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Duration</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingMissedLogs ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <Loader2 className="animate-spin text-orange-500 mx-auto" size={24} />
                  </td>
                </tr>
              ) : (
                missedLogs.map((log) => {
                  const isUnmarked = log.status === 'unmarked';
                  const durationMs = log.durationMs ?? log.cumulativeDurationMs ?? null;
                  return (
                    <tr
                      key={`${log.bookingId}-${log.bdaEmail}-${log.markedAt || ''}`}
                      className={isUnmarked ? 'bg-amber-50/60 hover:bg-amber-50' : 'bg-red-50/60 hover:bg-red-50'}
                    >
                      <td className="px-4 py-3 text-slate-700">
                        {log.meetingScheduledStart ? format(parseISO(log.meetingScheduledStart), 'MMM d, yyyy • h:mm a') : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{log.clientName || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{log.clientEmail || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{log.bdaName || log.bdaEmail || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                              isUnmarked ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isUnmarked ? 'No Response' : 'Absent'}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${getBookingStatusChip(
                              log.bookingStatus
                            )}`}
                          >
                            {log.bookingStatus || 'Unknown'}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                              log.meetingVideoUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.meetingVideoUrl ? 'Video' : 'No Video'}
                          </span>
                          {log.verified && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800"
                              title="Verified from Google Meet conference records"
                            >
                              ✓ Google Meet
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {log.verified ? fmtTimeExact(log.joinedAt) : fmtTime(log.joinedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {log.verified ? fmtTimeExact(log.leftAt) : fmtTime(log.leftAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-semibold">{formatDuration(durationMs)}</td>
                      <td className="px-4 py-3 text-slate-700">{log.notes || (isUnmarked ? 'No response captured' : 'No response')}</td>
                    </tr>
                  );
                })
              )}
              {!loadingMissedLogs && missedLogs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No missed meeting logs in selected date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] sm:text-xs table-auto">
            <caption className="sr-only">Meetings with BDA attendance, calls, status updates and deductions</caption>
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr className="text-left align-bottom">
                <th scope="col" className="sticky left-0 z-10 bg-slate-100 px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Meeting</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Marked</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">In / Out</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Time spent</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Called client</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Status updated</th>
                <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Deductions</th>
                {viewerIsAdmin && <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Flags</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={tableColumns} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin text-orange-500 mx-auto" size={28} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const att = row.attendance ?? (row.bdaAttendance ? legacyToAttendance(row.bdaAttendance) : null);
                  const isAbsent = att ? att.verdict === 'absent' : row.bdaAbsent;
                  const roster = (row.bdaAttendance?.participantsAtJoin || [])
                    .map((p) => p.displayName || 'Unknown')
                    .join(', ');
                  const bdaLabel = row.bdaAttendance?.bdaName || row.bdaAttendance?.bdaEmail;
                  const rowBg = isAbsent ? 'bg-red-50' : 'bg-white';
                  return (
                    <tr key={row.bookingId} className={`align-top transition-colors hover:bg-slate-50 ${rowBg}`}>
                      <th scope="row" className={`sticky left-0 z-10 px-3 py-3 text-left font-normal ${rowBg}`}>
                        <div className="font-semibold text-slate-900 text-xs">{row.clientName}</div>
                        <div className="text-[11px] text-slate-600 whitespace-nowrap">
                          {row.dateOfMeet ? format(parseISO(row.dateOfMeet), 'MMM d, yyyy • h:mm a') : '-'}
                        </div>
                        {bdaLabel && <div className="text-[11px] text-slate-500">BDA: {bdaLabel}</div>}
                        <div className="mt-1.5 flex items-center gap-2">
                          {row.meetingVideoUrl ? (
                            <a
                              href={row.meetingVideoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded text-[11px] font-semibold text-orange-700 hover:text-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                              title={row.meetingVideoUrl}
                            >
                              <ExternalLink size={12} aria-hidden="true" />
                              Recording
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-500">No recording</span>
                          )}
                          <TranscriptLink transcript={row.transcript ?? null} />
                        </div>
                      </th>
                      <td className="px-3 py-3">
                        {att || !row.bdaAbsent ? (
                          <MarkedCell attendance={att} />
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            <AlertTriangle size={11} aria-hidden="true" />
                            Likely absent
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <InOutCell
                          attendance={att}
                          scheduledStart={row.dateOfMeet}
                          title={roster ? `In call when BDA joined: ${roster}` : undefined}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <TimeSpentCell attendance={att} />
                      </td>
                      <td className="px-3 py-3">
                        <CallChip summary={row.callSummary ?? null} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusUpdatedCell statusUpdate={row.statusUpdate ?? null} />
                      </td>
                      <td className="px-3 py-3">
                        <DeductionChips deductions={row.deductions ?? null} viewerIsAdmin={viewerIsAdmin} />
                      </td>
                      {viewerIsAdmin && (
                        <td className="px-3 py-3">
                          <FlagChips attendance={att} />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={tableColumns} className="px-4 py-12 text-center text-slate-500 text-sm">
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
