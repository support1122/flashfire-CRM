import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crmRequest } from './attendance';
import type {
  EvaluateWarningsResponse,
  WarningLetterResponse,
  WarningLetterStatus,
  WarningLettersResponse,
} from '../types/warningLetter';

const BASE = '/api/crm/warning-letters';

export const warningLetterKeys = {
  all: ['warning-letters'] as const,
  list: (status: WarningLetterStatus | '') => ['warning-letters', 'list', status] as const,
};

/** A BDA always gets only their own sent letters. An admin may narrow by status. */
export function useWarningLetters(
  token: string | null,
  status: WarningLetterStatus | '' = '',
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: warningLetterKeys.list(status),
    enabled: (opts.enabled ?? true) && Boolean(token),
    queryFn: ({ signal }) =>
      crmRequest<WarningLettersResponse>(`${BASE}${status ? `?status=${encodeURIComponent(status)}` : ''}`, token, { signal }),
  });
}

function useInvalidateLetters() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: warningLetterKeys.all });
}

/** Admin: emails the letter to the BDA, admins copied. */
export function useSendWarningLetter(token: string | null) {
  const invalidate = useInvalidateLetters();
  return useMutation({
    mutationFn: (letterId: string) =>
      crmRequest<WarningLetterResponse>(`${BASE}/${encodeURIComponent(letterId)}/send`, token, { method: 'POST', body: {} }),
    // onSettled: a 409 already_resolved or a failed send both mean the list on screen is stale.
    onSettled: invalidate,
  });
}

/** Admin: closes a draft or failed letter without sending it. */
export function useDismissWarningLetter(token: string | null) {
  const invalidate = useInvalidateLetters();
  return useMutation({
    mutationFn: ({ letterId, note }: { letterId: string; note?: string }) =>
      crmRequest<WarningLetterResponse>(`${BASE}/${encodeURIComponent(letterId)}/dismiss`, token, {
        method: 'POST',
        body: note ? { note } : {},
      }),
    onSettled: invalidate,
  });
}

/** Admin: runs the check now instead of waiting for the schedule. */
export function useEvaluateWarningLetters(token: string | null) {
  const invalidate = useInvalidateLetters();
  return useMutation({
    mutationFn: () => crmRequest<EvaluateWarningsResponse>(`${BASE}/evaluate`, token, { method: 'POST', body: {} }),
    onSettled: invalidate,
  });
}
