/** Leave requests: a BDA asks for days off, an admin decides, approval waives that day's deductions.
 * Server contract: BACKEND/flashfire-website-backend/Routes/leaveRoutes.js
 */

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  leaveRequestId: string;
  bdaEmail: string;
  bdaName: string;
  /** Every IST day the request covers, 'YYYY-MM-DD'. */
  days: string[];
  fromDate: string;
  toDate: string;
  dayCount: number;
  reason: string;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Filled on approval: what was waived, so the cost is visible on the request itself. */
  waivedDeductionIds: string[];
  waivedAmountInr: number;
  createdAt: string | null;
}

export interface LeaveRequestsResponse {
  success: true;
  /** True when the server answered with everyone's rows rather than just the caller's. */
  admin: boolean;
  rows: LeaveRequest[];
  pendingCount: number;
}

export interface LeaveImpactDeduction {
  deductionId: string;
  rule: string;
  amountInr: number;
  status: string;
  scheduledStart: string | null;
}

/** What approving a request would waive, shown to the admin before they decide. */
export interface LeaveImpactResponse {
  success: true;
  count: number;
  amountInr: number;
  deductions: LeaveImpactDeduction[];
}

export interface CreateLeaveBody {
  fromDate: string;
  toDate: string;
  reason: string;
}

export interface LeaveMutationResponse {
  success: true;
  request: LeaveRequest;
  waived?: { count: number; amountInr: number };
  daysAdded?: string[];
}
