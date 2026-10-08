// Realistic stub data and a fetch router for the Deductions tab, review queues and BDA registry.
// Used by the Vitest suites in this folder. Not imported by any production code.
import type { Deduction } from '../../types/attendance';
import type {
  BdaProfile,
  BdaProfilesResponse,
  DeductionsMode,
  DeductionsResponse,
  DeductionSummaryResponse,
  ReviewQueuesResponse,
} from '../../types/attendanceAdmin';
import { deriveTotals } from './deductionHelpers';

export const SIDDHARTHA = { email: 'siddhartha@flashfirehq.com', name: 'Siddhartha' };
export const KALPATARU = { email: 'kalpataru@flashfirehq.com', name: 'Kalpataru' };

function base(id: string, who: typeof SIDDHARTHA, partial: Partial<Deduction>): Deduction {
  return {
    deductionId: id,
    bdaEmail: who.email,
    bdaName: who.name,
    bookingId: `bk_${id}`,
    clientName: 'Client',
    rule: 'missed_meeting',
    month: '2026-10',
    amountInr: 500,
    tierIndex: 1,
    status: 'active',
    evidence: {
      scheduledStart: '2026-10-01T10:30:00.000Z',
      windowClosedAt: '2026-10-01T10:31:30.000Z',
      signals: [],
      bookingStatus: 'completed',
      callSummary: null,
      clientName: 'Client',
    },
    waivedBy: null,
    waivedByName: null,
    waivedAt: null,
    waiverReason: null,
    voidedAt: null,
    voidReason: null,
    createdAt: '2026-10-01T10:32:00.000Z',
    ...partial,
  };
}

export const missedActive = base('ded_1001', SIDDHARTHA, {
  clientName: 'Hemanth Dasu',
  tierIndex: 1,
  evidence: {
    scheduledStart: '2026-10-01T10:30:00.000Z',
    windowClosedAt: '2026-10-01T10:31:30.000Z',
    signals: [],
    bookingStatus: 'completed',
    callSummary: { calls: 0, connected: false, firstCallAt: null, firstCallOffsetMin: null, talkSec: 0, calledWithin30Min: false, lastCallAt: null },
    clientName: 'Hemanth Dasu',
  },
});

export const missedLate = base('ded_1002', KALPATARU, {
  clientName: 'Priya Raghavan',
  tierIndex: 2,
  createdAt: '2026-10-02T12:02:00.000Z',
  evidence: {
    scheduledStart: '2026-10-02T11:30:00.000Z',
    windowClosedAt: '2026-10-02T11:31:30.000Z',
    signals: [{ kind: 'extension_join', eventAt: '2026-10-02T11:32:10.000Z' }],
    bookingStatus: 'completed',
    callSummary: null,
    clientName: 'Priya Raghavan',
  },
});

export const noShowNotCalled = base('ded_1003', KALPATARU, {
  clientName: 'Marcus Oyelaran-Whitfield',
  rule: 'no_show_not_called',
  amountInr: 100,
  tierIndex: null,
  createdAt: '2026-10-03T13:15:00.000Z',
  evidence: {
    scheduledStart: '2026-10-03T12:00:00.000Z',
    windowClosedAt: null,
    signals: [],
    bookingStatus: 'no-show',
    callSummary: { calls: 0, connected: false, firstCallAt: null, firstCallOffsetMin: null, talkSec: 0, calledWithin30Min: false, lastCallAt: null },
    clientName: 'Marcus Oyelaran-Whitfield',
  },
});

export const statusNotUpdated = base('ded_1004', SIDDHARTHA, {
  clientName: 'Ananya Krishnamurthy',
  rule: 'status_not_updated',
  amountInr: 50,
  tierIndex: null,
  createdAt: '2026-10-04T15:00:00.000Z',
  evidence: {
    scheduledStart: '2026-10-04T13:00:00.000Z',
    windowClosedAt: null,
    signals: [],
    bookingStatus: 'scheduled',
    callSummary: null,
    clientName: 'Ananya Krishnamurthy',
  },
});

