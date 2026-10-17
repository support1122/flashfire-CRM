import { ApiError } from '../../api/attendance';
import type { AbsenceErrorCode, AbsenceKind, AbsenceReport, AbsenceReportsFilters, AbsenceStatus } from '../../types/absence';
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

/** What to tell the person once a mark or report went through. */
export function successNotice(report: Pick<AbsenceReport, 'status' | 'clientName'>): string {
  return report.status === 'approved'
    ? `Absence recorded for ${report.clientName}. The fine was added to the ledger.`
    : `Report sent for ${report.clientName}. An admin will review it, and the fine only starts after approval.`;
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
