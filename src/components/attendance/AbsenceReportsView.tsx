import { useMemo, useState, type ReactNode } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { useAbsenceReports, useApproveAbsence, useCancelAbsence, useRejectAbsence } from '../../api/absence';
import type { AbsenceReport, AbsenceStatus } from '../../types/absence';
import { formatRelativeTime } from '../../utils/relativeTime';
import { ActionDialog } from '../salesAllocation/shared';
import {
  KIND_LABEL,
  PENDING_REPORTS,
  REPORT_STATUS_CHIP,
  absenceErrorMessage,
  istTime,
  reportStatusLabel,
  sortDecided,
  sortForBda,
  sortPending,
  withFriendlyError,
} from './absenceHelpers';
import { monthLabel } from './deductionHelpers';
import { fmtDayTime } from './format';
import WaiveDialog from './WaiveDialog';

type HistoryFilter = '' | Exclude<AbsenceStatus, 'pending'>;

const HISTORY_OPTIONS: Array<{ value: HistoryFilter; label: string }> = [
  { value: '', label: 'All decided' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Withdrawn' },
];

const BUTTON_FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500';

function StatusChip({ status, admin }: { status: AbsenceStatus; admin: boolean }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${REPORT_STATUS_CHIP[status]}`}>
      {reportStatusLabel(status, admin)}
    </span>
  );
}

function ListState({
  loading,
  error,
  onRetry,
  retrying,
  empty,
  label,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  empty: ReactNode;
  label: string;
}) {
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3" data-testid="reports-loading">
        <span className="sr-only">Loading {label}</span>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-red-900">Could not load {label}</p>
          <p className="mt-0.5 text-sm text-red-800">{absenceErrorMessage(error, 'Try again in a moment.')}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
        >
          {retrying ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
          Try again
        </button>
      </div>
    );
  }
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">{empty}</div>;
}

function ReportCard({ report, admin, actions }: { report: AbsenceReport; admin: boolean; actions?: ReactNode }) {
  const decidedBy = report.decidedByName || 'an admin';
  const adminMarked = report.raisedBy === 'admin';
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="absence-report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {admin && <span className="text-sm font-semibold text-slate-900">{report.bdaName || report.bdaEmail}</span>}
            <StatusChip status={report.status} admin={admin} />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{KIND_LABEL[report.kind]}</span>
          </div>
          <p className="mt-1 break-words text-sm font-medium text-slate-900">{report.clientName}</p>
          <p className="text-xs text-slate-500">
            Call at {istTime(report.callStart)}
            {report.status === 'pending' && (
              <>
                {' · '}
                {adminMarked ? 'Marked' : 'Reported'} {formatRelativeTime(report.createdAt)}
                {admin && !adminMarked ? ' by the BDA' : ''}
              </>
            )}
          </p>
          <p className="mt-2 break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="sr-only">{admin ? 'Reason given: ' : 'Your reason: '}</span>
            {report.reason}
          </p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      {report.status !== 'pending' && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {report.status === 'cancelled' ? (
            <span>{admin ? 'Withdrawn by the BDA' : 'You withdrew this report'}{report.decidedAt ? `, ${fmtDayTime(report.decidedAt)}` : ''}</span>
          ) : (
            <span>
              {reportStatusLabel(report.status, admin)} by <span className="font-medium text-slate-700">{decidedBy}</span>
              {report.decidedAt ? `, ${fmtDayTime(report.decidedAt)}` : ''}
            </span>
          )}
          {report.decisionNote && (
            <span className="mt-1 block">
              {report.status === 'rejected' ? 'Reason' : 'Note'}: {report.decisionNote}
            </span>
          )}
          {adminMarked && admin && <span className="mt-1 block">Marked directly by {report.raisedByName || 'an admin'}.</span>}
          {report.status === 'approved' && !admin && <span className="mt-1 block text-emerald-700">The fine is now on your ledger.</span>}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Admin: review queue and the decided history
// ---------------------------------------------------------------------------

type Decision = { kind: 'approve' | 'reject'; report: AbsenceReport };

function AdminReports({ token, month, onNotice }: { token: string | null; month: string; onNotice: (message: string) => void }) {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('');
  const [decision, setDecision] = useState<Decision | null>(null);

  const pendingQuery = useAbsenceReports(token, PENDING_REPORTS, { poll: true });
  const historyQuery = useAbsenceReports(token, { status: historyFilter, kind: '', bdaEmail: '', month });
  const approve = useApproveAbsence(token);
  const reject = useRejectAbsence(token);

  const pending = useMemo(() => sortPending(pendingQuery.data?.reports ?? []), [pendingQuery.data]);
  const decided = useMemo(
    () => sortDecided((historyQuery.data?.reports ?? []).filter((r) => r.status !== 'pending')),
    [historyQuery.data],
  );

  return (
    <div className="space-y-5">
      <section aria-labelledby="absence-pending-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="absence-pending-heading" className="text-sm font-bold text-slate-900">
            Waiting for review{pendingQuery.isSuccess ? ` (${pendingQuery.data.pendingCount ?? pending.length})` : ''}
          </h2>
          {pendingQuery.isFetching && !pendingQuery.isPending && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" role="status">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Refreshing
            </span>
          )}
        </div>
        {pendingQuery.isPending || pendingQuery.isError || pending.length === 0 ? (
          <ListState
            loading={pendingQuery.isPending}
            error={pendingQuery.error}
            onRetry={() => pendingQuery.refetch()}
            retrying={pendingQuery.isFetching}
            label="reports waiting for review"
            empty={
              <>
                <p className="text-sm font-semibold text-slate-800">Nothing is waiting for review</p>
                <p className="mt-1 text-sm text-slate-500">When a BDA reports a missed call, it lands here.</p>
              </>
            }
          />
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <ReportCard
                key={r.reportId}
                report={r}
                admin
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => setDecision({ kind: 'approve', report: r })}
                      aria-label={`Approve report for ${r.clientName} from ${r.bdaName || r.bdaEmail}`}
                      className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 ${BUTTON_FOCUS}`}
                    >
                      <Check size={14} aria-hidden="true" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision({ kind: 'reject', report: r })}
                      aria-label={`Reject report for ${r.clientName} from ${r.bdaName || r.bdaEmail}`}
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS}`}
                    >
                      <X size={14} aria-hidden="true" /> Reject
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="absence-history-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="absence-history-heading" className="text-sm font-bold text-slate-900">
            Decided in {monthLabel(month)}
          </h2>
          <div>
            <label htmlFor="absence-history-filter" className="block text-xs font-semibold text-slate-600">
              Outcome
            </label>
            <select
              id="absence-history-filter"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500"
            >
              {HISTORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {historyQuery.isPending || historyQuery.isError || decided.length === 0 ? (
          <ListState
            loading={historyQuery.isPending}
            error={historyQuery.error}
            onRetry={() => historyQuery.refetch()}
            retrying={historyQuery.isFetching}
            label="decided reports"
            empty={<p className="text-sm text-slate-600">No decided reports in {monthLabel(month)}.</p>}
          />
        ) : (
          <ul className="space-y-3">
            {decided.map((r) => (
              <ReportCard key={r.reportId} report={r} admin />
            ))}
          </ul>
        )}
      </section>

      {decision?.kind === 'approve' && (
        <ActionDialog
          title="Approve this report"
          submitLabel="Approve and fine"
          noteLabel="Note for the BDA (optional)"
          onClose={() => setDecision(null)}
          onSubmit={async (note) => {
            await withFriendlyError(approve.mutateAsync({ reportId: decision.report.reportId, note: note || undefined }));
            onNotice(`Report approved. The fine for ${decision.report.clientName} was added to the ledger.`);
          }}
        >
          <strong>{decision.report.bdaName || decision.report.bdaEmail}</strong> is fined for the call with{' '}
          <strong>{decision.report.clientName}</strong> on {istTime(decision.report.callStart)}.
        </ActionDialog>
      )}
      {decision?.kind === 'reject' && (
        <WaiveDialog
          variant="reject_report"
          subject={{
            heading: `${decision.report.bdaName || decision.report.bdaEmail}, ${decision.report.clientName}`,
            details: [istTime(decision.report.callStart), KIND_LABEL[decision.report.kind]],
          }}
          onClose={() => setDecision(null)}
          onSubmit={async (reason) => {
            await withFriendlyError(reject.mutateAsync({ reportId: decision.report.reportId, reason }));
            onNotice(`Report rejected. Nobody was fined for ${decision.report.clientName}.`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BDA: my reports
// ---------------------------------------------------------------------------

function MyReports({ token, onNotice }: { token: string | null; onNotice: (message: string) => void }) {
  const query = useAbsenceReports(token, { status: '', kind: '', bdaEmail: '', month: '' });
  const cancel = useCancelAbsence(token);
  const reports = useMemo(() => sortForBda(query.data?.reports ?? []), [query.data]);

  function withdraw(report: AbsenceReport) {
    cancel.mutate(report.reportId, {
      onSuccess: () => onNotice(`Report withdrawn for ${report.clientName}. Nobody was fined.`),
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        These are the missed calls you reported. An admin reviews each one, and a fine only starts after they approve it.
      </p>
      {cancel.isError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {absenceErrorMessage(cancel.error, 'Could not withdraw the report')}
        </p>
      )}
      {query.isPending || query.isError || reports.length === 0 ? (
        <ListState
          loading={query.isPending}
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
          label="your reports"
          empty={
            <>
              <p className="text-sm font-semibold text-slate-800">You have not reported any calls</p>
              <p className="mt-1 text-sm text-slate-500">If you could not take a call, use Report a missed call so an admin can review it.</p>
            </>
          }
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <ReportCard
              key={r.reportId}
              report={r}
              admin={false}
              actions={
                r.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => withdraw(r)}
                    disabled={cancel.isPending}
                    aria-label={`Withdraw report for ${r.clientName}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${BUTTON_FOCUS}`}
                  >
                    {cancel.isPending && cancel.variables === r.reportId && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                    Withdraw
                  </button>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface AbsenceReportsViewProps {
  token: string | null;
  admin: boolean;
  month: string;
  /** Called with a plain-language confirmation after a decision or a withdrawal. The parent shows it. */
  onNotice: (message: string) => void;
}

export default function AbsenceReportsView({ token, admin, month, onNotice }: AbsenceReportsViewProps) {
  return admin ? <AdminReports token={token} month={month} onNotice={onNotice} /> : <MyReports token={token} onNotice={onNotice} />;
}
