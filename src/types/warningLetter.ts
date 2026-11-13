/** Warning letters: a BDA who misses too many meetings in a calendar month gets a written warning.
 * Server contract: /api/crm/warning-letters (errors are { success: false, error: { code, message } }).
 */

export type WarningMode = 'off' | 'draft' | 'live';
export type WarningLetterStatus = 'draft' | 'sent' | 'failed' | 'dismissed';

export interface WarningPolicyLevel {
  level: number;
  threshold: number;
  title: string;
}

export interface WarningMissedMeeting {
  bookingId: string;
  clientName: string;
  /** ISO instant the meeting was scheduled to start. */
  scheduledStart: string;
  amountInr: number;
}

export interface WarningLetter {
  letterId: string;
  bdaEmail: string;
  bdaName: string;
  level: number;
  title: string;
  threshold: number;
  missedCount: number;
  windowFrom: string;
  windowTo: string;
  totalAmountInr: number;
  missed: WarningMissedMeeting[];
  status: WarningLetterStatus;
  subject: string;
  bodyText: string;
  toEmail: string;
  ccEmails: string[];
  sentAt: string | null;
  sentBy: string | null;
  error: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  dismissNote: string | null;
  createdAt: string;
}

export interface WarningStanding {
  bdaEmail: string;
  bdaName: string;
  missedCount: number;
  /** 0 = no letter reached yet, 1 to 3 = the highest level reached. */
  level: number;
  /** The count that triggers the next letter, or null when none is left. */
  nextThreshold: number | null;
}

export interface WarningLettersResponse {
  success: true;
  mode: WarningMode;
  /** The month being counted. Null before counting starts (13 Nov 2026). */
  window: { from: string; to: string; label: string } | null;
  policy: WarningPolicyLevel[];
  letters: WarningLetter[];
  standings: WarningStanding[];
  /** Admins only: drafts plus failed letters. */
  draftCount?: number;
}

export interface WarningLetterResponse {
  success: true;
  letter: WarningLetter;
}

export interface EvaluateWarningsResponse {
  success: true;
  mode: WarningMode;
  created: string[];
  sent: string[];
  failed: string[];
}
