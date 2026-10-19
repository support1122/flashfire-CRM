import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CALL_CHECK_CHIP, LABEL_CLASS, STATUS_CHIP, STATUS_LABEL, callCheckInfo, errorMessage } from './helpers';
import { Loader2, X } from 'lucide-react';
import type { AllocationStatus, CallCheck } from '../../types/salesAllocation';

export function StatusBadge({ status }: { status: AllocationStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
  );
}

/** "Called in time", "Not called"... from the Zoom call log. Renders nothing when there is nothing to say. */
export function CallCheckChip({ check, status, callAt, now }: { check: CallCheck | null | undefined; status: AllocationStatus; callAt: string; now: Date }) {
  const info = callCheckInfo(check, status, new Date(callAt).getTime(), now.getTime());
  if (!info) return null;
  return (
    <span className="mt-1 block">
      <span
        title={info.detail}
        data-testid="call-check"
        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${CALL_CHECK_CHIP[info.tone]}`}
      >
        {info.label}
      </span>
      <span className="mt-0.5 block text-xs text-slate-500">{info.detail}</span>
    </span>
  );
}

interface DialogProps {
  title: string;
  /** Resolve on success. Throw an Error whose message is safe to show. */
  onSubmit: (note: string) => Promise<unknown>;
  onClose: () => void;
  submitLabel: string;
  danger?: boolean;
  children?: ReactNode;
  /** When set, shows an optional note box with this label. */
  noteLabel?: string;
}

/** Small modal for confirming an action, optionally with a note. Native <dialog> for focus trap and Esc. */
export function ActionDialog({ title, onSubmit, onClose, submitLabel, danger, children, noteLabel }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sendingRef = useRef(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const noteId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await onSubmit(note.trim());
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'That did not work, try again'));
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
      className="m-auto w-[min(28rem,92vw)] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={submit} className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
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
        {children && <div className="mt-3 text-sm text-slate-600">{children}</div>}
        {noteLabel && (
          <div className="mt-4">
            <label htmlFor={noteId} className={LABEL_CLASS}>
              {noteLabel}
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={sending}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
