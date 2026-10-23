import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useAbsenceCandidates, useCreateAbsence, useCreateAbsenceBatch } from '../../api/absence';
import { useTrackedBdas } from '../../api/attendanceAdmin';
import type { AbsenceCandidate, AbsenceKind, AbsenceOutcome } from '../../types/absence';
import { useDebounced } from '../salesAllocation/helpers';
import { CallCheckChip } from '../salesAllocation/shared';
import { BATCH_MAX, KIND_LABEL, absenceErrorMessage, candidateKey, istTime, refusalMessage, withFriendlyError } from './absenceHelpers';
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
  /** Called with what was saved and what the server refused, just before the dialog closes. */
  onDone: (outcome: AbsenceOutcome) => void;
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

const BLOCKED_LABEL: Record<NonNullable<AbsenceCandidate['blockedReason']>, string> = {
  fined: 'Already fined',
  reported: 'Report open',
  leave: 'On leave',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
};

function CallPicker({
  token,
  admin,
  defaultBdaEmail,
  selected,
  onChange,
}: {
  token: string | null;
  admin: boolean;
  defaultBdaEmail: string;
  selected: Map<string, AbsenceCandidate>;
  onChange: (next: Map<string, AbsenceCandidate>) => void;
}) {
  const [kind, setKind] = useState<AbsenceKind>('allocation');
  const [bdaEmail, setBdaEmail] = useState(defaultBdaEmail);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useDebounced(search.trim(), 300);
  const searchId = useId();
  const fromId = useId();
  const toId = useId();
  const allRef = useRef<HTMLInputElement>(null);
  // An admin can mark a call that has not started yet, up to a week ahead (the server enforces it too).
  const aheadLimit = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 7 * 86_400_000));
  const backwards = Boolean(from && to && from > to);
  const query = useAbsenceCandidates(token, { kind, bdaEmail: admin ? bdaEmail : '', q, from, to }, !backwards);
  const listed = query.data?.candidates ?? [];
  const candidates = listed.filter((c) => !c.blockedReason);
  const shownSelected = candidates.filter((c) => selected.has(candidateKey(c))).length;
  const allShown = candidates.length > 0 && shownSelected === candidates.length;
  const atLimit = selected.size >= BATCH_MAX;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = shownSelected > 0 && !allShown;
  }, [shownSelected, allShown]);
  // The list may still show the previous search while the next one loads; say so instead of hiding it.
  const settling = q !== search.trim();

  function toggle(c: AbsenceCandidate) {
    const next = new Map(selected);
    const key = candidateKey(c);
    if (next.has(key)) next.delete(key);
    else if (next.size < BATCH_MAX) next.set(key, c);
    onChange(next);
  }

  function toggleAllShown() {
    const next = new Map(selected);
    if (allShown) {
      for (const c of candidates) next.delete(candidateKey(c));
    } else {
      for (const c of candidates) if (next.size < BATCH_MAX) next.set(candidateKey(c), c);
    }
    onChange(next);
  }

  return (
    <div className="space-y-3 pb-1 pt-2">
      <div role="group" aria-label="Call type" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(Object.keys(KIND_LABEL) as AbsenceKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_auto] sm:items-end">
        <div>
          <label htmlFor={fromId} className="block text-xs font-semibold text-slate-600">
            From date
          </label>
          <input id={fromId} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`mt-1 w-full ${FIELD}`} />
        </div>
        <div>
          <label htmlFor={toId} className="block text-xs font-semibold text-slate-600">
            To date
          </label>
          <input
            id={toId}
            type="date"
            value={to}
            min={from || undefined}
            max={admin ? aheadLimit : undefined}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 w-full ${FIELD}`}
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="col-span-2 justify-self-start rounded-lg px-2 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 sm:col-span-1"
          >
            Clear dates
          </button>
        )}
      </div>
      {backwards && (
        <p role="alert" className="text-xs font-medium text-red-700">
          The From date is after the To date.
        </p>
      )}

      <div>
        {query.isPending && !backwards ? (
          <div role="status" aria-busy="true" className="space-y-2" data-testid="candidates-loading">
            <span className="sr-only">Loading calls</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200/70" />
            ))}
          </div>
        ) : backwards ? null : query.isError ? (
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
        ) : listed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center" data-testid="candidates-empty">
            <p className="text-sm font-semibold text-slate-800">
              {q ? `No ${KIND_LABEL[kind].toLowerCase()} matches "${q}"` : `No ${KIND_LABEL[kind].toLowerCase()} to mark`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {admin ? 'Calls from the last 30 days, and the rest of today, appear here. Pick a later To date (up to a week ahead) to see calls that have not happened yet.' : 'Only calls from the last 30 days appear here.'}
            </p>
          </div>
        ) : (
          <fieldset className="min-w-0">
            <legend className="sr-only">Choose the calls</legend>
            <label className="mb-1 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-orange-500">
              <input ref={allRef} type="checkbox" checked={allShown} onChange={toggleAllShown} className="accent-orange-600" />
              Select all {candidates.length} that can be marked
            </label>
            <ul className={`max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 ${settling || query.isFetching ? 'opacity-60' : ''}`}>
              {listed.map((c) => {
                const checked = selected.has(candidateKey(c));
                const why = c.blockedReason ? BLOCKED_LABEL[c.blockedReason] : null;
                const blocked = Boolean(why) || (!checked && atLimit);
                return (
                  <li key={`${c.kind}-${c.refId}`}>
                    <label
                      className={`flex items-start gap-3 px-3 py-2.5 ${blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-orange-500 ${
                        checked ? 'bg-orange-50' : why ? '' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggle(c)}
                        className="mt-1 accent-orange-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{c.clientName}</span>
                        <span className="block text-xs text-slate-600">
                          {admin && c.bdaName ? `${c.bdaName} · ` : ''}
                          {istTime(c.callStart)}
                          {why && (
                            <span className="ml-2 inline-flex rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700" data-testid="blocked-chip">
                              {why}
                            </span>
                          )}
                          {c.upcoming && (
                            <span className="ml-2 inline-flex rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800" data-testid="upcoming-chip">
                              Upcoming
                            </span>
                          )}
                        </span>
                        {c.detail && <span className="block truncate text-xs text-slate-500">{c.detail}</span>}
                        {c.kind === 'allocation' && <CallCheckChip check={c.callCheck} status="scheduled" callAt={c.callStart} now={new Date()} />}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        <p role="status" aria-live="polite" className="mt-1.5 text-xs text-slate-500" data-testid="candidates-count">
          {query.isSuccess
            ? `${listed.length} ${listed.length === 1 ? 'call' : 'calls'} found${listed.length > candidates.length ? `, ${candidates.length} can be marked` : ''}`
            : ''}
        </p>
      </div>

      {[...selected.values()].some((c) => c.upcoming) && (
        <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="upcoming-warning">
          {[...selected.values()].filter((c) => c.upcoming).length} of these have not happened yet. The fine is written now. If a meeting is canceled or the BDA does attend, an admin has to waive it.
        </p>
      )}

      {selected.size > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="candidate-selected">
          <p>
            {selected.size === 1 ? (
              (() => {
                const only = [...selected.values()][0];
                return (
                  <>
                    Selected: <span className="font-semibold">{only.clientName}</span>
                    {admin && only.bdaName ? `, ${only.bdaName}` : ''}, {istTime(only.callStart)}
                  </>
                );
              })()
            ) : (
              <>
                <span className="font-semibold">{selected.size} calls selected</span>
                {atLimit ? ` (the most you can send at once is ${BATCH_MAX})` : ''}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => onChange(new Map())}
            className="shrink-0 rounded px-1.5 py-0.5 font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500"
          >
            Clear
          </button>
        </div>
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
  const [picked, setPicked] = useState<Map<string, AbsenceCandidate>>(new Map());
  // Admin only: mark the call even if attendance shows the BDA joined. Off by default, and the server refuses without it.
  const [force, setForce] = useState(false);
  const create = useCreateAbsence(token);
  const createMany = useCreateAbsenceBatch(token);
  const count = target ? 1 : picked.size;

  async function submit(reason: string) {
    if (target) {
      const { report } = await withFriendlyError(create.mutateAsync({ kind: target.kind, refId: target.refId, reason, ...(admin && force ? { force: true } : {}) }));
      onDone({ saved: [report], failed: [] });
      return;
    }
    if (picked.size === 0) throw new Error('Choose at least one call first.');
    const items = [...picked.values()];
    const res = await withFriendlyError(createMany.mutateAsync({ items: items.map((c) => ({ kind: c.kind, refId: c.refId })), reason, ...(admin && force ? { force: true } : {}) }));
    const names = new Map(items.map((c) => [candidateKey(c), c.clientName]));
    const saved = res.results.flatMap((r) => (r.ok && r.report ? [r.report] : []));
    const failed = res.results.flatMap((r) =>
      r.ok ? [] : [{ clientName: names.get(candidateKey(r)) ?? 'A call', message: refusalMessage(r.error) }],
    );
    // Nothing went through: keep the dialog open with the reasons, so the person can fix the selection and retry.
    if (saved.length === 0) throw new Error(failed.map((f) => `${f.clientName}: ${f.message}`).join(' ') || 'Nothing was saved.');
    onDone({ saved, failed });
  }

  const subject = target
    ? {
        heading: target.clientName,
        details: [...(admin ? [target.bdaName] : []), istTime(target.callStart), KIND_LABEL[target.kind]],
      }
    : {
        heading: admin ? 'Fine a BDA for missed calls' : 'Pick the calls you could not take',
        details: [],
      };
  const confirmLabel = !target && count > 1 ? (admin ? `Mark ${count} absent` : `Send ${count} reports`) : undefined;

  return (
    <WaiveDialog
      variant={admin ? 'mark_absent' : 'report_absent'}
      subject={subject}
      onSubmit={submit}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      canSubmit={count > 0}
      confirmLabel={confirmLabel}
      focusReason={Boolean(target)}
      size={target ? 'md' : 'lg'}
    >
      {!target && <CallPicker token={token} admin={admin} defaultBdaEmail={admin ? defaultBdaEmail : ''} selected={picked} onChange={setPicked} />}
      {admin && (
        <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-orange-500">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-orange-600" data-testid="force-fine" />
          <span>
            <span className="font-semibold">Fine anyway</span>, even when attendance shows the BDA joined the meeting. Leave this off unless you have checked the call yourself.
          </span>
        </label>
      )}
    </WaiveDialog>
  );
}
