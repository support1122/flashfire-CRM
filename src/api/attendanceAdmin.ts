import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { ApiError, toApiError } from './attendance';
import type { Deduction } from '../types/attendance';
import type {
  ActivateBody,
  BdaProfile,
  BdaProfilesResponse,
  BdaProfileUpdate,
  DeductionMutationResponse,
  DeductionSettings,
  DeductionsMode,
  DeductionsResponse,
  DeductionSummaryResponse,
  ReviewQueuesResponse,
} from '../types/attendanceAdmin';

// Admin endpoints need PUT (for profile edits, deduction actions), which the shared crmRequest in ./attendance
// does not support. This function duplicates crmRequest locally with PUT support, keeping the same ApiError contract
// so admin callers handle errors consistently. Kept local so the shared helper is not edited during parallel work.
async function adminRequest<T>(
  path: string,
  token: string | null,
  opts: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'network_error', 'Could not reach the server');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) throw toApiError(res.status, body);
  if (body === null || typeof body !== 'object') {
    throw new ApiError(res.status, 'bad_response', 'The server sent an unreadable answer');
  }
  return body as T;
}

export const attendanceAdminKeys = {
  all: ['attendance-admin'] as const,
  deductions: (month: string, bdaEmail: string) => ['attendance-admin', 'deductions', month, bdaEmail] as const,
  summary: (month: string) => ['attendance-admin', 'summary', month] as const,
  queues: ['attendance-admin', 'queues'] as const,
  profiles: ['attendance-admin', 'profiles'] as const,
  settings: ['attendance-admin', 'settings'] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Fetch deductions for a month. A BDA sees only their own rows; an admin sees all or filters by bdaEmail.
 * The server checks permissions and returns only rows the user is allowed to see.
 */
export function useDeductions(token: string | null, month: string, bdaEmail: string) {
  return useQuery({
    queryKey: attendanceAdminKeys.deductions(month, bdaEmail),
    enabled: Boolean(token),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ month });
      if (bdaEmail) params.set('bdaEmail', bdaEmail);
      return adminRequest<DeductionsResponse>(`/api/crm/deductions?${params.toString()}`, token, { signal });
    },
  });
}

export function useDeductionSummary(token: string | null, month: string, enabled: boolean) {
  return useQuery({
    queryKey: attendanceAdminKeys.summary(month),
    enabled: enabled && Boolean(token),
    queryFn: ({ signal }) =>
      adminRequest<DeductionSummaryResponse>(`/api/crm/deductions/summary?month=${encodeURIComponent(month)}`, token, {
        signal,
      }),
  });
}

export function useReviewQueues(token: string | null, enabled: boolean) {
  return useQuery({
    queryKey: attendanceAdminKeys.queues,
    enabled: enabled && Boolean(token),
    refetchInterval: 60_000,
    queryFn: ({ signal }) =>
      adminRequest<ReviewQueuesResponse>('/api/crm/admin/attendance/review-queues', token, { signal }),
  });
}

export function useBdaProfiles(token: string | null, enabled = true) {
  return useQuery({
    queryKey: attendanceAdminKeys.profiles,
    enabled: enabled && Boolean(token),
    queryFn: ({ signal }) => adminRequest<BdaProfilesResponse>('/api/crm/admin/bda-profiles', token, { signal }),
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Anything a ledger or queue change can touch: rows, per-BDA totals and the queues. */
function useInvalidateLedger() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: attendanceAdminKeys.all });
}

export function useWaiveDeduction(token: string | null) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ deductionId, reason }: { deductionId: string; reason: string }) =>
      adminRequest<DeductionMutationResponse>(`/api/crm/deductions/${encodeURIComponent(deductionId)}/waive`, token, {
        method: 'POST',
        body: { reason },
      }),
    // onSettled, not onSuccess: if another admin already resolved this row the server answers 409, and the list must
    // refresh so the stale Waive and Activate buttons disappear.
    onSettled: invalidate,
  });
}

export function useActivateDeduction(token: string | null) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ deductionId, reason, action }: { deductionId: string } & ActivateBody) =>
      adminRequest<DeductionMutationResponse>(
        `/api/crm/deductions/${encodeURIComponent(deductionId)}/activate`,
        token,
        { method: 'POST', body: { reason, action } },
      ),
    onSettled: invalidate,
  });
}

/** Waive a deduction (approve the fine) or activate a needs_review deduction with a decision.
 * The server has two separate endpoints (/waive and /activate) based on the row's status,
 * so this helper picks the right one: waive for active rows, activate or waive for needs_review.
 * Plan section 8.3.
 */
