import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, format, parse } from 'date-fns';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { fetchMyMonth } from '../../api/attendance';
import {
  CallChip,
  DeductionChips,
  InOutCell,
  MarkedCell,
  StatusUpdatedCell,
  TimeSpentCell,
  TranscriptLink,
} from './AttendanceCells';
import { fmtDayTime, formatInr } from './format';
import { summarise } from './summary';

const MONTH_FMT = 'yyyy-MM';

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/**
 * A tracked BDA's own month: each meeting with present or absent, calls, status update and deductions.
 * Uses the same cells as the Meeting Info table, so the two never disagree about how a fact is shown.
 */
export default function MyAttendancePanel({ initialMonth }: { initialMonth?: string }) {
  const { token, user } = useCrmAuth();
  const currentMonth = format(new Date(), MONTH_FMT);
  const [month, setMonth] = useState(initialMonth ?? currentMonth);

  const query = useQuery({
    queryKey: ['attendance', 'my-month', user?.email ?? null, month],
    queryFn: ({ signal }) => fetchMyMonth(token, month, signal),
    enabled: !!token,
  });

  const monthDate = parse(month, MONTH_FMT, new Date());
  const shift = (delta: number) => setMonth(format(addMonths(monthDate, delta), MONTH_FMT));
  const rows = query.data?.rows ?? [];
  const sum = summarise(rows);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">My attendance</h2>
          <p className="text-xs text-slate-600">Your meetings, what the system recorded, and any deductions.</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Choose month">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-900" aria-live="polite">
            {format(monthDate, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={month >= currentMonth}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {query.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600" aria-busy="true">
          <Loader2 size={18} className="animate-spin motion-reduce:animate-none text-orange-500" aria-hidden="true" />
          Loading your month
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={16} aria-hidden="true" />
          <span>Could not load your attendance for this month.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded-md border border-red-300 bg-white px-3 py-1 font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Meetings" value={sum.meetings} />
            <Stat label="Present" value={sum.present} tone="text-emerald-700" />
            <Stat label="Absent" value={sum.absent} tone={sum.absent > 0 ? 'text-red-700' : 'text-slate-900'} />
            <Stat label="Not called" value={sum.notCalled} tone={sum.notCalled > 0 ? 'text-rose-700' : 'text-slate-900'} />
            <Stat label="Stuck on scheduled" value={sum.stuck} tone={sum.stuck > 0 ? 'text-amber-700' : 'text-slate-900'} />
            <Stat label="Deductions" value={formatInr(sum.activeInr)} tone={sum.activeInr > 0 ? 'text-red-700' : 'text-slate-900'} />
          </dl>
          {sum.underReview > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {sum.underReview} {sum.underReview === 1 ? 'deduction is' : 'deductions are'} under review. They do not count in the total until an admin confirms them.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-xs">
                <caption className="sr-only">Your meetings in {format(monthDate, 'MMMM yyyy')}</caption>
                <thead className="border-b border-slate-200 bg-slate-100">
                  <tr className="text-left align-bottom">
                    <th scope="col" className="sticky left-0 z-10 bg-slate-100 px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Meeting</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Marked</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">In / Out</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Time spent</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Called client</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Status updated</th>
                    <th scope="col" className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Deductions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                        No meetings were assigned to you in {format(monthDate, 'MMMM yyyy')}.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const absent = r.attendance?.verdict === 'absent';
                      const rowBg = absent ? 'bg-red-50' : 'bg-white';
                      return (
                        <tr key={r.bookingId} className={`align-top hover:bg-slate-50 ${rowBg}`}>
                          <th scope="row" className={`sticky left-0 z-10 px-3 py-3 text-left font-normal ${rowBg}`}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-900">{r.clientName}</span>
                              <TranscriptLink transcript={r.transcript} />
                            </div>
                            <div className="text-[11px] text-slate-600 whitespace-nowrap">{fmtDayTime(r.scheduledStart)}</div>
                          </th>
                          <td className="px-3 py-3"><MarkedCell attendance={r.attendance} /></td>
                          <td className="px-3 py-3"><InOutCell attendance={r.attendance} scheduledStart={r.scheduledStart} /></td>
                          <td className="px-3 py-3"><TimeSpentCell attendance={r.attendance} /></td>
                          <td className="px-3 py-3"><CallChip summary={r.callSummary} /></td>
                          <td className="px-3 py-3"><StatusUpdatedCell statusUpdate={r.statusUpdate} /></td>
                          <td className="px-3 py-3"><DeductionChips deductions={r.deductions} /></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
