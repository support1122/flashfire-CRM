import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { ApiError, toApiError } from './attendance';
import type {
  CreateLeaveBody,
  LeaveImpactResponse,
  LeaveMutationResponse,
  LeaveRequestsResponse,
} from '../types/leave';

// Leave requests. Same error contract as ./attendanceAdmin so callers handle failures the same way.

async function leaveRequest<T>(
  path: string,
  token: string | null,
  opts: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
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

export const leaveKeys = {
  all: ['leave'] as const,
  list: (status: string, bdaEmail: string) => ['leave', 'list', status, bdaEmail] as const,
  impact: (leaveRequestId: string) => ['leave', 'impact', leaveRequestId] as const,
};

/** The server scopes the rows: a BDA gets their own, an admin gets everyone's. */
export function useLeaveRequests(token: string | null, status: string, bdaEmail: string) {
  return useQuery({
    queryKey: leaveKeys.list(status, bdaEmail),
    enabled: Boolean(token),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (status && status !== 'all') params.set('status', status);
      if (bdaEmail) params.set('bdaEmail', bdaEmail);
      const qs = params.toString();
      return leaveRequest<LeaveRequestsResponse>(`/api/crm/leave-requests${qs ? `?${qs}` : ''}`, token, { signal });
    },
  });
}

/** Admin only: what approving this request would waive. Fetched when the admin opens the decision dialog. */
export function useLeaveImpact(token: string | null, leaveRequestId: string | null) {
  return useQuery({
    queryKey: leaveKeys.impact(leaveRequestId ?? ''),
    enabled: Boolean(token && leaveRequestId),
    queryFn: ({ signal }) =>
      leaveRequest<LeaveImpactResponse>(
        `/api/crm/leave-requests/${encodeURIComponent(leaveRequestId as string)}/impact`,
        token,
        { signal },
      ),
  });
}

function useInvalidateLeave() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: leaveKeys.all });
    // Approving waives deductions, so the ledger on the Deductions tab is now stale too.
    qc.invalidateQueries({ queryKey: ['attendance-admin'] });
  };
}

export function useCreateLeaveRequest(token: string | null) {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (body: CreateLeaveBody) =>
      leaveRequest<LeaveMutationResponse>('/api/crm/leave-requests', token, { method: 'POST', body }),
    onSettled: invalidate,
  });
}

export function useDecideLeaveRequest(token: string | null) {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: ({
      leaveRequestId,
      decision,
      note,
    }: {
      leaveRequestId: string;
      decision: 'approve' | 'reject';
      note?: string;
    }) =>
      leaveRequest<LeaveMutationResponse>(
        `/api/crm/leave-requests/${encodeURIComponent(leaveRequestId)}/${decision}`,
        token,
        { method: 'POST', body: { note } },
      ),
    onSettled: invalidate,
  });
}

export function useCancelLeaveRequest(token: string | null) {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (leaveRequestId: string) =>
      leaveRequest<LeaveMutationResponse>(
        `/api/crm/leave-requests/${encodeURIComponent(leaveRequestId)}/cancel`,
        token,
        { method: 'POST' },
      ),
    onSettled: invalidate,
  });
}
