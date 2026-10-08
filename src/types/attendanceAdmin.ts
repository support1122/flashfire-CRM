/** Admin-only types for the Deductions tab, review queues, and BDA registry management.
 * Source of truth: DASH/BDA attendance/docs/api-contracts.md (plan sections 2-8).
 * Row-level types (Deduction, DeductionRule, DeductionStatus) are reused from ./attendance.ts
 * to keep the single source of truth for data shapes.
 */
import type { Deduction, DeductionRule, SignalKind } from './attendance';

export type DeductionsMode = 'off' | 'shadow' | 'live';

export interface RuleTotal {
  count: number;
  amountInr: number;
}

export type RuleTotals = Record<DeductionRule, RuleTotal>;

export interface DeductionsResponse {
  success: true;
  month: string;
  mode: DeductionsMode;
  rows: Deduction[];
  totals: {
    byRule: Partial<RuleTotals>;
    activeAmountInr: number;
  };
}

export interface DeductionSummaryRow {
  bdaEmail: string;
  name: string;
  activeAmountInr: number;
  count: number;
  byRule: Partial<RuleTotals>;
}

export interface DeductionSummaryResponse {
  success: true;
  month: string;
  perBda: DeductionSummaryRow[];
}

export interface WaiveBody {
  reason: string;
}

export interface ActivateBody {
  reason: string;
  action: 'activate' | 'waive';
}

export interface DeductionMutationResponse {
  success: true;
  deduction: Deduction;
}

export interface MarkedNeverJoinedItem {
  bookingId: string;
  clientName: string;
  bdaEmail: string;
  scheduledStart: string;
  markedAt: string;
  signal: SignalKind;
}

export interface StuckStatusItem {
  bookingId: string;
  clientName: string;
  bdaEmail: string;
  scheduledStart: string;
  bookingStatus: string;
}

export interface NeedsReassignmentItem {
  bookingId: string;
  clientName: string;
  scheduledStart: string;
  assignedBdaEmail: string;
  reason: string;
}

export interface ReviewQueuesResponse {
  success: true;
  needsReview: Deduction[];
  markedNeverJoined: MarkedNeverJoinedItem[];
  stuckStatus: StuckStatusItem[];
  needsReassignment: NeedsReassignmentItem[];
}

/** Registry entry for one BDA: their identity (email, names, aliases) and tracking settings.
 * Created by admins, used throughout the system to match BDAs across Google Meet, Zoom, Calendly, and the CRM.
 * See plan section 2.8 for the identity matching rules and why every system names the same person differently.
 */
export interface BdaProfile {
  email: string; // Unique identity key (lowercase), the canonical email address for this person
  displayName: string; // "Siddhartha" or "Kalpataru", used in attendance rows and admin lists
  firstName?: string; // "siddhartha", "kalpataru" (lowercase, used for name matching fallback)
  lastName?: string; // "basaveni", "samal" (used for name matching fallback)
  aliases: string[]; // Alternate names seen in the wild: ["siddhartha b", "basaveni siddhartha"]
  calendlyUserUri?: string | null; // https://api.calendly.com/users/74015a2f-..., identifies them on Calendly
  zoomUserId?: string | null; // Zoom Phone caller_user_id, identifies them on Zoom
  googleUserId?: string | null; // Google Meet participant user ID, learned automatically from Meet records
  discordUserId: string | null; // Discord @mention ID for admin alerts (set by admin)
  /** Approved leave dates in 'YYYY-MM-DD' format (IST timezone). Meetings on these dates are not countable. */
  leaveDays: string[];
  active: boolean; // false = person left the company, never count their meetings
  tracked: boolean; // false = person is in the registry but not counted for attendance/fines (e.g. admin testing an account)
}

export interface UnknownBdaName {
  name: string;
  count: number;
  lastSeenAt: string;
  source: string;
}

export interface BdaProfilesResponse {
  success: true;
  profiles: BdaProfile[];
  unknownNames: UnknownBdaName[];
}

/** The fields PUT /api/crm/admin/bda-profiles/:email accepts. */
export interface BdaProfileUpdate {
  aliases: string[];
  discordUserId: string | null;
  leaveDays: string[];
  tracked: boolean;
  active: boolean;
}