export function useResolveDeduction(token: string | null) {
  const waive = useWaiveDeduction(token);
  const activate = useActivateDeduction(token);
  const { mutateAsync: waiveAsync } = waive;
  const { mutateAsync: activateAsync } = activate;
  return useCallback(
    (deduction: Pick<Deduction, 'deductionId' | 'status'>, decision: 'activate' | 'waive', reason: string) => {
      if (deduction.status === 'needs_review') {
        return activateAsync({ deductionId: deduction.deductionId, reason, action: decision });
      }
      return waiveAsync({ deductionId: deduction.deductionId, reason });
    },
    [waiveAsync, activateAsync],
  );
}

export function useReassignBooking(token: string | null) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ bookingId, email }: { bookingId: string; email: string }) =>
      adminRequest<{ success: true }>(
        `/api/crm/admin/bookings/${encodeURIComponent(bookingId)}/attendance-assignee`,
        token,
        { method: 'PUT', body: { email } },
      ),
    onSettled: invalidate,
  });
}

export function useConvertToMiss(token: string | null) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ bookingId, bdaEmail, reason }: { bookingId: string; bdaEmail: string; reason: string }) =>
      adminRequest<{ success: true }>(
        `/api/crm/admin/attendance/${encodeURIComponent(bookingId)}/convert-to-miss`,
        token,
        { method: 'POST', body: { reason, bdaEmail } },
      ),
    onSettled: invalidate,
  });
}

/**
 * Closes a "marked present, never joined" flag without fining anyone.
 * This endpoint is not in the original contract; it is added to api-contracts.md with this change.
 */
export function useDismissIntegrityFlag(token: string | null) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ bookingId, bdaEmail, reason }: { bookingId: string; bdaEmail: string; reason: string }) =>
      adminRequest<{ success: true }>(
        `/api/crm/admin/attendance/${encodeURIComponent(bookingId)}/dismiss-integrity-flag`,
        token,
        { method: 'POST', body: { reason, bdaEmail } },
      ),
    onSettled: invalidate,
  });
}

interface SaveProfileVars {
  email: string;
  /** Only the field(s) the admin changed. Sending the whole profile from a stale cache would overwrite a colleague's
   * edit (for example re-enabling `tracked`), and re-validating untouched aliases could reject an unrelated toggle. */
  update: Partial<BdaProfileUpdate>;
}

/** Saves a BDA profile edit (name, aliases, leave days, etc) with optimistic updates.
 * The change shows in the UI immediately; if the server refuses, the cached profile reverts.
 * Uses `scope` so saves run sequentially: a fast second click cannot queue two saves that overtake each other.
 */
export function useSaveBdaProfile(token: string | null) {
  const client = useQueryClient();
  return useMutation({
    scope: { id: 'bda-profile-save' },
    mutationFn: ({ email, update }: SaveProfileVars) =>
      adminRequest<{ success: true; profile?: BdaProfile }>(
        `/api/crm/admin/bda-profiles/${encodeURIComponent(email)}`,
        token,
        { method: 'PUT', body: update },
      ),
    onMutate: async ({ email, update }) => {
      await client.cancelQueries({ queryKey: attendanceAdminKeys.profiles });
      const previous = client.getQueryData<BdaProfilesResponse>(attendanceAdminKeys.profiles);
      if (previous) {
        client.setQueryData<BdaProfilesResponse>(attendanceAdminKeys.profiles, {
          ...previous,
          profiles: previous.profiles.map((p) => (p.email === email ? { ...p, ...update } : p)),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(attendanceAdminKeys.profiles, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: attendanceAdminKeys.profiles }),
  });
}

/** The fines switch. Admin only. */
export function useDeductionSettings(token: string | null, enabled: boolean) {
  return useQuery({
    queryKey: attendanceAdminKeys.settings,
    queryFn: ({ signal }) => adminRequest<{ success: true; settings: DeductionSettings }>('/api/crm/admin/deductions/settings', token, { signal }),
    enabled: enabled && Boolean(token),
  });
}

/** Turn fines off / shadow / live. Live and shadow start now on the server; a past start is refused there. */
export function useSaveDeductionSettings(token: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mode: DeductionsMode) =>
      adminRequest<{ success: true; settings: DeductionSettings }>('/api/crm/admin/deductions/settings', token, { method: 'PUT', body: { mode } }),
    onSettled: () => client.invalidateQueries({ queryKey: attendanceAdminKeys.all }),
  });
}

/** The tracked BDAs (name + email), for filter dropdowns. Any signed-in CRM user. */
export function useTrackedBdas(token: string | null) {
  return useQuery({
    queryKey: ['attendance', 'tracked-bdas'] as const,
    queryFn: ({ signal }) =>
      adminRequest<{ success: true; bdas: { email: string; displayName: string }[] }>('/api/crm/attendance/bdas', token, { signal }),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
}
