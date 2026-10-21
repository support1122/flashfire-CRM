import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTrackedBdas, useTransferCandidates, useTransferMeetings } from '../../api/attendanceAdmin';
import type { TransferItemResult } from '../../types/attendanceAdmin';
import { fmtDayTime } from './format';
import { TRANSFER_MAX, buildTransferPlan, leaveClashes, warningText, type TransferMode } from './transferHelpers';
import type { FocusTarget } from './deductionHelpers';
import { resolveFocusTarget } from './deductionHelpers';

interface TransferMeetingsDialogProps {
  token: string | null;
  /** The BDA whose meetings are being moved, when the opener already knows (a Per BDA row, a leave request). */
  defaultBdaEmail?: string;
  /** IST days, YYYY-MM-DD. Default: today to two weeks ahead. */
  defaultFrom?: string;
  defaultTo?: string;
  returnFocusTo?: FocusTarget;
  onClose: () => void;
  /** One plain sentence about what moved, shown on the page after the dialog closes. */
  onDone: (message: string) => void;
}

const FIELD =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500';

const istDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

/**
 * Move one BDA's upcoming Calendly meetings to someone else in one go: pick who is away and the dates, tick the
 * meetings, then give them all to one BDA or spread them across whoever is free. One request, an answer per meeting.
 * Mount it only while it should be open.
 */