export const missedWaived = base('ded_1005', SIDDHARTHA, {
  clientName: 'Rohan Deshpande',
  status: 'waived',
  tierIndex: null,
  waivedBy: 'sohith@flashfirehq.com',
  waivedByName: 'Sohith',
  waivedAt: '2026-10-06T09:40:00.000Z',
  waiverReason: 'Power cut at the BDA home, confirmed by the ISP outage notice.',
  createdAt: '2026-10-05T10:05:00.000Z',
  evidence: {
    scheduledStart: '2026-10-05T10:00:00.000Z',
    windowClosedAt: '2026-10-05T10:01:30.000Z',
    signals: [],
    bookingStatus: 'completed',
    callSummary: null,
    clientName: 'Rohan Deshpande',
  },
});

export const missedVoided = base('ded_1006', KALPATARU, {
  clientName: 'Elena Fischer',
  status: 'voided',
  tierIndex: null,
  voidedAt: '2026-10-06T07:10:00.000Z',
  voidReason: 'late_evidence',
  createdAt: '2026-10-06T06:35:00.000Z',
  evidence: {
    scheduledStart: '2026-10-06T06:30:00.000Z',
    windowClosedAt: '2026-10-06T06:31:30.000Z',
    signals: [{ kind: 'google_meet', eventAt: '2026-10-06T06:30:40.000Z' }],
    bookingStatus: 'completed',
    callSummary: null,
    clientName: 'Elena Fischer',
  },
});

export const needsReviewRow = base('ded_1007', KALPATARU, {
  clientName: 'Tomasz Kowalczyk',
  rule: 'no_show_not_called',
  amountInr: 100,
  tierIndex: null,
  status: 'needs_review',
  createdAt: '2026-10-07T11:00:00.000Z',
  evidence: {
    scheduledStart: '2026-10-07T10:00:00.000Z',
    windowClosedAt: null,
    signals: [],
    bookingStatus: 'no-show',
    callSummary: { calls: 0, connected: false, firstCallAt: null, firstCallOffsetMin: null, talkSec: 0, calledWithin30Min: false, lastCallAt: null },
    clientName: 'Tomasz Kowalczyk',
  },
});

export const shadowRow = base('ded_1008', SIDDHARTHA, {
  clientName: 'Grace Okafor',
  rule: 'status_not_updated',
  amountInr: 50,
  tierIndex: null,
  status: 'shadow',
  createdAt: '2026-10-07T14:00:00.000Z',
  evidence: {
    scheduledStart: '2026-10-07T12:00:00.000Z',
    windowClosedAt: null,
    signals: [],
    bookingStatus: 'scheduled',
    callSummary: null,
    clientName: 'Grace Okafor',
  },
});

export const siddharthaNeedsReview = base('ded_1009', SIDDHARTHA, {
  clientName: 'Imran Qureshi',
  status: 'needs_review',
  tierIndex: null,
  createdAt: '2026-10-07T16:00:00.000Z',
  evidence: {
    scheduledStart: '2026-10-07T15:00:00.000Z',
    windowClosedAt: '2026-10-07T15:01:30.000Z',
    signals: [],
    bookingStatus: 'completed',
    callSummary: null,
    clientName: 'Imran Qureshi',
  },
});

/** Everything an admin sees. */
export const adminRows: Deduction[] = [
  missedActive,
  missedLate,
  noShowNotCalled,
  statusNotUpdated,
  missedWaived,
  missedVoided,
  needsReviewRow,
  shadowRow,
];

/** What the API returns to Siddhartha: own rows only, no shadow. */
export const siddharthaRows: Deduction[] = [missedActive, statusNotUpdated, missedWaived, siddharthaNeedsReview];

export function deductionsResponse(rows: Deduction[], mode: DeductionsMode = 'live'): DeductionsResponse {
  const { byRule, activeAmountInr } = deriveTotals(rows);
  return { success: true, month: '2026-10', mode, rows, totals: { byRule, activeAmountInr } };
}

export function summaryResponse(): DeductionSummaryResponse {
  const sid = deriveTotals(adminRows.filter((r) => r.bdaEmail === SIDDHARTHA.email));
  const kal = deriveTotals(adminRows.filter((r) => r.bdaEmail === KALPATARU.email));
  return {
    success: true,
    month: '2026-10',
    perBda: [
      { bdaEmail: SIDDHARTHA.email, name: SIDDHARTHA.name, activeAmountInr: sid.activeAmountInr, count: 2, byRule: sid.byRule },
      { bdaEmail: KALPATARU.email, name: KALPATARU.name, activeAmountInr: kal.activeAmountInr, count: 2, byRule: kal.byRule },
    ],
  };
}

