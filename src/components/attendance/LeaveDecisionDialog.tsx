import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { useLeaveImpact } from '../../api/leave';
import type { LeaveRequest } from '../../types/leave';
import { REASON_MAX, REASON_MIN, reasonProblem } from './deductionHelpers';
import { RULE_LABEL, fmtDayTime, formatInr } from './format';

interface Props {
  token: string | null;
  request: LeaveRequest;
  decision: 'approve' | 'reject';
  /** Resolve on success. Throw an Error whose message is safe to show. */
  onSubmit: (note: string) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Confirms an admin's decision on a leave request. For an approval it first shows exactly which
 * deductions will be waived and what they are worth, because approving spends money and the admin
 * should see the bill before they agree to it. A rejection requires a written reason; an approval
 * note is optional.
 */
export default function LeaveDecisionDialog({ token, request, decision, onSubmit, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sendingRef = useRef(false);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const titleId = useId();
  const approving = decision === 'approve';

  const impact = useLeaveImpact(token, approving ? request.leaveRequestId : null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);

  const problem = approving ? null : reasonProblem(note);
  const blocked = sending || Boolean(problem);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (blocked || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setServerError(null);
    try {
      await onSubmit(note.trim());
      onClose();
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'That did not work, try again');
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!sending) onClose();
      }}
      onClose={onClose}
      className="w-[min(32rem,92vw)] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={submit} className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {approving ? 'Approve this leave' : 'Reject this leave'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <dl className="mt-3 space-y-1 text-sm text-slate-600">
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">BDA</dt>
            <dd>{request.bdaName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">Days</dt>
            <dd>
              {request.fromDate === request.toDate ? request.fromDate : `${request.fromDate} to ${request.toDate}`} (
              {request.dayCount})
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">Reason</dt>
            <dd className="break-words">{request.reason}</dd>
          </div>
        </dl>

        {approving && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {impact.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Working out what this waives
              </p>
            ) : impact.isError ? (
              <p className="text-sm text-rose-600">Could not load the deductions this would waive.</p>
            ) : impact.data && impact.data.count > 0 ? (
              <>
                <p className="text-sm font-medium text-slate-800">
                  Approving waives {impact.data.count} deduction{impact.data.count === 1 ? '' : 's'} worth{' '}
                  {formatInr(impact.data.amountInr)}.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {impact.data.deductions.slice(0, 8).map((d) => (
                    <li key={d.deductionId} className="flex justify-between gap-2">
                      <span>
                        {RULE_LABEL[d.rule as keyof typeof RULE_LABEL] ?? d.rule} · {fmtDayTime(d.scheduledStart)}
                      </span>
                      <span className="font-medium">{formatInr(d.amountInr)}</span>
                    </li>
                  ))}
                  {impact.data.deductions.length > 8 && (
                    <li className="text-slate-400">and {impact.data.deductions.length - 8} more</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                No deductions exist for these days yet. Approving still stops any from being raised.
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="leave-note" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            {approving ? 'Note (optional)' : 'Reason'}
          </label>
          <textarea
            id="leave-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            maxLength={REASON_MAX + 50}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
            placeholder={approving ? 'Anything the BDA should know' : `Why this is refused (at least ${REASON_MIN} characters)`}
          />
        </div>

        {touched && problem && <p className="mt-2 text-sm text-rose-600">{problem}</p>}
        {serverError && <p className="mt-2 text-sm text-rose-600">{serverError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={blocked}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              approving ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {approving ? 'Approve and waive' : 'Reject request'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
