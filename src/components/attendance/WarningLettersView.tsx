import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Mail, RefreshCw, Send, X } from 'lucide-react';
import { useDismissWarningLetter, useEvaluateWarningLetters, useSendWarningLetter, useWarningLetters } from '../../api/warningLetter';
import type { WarningLetter, WarningLetterStatus, WarningMode, WarningStanding } from '../../types/warningLetter';
import { ActionDialog } from '../salesAllocation/shared';
import { absenceErrorMessage, istTime, withFriendlyError } from './absenceHelpers';

const BUTTON_FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500';

const LEVEL_LABEL = ['None', '1st', '2nd', '3rd'] as const;
const LEVEL_CHIP = [
  'bg-slate-100 text-slate-700',
  'bg-amber-100 text-amber-800',
  'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800',
] as const;

const STATUS_LABEL: Record<WarningLetterStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  failed: 'Failed',
  dismissed: 'Dismissed',
};
const STATUS_CHIP: Record<WarningLetterStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  dismissed: 'bg-slate-200 text-slate-700',
};

const POLICY_ROWS = [
  { range: '0 to 6', outcome: 'No warning' },
  { range: '7', outcome: 'First warning letter' },
  { range: '10', outcome: 'Second warning letter' },
  { range: '15', outcome: 'Third warning letter' },
] as const;

const MODE_TEXT: Record<WarningMode, string> = {
  draft: 'Letters are written as drafts. Review and send them here.',
  live: 'Letters are emailed automatically to the BDA, with admins copied.',
  off: 'Warning letters are switched off.',
};

const levelIndex = (level: number) => Math.min(Math.max(Math.trunc(level) || 0, 0), 3);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Oct 2026", read in IST so the same letter shows the same dates on every machine. */
function istDate(iso: string | null | undefined): string {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '-';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return `${get('day')} ${MONTHS[get('month') - 1]} ${get('year')}`;
}

function windowText(letter: WarningLetter): string {
  return `${istDate(letter.windowFrom)} to ${istDate(letter.windowTo)}`;
}

function canSend(letter: WarningLetter) {
  return letter.status === 'draft' || letter.status === 'failed';
}