export function queuesResponse(now: number = Date.now()): ReviewQueuesResponse {
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
  return {
    success: true,
    needsReview: [needsReviewRow],
    markedNeverJoined: [
      {
        bookingId: 'bk_nj_1',
        clientName: 'Sanjana Iyer',
        bdaEmail: SIDDHARTHA.email,
        scheduledStart: '2026-10-07T09:00:00.000Z',
        markedAt: '2026-10-07T08:56:41.000Z',
        signal: 'button_crm',
      },
      {
        bookingId: 'bk_nj_2',
        clientName: 'Daniel Brooks',
        bdaEmail: KALPATARU.email,
        scheduledStart: '2026-10-06T13:30:00.000Z',
        markedAt: '2026-10-06T13:27:12.000Z',
        signal: 'button_meet',
      },
    ],
    stuckStatus: [
      { bookingId: 'bk_st_1', clientName: 'Olivia Hartmann', bdaEmail: KALPATARU.email, scheduledStart: '2026-10-05T14:00:00.000Z', bookingStatus: 'scheduled' },
      { bookingId: 'bk_st_2', clientName: 'Vikram Nair', bdaEmail: SIDDHARTHA.email, scheduledStart: '2026-10-05T16:30:00.000Z', bookingStatus: 'scheduled' },
    ],
    needsReassignment: [
      { bookingId: 'bk_ra_open', clientName: 'Meera Pillai', scheduledStart: iso(3), assignedBdaEmail: KALPATARU.email, reason: 'leave' },
      { bookingId: 'bk_ra_later', clientName: 'Jonas Lindqvist', scheduledStart: iso(26 * 60), assignedBdaEmail: KALPATARU.email, reason: 'leave' },
    ],
  };
}

export const emptyQueues: ReviewQueuesResponse = {
  success: true,
  needsReview: [],
  markedNeverJoined: [],
  stuckStatus: [],
  needsReassignment: [],
};

export function profilesResponse(): BdaProfilesResponse {
  const sid: BdaProfile = {
    email: SIDDHARTHA.email,
    displayName: 'Siddhartha',
    firstName: 'siddhartha',
    lastName: 'basaveni',
    aliases: ['siddhartha b', 'basaveni siddhartha'],
    discordUserId: '412345678901234567',
    leaveDays: ['2026-10-12', '2026-10-13'],
    active: true,
    tracked: true,
  };
  const kal: BdaProfile = {
    email: KALPATARU.email,
    displayName: 'Kalpataru',
    firstName: 'kalpataru',
    lastName: 'samal',
    aliases: ['kalpataru s', 'kalpataru samal'],
    discordUserId: null,
    leaveDays: ['2026-10-09'],
    active: true,
    tracked: true,
  };
  const pranjal: BdaProfile = {
    email: 'pranjal@flashfirehq.com',
    displayName: 'Pranjal Tripathi',
    aliases: [],
    discordUserId: null,
    leaveDays: [],
    active: true,
    tracked: false,
  };
  return {
    success: true,
    profiles: [sid, kal, pranjal],
    unknownNames: [
      { name: 'Siddharthan Rao', count: 3, lastSeenAt: '2026-10-07T09:12:00.000Z', source: 'google_meet' },
      { name: 'Basaveni S.', count: 1, lastSeenAt: '2026-10-06T10:02:00.000Z', source: 'zoom_phone' },
      { name: 'iPhone', count: 6, lastSeenAt: '2026-10-05T12:45:00.000Z', source: 'google_meet' },
    ],
  };
}

// ---------------------------------------------------------------------------
// fetch router
// ---------------------------------------------------------------------------

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export type Handler = (call: RecordedCall) => Response | object | Promise<Response | object>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ success: false, error: { code, message } }, status);
}

/**
 * Replaces global fetch. `routes` maps "METHOD /path" (path without query string) to a handler that
 * returns a Response, or any object (sent as 200 JSON). Unmatched calls fail loudly.
 */
export function installFetch(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: RecordedCall = { method, path: `${url.pathname}${url.search}`, body };
    calls.push(call);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return apiError(404, 'not_stubbed', `No stub for ${method} ${url.pathname}`);
    const result = await handler(call);
    return result instanceof Response ? result : json(result);
  };
  return { calls, impl };
}
