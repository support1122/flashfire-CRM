import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { REASON_MAX, REASON_MIN, reasonProblem, resolveFocusTarget, type FocusTarget } from './deductionHelpers';

export type ReasonVariant = 'waive' | 'activate' | 'convert' | 'dismiss';

const COPY: Record<ReasonVariant, { title: string; confirm: string; help: string; tone: string }> = {
  waive: {
    title: 'Waive this deduction',
    confirm: 'Waive deduction',
    help: 'The BDA will see your name, the time and this reason next to the deduction. The record stays and is never deleted.',
    tone: 'bg-slate-800 hover:bg-slate-900 focus-visible:outline-slate-800',
  },
  activate: {
    title: 'Activate this deduction',
    confirm: 'Activate deduction',
    help: 'It will count towards pay and towards the monthly tier from now on. The reason is kept on the record.',
    tone: 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600',
  },
  convert: {
    title: 'Convert to a missed meeting',
    confirm: 'Convert to miss',
    help: 'This creates a missed meeting deduction for the BDA. The reason is kept on the record and shown to them.',
    tone: 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600',
  },
  dismiss: {
    title: 'Dismiss this flag',
    confirm: 'Dismiss flag',
    help: 'Nobody is fined. The flag leaves the review list and the reason is kept for the audit trail.',
    tone: 'bg-slate-800 hover:bg-slate-900 focus-visible:outline-slate-800',
  },
};

interface WaiveDialogProps {
  variant: ReasonVariant;
  /** Who and what this is about, shown above the reason box. */
  subject: { heading: string; details: string[] };
  /** Resolve on success. Throw an Error whose message is safe to show to reject. */
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
  /** Where focus goes on close, when the browser did not focus the trigger button itself. */
  returnFocusTo?: FocusTarget;
}

/**
 * Asks an admin for a written reason (5 to 500 characters) before a deduction or a review flag is
 * changed. Mount it only while it should be open; closing unmounts it, which also clears the text.
 */
export default function WaiveDialog({ variant, subject, onSubmit, onClose, returnFocusTo }: WaiveDialogProps) {
  const copy = COPY[variant];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const titleId = useId();
  const helpId = useId();
  const statusId = useId();

  const trimmedLength = reason.trim().length;
  const problem = reasonProblem(reason);
  // Guidance appears as soon as the admin types; it turns red once they leave the box or try to send.
  const showProblem = problem !== null && (touched || reason.length > 0);
  const flagged = problem !== null && (touched || trimmedLength > REASON_MAX);

  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal; a real browser always does.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    textareaRef.current?.focus();
    const remembered = opener.current;
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      const target = resolveFocusTarget(returnRef.current) ?? resolveFocusTarget(remembered instanceof HTMLElement ? remembered : null);
      target?.focus();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problem !== null || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setServerError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Something went wrong. Nothing was changed.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function requestClose() {
    if (!sendingRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-bold">
              {copy.title}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-slate-700">{subject.heading}</p>
            {subject.details.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">{subject.details.join(' · ')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          <p id={helpId} className="text-sm text-slate-600">
            {copy.help}
          </p>
          <label htmlFor={`${titleId}-reason`} className="block pt-1 text-sm font-semibold text-slate-800">
            Reason
          </label>
          <textarea
            ref={textareaRef}
            id={`${titleId}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            disabled={sending}
            aria-invalid={flagged}
            aria-describedby={statusId}
            className={`block w-full resize-y rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 disabled:bg-slate-50 ${
              flagged ? 'border-red-400' : 'border-slate-300'
            }`}
            placeholder="What did you check, and why does this change the outcome?"
          />
          <div id={statusId} className="flex items-start justify-between gap-3 text-xs">
            <p
              className={flagged ? 'font-medium text-red-700' : showProblem ? 'font-medium text-amber-700' : 'text-slate-500'}
              role={flagged ? 'alert' : undefined}
            >
              {showProblem ? problem : `${REASON_MIN} to ${REASON_MAX} characters.`}
            </p>
            <p
              className={`shrink-0 tabular-nums ${flagged ? 'font-semibold text-red-700' : 'text-slate-500'}`}
              aria-label={`${trimmedLength} of ${REASON_MAX} characters used`}
            >
              {trimmedLength} / {REASON_MAX}
            </p>
          </div>

          {serverError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {serverError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={sending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={problem !== null || sending}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${copy.tone}`}
          >
            {sending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {sending ? 'Saving' : copy.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
