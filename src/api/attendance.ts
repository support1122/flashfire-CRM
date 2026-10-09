import { API_BASE_URL } from '../config';
import type { MarkPresentResponse, MyMonthResponse, MyWindowResponse } from '../types/attendance';

/** A failed API call from the backend. `status` is 0 when the network was unreachable.
 * Includes `code` (snake_case error identifier) and `details` (extra fields like windowOpensAt on 409s).
 */
export class ApiError extends Error {
  readonly status: number; // HTTP status code, or 0 if network unreachable
  readonly code: string | null; // Error code from the backend (e.g. 'window_closed', 'not_assigned')
  /** Extra fields from the error response, used by the caller. Examples: windowOpensAt, windowClosesAt on 409. */
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string | null, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Builds the ApiError for a failed response. The backend puts extra facts at the TOP LEVEL of the body, next to
 * `error` (for example windowOpensAt on a 409 window_not_open), so those are copied into `details` as well as
 * anything nested inside `error`. Reading only `error.*` silently lost them.
 */
export function toApiError(status: number, body: unknown): ApiError {
  const { success: _success, error: err, ...top } = (body ?? {}) as Record<string, unknown>;
  void _success;
  if (err && typeof err === 'object') {
    const { code, message, ...rest } = err as Record<string, unknown>;
    return new ApiError(
      status,
      typeof code === 'string' ? code : null,
      typeof message === 'string' ? message : `Request failed (${status})`,
      { ...top, ...rest },
    );
  }
  // Older endpoints return a bare string error.
  if (typeof err === 'string') return new ApiError(status, null, err, top);
  return new ApiError(status, null, `Request failed (${status})`, top);
}

/** Calls the CRM backend with the logged-in user's bearer token. Throws ApiError on failure.
 * Token comes from CrmAuthContext so the auth logic stays in one place. Every route except login needs a token.
 * Request errors are parsed into ApiError (code, message, details) so the caller handles them uniformly.
 */
export async function crmRequest<T>(path: string, token: string | null, opts: RequestOptions = {}): Promise<T> {
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

export function fetchMyWindow(token: string | null, signal?: AbortSignal): Promise<MyWindowResponse> {
  return crmRequest<MyWindowResponse>('/api/crm/attendance/my-window', token, { signal });
}

export function postMarkPresent(token: string | null, bookingId: string): Promise<MarkPresentResponse> {
  return crmRequest<MarkPresentResponse>(
    `/api/crm/attendance/${encodeURIComponent(bookingId)}/mark-present`,
    token,
    { method: 'POST', body: {} },
  );
}

export function fetchMyMonth(token: string | null, month: string, signal?: AbortSignal): Promise<MyMonthResponse> {
  return crmRequest<MyMonthResponse>(`/api/crm/attendance/my-month?month=${encodeURIComponent(month)}`, token, { signal });
}
