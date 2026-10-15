/** Sales lead allocation: an admin books a call with a lead and assigns it to a BDA.
 * Server contract: /api/crm/sales-allocations
 */

export type AllocationStatus = 'scheduled' | 'completed' | 'no_answer' | 'cancelled';
export type AllocationScope = 'upcoming' | 'past' | 'all';

export interface SalesAllocation {
  allocationId: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  /** IANA zone of the client, e.g. 'America/New_York'. */
  timezone: string;
  /** ISO UTC instant of the call. */
  callAt: string;
  bdaEmail: string;
  bdaName: string;
  status: AllocationStatus;
  notes: string | null;
  outcomeNote: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  reminderState: string | null;
  reminderSentAt: string | null;
  crmUrl: string;
}

export interface AllocationListResponse {
  success: true;
  isAdmin: boolean;
  allocations: SalesAllocation[];
}

export interface LeadMatch {
  clientName: string;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  source: string;
}

export interface LeadLookupResponse {
  success: true;
  matches: LeadMatch[];
}

export interface BdaAvailability {
  email: string;
  name: string;
  available: boolean;
  reason: 'on_leave' | null;
  callsThatDay: number;
}

export interface BdaAvailabilityResponse {
  success: true;
  bdas: BdaAvailability[];
}

export interface CreateAllocationBody {
  clientName: string;
  phone?: string;
  email?: string;
  timezone: string;
  callAt: string;
  bdaEmail: string;
  notes?: string;
}

export interface AllocationMutationResponse {
  success: true;
  allocation: SalesAllocation;
}

export interface AllocationFilters {
  scope: AllocationScope;
  status: string;
  bdaEmail: string;
}
