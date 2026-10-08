import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { ApiError } from '../../api/attendance';
import {
  useBdaProfiles,
  useConvertToMiss,
  useDismissIntegrityFlag,
  useReassignBooking,
  useResolveDeduction,
  useReviewQueues,
} from '../../api/attendanceAdmin';
import type { Deduction } from '../../types/attendance';
import type {
  BdaProfile,
  MarkedNeverJoinedItem,
  NeedsReassignmentItem,
  StuckStatusItem,
} from '../../types/attendanceAdmin';
import DeductionEvidenceDrawer from './DeductionEvidenceDrawer';
import WaiveDialog, { type ReasonVariant } from './WaiveDialog';
import { STATUS_CHIP, signalName, statusLabel, tierText } from './deductionHelpers';
import { RULE_LABEL, fmtClock, fmtDayTime, formatInr } from './format';

const WINDOW_OPENS_BEFORE_START_MS = 5 * 60_000;

/** Re-renders every `everyMs` so "window already opened" flips without a reload. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function nameFor(profiles: BdaProfile[], email: string): string {
  const match = profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
  return match?.displayName || email;
}

interface QueueSectionProps {
  id: string;
  title: string;
  description: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}

function QueueSection({ id, title, description, count, emptyText, children }: QueueSectionProps) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 id={id} className="text-sm font-bold text-slate-900">
            {title}
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-slate-500">{description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
            count > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {count}
          <span className="sr-only"> {count === 1 ? 'item' : 'items'}</span>
        </span>
      </div>
      {count === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyText}</p> : children}
    </section>
  );
}

const TH = 'px-4 py-2 text-left text-xs font-semibold text-slate-600';
const TH_RIGHT = 'px-4 py-2 text-right text-xs font-semibold text-slate-600';
const TD = 'px-4 py-3 align-top';

const BTN_DARK =
  'rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800';
const BTN_RED =
  'rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600';
const BTN_LIGHT =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500';

// ---------------------------------------------------------------------------
// Reassign
// ---------------------------------------------------------------------------

function ReassignRow({
  item,
  token,
  profiles,
  now,
}: {
  item: NeedsReassignmentItem;
  token: string | null;
  profiles: BdaProfile[];
  now: number;
}) {
  const reassign = useReassignBooking(token);
  const [choice, setChoice] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const start = Date.parse(item.scheduledStart);
  const opensAt = start - WINDOW_OPENS_BEFORE_START_MS;
  const windowOpen = now >= opensAt;
  const candidates = profiles.filter(
    (p) => p.tracked && p.active && p.email.toLowerCase() !== item.assignedBdaEmail.toLowerCase(),
  );
  const selectId = `reassign-${item.bookingId}`;
  const messageId = `reassign-msg-${item.bookingId}`;

  async function submit() {
    if (!choice || windowOpen || reassign.isPending) return;
    setMessage(null);
    try {
      await reassign.mutateAsync({ bookingId: item.bookingId, email: choice });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'window_open') {
        setMessage('The mark window has already opened on the server, so this meeting can no longer be reassigned.');
      } else if (error instanceof ApiError && error.code === 'not_tracked_bda') {
        setMessage('That person is not a tracked BDA. Pick someone from the list.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Could not reassign this meeting.');
      }
    }
  }

  return (
    <tr>
      <td className={TD}>
        <p className="font-medium text-slate-900">{item.clientName}</p>
        <p className="text-xs text-slate-500">{fmtDayTime(item.scheduledStart)}</p>
      </td>
      <td className={TD}>
        <p className="text-slate-800">{nameFor(profiles, item.assignedBdaEmail)}</p>
        <p className="text-xs text-slate-500">{item.reason === 'leave' ? 'On approved leave' : item.reason.replace(/_/g, ' ')}</p>
      </td>
      <td className={TD}>
        <div className="flex flex-wrap items-start gap-2">
          <div>
            <label htmlFor={selectId} className="sr-only">
              Reassign {item.clientName} to
            </label>
            <select
              id={selectId}
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setMessage(null);
              }}
              disabled={windowOpen || reassign.isPending}
              aria-describedby={windowOpen || message ? messageId : undefined}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">Pick a BDA</option>
              {candidates.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!choice || windowOpen || reassign.isPending}
            className={`${BTN_DARK} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {reassign.isPending && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
            Reassign
          </button>
        </div>
        <div id={messageId} aria-live="polite">
          {windowOpen && !message && (
            <p className="mt-1.5 max-w-xs text-xs text-amber-800">
              The mark window opened at {fmtClock(new Date(opensAt).toISOString())}. After that the meeting cannot be handed to someone else.
            </p>
          )}
          {message && (
            <p role="alert" className="mt-1.5 max-w-xs text-xs font-medium text-red-700">
              {message}
            </p>
          )}
          {candidates.length === 0 && !windowOpen && !message && (
            <p className="mt-1.5 max-w-xs text-xs text-slate-500">No other tracked BDA is available.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type ReasonDialog =
  | { kind: 'deduction'; variant: 'activate' | 'waive'; deduction: Deduction; trigger: HTMLElement | null }
  | { kind: 'flag'; variant: Extract<ReasonVariant, 'convert' | 'dismiss'>; item: MarkedNeverJoinedItem; trigger: HTMLElement | null };

export default function AttendanceReviewQueues({ token }: { token: string | null }) {
  const queues = useReviewQueues(token, true);
  const profiles = useBdaProfiles(token, true);
  const resolve = useResolveDeduction(token);
  const convert = useConvertToMiss(token);
  const dismiss = useDismissIntegrityFlag(token);
  const now = useNow();
  const [dialog, setDialog] = useState<ReasonDialog | null>(null);
  const [evidence, setEvidence] = useState<{ deduction: Deduction; trigger: HTMLElement | null } | null>(null);

  const people = profiles.data?.profiles ?? [];

  if (queues.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-3" data-testid="queues-loading">
        <span className="sr-only">Loading review queues</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (queues.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-red-900">Could not load the review queues</p>
          <p className="mt-0.5 text-sm text-red-800">{queues.error.message}</p>
        </div>
        <button
          type="button"
          onClick={() => queues.refetch()}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  const q = queues.data;

  const dialogSubject = (() => {
    if (!dialog) return null;
    if (dialog.kind === 'deduction') {
      const d = dialog.deduction;
      return {
        heading: `${RULE_LABEL[d.rule]}, ${formatInr(d.amountInr)}`,
        details: [d.clientName, d.bdaName || d.bdaEmail, fmtDayTime(d.evidence.scheduledStart)],
      };
    }
    return {
      heading: dialog.item.clientName,
      details: [nameFor(people, dialog.item.bdaEmail), fmtDayTime(dialog.item.scheduledStart)],
    };
  })();

  function submitReason(reason: string) {
    if (!dialog) return Promise.resolve();
    if (dialog.kind === 'deduction') return resolve(dialog.deduction, dialog.variant, reason);
    const vars = { bookingId: dialog.item.bookingId, bdaEmail: dialog.item.bdaEmail, reason };
    return dialog.variant === 'convert' ? convert.mutateAsync(vars) : dismiss.mutateAsync(vars);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Things that need an admin decision. The lists refresh every minute.</p>
        <button
          type="button"
          onClick={() => queues.refetch()}
          disabled={queues.isFetching}
          className={`${BTN_LIGHT} inline-flex items-center gap-1.5 disabled:opacity-60`}
        >
          {queues.isFetching ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
          Refresh
        </button>
      </div>

      <QueueSection
        id="queue-needs-review"
        title="Needs review"
        description="A data source was unhealthy when these were judged, so they do not count until you activate or waive them."
        count={q.needsReview.length}
        emptyText="Nothing waiting for review."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Deductions that need review</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Meeting</th>
                <th scope="col" className={TH}>BDA</th>
                <th scope="col" className={TH}>Rule</th>
                <th scope="col" className={TH_RIGHT}>Amount</th>
                <th scope="col" className={TH_RIGHT}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.needsReview.map((d) => (
                <tr key={d.deductionId} className="bg-amber-50/40">
                  <td className={TD}>
                    <p className="font-medium text-slate-900">{d.clientName}</p>
                    <p className="text-xs text-slate-500">{fmtDayTime(d.evidence.scheduledStart)}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-slate-800`}>{d.bdaName || d.bdaEmail}</td>
                  <td className={TD}>
                    <p className="text-slate-800">{RULE_LABEL[d.rule]}</p>
                    {tierText(d) && <p className="text-xs text-slate-500">{tierText(d)}</p>}
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[d.status]}`}>
                      {statusLabel(d.status, true)}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right font-semibold tabular-nums text-slate-700`}>{formatInr(d.amountInr)}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => setEvidence({ deduction: d, trigger: e.currentTarget })}
                        aria-label={`View evidence for ${d.clientName}`}
                        className={BTN_LIGHT}
                      >
                        Evidence
                      </button>
                      <button
                        type="button"
                        onClick={(e) => setDialog({ kind: 'deduction', variant: 'activate', deduction: d, trigger: e.currentTarget })}
                        aria-label={`Activate deduction for ${d.clientName}`}
                        className={BTN_RED}
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={(e) => setDialog({ kind: 'deduction', variant: 'waive', deduction: d, trigger: e.currentTarget })}
                        aria-label={`Waive deduction for ${d.clientName}`}
                        className={BTN_DARK}
                      >
                        Waive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueueSection>

      <QueueSection
        id="queue-never-joined"
        title="Marked present, never joined"
        description="The BDA pressed Mark Present, but Google Meet and the extension never saw them in the call. Nobody is fined automatically."
        count={q.markedNeverJoined.length}
        emptyText="No button-only presence flags."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Meetings marked present where nobody joined</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Meeting</th>
                <th scope="col" className={TH}>BDA</th>
                <th scope="col" className={TH}>Marked present</th>
                <th scope="col" className={TH_RIGHT}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.markedNeverJoined.map((item) => (
                <tr key={item.bookingId}>
                  <td className={TD}>
                    <p className="font-medium text-slate-900">{item.clientName}</p>
                    <p className="text-xs text-slate-500">{fmtDayTime(item.scheduledStart)}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-slate-800`}>{nameFor(people, item.bdaEmail)}</td>
                  <td className={TD}>
                    <p className="tabular-nums text-slate-800">{fmtClock(item.markedAt, true)}</p>
                    <p className="text-xs text-slate-500">via {signalName(item.signal)}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => setDialog({ kind: 'flag', variant: 'convert', item, trigger: e.currentTarget })}
                        aria-label={`Convert ${item.clientName} to a missed meeting`}
                        className={BTN_RED}
                      >
                        Convert to miss
                      </button>
                      <button
                        type="button"
                        onClick={(e) => setDialog({ kind: 'flag', variant: 'dismiss', item, trigger: e.currentTarget })}
                        aria-label={`Dismiss the flag for ${item.clientName}`}
                        className={BTN_LIGHT}
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueueSection>

      <QueueSection
        id="queue-stuck"
        title="Stuck on scheduled"
        description="Still marked scheduled long after the meeting. The BDA needs to set the real status in Meeting Info; there is nothing to approve here."
        count={q.stuckStatus.length}
        emptyText="No meetings stuck on scheduled."
      >
        <StuckTable items={q.stuckStatus} people={people} />
      </QueueSection>

      <QueueSection
        id="queue-reassign"
        title="Needs reassignment"
        description="These meetings fall on an approved leave day. Hand each one to a tracked BDA before its mark window opens, 5 minutes before the start."
        count={q.needsReassignment.length}
        emptyText="No meetings need a new assignee."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Meetings that need a new assignee</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={TH}>Meeting</th>
                <th scope="col" className={TH}>Assigned to</th>
                <th scope="col" className={TH}>Reassign to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.needsReassignment.map((item) => (
                <ReassignRow key={item.bookingId} item={item} token={token} profiles={people} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      </QueueSection>

      {evidence && (
        <DeductionEvidenceDrawer
          deduction={evidence.deduction}
          admin
          returnFocusTo={() => (evidence.trigger?.isConnected ? evidence.trigger : null)}
          onClose={() => setEvidence(null)}
        />
      )}
      {dialog && dialogSubject && (
        <WaiveDialog
          variant={dialog.variant}
          subject={dialogSubject}
          returnFocusTo={() => (dialog.trigger?.isConnected ? dialog.trigger : null)}
          onSubmit={submitReason}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function StuckTable({ items, people }: { items: StuckStatusItem[]; people: BdaProfile[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Meetings stuck on scheduled</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={TH}>Meeting</th>
            <th scope="col" className={TH}>BDA</th>
            <th scope="col" className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.bookingId}>
              <td className={TD}>
                <p className="font-medium text-slate-900">{item.clientName}</p>
                <p className="text-xs text-slate-500">{fmtDayTime(item.scheduledStart)}</p>
              </td>
              <td className={`${TD} whitespace-nowrap text-slate-800`}>{nameFor(people, item.bdaEmail)}</td>
              <td className={TD}>
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Still {item.bookingStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
