import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mail, Phone, RefreshCw } from 'lucide-react';
import { useAbsenceReports } from '../../api/absence';
import { useAllocationOutcome, useSalesAllocations } from '../../api/salesAllocation';
import type { SalesAllocation } from '../../types/salesAllocation';
import { PENDING_REPORTS, outcomeNotice } from '../attendance/absenceHelpers';
import AbsenceNotice from '../attendance/AbsenceNotice';
import MarkAbsentDialog from '../attendance/MarkAbsentDialog';
import { ActionDialog, StatusBadge } from './shared';
import { errorMessage, useNow } from './helpers';
import { INDIA_ZONE, countdownLabel, dayKeyInZone, formatInZone, zoneCity } from './timeZones';

type Outcome = { row: SalesAllocation; status: 'completed' | 'no_answer' };

function CallCard({
  row,
  now,
  highlight,
  reportPending,
  onOutcome,
  onReport,
}: {
  row: SalesAllocation;
  now: Date;
  highlight: boolean;
  /** This BDA already reported the call and it waits for an admin. */
  reportPending: boolean;
  onOutcome: (o: Outcome) => void;
  onReport: (row: SalesAllocation, trigger: HTMLElement) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const at = new Date(row.callAt);
  const open = row.status === 'scheduled';
  const callOver = at.getTime() <= now.getTime();

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);

  return (
    <li
      ref={ref}
      id={`alloc-${row.allocationId}`}
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        highlight ? 'border-orange-400 ring-2 ring-orange-500' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{row.clientName}</h3>
        <div className="flex items-center gap-2">
          {open && <span className="text-sm font-semibold text-sky-700">{countdownLabel(at, now)}</span>}
          <StatusBadge status={row.status} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {row.phone && (
          <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1.5 text-slate-700 underline-offset-2 hover:underline">
            <Phone size={14} className="text-slate-400" /> {row.phone}
          </a>
        )}
        {row.email && (
          <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1.5 break-all text-slate-700 underline-offset-2 hover:underline">
            <Mail size={14} className="text-slate-400" /> {row.email}
          </a>
        )}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Client time ({zoneCity(row.timezone)})
          </dt>
          <dd className="font-semibold text-slate-900">{formatInZone(at, row.timezone)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">India time</dt>
          <dd className="font-semibold text-slate-900">{formatInZone(at, INDIA_ZONE)}</dd>
        </div>
      </dl>

      {row.notes && <p className="mt-3 break-words text-sm text-slate-600">Note: {row.notes}</p>}
      {row.outcomeNote && <p className="mt-2 break-words text-sm text-slate-500">Outcome: {row.outcomeNote}</p>}

      {open && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOutcome({ row, status: 'completed' })}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Mark completed
          </button>
          <button
            type="button"
            onClick={() => onOutcome({ row, status: 'no_answer' })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            No answer
          </button>
          {callOver &&
            (reportPending ? (
              <span className="inline-flex items-center rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
                Report sent, waiting for review
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => onReport(row, e.currentTarget)}
                aria-label={`Report missed call: ${row.clientName}`}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Report missed call
              </button>
            ))}
        </div>
      )}
    </li>
  );
}

