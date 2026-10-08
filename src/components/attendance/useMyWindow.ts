import { useQuery } from '@tanstack/react-query';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { fetchMyWindow } from '../../api/attendance';

export const MY_WINDOW_POLL_MS = 15_000;

export function myWindowKey(email: string | undefined) {
  return ['attendance', 'my-window', email ?? null] as const;
}

/**
 * Polls the Mark Present window every 15 s.
 * `serverOffsetMs` is serverTime minus the PC clock at the moment the answer arrived;
 * add it to Date.now() to get the server clock. It is refreshed on every poll.
 */
export function useMyWindow() {
  const { token, user } = useCrmAuth();
  const query = useQuery({
    queryKey: myWindowKey(user?.email),
    queryFn: ({ signal }) => fetchMyWindow(token, signal),
    enabled: !!token,
    refetchInterval: MY_WINDOW_POLL_MS,
    refetchIntervalInBackground: true,
  });

  const serverOffsetMs = query.data ? Date.parse(query.data.serverTime) - query.dataUpdatedAt : 0;
  return { ...query, serverOffsetMs };
}
