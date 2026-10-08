import { AlertTriangle, Check, Clock, PhoneCall, PhoneOff, ScrollText, ShieldCheck, X } from 'lucide-react';
import type {
  CallSummary,
  DeductionChip,
  MeetingAttendance,
  StatusUpdate,
  TranscriptRef,
} from '../../types/attendance';
import { RULE_LABEL, SIGNAL_LABEL, callChipText, fmtClock, formatDuration, formatInr, formatTalk } from './format';

const CHIP = 'inline-flex items-start gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-snug';
const MUTED = 'text-[11px] text-slate-500';

/** Marked column: the server verdict plus the signal that won. */
export function MarkedCell({ attendance }: { attendance: MeetingAttendance | null }) {
  if (!attendance) return <span className={MUTED}>Not tracked</span>;

  if (attendance.verdict === 'absent') {
    return (
      <span className={`${CHIP} bg-red-50 text-red-800 border-red-200`}>
        <X size={12} className="mt-[3px] flex-shrink-0" aria-hidden="true" />
        Absent
      </span>
    );
  }

  if (attendance.verdict === 'present') {
    const button = attendance.signals.find((s) => s.kind === 'button_meet' || s.kind === 'button_crm');
    const first = [...attendance.signals].sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt))[0];
    const how = button ?? first;
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`${CHIP} bg-emerald-50 text-emerald-800 border-emerald-200`}>
          <Check size={12} className="mt-[3px] flex-shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">{attendance.markedPresentAt ? fmtClock(attendance.markedPresentAt, true) : 'Present'}</span>
        </span>
        {how && <span className={MUTED}>{SIGNAL_LABEL[how.kind]}</span>}
      </div>
    );
  }

  return (
    <span className={`${CHIP} bg-slate-50 text-slate-600 border-slate-200`}>
      <Clock size={12} className="mt-[3px] flex-shrink-0" aria-hidden="true" />
      Pending
    </span>
  );
}

