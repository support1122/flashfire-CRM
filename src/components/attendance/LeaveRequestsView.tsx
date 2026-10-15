import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import {
  useCancelLeaveRequest,
  useCreateLeaveRequest,
  useDecideLeaveRequest,
  useLeaveRequests,
} from '../../api/leave';
import type { LeaveRequest, LeaveStatus } from '../../types/leave';
import { isCrmAdminUser, REASON_MAX, REASON_MIN, reasonProblem } from './deductionHelpers';
import { formatInr } from './format';
import LeaveDecisionDialog from './LeaveDecisionDialog';

const STATUS_CHIP: Record<LeaveStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function dayRange(r: LeaveRequest): string {
  return r.fromDate === r.toDate ? r.fromDate : `${r.fromDate} to ${r.toDate}`;
}

// ---------------------------------------------------------------------------
// BDA: file a request
// ---------------------------------------------------------------------------

function RequestForm({ token }: { token: string | null }) {
  const create = useCreateLeaveRequest(token);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const problem = reasonProblem(reason);
  const datesMissing = !fromDate;
  const backwards = Boolean(fromDate && toDate && toDate < fromDate);
  const blocked = Boolean(problem) || datesMissing || backwards || create.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    setDone(null);
    if (blocked) return;
    try {
      const res = await create.mutateAsync({ fromDate, toDate: toDate || fromDate, reason: reason.trim() });
      setDone(`Request filed for ${dayRange(res.request)}. An admin will review it.`);
      setFromDate('');
      setToDate('');
      setReason('');
      setTouched(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not file the request');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Request leave</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick the days you were, or will be, away and say why. Once an admin approves it, deductions for
        meetings on those days are waived and no new ones are raised. Past days are allowed, which is how a
        deduction you already picked up gets cleared.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="leave-from" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            First day
          </label>
          <input
            id="leave-from"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              if (toDate && e.target.value && toDate < e.target.value) setToDate(e.target.value);
            }}
            required
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <div>
          <label htmlFor="leave-to" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Last day <span className="font-normal normal-case text-slate-400">(same day if left empty)</span>
          </label>
          <input
            id="leave-to"
            type="date"
            min={fromDate || undefined}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="leave-reason" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Reason
        </label>
        <textarea
          id="leave-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={3}
          maxLength={REASON_MAX + 50}
          placeholder="Why you need these days off"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
        />
        <p className="mt-1 text-xs text-slate-400">
          {reason.trim().length}/{REASON_MAX} characters, at least {REASON_MIN}.
        </p>
      </div>

      {touched && problem && <p className="mt-2 text-sm text-rose-600">{problem}</p>}
      {backwards && <p className="mt-2 text-sm text-rose-600">The last day cannot be before the first day.</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {done && <p className="mt-2 text-sm text-emerald-700">{done}</p>}

      <button
        type="submit"
        disabled={blocked}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {create.isPending && <Loader2 size={14} className="animate-spin" />}
        Send request
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

function RequestCard({
  request,
  admin,
  onDecide,
  onCancel,
  cancelling,
}: {
  request: LeaveRequest;
  admin: boolean;
  onDecide: (r: LeaveRequest, decision: 'approve' | 'reject') => void;
  onCancel: (r: LeaveRequest) => void;
  cancelling: boolean;
}) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {admin && <span className="text-sm font-semibold text-slate-900">{request.bdaName}</span>}
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[request.status]}`}>
              {STATUS_LABEL[request.status]}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
            <CalendarDays size={14} className="shrink-0 text-slate-400" />
            {dayRange(request)}
            <span className="text-slate-400">
              ({request.dayCount} day{request.dayCount === 1 ? '' : 's'})
            </span>
          </p>
          <p className="mt-1 break-words text-sm text-slate-600">{request.reason}</p>
        </div>

        {request.status === 'pending' && (
          <div className="flex shrink-0 gap-2">
            {admin ? (
              <>
                <button
                  type="button"
                  onClick={() => onDecide(request, 'approve')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => onDecide(request, 'reject')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <X size={14} /> Reject
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onCancel(request)}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {cancelling && <Loader2 size={14} className="animate-spin" />}
                Withdraw
              </button>
            )}
          </div>
        )}
      </div>

      {request.status !== 'pending' && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {request.decidedByName || request.decidedBy ? (
            <span>
              {STATUS_LABEL[request.status]} by{' '}
              <span className="font-medium text-slate-700">{request.decidedByName || request.decidedBy}</span>
            </span>
          ) : (
            <span>{STATUS_LABEL[request.status]}</span>
          )}
          {request.decisionNote && <span className="block mt-1">Note: {request.decisionNote}</span>}
          {request.status === 'approved' && (
            <span className="mt-1 block text-emerald-700">
              {request.waivedDeductionIds.length === 0
                ? 'No deductions needed waiving for these days.'
                : `Waived ${request.waivedDeductionIds.length} deduction${
                    request.waivedDeductionIds.length === 1 ? '' : 's'
                  } worth ${formatInr(request.waivedAmountInr)}.`}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

export default function LeaveRequestsView() {
  const { user, token } = useCrmAuth();
  const admin = isCrmAdminUser(user);
  const [filter, setFilter] = useState(admin ? 'pending' : 'all');
  const [dialog, setDialog] = useState<{ request: LeaveRequest; decision: 'approve' | 'reject' } | null>(null);

  const query = useLeaveRequests(token, filter, '');
  const decide = useDecideLeaveRequest(token);
  const cancel = useCancelLeaveRequest(token);

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const serverAdmin = query.data?.admin ?? admin;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave</h1>
          <p className="mt-1 text-sm text-slate-500">
            {serverAdmin
              ? 'Approve a request and every deduction for those days is waived automatically.'
              : 'Ask for days off. Approved days never earn a deduction.'}
          </p>
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

      {!serverAdmin && <RequestForm token={token} />}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="mr-2 text-sm font-semibold text-slate-900">
            {serverAdmin ? 'All requests' : 'Your requests'}
          </h2>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-lg px-3 py-1 text-sm font-medium ${
                filter === f.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {query.isLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading requests
            </p>
          ) : query.isError ? (
            <p className="py-6 text-sm text-rose-600">
              {query.error instanceof Error ? query.error.message : 'Could not load leave requests'}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No {filter === 'all' ? '' : `${filter} `}requests.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <RequestCard
                  key={r.leaveRequestId}
                  request={r}
                  admin={serverAdmin}
                  onDecide={(request, decision) => setDialog({ request, decision })}
                  onCancel={(request) => cancel.mutate(request.leaveRequestId)}
                  cancelling={cancel.isPending && cancel.variables === r.leaveRequestId}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {dialog && (
        <LeaveDecisionDialog
          token={token}
          request={dialog.request}
          decision={dialog.decision}
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            await decide.mutateAsync({
              leaveRequestId: dialog.request.leaveRequestId,
              decision: dialog.decision,
              note,
            });
          }}
        />
      )}
    </div>
  );
}
