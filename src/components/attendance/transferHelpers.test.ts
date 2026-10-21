import { describe, expect, it } from 'vitest';
import type { TransferBda, TransferMeeting } from '../../types/attendanceAdmin';
import { buildTransferPlan, leaveClashes, warningText } from './transferHelpers';

const m = (id: string, day: string, hour: number): TransferMeeting => ({
  bookingId: id,
  clientName: id,
  bookingStatus: 'scheduled',
  scheduledStart: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  day,
  canMove: true,
});
const bda = (email: string, over: Partial<TransferBda> = {}): TransferBda => ({ email, displayName: email.split('@')[0], leaveDays: [], loadByDay: {}, ...over });

const SRC = 'kal@x';
const meetings = [m('a', '2026-10-25', 5), m('b', '2026-10-25', 6), m('c', '2026-10-25', 7), m('d', '2026-10-26', 5)];

describe('buildTransferPlan', () => {
  it('gives everything to one BDA in one mode', () => {
    const plan = buildTransferPlan(meetings, 'one', 'sid@x', [bda('sid@x')], SRC);
    expect(plan.map((p) => p.email)).toEqual(['sid@x', 'sid@x', 'sid@x', 'sid@x']);
  });

  it('spreads across free BDAs, starting with the one carrying the fewest that day', () => {
    const bdas = [bda(SRC), bda('adit@x', { loadByDay: { '2026-10-25': 3 } }), bda('sid@x', { loadByDay: { '2026-10-25': 0 } })];
    const plan = buildTransferPlan(meetings, 'spread', '', bdas, SRC);
    // sid starts at 0 and adit at 3, so sid stays at or below adit's load for all three meetings that day.
    expect(plan.slice(0, 3).map((p) => p.email)).toEqual(['sid@x', 'sid@x', 'sid@x']);
    expect(plan.every((p) => p.email !== SRC)).toBe(true);
  });

  it('skips a BDA who is on leave that day and says so when nobody is free', () => {
    const bdas = [bda(SRC), bda('sid@x', { leaveDays: ['2026-10-26'] })];
    const plan = buildTransferPlan(meetings, 'spread', '', bdas, SRC);
    expect(plan[3]).toMatchObject({ bookingId: 'd', email: null });
    expect(plan[3].note).toMatch(/on leave/);
    expect(plan[0].email).toBe('sid@x');
  });

  it('is the same every time, ties going to the first name', () => {
    const bdas = [bda(SRC), bda('b@x'), bda('a@x')];
    const one = buildTransferPlan(meetings, 'spread', '', bdas, SRC).map((p) => p.email);
    const two = buildTransferPlan([...meetings].reverse(), 'spread', '', bdas, SRC).map((p) => p.email);
    expect(one).toEqual(two);
    expect(one[0]).toBe('a@x');
  });
});

describe('leaveClashes and warningText', () => {
  it('lists the meetings that fall on the target leave days', () => {
    expect(leaveClashes(meetings, bda('sid@x', { leaveDays: ['2026-10-26'] })).map((x) => x.bookingId)).toEqual(['d']);
    expect(leaveClashes(meetings, undefined)).toEqual([]);
  });
  it('words the double booking warning', () => {
    expect(warningText('double_booked:Asha')).toBe('Already has a meeting with Asha at that time');
  });
});
