import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, UserX } from 'lucide-react';
import { useAbsenceReports } from '../../api/absence';
import {
  useBdaAvailability,
  useCancelAllocation,
  useReassignAllocation,
  useSalesAllocations,
} from '../../api/salesAllocation';
import type { AllocationScope, SalesAllocation } from '../../types/salesAllocation';
import { PENDING_REPORTS, successNotice } from '../attendance/absenceHelpers';
import AbsenceNotice from '../attendance/AbsenceNotice';
import MarkAbsentDialog from '../attendance/MarkAbsentDialog';
import ScheduleCallCard from './ScheduleCallCard';
import { ActionDialog, StatusBadge } from './shared';
import { copyText, errorMessage, useNow } from './helpers';
import { INDIA_ZONE, countdownLabel, formatInZone, zoneCity } from './timeZones';

const TABS: Array<{ key: AllocationScope; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const GRID = 'md:grid md:grid-cols-[1.3fr_1.5fr_1.5fr_1fr_0.9fr_1.6fr] md:items-start md:gap-3';

function ReassignInline({
  token,
  row,
  onDone,
}: {
  token: string | null;
  row: SalesAllocation;
  onDone: () => void;
}) {
  const bdas = useBdaAvailability(token, row.callAt);
  const reassign = useReassignAllocation(token);
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = (bdas.data?.bdas ?? []).filter((b) => b.available && b.email !== row.bdaEmail);

  async function apply() {
    setError(null);
    try {
      await reassign.mutateAsync({ allocationId: row.allocationId, bdaEmail: pick });
      onDone();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not reassign'));
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
      <label className="sr-only" htmlFor={`re-${row.allocationId}`}>
        New BDA for {row.clientName}
      </label>
      {bdas.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Checking who is free
        </p>
      ) : (
        <select
          id={`re-${row.allocationId}`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
        >
          <option value="">{options.length ? 'Choose a BDA' : 'No other BDA is free'}</option>
          {options.map((b) => (
            <option key={b.email} value={b.email}>
              {b.name} ({b.callsThatDay} call{b.callsThatDay === 1 ? '' : 's'})
            </option>
          ))}
        </select>
      )}
      {bdas.isError && <p className="text-xs text-rose-600">{errorMessage(bdas.error, 'Could not load BDAs')}</p>}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={!pick || reassign.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {reassign.isPending && <Loader2 size={12} className="animate-spin" />}
          Reassign
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function AllocationRow({
  token,
  row,
  now,
  highlight,
  reportPending,
  onCancel,
  onMarkAbsent,
}: {
  token: string | null;
  row: SalesAllocation;
  now: Date;
  highlight: boolean;
  /** A BDA already reported this call and it waits for review in the Deductions tab. */
  reportPending: boolean;
  onCancel: (row: SalesAllocation) => void;
  onMarkAbsent: (row: SalesAllocation, trigger: HTMLElement) => void;
}) {
  const [reassigning, setReassigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const at = new Date(row.callAt);
  const open = row.status === 'scheduled';
  const callOver = at.getTime() <= now.getTime();

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);

  async function copy() {
    if (await copyText(row.crmUrl)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <li
      ref={ref}
      id={`alloc-${row.allocationId}`}
      className={`rounded-xl border bg-white p-4 shadow-sm md:rounded-none md:border-0 md:border-b md:border-slate-100 md:p-3 md:shadow-none ${GRID} ${
        highlight ? 'border-orange-400 ring-2 ring-orange-500' : 'border-slate-200'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{row.clientName}</p>
        <p className="truncate text-xs text-slate-500">{[row.phone, row.email].filter(Boolean).join(' · ')}</p>
      </div>
      <p className="mt-2 text-sm text-slate-700 md:mt-0">
        <span className="text-xs text-slate-400 md:hidden">Client: </span>
        {formatInZone(at, row.timezone)}
        <span className="block text-xs text-slate-400">{zoneCity(row.timezone)}</span>
      </p>
      <p className="mt-1 text-sm text-slate-700 md:mt-0">
        <span className="text-xs text-slate-400 md:hidden">India: </span>
        {formatInZone(at, INDIA_ZONE)}
        {open && <span className="block text-xs font-medium text-sky-700">{countdownLabel(at, now)}</span>}
      </p>
      <p className="mt-1 truncate text-sm text-slate-700 md:mt-0">
        <span className="text-xs text-slate-400 md:hidden">BDA: </span>
        {row.bdaName}
      </p>
      <div className="mt-2 md:mt-0">
        <StatusBadge status={row.status} />
        {row.outcomeNote && <p className="mt-1 text-xs text-slate-500">{row.outcomeNote}</p>}
      </div>
      <div className="mt-3 md:mt-0">
        <div className="flex flex-wrap gap-1.5">
          {open && (
            <>
              <button
                type="button"
                onClick={() => setReassigning((v) => !v)}
                aria-expanded={reassigning}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reassign
              </button>
              <button
                type="button"
                onClick={() => onCancel(row)}
                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Cancel
              </button>
              {callOver &&
                (reportPending ? (
                  <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Report waiting for review
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => onMarkAbsent(row, e.currentTarget)}
                    aria-label={`Mark absent: ${row.clientName}, ${row.bdaName}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <UserX size={12} aria-hidden="true" />
                    Mark absent
                  </button>
                ))}
            </>
          )}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy CRM link'}</span>
          </button>
        </div>
        {reassigning && <ReassignInline token={token} row={row} onDone={() => setReassigning(false)} />}
      </div>
    </li>
  );
}

export default function AdminAllocations({
  token,
  highlightId,
  initialScope,
}: {
  token: string | null;
  highlightId: string | null;
  initialScope: AllocationScope;
}) {
  const [scope, setScope] = useState<AllocationScope>(initialScope);
  const [bdaFilter, setBdaFilter] = useState('');
  const [cancelling, setCancelling] = useState<SalesAllocation | null>(null);
  const [absentFor, setAbsentFor] = useState<{ row: SalesAllocation; trigger: HTMLElement } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();
  const cancel = useCancelAllocation(token);

  const query = useSalesAllocations(token, { scope, status: '', bdaEmail: bdaFilter });
  // Unfiltered list feeds the BDA filter options so choosing one does not empty the dropdown.
  const everyone = useSalesAllocations(token, { scope, status: '', bdaEmail: '' });
  const bdaOptions = Array.from(
    new Map((everyone.data?.allocations ?? []).map((a) => [a.bdaEmail, a.bdaName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const rows = query.data?.allocations ?? [];
  // Same request as the Deductions tab badge, so it is shared. Tells us which calls a BDA already reported.
  const pendingReports = useAbsenceReports(token, PENDING_REPORTS);
  const reportedIds = new Set(
    (pendingReports.data?.reports ?? []).filter((r) => r.kind === 'allocation').map((r) => r.refId),
  );

  return (
    <div className="space-y-5">
      <ScheduleCallCard token={token} />

      <AbsenceNotice message={notice} onDismiss={() => setNotice(null)} />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="mr-2 text-sm font-semibold text-slate-900">Allocations</h2>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setScope(t.key)}
              aria-pressed={scope === t.key}
              className={`rounded-lg px-3 py-1 text-sm font-medium ${
                scope === t.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="alloc-bda-filter" className="text-xs font-medium text-slate-500">
              BDA
            </label>
            <select
              id="alloc-bda-filter"
              value={bdaFilter}
              onChange={(e) => setBdaFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
            >
              <option value="">All BDAs</option>
              {bdaOptions.map(([email, name]) => (
                <option key={email} value={email}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-4">
          {query.isLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading calls
            </p>
          ) : query.isError ? (
            <p role="alert" className="py-6 text-sm text-rose-600">
              {errorMessage(query.error, 'Could not load allocations')}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No {scope === 'all' ? '' : `${scope} `}calls{bdaFilter ? ' for this BDA' : ''}.
            </p>
          ) : (
            <>
              <div
                aria-hidden="true"
                className={`hidden border-b border-slate-200 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${GRID}`}
              >
                <span>Client</span>
                <span>Client time</span>
                <span>India time</span>
                <span>BDA</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              <ul className="space-y-3 md:space-y-0">
                {rows.map((r) => (
                  <AllocationRow
                    key={r.allocationId}
                    token={token}
                    row={r}
                    now={now}
                    highlight={r.allocationId === highlightId}
                    reportPending={reportedIds.has(r.allocationId)}
                    onCancel={setCancelling}
                    onMarkAbsent={(row, trigger) => setAbsentFor({ row, trigger })}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {absentFor && (
        <MarkAbsentDialog
          token={token}
          admin
          target={{
            kind: 'allocation',
            refId: absentFor.row.allocationId,
            clientName: absentFor.row.clientName,
            bdaName: absentFor.row.bdaName,
            callStart: absentFor.row.callAt,
          }}
          returnFocusTo={absentFor.trigger}
          onClose={() => setAbsentFor(null)}
          onDone={(report) => setNotice(successNotice(report))}
        />
      )}

      {cancelling && (
        <ActionDialog
          title="Cancel this call"
          submitLabel="Cancel call"
          danger
          onClose={() => setCancelling(null)}
          onSubmit={() => cancel.mutateAsync(cancelling.allocationId)}
        >
          Cancel the call with <strong>{cancelling.clientName}</strong> on{' '}
          {formatInZone(new Date(cancelling.callAt), INDIA_ZONE)}? {cancelling.bdaName} will be told.
        </ActionDialog>
      )}
    </div>
  );
}
