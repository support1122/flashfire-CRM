import type {
  CallSummary,
  MeetingAttendance,
  MyWindowResponse,
  StatusUpdate,
  Window,
} from '../types/attendance';

/** A meeting at 11:00 UTC, which is 4:30 PM in India. The window is 10:55:00 to 11:01:00 UTC. */
export function makeWindow(overrides: Partial<Window> = {}): Window {
  return {
    bookingId: 'bk_1',
    clientName: 'Aarav Mehta',
    scheduledStart: '2026-10-08T11:00:00.000Z',
    windowOpensAt: '2026-10-08T10:55:00.000Z',
    windowClosesAt: '2026-10-08T11:01:00.000Z',
    marked: false,
    markedPresentAt: null,
    verdict: null,
    verdictSignal: null,
    ...overrides,
  };
}

export function makeMyWindow(overrides: Partial<MyWindowResponse> = {}): MyWindowResponse {
  return {
    success: true,
    serverTime: '2026-10-08T11:00:18.000Z',
    tracked: true,
    current: makeWindow(),
    next: null,
    ...overrides,
  };
}

export function makeAttendance(overrides: Partial<MeetingAttendance> = {}): MeetingAttendance {
  return {
    verdict: 'present',
    verdictAt: '2026-10-08T11:01:30.000Z',
    markedPresentAt: '2026-10-08T10:59:51.000Z',
    signals: [{ kind: 'button_meet', eventAt: '2026-10-08T10:59:51.000Z' }],
    inAt: '2026-10-08T10:59:40.000Z',
    outAt: '2026-10-08T11:41:12.000Z',
    timeSpentMs: 2_472_000,
    sessions: [
      { joinedAt: '2026-10-08T10:59:40.000Z', leftAt: '2026-10-08T11:20:00.000Z' },
      { joinedAt: '2026-10-08T11:25:00.000Z', leftAt: '2026-10-08T11:41:12.000Z' },
    ],
    verified: true,
    matchedBy: 'stable_id',
    integrityFlag: null,
    ...overrides,
  };
}

export function makeCalls(overrides: Partial<CallSummary> = {}): CallSummary {
  return {
    calls: 3,
    connected: true,
    firstCallAt: '2026-10-08T11:08:00.000Z',
    firstCallOffsetMin: 8,
    talkSec: 412,
    calledWithin30Min: true,
    lastCallAt: '2026-10-08T11:20:00.000Z',
    ...overrides,
  };
}

export function makeStatus(overrides: Partial<StatusUpdate> = {}): StatusUpdate {
  return {
    status: 'completed',
    updatedBy: 'Siddhartha',
    updatedAt: '2026-10-08T11:42:00.000Z',
    stuck: false,
    ...overrides,
  };
}
