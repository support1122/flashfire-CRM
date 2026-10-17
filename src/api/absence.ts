import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmRequest } from './attendance';
import { attendanceAdminKeys } from './attendanceAdmin';
import { allocationKeys } from './salesAllocation';
import type {
  AbsenceCandidatesFilters,
  AbsenceCandidatesResponse,
  AbsenceReportsFilters,
  AbsenceReportsResponse,
  CreateAbsenceBody,
  CreateAbsenceResponse,
  DecideAbsenceResponse,
} from '../types/absence';

const BASE = '/api/crm/absences';

export const absenceKeys = {
  all: ['absences'] as const,
  reports: (f: AbsenceReportsFilters) => ['absences', 'reports', f.status, f.kind, f.bdaEmail, f.month] as const,
  candidates: (f: AbsenceCandidatesFilters) => ['absences', 'candidates', f.kind, f.bdaEmail, f.q] as const,
};

/** A BDA gets their own reports, an admin gets everyone's. The server decides, and adds `pendingCount` for admins. */
export function useAbsenceReports(
  token: string | null,
  filters: AbsenceReportsFilters,
  opts: { enabled?: boolean; poll?: boolean } = {},
) {
  return useQuery({
    queryKey: absenceKeys.reports(filters),
    enabled: (opts.enabled ?? true) && Boolean(token),
    refetchInterval: opts.poll ? 60_000 : false,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.kind) params.set('kind', filters.kind);
      if (filters.bdaEmail) params.set('bdaEmail', filters.bdaEmail);
      if (filters.month) params.set('month', filters.month);
      const qs = params.toString();
      return crmRequest<AbsenceReportsResponse>(`${BASE}/${qs ? `?${qs}` : ''}`, token, { signal });
    },
  });
}

/** Past calls from the last 30 days that can still be marked absent. `bdaEmail` only narrows an admin's list. */
export function useAbsenceCandidates(token: string | null, filters: AbsenceCandidatesFilters, enabled = true) {
  return useQuery({
    queryKey: absenceKeys.candidates(filters),
    enabled: enabled && Boolean(token),
    // A call can be fined or reported from another tab at any time, so never trust a stale list.
    staleTime: 0,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ kind: filters.kind });
      if (filters.bdaEmail) params.set('bdaEmail', filters.bdaEmail);
      if (filters.q) params.set('q', filters.q);
      return crmRequest<AbsenceCandidatesResponse>(`${BASE}/candidates?${params.toString()}`, token, { signal });
    },
  });
}

/** Everything one absence change can touch: the reports, the candidate lists, the ledger and the allocation list. */
function useInvalidateAbsences() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: absenceKeys.all }),
      qc.invalidateQueries({ queryKey: attendanceAdminKeys.all }),
      qc.invalidateQueries({ queryKey: allocationKeys.all }),
    ]);
}

/** Admin: the fine is written at once. BDA: a pending report is filed and nothing is fined yet. */
export function useCreateAbsence(token: string | null) {
  const invalidate = useInvalidateAbsences();
  return useMutation({
    mutationFn: (body: CreateAbsenceBody) => crmRequest<CreateAbsenceResponse>(`${BASE}/`, token, { method: 'POST', body }),
    // onSettled, not onSuccess: an already_fined or already_reported refusal means the lists on screen are stale.
    onSettled: invalidate,
  });
}

export function useApproveAbsence(token: string | null) {
  const invalidate = useInvalidateAbsences();
  return useMutation({
    mutationFn: ({ reportId, note }: { reportId: string; note?: string }) =>
      crmRequest<DecideAbsenceResponse>(`${BASE}/${encodeURIComponent(reportId)}/approve`, token, {
        method: 'POST',
        body: note ? { note } : {},
      }),
    onSettled: invalidate,
  });
}

export function useRejectAbsence(token: string | null) {
  const invalidate = useInvalidateAbsences();
  return useMutation({
    mutationFn: ({ reportId, reason }: { reportId: string; reason: string }) =>
      crmRequest<DecideAbsenceResponse>(`${BASE}/${encodeURIComponent(reportId)}/reject`, token, {
        method: 'POST',
        body: { reason },
      }),
    onSettled: invalidate,
  });
}

/** A BDA withdraws their own pending report. */
export function useCancelAbsence(token: string | null) {
  const invalidate = useInvalidateAbsences();
  return useMutation({
    mutationFn: (reportId: string) =>
      crmRequest<DecideAbsenceResponse>(`${BASE}/${encodeURIComponent(reportId)}/cancel`, token, {
        method: 'POST',
        body: {},
      }),
    onSettled: invalidate,
  });
}
