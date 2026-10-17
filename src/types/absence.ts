/** Mark absent: a person records that a BDA missed a call. An admin fines straight away, a BDA report waits for review.
 * Server contract: /api/crm/absences (errors are { success: false, error: { code, message } }).
 */

/** allocation = a Lead Allocation call, booking = a Calendly meeting. */
export type AbsenceKind = 'allocation' | 'booking';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** A past call (last 30 days) that could still be marked absent. Already fined or reported calls never appear. */
export interface AbsenceCandidate {
  kind: AbsenceKind;
  refId: string;
  bdaEmail: string;
  bdaName: string;
  clientName: string;
  /** ISO UTC instant the call started. */
  callStart: string;
  detail: string | null;
}

export interface AbsenceCandidatesResponse {
  success: true;
  kind: AbsenceKind;
  candidates: AbsenceCandidate[];
}

export interface AbsenceReport {
  reportId: string;
  kind: AbsenceKind;
  refId: string;
  bdaEmail: string;
  bdaName: string;
  clientName: string;
  callStart: string;
  reason: string;
  raisedBy: 'bda' | 'admin';
  raisedByName: string | null;
  status: AbsenceStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  deductionId: string | null;
  createdAt: string;
}

export interface AbsenceReportsResponse {
  success: true;
  reports: AbsenceReport[];
  /** Admins only. Always the global pending count, whatever filters the request carried. */
  pendingCount?: number;
}

export interface AbsenceReportsFilters {
  /** '' = any status. */
  status: AbsenceStatus | '';
  /** '' = both kinds. */
  kind: AbsenceKind | '';
  bdaEmail: string;
  /** YYYY-MM, '' = every month. */
  month: string;
}

export interface AbsenceCandidatesFilters {
  kind: AbsenceKind;
  bdaEmail: string;
  q: string;
}

export interface CreateAbsenceBody {
  kind: AbsenceKind;
  refId: string;
  reason: string;
}

/** 201 for both callers. An admin gets status approved plus deductionId, a BDA gets status pending and no fine yet. */
export interface CreateAbsenceResponse {
  success: true;
  report: AbsenceReport;
  deductionId?: string | null;
}

export interface DecideAbsenceResponse {
  success: true;
  report: AbsenceReport;
  deductionId?: string | null;
}

export type AbsenceErrorCode =
  | 'fines_off'
  | 'fines_not_started'
  | 'before_live_from'
  | 'before_tracking'
  | 'already_fined'
  | 'already_reported'
  | 'not_pending'
  | 'not_scheduled'
  | 'call_not_over'
  | 'too_old'
  | 'meeting_did_not_happen'
  | 'forbidden';
