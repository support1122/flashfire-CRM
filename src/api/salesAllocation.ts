import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmRequest } from './attendance';
import type {
  AllocationFilters,
  AllocationListResponse,
  AllocationMutationResponse,
  BdaAvailabilityResponse,
  CreateAllocationBody,
  LeadLookupResponse,
} from '../types/salesAllocation';

const BASE = '/api/crm/sales-allocations';

export const allocationKeys = {
  all: ['sales-allocations'] as const,
  list: (f: AllocationFilters) => ['sales-allocations', 'list', f.scope, f.status, f.bdaEmail] as const,
  lookup: (q: string) => ['sales-allocations', 'lookup', q] as const,
  bdas: (callAt: string) => ['sales-allocations', 'bdas', callAt] as const,
};

/** The server decides the shape: a BDA gets their own calls, an admin gets everyone's. */
export function useSalesAllocations(token: string | null, filters: AllocationFilters) {
  return useQuery({
    queryKey: allocationKeys.list(filters),
    enabled: Boolean(token),
    // Statuses and countdowns drift, so keep the list fresh without a manual refresh.
    refetchInterval: 60_000,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ scope: filters.scope });
      if (filters.status) params.set('status', filters.status);
      if (filters.bdaEmail) params.set('bdaEmail', filters.bdaEmail);
      return crmRequest<AllocationListResponse>(`${BASE}/?${params.toString()}`, token, { signal });
    },
  });
}

/** Admin only. The caller debounces `q` and passes '' until it is at least 3 characters. */
export function useLeadLookup(token: string | null, q: string) {
  return useQuery({
    queryKey: allocationKeys.lookup(q),
    enabled: Boolean(token) && q.length >= 3,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      crmRequest<LeadLookupResponse>(`${BASE}/lookup?q=${encodeURIComponent(q)}`, token, { signal }),
  });
}

/** Admin only. Who can take a call at this instant. */
export function useBdaAvailability(token: string | null, callAt: string | null) {
  return useQuery({
    queryKey: allocationKeys.bdas(callAt ?? ''),
    enabled: Boolean(token && callAt),
    queryFn: ({ signal }) =>
      crmRequest<BdaAvailabilityResponse>(`${BASE}/bdas?callAt=${encodeURIComponent(callAt as string)}`, token, {
        signal,
      }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: allocationKeys.all });
}

export function useCreateAllocation(token: string | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateAllocationBody) =>
      crmRequest<AllocationMutationResponse>(`${BASE}/`, token, { method: 'POST', body }),
    onSettled: invalidate,
  });
}

export function useReassignAllocation(token: string | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ allocationId, bdaEmail }: { allocationId: string; bdaEmail: string }) =>
      crmRequest<AllocationMutationResponse>(`${BASE}/${encodeURIComponent(allocationId)}/reassign`, token, {
        method: 'POST',
        body: { bdaEmail },
      }),
    onSettled: invalidate,
  });
}

export function useCancelAllocation(token: string | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (allocationId: string) =>
      crmRequest<AllocationMutationResponse>(`${BASE}/${encodeURIComponent(allocationId)}/cancel`, token, {
        method: 'POST',
        body: {},
      }),
    onSettled: invalidate,
  });
}

export function useAllocationOutcome(token: string | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      allocationId,
      status,
      note,
    }: {
      allocationId: string;
      status: 'completed' | 'no_answer';
      note?: string;
    }) =>
      crmRequest<AllocationMutationResponse>(`${BASE}/${encodeURIComponent(allocationId)}/outcome`, token, {
        method: 'POST',
        body: { status, note },
      }),
    onSettled: invalidate,
  });
}
