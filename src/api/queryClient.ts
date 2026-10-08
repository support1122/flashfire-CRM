import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './attendance';

/** Retry strategy for TanStack Query. Retries network blips (5xx, timeout) and 0 (unreachable),
 * but never retries 4xx client errors (they won't succeed on a retry) or 401/403 auth errors.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // Never retry client errors (400-499): the request is malformed or unauthorized, retrying won't fix it
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  // Retry transient failures (network errors, 5xx, timeouts) up to 2 times
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export const queryClient = createQueryClient();