export default function BdaAllocations({ token, highlightId }: { token: string | null; highlightId: string | null }) {
  const query = useSalesAllocations(token, { scope: 'all', status: '', bdaEmail: '' });
  const outcome = useAllocationOutcome(token);
  const [dialog, setDialog] = useState<Outcome | null>(null);
  const [reporting, setReporting] = useState<{ row: SalesAllocation; trigger: HTMLElement } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();
  // A BDA only gets their own reports back, so this is the set of calls they already reported.
  const pendingReports = useAbsenceReports(token, PENDING_REPORTS);
  const reportedIds = useMemo(
    () => new Set((pendingReports.data?.reports ?? []).filter((r) => r.kind === 'allocation').map((r) => r.refId)),
    [pendingReports.data],
  );

  const groups = useMemo(() => {
    const today = dayKeyInZone(now, INDIA_ZONE);
    const rows = [...(query.data?.allocations ?? [])].sort((a, b) => a.callAt.localeCompare(b.callAt));
    const todayRows: SalesAllocation[] = [];
    const upcoming: SalesAllocation[] = [];
    const past: SalesAllocation[] = [];
    for (const r of rows) {
      const isOpen = r.status === 'scheduled';
      const key = dayKeyInZone(new Date(r.callAt), INDIA_ZONE);
      if (r.status === 'cancelled') past.push(r);
      else if (isOpen && key === today) todayRows.push(r);
      else if (isOpen && key > today) upcoming.push(r);
      else past.push(r);
    }
    past.reverse();
    return { today: todayRows, upcoming, past };
  }, [query.data, now]);

  const doneCount = (query.data?.allocations ?? []).filter((r) => r.status === 'completed').length;
  const absentCount = (query.data?.allocations ?? []).filter((r) => r.status === 'absent').length;

  const sections: Array<{ title: string; rows: SalesAllocation[] }> = [
    { title: 'Today', rows: groups.today },
    { title: 'Upcoming', rows: groups.upcoming },
    { title: 'Past', rows: groups.past },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My assigned calls</h1>
          <p className="mt-1 text-sm text-slate-500">Calls an admin booked for you. Times show the client and India side by side.</p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <ul className="flex flex-wrap gap-2" aria-label="Summary">
        {[
          { label: 'Today', n: groups.today.length, cls: 'bg-sky-100 text-sky-800' },
          { label: 'Upcoming', n: groups.upcoming.length, cls: 'bg-slate-200 text-slate-800' },
          { label: 'Done', n: doneCount, cls: 'bg-emerald-100 text-emerald-800' },
          ...(absentCount > 0 ? [{ label: 'Absent', n: absentCount, cls: 'bg-red-100 text-red-800' }] : []),
        ].map((c) => (
          <li key={c.label} className={`rounded-full px-3 py-1 text-sm font-semibold ${c.cls}`}>
            {c.label}: {c.n}
          </li>
        ))}
      </ul>

      <AbsenceNotice message={notice} onDismiss={() => setNotice(null)} />

      {query.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading your calls
        </p>
      ) : query.isError ? (
        <p role="alert" className="py-6 text-sm text-rose-600">
          {errorMessage(query.error, 'Could not load your calls')}
        </p>
      ) : (query.data?.allocations.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">No calls assigned to you yet.</p>
          <p className="mt-1 text-sm text-slate-500">When an admin books a lead for you, it shows up here and in Discord.</p>
        </div>
      ) : (
        sections
          .filter((s) => s.rows.length > 0)
          .map((s) => (
            <section key={s.title} aria-labelledby={`grp-${s.title}`}>
              <h2 id={`grp-${s.title}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {s.title} ({s.rows.length})
              </h2>
              <ul className="space-y-3">
                {s.rows.map((r) => (
                  <CallCard
                    key={r.allocationId}
                    row={r}
                    now={now}
                    highlight={r.allocationId === highlightId}
                    reportPending={reportedIds.has(r.allocationId)}
                    onOutcome={setDialog}
                    onReport={(row, trigger) => setReporting({ row, trigger })}
                  />
                ))}
              </ul>
            </section>
          ))
      )}

      {reporting && (
        <MarkAbsentDialog
          token={token}
          admin={false}
          target={{
            kind: 'allocation',
            refId: reporting.row.allocationId,
            clientName: reporting.row.clientName,
            bdaName: reporting.row.bdaName,
            callStart: reporting.row.callAt,
          }}
          returnFocusTo={reporting.trigger}
          onClose={() => setReporting(null)}
          onDone={(outcome) => setNotice(outcomeNotice(outcome))}
        />
      )}

      {dialog && (
        <ActionDialog
          title={dialog.status === 'completed' ? 'Mark call completed' : 'Mark as no answer'}
          submitLabel={dialog.status === 'completed' ? 'Mark completed' : 'Mark no answer'}
          noteLabel="Note (optional)"
          onClose={() => setDialog(null)}
          onSubmit={(note) =>
            outcome.mutateAsync({ allocationId: dialog.row.allocationId, status: dialog.status, note: note || undefined })
          }
        >
          {dialog.row.clientName}, {formatInZone(new Date(dialog.row.callAt), INDIA_ZONE)}
        </ActionDialog>
      )}
    </div>
  );
}