function LevelChip({ level }: { level: number }) {
  const i = levelIndex(level);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_CHIP[i]}`}>
      {LEVEL_LABEL[i]}
      <span className="sr-only"> warning level</span>
    </span>
  );
}

function StatusChip({ status }: { status: WarningLetterStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ListState({
  loading,
  error,
  onRetry,
  retrying,
  empty,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  empty: ReactNode;
}) {
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3" data-testid="warnings-loading">
        <span className="sr-only">Loading warning letters</span>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-red-900">Could not load warning letters</p>
          <p className="mt-0.5 text-sm text-red-800">{absenceErrorMessage(error, 'Try again in a moment.')}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
        >
          {retrying ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
          Try again
        </button>
      </div>
    );
  }
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">{empty}</div>;
}

function PolicyStrip({ windowLabel }: { windowLabel?: string | null }) {
  return (
    <section aria-labelledby="warning-policy-heading" className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="warning-policy-heading" className="text-sm font-bold text-slate-900">
        Missed meetings this month{windowLabel ? ` (${windowLabel})` : ''}
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-4">
        {POLICY_ROWS.map((row) => (
          <li key={row.range} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-lg font-bold tabular-nums text-slate-900">{row.range}</p>
            <p className="text-xs font-medium text-slate-600">{row.outcome}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Only active deductions count. A waived deduction stops counting.</p>
    </section>
  );
}

function evaluateSummary(mode: WarningMode, result: { created: string[]; sent: string[]; failed: string[] }): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (mode === 'draft' && result.created.length > 0) parts.push(`${plural(result.created.length, 'draft', 'drafts')} created`);
  if (result.sent.length > 0) parts.push(`${plural(result.sent.length, 'letter', 'letters')} sent`);
  if (result.failed.length > 0) parts.push(`${plural(result.failed.length, 'letter', 'letters')} failed to send`);
  return parts.length > 0 ? parts.join(', ') : 'No new letters needed. Nobody crossed a threshold.';
}

function AdminControls({ token, mode }: { token: string | null; mode: WarningMode }) {
  const evaluate = useEvaluateWarningLetters(token);
  const [result, setResult] = useState<string | null>(null);
  const tone =
    mode === 'off' ? 'border-slate-200 bg-slate-50 text-slate-700' : mode === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900';

  function run() {
    setResult(null);
    evaluate.mutate(undefined, { onSuccess: (r) => setResult(evaluateSummary(r.mode, r)) });
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tone}`} data-testid="warning-mode">
      <div>
        <p className="text-sm font-semibold">{MODE_TEXT[mode]}</p>
        {result && (
          <p role="status" className="mt-0.5 text-sm">
            {result}
          </p>
        )}
        {evaluate.isError && (
          <p role="alert" className="mt-0.5 text-sm font-medium text-red-800">
            {absenceErrorMessage(evaluate.error, 'Could not run the check.')}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={run}
        disabled={mode === 'off' || evaluate.isPending}
        className={`inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS}`}
      >
        {evaluate.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
        Check now
      </button>
    </div>
  );
}

function nextText(s: WarningStanding): string {
  return s.nextThreshold == null ? 'None left' : `${s.nextThreshold} missed`;
}

function StandingsTable({ standings }: { standings: WarningStanding[] }) {
  return (
    <section aria-labelledby="warning-standings-heading" className="space-y-2">
      <h2 id="warning-standings-heading" className="text-sm font-bold text-slate-900">
        Standings
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-2">BDA</th>
              <th scope="col" className="px-4 py-2">Missed this month</th>
              <th scope="col" className="px-4 py-2">Level reached</th>
              <th scope="col" className="px-4 py-2">Next letter at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {standings.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No BDAs are tracked yet.
                </td>
              </tr>
            ) : (
              standings.map((s) => (
                <tr key={s.bdaEmail}>
                  <th scope="row" className="px-4 py-2 font-medium text-slate-900">{s.bdaName || s.bdaEmail}</th>
                  <td className="px-4 py-2 tabular-nums">{s.missedCount}</td>
                  <td className="px-4 py-2"><LevelChip level={s.level} /></td>
                  <td className="px-4 py-2 text-slate-700">{nextText(s)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MyStandingCard({ standing }: { standing: WarningStanding | undefined }) {
  return (
    <section aria-labelledby="warning-standings-heading" className="space-y-2">
      <h2 id="warning-standings-heading" className="text-sm font-bold text-slate-900">
        Your standing
      </h2>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3" data-testid="my-standing">
        {standing ? (
          <>
            <div>
              <p className="text-xs font-semibold text-slate-500">Missed this month</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{standing.missedCount}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Level reached</p>
              <p className="mt-1"><LevelChip level={standing.level} /></p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Next letter at</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{nextText(standing)}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600 sm:col-span-3">No standing to show yet.</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Preview and send dialog
// ---------------------------------------------------------------------------

interface PreviewDialogProps {
  letter: WarningLetter;
  admin: boolean;
  /** Open straight on the "are you sure" step, used by the row's Send email button. */
  startConfirming: boolean;
  onSend: (letter: WarningLetter) => Promise<unknown>;
  onDismiss: (letter: WarningLetter) => void;
  onClose: () => void;
}

function PreviewDialog({ letter, admin, startConfirming, onSend, onDismiss, onClose }: PreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sendingRef = useRef(false);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const [confirming, setConfirming] = useState(startConfirming && canSend(letter));
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal; a real browser always does.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    const remembered = opener.current;
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (remembered instanceof HTMLElement && remembered.isConnected) remembered.focus();
    };
  }, []);

  function requestClose() {
    if (!sendingRef.current) onClose();
  }

  async function send() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setServerError(null);
    try {
      await onSend(letter);
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not send the email. Nothing was changed.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const cc = letter.ccEmails.length > 0 ? letter.ccEmails.join(', ') : 'none';
  const name = letter.bdaName || letter.bdaEmail;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id={titleId} className="text-base font-bold">
            {letter.title}: {name}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusChip status={letter.status} />
            <span>{letter.missedCount} missed, {windowText(letter)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className={`-mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${BUTTON_FOCUS}`}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-semibold text-slate-600">Subject</dt>
          <dd className="break-words">{letter.subject}</dd>
          <dt className="font-semibold text-slate-600">To</dt>
          <dd className="break-words">{letter.toEmail}</dd>
          <dt className="font-semibold text-slate-600">Cc</dt>
          <dd className="break-words">{cc}</dd>
        </dl>

        <pre
          data-testid="letter-body"
          className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800"
        >
          {letter.bodyText}
        </pre>

        <section aria-label="Missed meetings">
          <h3 className="text-sm font-bold text-slate-900">Missed meetings</h3>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {letter.missed.map((m) => (
              <li key={m.bookingId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <span className="font-medium text-slate-900">{m.clientName}</span>
                <span className="text-slate-600">{istTime(m.scheduledStart)}</span>
              </li>
            ))}
          </ul>
        </section>

        {letter.status === 'failed' && letter.error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Last send failed: {letter.error}</p>
        )}

        {admin && confirming && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-semibold">This emails {letter.toEmail} now.</p>
            <p className="mt-0.5">Copied: {cc}. An email cannot be taken back.</p>
          </div>
        )}

        {serverError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {serverError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        {admin && canSend(letter) && confirming ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setServerError(null);
              }}
              disabled={sending}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 ${BUTTON_FOCUS}`}
            >
              Back
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className={`inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_FOCUS}`}
            >
              {sending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {sending ? 'Sending' : `Send to ${name}`}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={requestClose}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 ${BUTTON_FOCUS}`}
            >
              Close
            </button>
            {admin && canSend(letter) && (
              <>
                <button
                  type="button"
                  onClick={() => onDismiss(letter)}
                  className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS}`}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className={`inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 ${BUTTON_FOCUS}`}
                >
                  <Mail size={14} aria-hidden="true" />
                  Send email
                </button>
              </>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Letters list
// ---------------------------------------------------------------------------

function LetterRow({
  letter,
  admin,
  onPreview,
  onSend,
  onDismiss,
}: {
  letter: WarningLetter;
  admin: boolean;
  onPreview: (l: WarningLetter) => void;
  onSend: (l: WarningLetter) => void;
  onDismiss: (l: WarningLetter) => void;
}) {
  const name = letter.bdaName || letter.bdaEmail;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="warning-letter">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_CHIP[levelIndex(letter.level)]}`}>
              {letter.title}
            </span>
            {admin && <span className="text-sm font-semibold text-slate-900">{name}</span>}
            <StatusChip status={letter.status} />
          </div>
          <p className="text-sm text-slate-700">
            {letter.missedCount} missed meetings, {windowText(letter)}
          </p>
          {letter.status === 'sent' && (
            <p className="text-xs text-slate-500">
              Sent {istTime(letter.sentAt)}
              {letter.sentBy ? ` by ${letter.sentBy}` : ''}
            </p>
          )}
          {letter.status === 'dismissed' && (
            <p className="text-xs text-slate-500">
              Dismissed {istTime(letter.dismissedAt)}
              {letter.dismissedBy ? ` by ${letter.dismissedBy}` : ''}
              {letter.dismissNote ? `: ${letter.dismissNote}` : ''}
            </p>
          )}
          {letter.status === 'failed' && letter.error && <p className="text-xs font-medium text-rose-700">Send failed: {letter.error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPreview(letter)}
            aria-label={`Preview ${letter.title} for ${name}`}
            className={`rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS}`}
          >
            Preview
          </button>
          {admin && canSend(letter) && (
            <>
              <button
                type="button"
                onClick={() => onSend(letter)}
                aria-label={`Send email for ${letter.title} to ${name}`}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 ${BUTTON_FOCUS}`}
              >
                <Mail size={14} aria-hidden="true" /> Send email
              </button>
              <button
                type="button"
                onClick={() => onDismiss(letter)}
                aria-label={`Dismiss ${letter.title} for ${name}`}
                className={`rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS}`}
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

type DialogState =
  | { kind: 'preview'; letterId: string; confirm: boolean }
  | { kind: 'dismiss'; letterId: string };

interface WarningLettersViewProps {
  token: string | null;
  admin: boolean;
  /** Called with a plain-language confirmation after a send or a dismissal. The parent shows it. */
  onNotice: (message: string) => void;
}

export default function WarningLettersView({ token, admin, onNotice }: WarningLettersViewProps) {
  const query = useWarningLetters(token);
  const send = useSendWarningLetter(token);
  const dismiss = useDismissWarningLetter(token);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const letters = useMemo(() => {
    const all = query.data?.letters ?? [];
    // The server already limits a BDA to sent letters; this keeps a draft from ever showing if that changes.
    const visible = admin ? all : all.filter((l) => l.status === 'sent');
    return [...visible].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.letterId.localeCompare(b.letterId));
  }, [query.data, admin]);

  const target = dialog ? letters.find((l) => l.letterId === dialog.letterId) : undefined;
  const mode = query.data?.mode;

  return (
    <div className="space-y-5">
      <PolicyStrip windowLabel={query.data?.window?.label} />

      {admin && mode && <AdminControls token={token} mode={mode} />}

      {query.isPending || query.isError || !query.data ? (
        <ListState loading={query.isPending} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} empty={null} />
      ) : (
        <>
          {admin ? <StandingsTable standings={query.data.standings} /> : <MyStandingCard standing={query.data.standings[0]} />}

          <section aria-labelledby="warning-letters-heading" className="space-y-3">
            <h2 id="warning-letters-heading" className="text-sm font-bold text-slate-900">
              {admin ? 'Letters' : 'Your letters'}
            </h2>
            {letters.length === 0 ? (
              <ListState
                loading={false}
                error={null}
                onRetry={() => undefined}
                retrying={false}
                empty={
                  <>
                    <p className="text-sm font-semibold text-slate-800">No warning letters yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {admin ? 'A letter appears here when a BDA reaches a threshold.' : 'You have not received any warning letters.'}
                    </p>
                  </>
                }
              />
            ) : (
              <ul className="space-y-3">
                {letters.map((l) => (
                  <LetterRow
                    key={l.letterId}
                    letter={l}
                    admin={admin}
                    onPreview={(x) => setDialog({ kind: 'preview', letterId: x.letterId, confirm: false })}
                    onSend={(x) => setDialog({ kind: 'preview', letterId: x.letterId, confirm: true })}
                    onDismiss={(x) => setDialog({ kind: 'dismiss', letterId: x.letterId })}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {dialog?.kind === 'preview' && target && (
        <PreviewDialog
          key={target.letterId}
          letter={target}
          admin={admin}
          startConfirming={dialog.confirm}
          onClose={() => setDialog(null)}
          onDismiss={(l) => setDialog({ kind: 'dismiss', letterId: l.letterId })}
          onSend={async (l) => {
            await withFriendlyError(send.mutateAsync(l.letterId));
            onNotice(`${l.title} emailed to ${l.bdaName || l.bdaEmail}.`);
          }}
        />
      )}
      {dialog?.kind === 'dismiss' && target && (
        <ActionDialog
          title="Dismiss this letter"
          submitLabel="Dismiss letter"
          noteLabel="Note (optional)"
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            await withFriendlyError(dismiss.mutateAsync({ letterId: target.letterId, note: note || undefined }));
            onNotice(`${target.title} for ${target.bdaName || target.bdaEmail} dismissed. No email was sent.`);
          }}
        >
          Nothing is emailed to <strong>{target.bdaName || target.bdaEmail}</strong>. The letter stays on record as dismissed.
        </ActionDialog>
      )}
    </div>
  );
}
