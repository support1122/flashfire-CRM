import { ApiError } from '../../api/attendance';
import type { AbsenceErrorCode, AbsenceOutcome, AbsenceKind, AbsenceReport, AbsenceReportsFilters, AbsenceStatus } from '../../types/absence';
import { INDIA_ZONE, formatInZone } from '../salesAllocation/timeZones';

export const KIND_LABEL: Record<AbsenceKind, string> = {
  allocation: 'Lead Allocation call',
  booking: 'Calendly meeting',
};

/** A pending report reads "Waiting for review" to an admin and "Pending review" to the BDA who raised it. */
export function reportStatusLabel(status: AbsenceStatus, admin: boolean): string {
  switch (status) {
    case 'pending':
      return admin ? 'Waiting for review' : 'Pending review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Withdrawn';
  }
}

export const REPORT_STATUS_CHIP: Record<AbsenceStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

/** "Thu, Oct 15, 12:30 PM IST". Every absence time is shown in IST, the zone the fines are counted in. */
export function istTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '-' : formatInZone(at, INDIA_ZONE);
}

/** Server messages are already readable; this only fills in when one is missing, and never exposes a 403 body. */
const FALLBACK: Record<AbsenceErrorCode, string> = {
  fines_off: 'Fines are switched off, so nothing can be marked absent right now.',
  fines_not_started: 'Fines have not started yet, so nothing can be marked absent.',
  before_live_from: 'This call is before the date fines went live.',
  before_tracking: 'This call is before this BDA was tracked for attendance.',
  already_fined: 'This call already has a fine.',
  already_reported: 'This call already has a report.',
  not_pending: 'Someone already decided this report. The list has been refreshed.',
  not_scheduled: 'This call is no longer scheduled, so it cannot be marked absent.',
  call_not_over: 'This call has not finished yet.',
  too_old: 'This call is more than 30 days old, so it can no longer be marked absent.',
  meeting_did_not_happen: 'The client did not show up to this meeting, so there is no absence to record.',
  forbidden: 'You do not have permission to do that.',
};

export function absenceErrorMessage(cause: unknown, fallback = 'That did not work. Nothing was changed.'): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'forbidden') return FALLBACK.forbidden;
    if (cause.message && !/^Request failed \(\d+\)$/.test(cause.message)) return cause.message;
    if (cause.code && cause.code in FALLBACK) return FALLBACK[cause.code as AbsenceErrorCode];
    return fallback;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Oldest pending report first, so the review queue works through the backlog in order. */
export function sortPending(reports: AbsenceReport[]): AbsenceReport[] {
  return [...reports].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.reportId.localeCompare(b.reportId));
}

/** Newest decision first. A report with no decision time falls back to when it was raised. */
export function sortDecided(reports: AbsenceReport[]): AbsenceReport[] {
  const at = (r: AbsenceReport) => Date.parse(r.decidedAt ?? r.createdAt) || 0;
  return [...reports].sort((a, b) => at(b) - at(a) || a.reportId.localeCompare(b.reportId));
}

/** A BDA sees pending reports first, then everything else newest first. */
export function sortForBda(reports: AbsenceReport[]): AbsenceReport[] {
  const pending = reports.filter((r) => r.status === 'pending');
  const rest = reports.filter((r) => r.status !== 'pending');
  return [...pending.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), ...sortDecided(rest)];
}

/** The server refuses more than this in one request. */
export const BATCH_MAX = 50;

export const candidateKey = (c: { kind: AbsenceKind; refId: string }) => `${c.kind}|${c.refId}`;

/** One refused call in a batch: the server's sentence, or the stock one for its code. */
export function refusalMessage(error: { code: string; message: string }): string {
  if (error.message) return error.message;
  return error.code in FALLBACK ? FALLBACK[error.code as AbsenceErrorCode] : 'That call could not be saved.';
}

/** What to tell the person once a mark or report went through. */
export function successNotice(report: Pick<AbsenceReport, 'status' | 'clientName'>): string {
  return report.status === 'approved'
    ? `Absence recorded for ${report.clientName}. The fine was added to the ledger.`
    : `Report sent for ${report.clientName}. An admin will review it, and the fine only starts after approval.`;
}

/**
 * What to tell the person after one or many calls were sent. All saved: the single-call wording, or a count.
 * Some refused: say how many went through and name each refusal, so nothing fails silently.
 */
export function outcomeNotice(outcome: AbsenceOutcome): string {
  const { saved, failed } = outcome;
  if (failed.length === 0 && saved.length === 1) return successNotice(saved[0]);
  const n = saved.length;
  const pending = saved.some((r) => r.status === 'pending');
  const done = pending
    ? `${n} ${n === 1 ? 'report' : 'reports'} sent. An admin will review ${n === 1 ? 'it' : 'them'}, and fines only start after approval.`
    : `${n} ${n === 1 ? 'absence' : 'absences'} recorded. The ${n === 1 ? 'fine was' : 'fines were'} added to the ledger.`;
  if (failed.length === 0) return done;
  const refused = failed.map((f) => `${f.clientName}: ${f.message}`).join(' ');
  return saved.length === 0 ? `Nothing was saved. ${refused}` : `${done} ${failed.length} refused. ${refused}`;
}

/** Runs a request and turns a failure into an Error whose message is safe to show in a dialog. */
export async function withFriendlyError<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    throw new Error(absenceErrorMessage(cause));
  }
}

/** The review queue. One shared filter, so the nav badge, the queue and the Lead Allocation tab share one request. */
export const PENDING_REPORTS: AbsenceReportsFilters = { status: 'pending', kind: '', bdaEmail: '', month: '' };
