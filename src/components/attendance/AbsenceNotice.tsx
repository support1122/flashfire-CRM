import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

/** outcomeNotice() words a partly refused batch as "... 1 refused. Name: reason", so that is what turns the notice amber. */
const hasRefusals = (message: string) => /\b\d+ refused\./.test(message);

/** A short confirmation after an absence was recorded, reported or decided. Screen readers hear it through role="status". */
export default function AbsenceNotice({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const warn = message ? hasRefusals(message) : false;
  const Icon = warn ? AlertTriangle : CheckCircle2;
  // The live region stays mounted while empty so the next message is announced.
  return (
    <div role="status" aria-live="polite">
      {message && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            warn ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          data-testid="absence-notice"
        >
          <Icon size={16} className={`mt-0.5 shrink-0 ${warn ? 'text-amber-600' : 'text-emerald-600'}`} aria-hidden="true" />
          <p className="flex-1">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            className={`-m-1 rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 ${
              warn ? 'text-amber-700 hover:bg-amber-100 focus-visible:outline-amber-700' : 'text-emerald-700 hover:bg-emerald-100 focus-visible:outline-emerald-700'
            }`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