/** "3m late", "2m early" or "on time" for the first join against the scheduled start. */
function punctuality(inAt: string | null, scheduledStart: string | null | undefined) {
  if (!inAt || !scheduledStart) return null;
  const diff = Date.parse(inAt) - Date.parse(scheduledStart);
  if (!Number.isFinite(diff)) return null;
  if (diff > 60_000) return { label: `${Math.round(diff / 60_000)}m late`, cls: 'bg-red-50 text-red-700 border-red-200' };
  if (diff < -60_000) return { label: `${Math.round(-diff / 60_000)}m early`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: 'on time', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

/** In / Out column: exact times, the Google-verified badge, and how late the BDA joined. */
export function InOutCell({
  attendance,
  scheduledStart,
  title,
}: {
  attendance: MeetingAttendance | null;
  scheduledStart?: string | null;
  /** Hover text, for example who was in the call when the BDA joined. */
  title?: string;
}) {
  if (!attendance || (!attendance.inAt && !attendance.outAt)) return <span className={MUTED}>-</span>;
  const secs = attendance.verified;
  const late = punctuality(attendance.inAt, scheduledStart);
  return (
    <div className="flex flex-col gap-1" title={title}>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] leading-snug">
        <span className="text-slate-500">In</span>
        <span className="whitespace-nowrap font-semibold text-slate-800 tabular-nums">{fmtClock(attendance.inAt, secs)}</span>
        <span className="text-slate-500">Out</span>
        <span className="whitespace-nowrap font-semibold text-slate-800 tabular-nums">{fmtClock(attendance.outAt, secs)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {attendance.verified && (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
            title="Times verified from Google Meet conference records"
          >
            <ShieldCheck size={11} aria-hidden="true" />
            Google verified
          </span>
        )}
        {late && (
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${late.cls}`}>
            {late.label}
          </span>
        )}
      </div>
    </div>
  );
}

/** Time spent column: the total, with every in-call segment in an expandable list. */
export function TimeSpentCell({ attendance }: { attendance: MeetingAttendance | null }) {
  if (!attendance) return <span className={MUTED}>-</span>;
  const sessions = attendance.sessions ?? [];
  const total = formatDuration(attendance.timeSpentMs);
  if (total === '-' && sessions.length === 0) return <span className={MUTED}>-</span>;
  return (
    <div className="flex flex-col gap-0.5 text-[11px]">
      <span className="font-semibold text-slate-800 text-xs">{total}</span>
      {sessions.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none rounded text-blue-700 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </summary>
          <ol className="mt-1 space-y-0.5 text-slate-700">
            {sessions.map((s, i) => (
              <li key={`${s.joinedAt}-${i}`} className="whitespace-nowrap tabular-nums">
                {fmtClock(s.joinedAt, attendance.verified)} to {s.leftAt ? fmtClock(s.leftAt, attendance.verified) : 'still in'}
                {s.leftAt && (
                  <span className="text-slate-500"> ({formatDuration(Date.parse(s.leftAt) - Date.parse(s.joinedAt))})</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

/** Called client chip, used in Meeting Info, My attendance and the Leads table. */
export function CallChip({ summary, compact = false }: { summary: CallSummary | null; compact?: boolean }) {
  const size = compact ? 'text-[9px] px-1 py-px gap-0.5' : 'text-[11px] px-1.5 py-0.5 gap-1';
  const icon = compact ? 9 : 12;
  const base = `inline-flex items-start rounded-md border font-semibold leading-snug ${size}`;
  if (!summary) {
    return <span className={`${base} bg-slate-50 text-slate-500 border-slate-200`}>No call data</span>;
  }
  if (summary.calls === 0) {
    return (
      <span
        className={`${base} bg-rose-50 text-rose-700 border-rose-200`}
        title="No outbound call from the assigned BDA is linked to this meeting"
      >
        <PhoneOff size={icon} className="mt-[2px] flex-shrink-0" aria-hidden="true" />
        Not called
      </span>
    );
  }
  const good = summary.connected;
  return (
    <span
      className={`${base} ${good ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
      title={`Talk time ${formatTalk(summary.talkSec)}${summary.calledWithin30Min ? ', first call within 30 minutes' : ', first call after 30 minutes'}`}
    >
      <PhoneCall size={icon} className="mt-[2px] flex-shrink-0" aria-hidden="true" />
      {callChipText(summary)}
    </span>
  );
}

/** Status updated column: who moved the booking off "scheduled", or the warning that nobody did. */
export function StatusUpdatedCell({ statusUpdate }: { statusUpdate: StatusUpdate | null }) {
  if (!statusUpdate) return <span className={MUTED}>-</span>;
  if (statusUpdate.status === 'scheduled') {
    return (
      <div className="flex flex-col gap-1">
        <span className={`${CHIP} ${statusUpdate.stuck ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          <AlertTriangle size={12} className="mt-[3px] flex-shrink-0" aria-hidden="true" />
          Still scheduled
        </span>
        {statusUpdate.stuck && <span className="text-[10px] font-semibold text-red-700">Stuck, needs an update</span>}
      </div>
    );
  }
  return (
    <span className="inline-flex items-start gap-1 text-[11px] leading-snug text-slate-800">
      <Check size={12} className="mt-[3px] flex-shrink-0 text-emerald-600" aria-hidden="true" />
      <span>
        <span className="font-semibold">{statusUpdate.status}</span>
        {statusUpdate.updatedBy ? ` by ${statusUpdate.updatedBy}` : ''}
        {statusUpdate.updatedAt && <span className="whitespace-nowrap text-slate-500">{` ${fmtClock(statusUpdate.updatedAt)}`}</span>}
      </span>
    </span>
  );
}

/**
 * Deductions column. One chip per rule: struck through when waived or voided, amber when it needs review.
 * A BDA sees a needs_review row as "under review" with no amount, because it does not count yet.
 */
export function DeductionChips({
  deductions,
  viewerIsAdmin = false,
}: {
  deductions: DeductionChip[] | null;
  viewerIsAdmin?: boolean;
}) {
  if (!deductions || deductions.length === 0) return <span className={MUTED}>-</span>;
  return (
    <ul className="flex flex-col items-start gap-1" aria-label="Deductions">
      {deductions.map((d) => {
        const label = RULE_LABEL[d.rule] ?? d.rule;
        const amount = formatInr(d.amountInr);
        const dead = d.status === 'waived' || d.status === 'voided';
        let cls = 'bg-rose-50 text-rose-800 border-rose-200';
        if (dead) cls = 'bg-slate-50 text-slate-500 border-slate-200';
        else if (d.status === 'needs_review') cls = 'bg-amber-50 text-amber-900 border-amber-300';
        else if (d.status === 'shadow') cls = 'bg-white text-slate-600 border-slate-300 border-dashed';
        const title = d.waiverReason
          ? `${d.status === 'voided' ? 'Voided' : 'Waived'}: ${d.waiverReason}`
          : d.status === 'needs_review'
            ? 'An admin has to confirm this before it counts'
            : d.status === 'shadow'
              ? 'Shadow mode, not charged'
              : undefined;
        return (
          <li key={d.deductionId}>
            <span className={`${CHIP} flex-col gap-0 ${cls}`} title={title}>
              <span className={dead ? 'line-through' : undefined}>
                {/* A non-breaking space keeps the amount on the same line as the last word of the label. */}
                {d.status === 'needs_review' && !viewerIsAdmin ? label : `${label}\u00a0${amount}`}
              </span>
              {d.status === 'waived' && <span className="font-medium">waived</span>}
              {d.status === 'voided' && <span className="font-medium">voided</span>}
              {d.status === 'needs_review' && <span className="font-medium">{viewerIsAdmin ? 'to review' : 'under review'}</span>}
              {d.status === 'shadow' && <span className="font-medium">shadow</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Flags column, admin only: why a row deserves a second look. */
export function FlagChips({ attendance }: { attendance: MeetingAttendance | null }) {
  const flags: Array<{ key: string; label: string; cls: string; title: string }> = [];
  if (attendance?.matchedBy === 'name') {
    flags.push({
      key: 'name',
      label: 'Matched by name',
      cls: 'bg-amber-50 text-amber-900 border-amber-300',
      title: 'In and out times were matched on the display name, not a stable ID',
    });
  }
  if (attendance?.integrityFlag === 'marked_never_joined') {
    flags.push({
      key: 'never',
      label: 'Marked present, never joined',
      cls: 'bg-rose-50 text-rose-800 border-rose-200',
      title: 'The button was pressed but neither Google nor the extension saw the BDA in the call',
    });
  }
  if (flags.length === 0) return <span className={MUTED}>-</span>;
  return (
    <ul className="flex flex-col items-start gap-1" aria-label="Flags">
      {flags.map((f) => (
        <li key={f.key}>
          <span className={`${CHIP} ${f.cls}`} title={f.title}>
            <AlertTriangle size={12} className="mt-[3px] flex-shrink-0" aria-hidden="true" />
            {f.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Transcript icon. Renders nothing until a transcript exists (Part E); a bare link when it has a URL. */
export function TranscriptLink({ transcript, size = 12 }: { transcript: TranscriptRef | null; size?: number }) {
  if (transcript == null) return null;
  const url = typeof transcript === 'string' ? transcript : transcript.url ?? null;
  const cls =
    'inline-flex items-center justify-center p-0.5 rounded border border-slate-200 bg-white text-slate-700 hover:border-orange-400 hover:text-orange-600 transition flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title="View transcript" aria-label="View transcript" className={cls}>
        <ScrollText size={size} aria-hidden="true" />
      </a>
    );
  }
  return (
    <span title="Transcript is being prepared" aria-label="Transcript is being prepared" role="img" className={`${cls} opacity-60`}>
      <ScrollText size={size} aria-hidden="true" />
    </span>
  );
}
