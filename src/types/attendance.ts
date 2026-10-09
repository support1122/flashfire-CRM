/** Contract types for BDA attendance: what the CRM receives from the backend and displays to BDAs and admins.
 * Source of truth: DASH/BDA attendance/docs/api-contracts.md (plan sections 2-8).
 * Unknown or not-yet-computed values arrive as null, never omitted, so the CRM never needs type guards.
 */

/** One countable meeting showing its Mark Present window state (all times ISO, on server clock).
 * Used by GET /api/crm/attendance/my-window to show the current and next meeting for the Mark Present card.
 */
export interface Window {
  bookingId: string;
  clientName: string;
  scheduledStart: string; // Meeting start time (server clock)
  windowOpensAt: string; // start - 5 min: when Mark Present button becomes enabled
  windowClosesAt: string; // start + 60s: deadline to mark present
  marked: boolean;
  markedPresentAt: string | null; // Server-corrected time of the signal that counted (null = not marked yet)
  verdict: 'present' | 'absent' | null; // null while window is open, decided at start + 60s + 30s settle time
  verdictSignal: SignalKind | null; // Which signal (button_crm, extension_join, etc) led to present verdict
}

export interface MyWindowResponse {
  success: true;
  /** The server clock at the moment of the response. The countdown is derived from this. */
  serverTime: string;
  /** Registry flag for the logged-in user. When false the card renders nothing. */
  tracked: boolean;
  current: Window | null;
  next: Window | null;
}

export interface MarkPresentResponse {
  success: true;
  marked: true;
  markedPresentAt: string;
}

export type SignalKind = 'button_meet' | 'button_crm' | 'extension_join' | 'google_meet';

export interface AttendanceSignal {
  kind: SignalKind;
  eventAt: string;
}

export interface AttendanceSession {
  joinedAt: string;
  leftAt: string | null;
}

/** Attendance verdict and evidence for one meeting (plan section 2.2-2.3).
 * Every meeting row on /api/meeting-links and /api/leads/paginated gains these fields.
 */
export interface MeetingAttendance {
  verdict: 'present' | 'absent' | null; // null = window not closed yet; decided at start + 60s + 30s settle
  verdictAt: string | null; // ISO timestamp when the server decided the verdict
  markedPresentAt: string | null; // Earliest signal time counted in the window (null = no mark, might be late join)
  signals: AttendanceSignal[]; // All signals received: button clicks, extension join, Google Meet records
  inAt: string | null; // First join time (Google records > extension data, source-priority in plan 2.3)
  outAt: string | null; // Last leave time (Google records > extension data)
  timeSpentMs: number; // Sum of all in-call segments, including rejoins (plan 2.3)
  sessions: AttendanceSession[]; // Every join/leave segment, so rejoins are visible to BDAs and admins
  verified: boolean; // true = times come from Google Meet conference records (authoritative); false = from extension
  matchedBy: 'stable_id' | 'name' | null; // How the BDA was identified (plan 2.8): email/calendly/zoom > name
  integrityFlag: 'marked_never_joined' | null; // Flag: BDA marked present but never joined the call (plan 2.2, open D10)
  /**
   * Which device the BDA joined from (backend Utils/JoinDevice.js). Display only, never decides a verdict.
   * pc: the extension saw this call. mobile: Google saw the BDA while the extension ran on the PC without this call
   * in any tab. phone_dial_in: Google lists the BDA as a dial-in. unknown: extension offline during the call.
   */
  joinDevice?: JoinDevice | null;
  joinDeviceReason?: string | null;
}

export type JoinDevice = 'pc' | 'mobile' | 'phone_dial_in' | 'unknown';

/** Summary of calls from the assigned BDA to the client on a booking (plan section 2.4).
 * Computed from Zoom Phone call logs; matched by BDA email, Zoom ID, or normalized phone number.
 */
export interface CallSummary {
  calls: number; // Total outbound calls to the client
  connected: boolean; // true = at least one call reached the client (connected)
  firstCallAt: string | null; // ISO timestamp of the first outbound call
  /** Minutes after scheduled start when the first call was made. Negative = before start. */
  firstCallOffsetMin: number | null;
  talkSec: number; // Total talk time in seconds across all connected calls
  calledWithin30Min: boolean; // true = at least one call between start and start + 30min (plan 2.5, no-show rule)
  lastCallAt: string | null; // ISO timestamp of the most recent call
}

