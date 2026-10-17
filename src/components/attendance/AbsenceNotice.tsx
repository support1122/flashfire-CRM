import { CheckCircle2, X } from 'lucide-react';

/** A short confirmation after an absence was recorded, reported or decided. Screen readers hear it through role="status". */
export default function AbsenceNotice({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  // The live region stays mounted while empty so the next message is announced.
  return (
    <div role="status" aria-live="polite">
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="absence-notice">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="flex-1">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            className="-m-1 rounded p-1 text-emerald-700 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-700"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