export default function TransferMeetingsDialog({ token, defaultBdaEmail = '', defaultFrom, defaultTo, returnFocusTo, onClose, onDone }: TransferMeetingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });
  const titleId = useId();
  const sourceId = useId();
  const fromId = useId();
  const toId = useId();
  const targetId = useId();

  const [source, setSource] = useState(defaultBdaEmail);
  const [from, setFrom] = useState(defaultFrom ?? istDay());
  const [to, setTo] = useState(defaultTo ?? istDay(14));
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TransferMode>('one');
  const [target, setTarget] = useState('');
  const [results, setResults] = useState<TransferItemResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bdas = useTrackedBdas(token);
  const rangeOk = Boolean(from) && Boolean(to) && to >= from;
  const q = useTransferCandidates(token, { bdaEmail: source, from, to }, rangeOk);
  const move = useTransferMeetings(token);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    closeRef.current?.focus();
    const remembered = opener.current;
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      const t = resolveFocusTarget(returnRef.current) ?? resolveFocusTarget(remembered instanceof HTMLElement ? remembered : null);
      t?.focus();
    };
  }, []);

  const meetings = useMemo(() => q.data?.meetings ?? [], [q.data]);
  const movable = meetings.filter((m) => m.canMove);
  const chosen = movable.filter((m) => !unticked.has(m.bookingId)).slice(0, TRANSFER_MAX);
  const people = useMemo(() => q.data?.bdas ?? [], [q.data]);
  const targetBda = people.find((b) => b.email === target);
  const clashes = mode === 'one' ? leaveClashes(chosen, targetBda) : [];
  const plan = useMemo(() => buildTransferPlan(chosen, mode, target, people, source), [chosen, mode, target, people, source]);
  const unplaced = plan.filter((p) => !p.email);
  const sendable = plan.filter((p) => p.email);
  const nameOf = (email: string | null | undefined) => people.find((b) => b.email === email)?.displayName ?? email ?? 'the Calendly host';
  const clientOf = (id: string) => meetings.find((m) => m.bookingId === id)?.clientName ?? id;

  const canSubmit = chosen.length > 0 && sendable.length > 0 && (mode === 'spread' || Boolean(target)) && !move.isPending && !results;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    try {
      const res = await move.mutateAsync(sendable.map((p) => ({ bookingId: p.bookingId, email: p.email as string })));
      setResults(res.results);
      if (res.summary.failed === 0) {
        onDone(`${res.summary.moved} ${res.summary.moved === 1 ? 'meeting' : 'meetings'} moved to a new BDA. The admin channel has the summary.`);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the meetings.');
    }
  }

  const failed = results?.filter((r) => !r.ok) ?? [];
  const movedCount = (results?.length ?? 0) - failed.length;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (results && movedCount > 0) onDone(`${movedCount} ${movedCount === 1 ? 'meeting' : 'meetings'} moved, ${failed.length} could not move.`);
        onClose();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] max-w-none rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id={titleId} className="text-lg font-bold">Transfer meetings</h2>
          <p className="mt-0.5 text-sm text-slate-600">Hand a BDA's upcoming Calendly meetings to someone else, for example while they are on leave.</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => {
            if (results && movedCount > 0) onDone(`${movedCount} ${movedCount === 1 ? 'meeting' : 'meetings'} moved, ${failed.length} could not move.`);
            onClose();
          }}
          aria-label="Close"
          className="-mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label htmlFor={sourceId} className="block text-xs font-semibold text-slate-600">Meetings of</label>
            <select
              id={sourceId}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setUnticked(new Set());
                setTarget('');
              }}
              className={`mt-1 w-full ${FIELD}`}
            >
              <option value="">Pick a BDA</option>
              {(bdas.data?.bdas ?? []).map((b) => (
                <option key={b.email} value={b.email}>{b.displayName || b.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={fromId} className="block text-xs font-semibold text-slate-600">From date</label>
            <input id={fromId} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 w-full ${FIELD}`} />
          </div>
          <div>
            <label htmlFor={toId} className="block text-xs font-semibold text-slate-600">To date</label>
            <input id={toId} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`mt-1 w-full ${FIELD}`} />
          </div>
        </div>
        {!rangeOk && <p className="text-xs text-red-700" role="alert">The end date must be on or after the start date.</p>}

        {!source ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">Pick the BDA who is away.</p>
        ) : q.isPending && rangeOk ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : q.isError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {q.error.message}
            <button type="button" onClick={() => q.refetch()} className="ml-3 font-semibold underline">Try again</button>
          </div>
        ) : meetings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600" data-testid="transfer-empty">
            No upcoming meetings for this BDA in these dates.
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="sr-only">Choose the meetings to move</legend>
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {meetings.map((m) => {
                  const on = m.canMove && !unticked.has(m.bookingId);
                  return (
                    <li key={m.bookingId}>
                      <label className={`flex items-center gap-3 px-3 py-2 text-sm ${m.canMove ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!m.canMove || move.isPending || Boolean(results)}
                          onChange={() =>
                            setUnticked((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.bookingId)) next.delete(m.bookingId);
                              else next.add(m.bookingId);
                              return next;
                            })
                          }
                          className="accent-orange-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.clientName}</span>
                          <span className="block text-xs text-slate-600">{fmtDayTime(m.scheduledStart)}</span>
                        </span>
                        {!m.canMove && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">Too late</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p role="status" aria-live="polite" className="mt-1.5 text-xs text-slate-600" data-testid="transfer-count">
                {chosen.length} of {meetings.length} selected.
                {meetings.length > movable.length ? ' "Too late" meetings have passed the mark window and cannot move.' : ''}
              </p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-600">Give them to</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="transfer-mode" checked={mode === 'one'} onChange={() => setMode('one')} className="accent-orange-600" />
                One BDA
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="transfer-mode" checked={mode === 'spread'} onChange={() => setMode('spread')} className="accent-orange-600" />
                Spread evenly across whoever is free that day
              </label>
              {mode === 'one' && (
                <div>
                  <label htmlFor={targetId} className="sr-only">New BDA</label>
                  <select id={targetId} value={target} onChange={(e) => setTarget(e.target.value)} className={`w-full ${FIELD}`}>
                    <option value="">Pick a BDA</option>
                    {people.filter((b) => b.email !== source).map((b) => {
                      const off = leaveClashes(chosen, b).length;
                      return (
                        <option key={b.email} value={b.email}>
                          {b.displayName}{off > 0 ? ` (on leave for ${off} of these)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </fieldset>

            {clashes.length > 0 && (
              <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="transfer-leave-warning">
                {nameOf(target)} is on leave for {clashes.length} of these ({clashes.map((c) => c.clientName).join(', ')}). The server will refuse those.
              </p>
            )}

            {mode === 'spread' && chosen.length > 0 && (
              <div data-testid="transfer-plan">
                <p className="text-xs font-semibold text-slate-600">Plan</p>
                <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {plan.map((p) => (
                    <li key={p.bookingId} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="truncate">{clientOf(p.bookingId)}</span>
                      <span className={p.email ? 'font-medium' : 'text-red-700'}>{p.email ? nameOf(p.email) : p.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unplaced.length > 0 && mode === 'spread' && (
              <p className="text-xs text-amber-900">{unplaced.length} will stay where they are, nobody is free that day.</p>
            )}
          </>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {results && (
          <div role="status" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid="transfer-results">
            <p className="font-semibold">{movedCount} moved{failed.length > 0 ? `, ${failed.length} could not move` : ''}.</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {failed.map((r) => (
                <li key={r.bookingId} className="text-red-800">{r.clientName || clientOf(r.bookingId)}: {r.error?.message}</li>
              ))}
              {results.filter((r) => r.ok && r.warnings?.length).map((r) => (
                <li key={r.bookingId} className="text-amber-900">{r.clientName}: {r.warnings?.map(warningText).join(', ')}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          onClick={() => {
            if (results && movedCount > 0) onDone(`${movedCount} ${movedCount === 1 ? 'meeting' : 'meetings'} moved, ${failed.length} could not move.`);
            onClose();
          }}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          {results ? 'Close' : 'Cancel'}
        </button>
        {!results && (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {move.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {sendable.length > 0 ? `Move ${sendable.length} ${sendable.length === 1 ? 'meeting' : 'meetings'}` : 'Move meetings'}
          </button>
        )}
      </footer>
    </dialog>
  );
}