export interface StatusUpdate {
  status: string;
  updatedBy: string | null;
  updatedAt: string | null;
  /** true when the booking is stuck on scheduled long after the meeting */
  stuck: boolean;
}

export type DeductionRule = 'missed_meeting' | 'no_show_not_called' | 'status_not_updated';
export type DeductionStatus = 'shadow' | 'needs_review' | 'active' | 'waived' | 'voided';

/** The small form of a deduction that rides on every meeting row. */
export interface DeductionChip {
  deductionId: string;
  rule: DeductionRule;
  amountInr: number;
  status: DeductionStatus;
  waiverReason: string | null;
}

/** Full deduction ledger row from GET /api/crm/deductions (plan section 2.5, 8).
 * A row is created when a rule fires (missed_meeting, no_show_not_called, status_not_updated),
 * tracks evidence and any admin waiver/activation, and is never deleted (immutable audit trail).
 */
export interface Deduction {
  deductionId: string;
  bdaEmail: string;
  bdaName: string;
  bookingId: string;
  clientName: string;
  rule: DeductionRule; // 'missed_meeting' | 'no_show_not_called' | 'status_not_updated'
  month: string; // YYYY-MM (IST calendar month the booking started in)
  amountInr: number; // Fine amount in INR (may be 0 if waived)
  tierIndex: number | null; // Only for missed_meeting: 1-based tier (1st miss = 1, 6th+ = 6 and up; ₹1,000 from 6). The backend sets i + 1.
  status: DeductionStatus; // 'shadow' | 'needs_review' | 'active' | 'waived' | 'voided'
  evidence: {
    scheduledStart: string;
    windowClosedAt: string | null; // When the Mark Present window closed (start + 60s)
    signals: AttendanceSignal[]; // All signals (button clicks, extension join, Google records)
    bookingStatus: string | null; // Status at rule evaluation time
    callSummary: Partial<CallSummary> | null; // Calls from the BDA (for no_show_not_called rule)
    clientName: string;
  };
  waivedBy: string | null; // Admin who waived (approved the fine)
  waivedByName: string | null;
  waivedAt: string | null;
  waiverReason: string | null; // Why the admin waived (5-500 chars)
  voidedAt: string | null; // When late evidence turned absent->present (plan 2.2)
  voidReason: string | null; // 'late_evidence' or admin reason
  createdAt: string; // When the rule fired
}

/**
 * Transcript reference. Stays null until Part E ships, so the shape is deliberately loose:
 * a bare URL string or an object with an optional url.
 */
export type TranscriptRef =
  | string
  | {
      /** Calendly's recap link, when the email carried one. */
      url?: string | null;
      /** First ~280 characters of the Calendly Notetaker summary. */
      summaryPreview?: string;
      sentAt?: string | null;
      /** Present when a recap is stored: the full summary loads from GET /api/crm/bookings/:bookingId/recap. */
      bookingId?: string;
    };

/** One Calendly Notetaker recap, from GET /api/crm/bookings/:bookingId/recap. */
export interface BookingRecap {
  messageId: string;
  subject: string;
  sentAt: string | null;
  summary: string;
  sections: Record<string, string>;
  recapUrl: string | null;
  attendees: string[];
  matchStatus: 'matched' | 'ambiguous' | 'unmatched' | 'manual';
}

export interface BookingRecapResponse {
  success: true;
  recaps: BookingRecap[];
}

/** The attendance fields every meeting row gains on /api/meeting-links and /api/leads/paginated. */
export interface MeetingAttendanceFields {
  attendance: MeetingAttendance | null;
  callSummary: CallSummary | null;
  statusUpdate: StatusUpdate | null;
  deductions: DeductionChip[] | null;
  transcript: TranscriptRef | null;
}

/**
 * One row of GET /api/crm/attendance/my-month?month=YYYY-MM.
 * This endpoint is not in the original contract; it is added to api-contracts.md with this change.
 */
export interface MyMonthRow extends MeetingAttendanceFields {
  bookingId: string;
  clientName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  bookingStatus: string | null;
}

export interface MyMonthResponse {
  success: true;
  month: string;
  rows: MyMonthRow[];
}
