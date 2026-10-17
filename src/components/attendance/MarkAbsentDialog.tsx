import { useId, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useAbsenceCandidates, useCreateAbsence } from '../../api/absence';
import { useTrackedBdas } from '../../api/attendanceAdmin';
import type { AbsenceCandidate, AbsenceKind, AbsenceReport } from '../../types/absence';
import { useDebounced } from '../salesAllocation/helpers';
import { KIND_LABEL, absenceErrorMessage, istTime, withFriendlyError } from './absenceHelpers';
import type { FocusTarget } from './deductionHelpers';
import WaiveDialog from './WaiveDialog';

/** A call that is already chosen, for example from a row on the Lead Allocation tab. */
export interface AbsenceTarget {
  kind: AbsenceKind;
  refId: string;
  clientName: string;
  bdaName: string;
  callStart: string;
}

interface MarkAbsentDialogProps {
  token: string | null;
  /** Admins fine at once and can pick any BDA's call. A BDA files a report about their own calls. */
  admin: boolean;
  /** Skips the picker and goes straight to the reason. */
  target?: AbsenceTarget;
  /** Starts the picker on this BDA (admins only). */
  defaultBdaEmail?: string;
  returnFocusTo?: FocusTarget;
  onClose: () => void;
  /** Called with the saved report once the server accepted it, just before the dialog closes. */
  onDone: (report: AbsenceReport) => void;
}

const FIELD =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500';

function AdminBdaSelect({ token, value, onChange }: { token: string | null; value: string; onChange: (email: string) => void }) {
  const bdas = useTrackedBdas(token);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600">
        BDA
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1 w-full ${FIELD}`}>
        <option value="">All BDAs</option>
        {(bdas.data?.bdas ?? []).map((b) => (
          <option key={b.email} value={b.email}>
            {b.displayName || b.email}
          </option>
        ))}
      </select>
    </div>
  );
}

function CallPicker({
  token,
  admin,
  defaultBdaEmail,
  selected,
  onSelect,
}: {
  token: string | null;
  admin: boolean;
  defaultBdaEmail: string;
  selected: AbsenceCandidate | null;
  onSelect: (c: AbsenceCandidate | null) => void;
}) {
  const [kind, setKind] = useState<AbsenceKind>('allocation');
  const [bdaEmail, setBdaEmail] = useState(defaultBdaEmail);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const groupName = useId();
  const searchId = useId();
  const query = useAbsenceCandidates(token, { kind, bdaEmail: admin ? bdaEmail : '', q });
  const candidates = query.data?.candidates ?? [];
  // The list may still show the previous search while the next one loads; say so instead of hiding it.
  const settling = q !== search.trim();

  function pickKind(next: AbsenceKind) {
    if (next === kind) return;
    setKind(next);
    onSelect(null);
  }

  return (
    <div className="space-y-3 pb-1 pt-2">
      <div role="group" aria-label="Call type" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(Object.keys(KIND_LABEL) as AbsenceKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickKind(k)}
            aria-pressed={kind === k}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 ${
              kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className={`grid gap-3 ${admin ? 'sm:grid-cols-[minmax(0,12rem)_1fr]' : ''}`}>
        {admin && <AdminBdaSelect token={token} value={bdaEmail} onChange={setBdaEmail} />}
        <div>
          <label htmlFor={searchId} className="block text-xs font-semibold text-slate-600">
            Search
          </label>
          <div className="relative mt-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === 'booking' ? 'Client name, phone, email or booking id' : 'Client name, phone or email'}
              autoComplete="off"
              className={`w-full pl-8 ${FIELD}`}
            />
          </div>
        </div>
      </div>

      <div>
        {query.isPending ? (
          <div role="status" aria-busy="true" className="space-y-2" data-testid="candidates-loading">
            <span className="sr-only">Loading calls</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200/70" />
            ))}
          </div>
        ) : query.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm text-red-800">{absenceErrorMessage(query.error, 'Could not load calls')}</p>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
            >
              {query.isFetching ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
              Try again
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center" data-testid="candidates-empty">
            <p className="text-sm font-semibold text-slate-800">
              {q ? `No ${KIND_LABEL[kind].toLowerCase()} matches "${q}"` : `No ${KIND_LABEL[kind].toLowerCase()} to mark`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Only calls from the last 30 days appear here. Calls that already have a fine or a report are left out.
            </p>
          </div>
        ) : (
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-600">Choose the call</legend>
            <ul className={`max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 ${settling || query.isFetching ? 'opacity-60' : ''}`}>
              {candidates.map((c) => {
                const checked = selected?.kind === c.kind && selected.refId === c.refId;
                return (
                  <li key={`${c.kind}-${c.refId}`}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-orange-500 ${
                        checked ? 'bg-orange-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={groupName}
                        checked={checked}
                        onChange={() => onSelect(c)}
                        className="mt-1 accent-orange-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{c.clientName}</span>
                        <span className="block text-xs text-slate-600">
                          {admin && c.bdaName ? `${c.bdaName} · ` : ''}
                          {istTime(c.callStart)}
                        </span>
                        {c.detail && <span className="block truncate text-xs text-slate-500">{c.detail}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        <p role="status" aria-live="polite" className="mt-1.5 text-xs text-slate-500" data-testid="candidates-count">
          {query.isSuccess ? `${candidates.length} ${candidates.length === 1 ? 'call' : 'calls'} found` : ''}
        </p>
      </div>

      {selected && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="candidate-selected">
          Selected: <span className="font-semibold">{selected.clientName}</span>
          {admin && selected.bdaName ? `, ${selected.bdaName}` : ''}, {istTime(selected.callStart)}
        </p>
      )}
    </div>
  );
}

/**
 * One dialog for both roles. An admin marks a call absent and the fine is written at once. A BDA reports a missed
 * call and an admin decides later. Pass `target` to skip the picker when the call is already known.
 * Mount it only while it should be open; closing unmounts it and clears the picker and the reason.
 */
export default function MarkAbsentDialog({ token, admin, target, defaultBdaEmail = '', returnFocusTo, onClose, onDone }: MarkAbsentDialogProps) {
  const [picked, setPicked] = useState<AbsenceCandidate | null>(null);
  const create = useCreateAbsence(token);
  const chosen: Pick<AbsenceTarget, 'kind' | 'refId'> | null = target ?? picked;

  async function submit(reason: string) {
    if (!chosen) throw new Error('Choose a call first.');
    const { report } = await withFriendlyError(create.mutateAsync({ kind: chosen.kind, refId: chosen.refId, reason }));
    onDone(report);
  }

  const subject = target
    ? {
        heading: target.clientName,
        details: [...(admin ? [target.bdaName] : []), istTime(target.callStart), KIND_LABEL[target.kind]],
      }
    : {
        heading: admin ? 'Fine a BDA for a missed call' : 'Pick the call you could not take',
        details: [],
      };

  return (
    <WaiveDialog
      variant={admin ? 'mark_absent' : 'report_absent'}
      subject={subject}
      onSubmit={submit}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      canSubmit={chosen !== null}
      focusReason={Boolean(target)}
      size={target ? 'md' : 'lg'}
    >
      {!target && <CallPicker token={token} admin={admin} defaultBdaEmail={admin ? defaultBdaEmail : ''} selected={picked} onSelect={setPicked} />}
    </WaiveDialog>
  );
}
