import { useState } from 'react';
import { Power } from 'lucide-react';
import { useDeductionSettings, useSaveDeductionSettings } from '../../api/attendanceAdmin';
import type { DeductionsMode } from '../../types/attendanceAdmin';

// Admin-only switch for the deduction engine. Stored in the database, so it needs no env var on the server.
// Every change asks for one confirmation, because live mode takes money from salaries.

const LABEL: Record<DeductionsMode, string> = { live: 'Live', shadow: 'Shadow', off: 'Off' };
const CONFIRM: Record<DeductionsMode, string> = {
  live: 'Start real fines now? Meetings from this moment are fined per policy (₹500/₹1,000 missed, ₹100 no-show not called, ₹50 status not updated). Earlier meetings are never fined.',
  shadow: 'Switch to shadow mode? Rows are created for admins only and nobody is charged.',
  off: 'Turn fines off? No new deduction rows are created. Existing rows stay and can still be waived.',
};

function fmt(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
}

export default function FinesSwitch({ token }: { token: string | null }) {
  const settings = useDeductionSettings(token, true);
  const save = useSaveDeductionSettings(token);
  const [pending, setPending] = useState<DeductionsMode | null>(null);

  if (settings.isPending) return null;
  if (settings.isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <span>The fines setting could not load.</span>
        <button type="button" onClick={() => settings.refetch()} className="rounded-lg border border-rose-300 bg-white px-3 py-1 font-semibold hover:bg-rose-100">
          Retry
        </button>
      </div>
    );
  }

  const s = settings.data.settings;
  const readOnly = s.source === 'env';
  const tone = s.mode === 'live' ? 'border-emerald-300 bg-emerald-50' : s.mode === 'shadow' ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white';

  return (
    <section aria-labelledby="fines-switch-heading" className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Power size={18} aria-hidden="true" className={s.mode === 'live' ? 'text-emerald-600' : 'text-slate-500'} />
        <div className="min-w-0 flex-1">
          <h2 id="fines-switch-heading" className="text-sm font-bold text-slate-900">
            Fines: {LABEL[s.mode]}
            {s.mode !== 'off' && s.liveFrom ? <span className="font-medium text-slate-600"> since {fmt(s.liveFrom)}</span> : null}
          </h2>
          {readOnly && <p className="text-xs text-slate-600">Set on the server (DEDUCTIONS_MODE), so it cannot be changed here.</p>}
        </div>
        {!readOnly && !pending && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Change fines mode">
            {(['live', 'shadow', 'off'] as DeductionsMode[])
              .filter((m) => m !== s.mode)
              .map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPending(m)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    m === 'live' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {m === 'live' ? 'Start fines (live)' : m === 'shadow' ? 'Shadow mode' : 'Turn off'}
                </button>
              ))}
          </div>
        )}
      </div>
      {pending && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alertdialog" aria-labelledby="fines-confirm-text">
          <p id="fines-confirm-text">{CONFIRM[pending]}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(pending, { onSuccess: () => setPending(null) })}
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : `Yes, ${pending === 'live' ? 'start fines' : pending === 'shadow' ? 'use shadow mode' : 'turn off'}`}
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50">
              Cancel
            </button>
          </div>
          {save.isError && <p className="mt-2 text-rose-700">{save.error instanceof Error ? save.error.message : 'Could not save.'}</p>}
        </div>
      )}
    </section>
  );
}
