import { describe, expect, it } from 'vitest';
import { fmtMeetingTime, fmtTime, fmtWeekdayDate, fmtWorkDay, istDateKey } from './format';

// Offset-less ISO strings parse as local time, so these hold in any timezone.
describe('fmtWeekdayDate', () => {
  it('formats weekday, day, month and year', () => {
    expect(fmtWeekdayDate('2026-10-21T16:30:00')).toBe('Wed, 21 Oct 2026');
  });

  it('returns a dash for missing or bad input', () => {
    expect(fmtWeekdayDate(null)).toBe('-');
    expect(fmtWeekdayDate(undefined)).toBe('-');
    expect(fmtWeekdayDate('')).toBe('-');
    expect(fmtWeekdayDate('not a date')).toBe('-');
  });
});

describe('fmtTime', () => {
  it('formats the clock time', () => {
    expect(fmtTime('2026-10-21T16:30:00')).toBe('4:30 PM');
    expect(fmtTime('2026-10-21T09:05:00')).toBe('9:05 AM');
  });

  it('returns a dash for missing or bad input', () => {
    expect(fmtTime(null)).toBe('-');
    expect(fmtTime(undefined)).toBe('-');
    expect(fmtTime('')).toBe('-');
    expect(fmtTime('not a date')).toBe('-');
  });
});

describe('fmtWorkDay', () => {
  it('formats a plain calendar date with no timezone shift', () => {
    expect(fmtWorkDay('2026-10-29')).toBe('Thu, 29 Oct 2026');
    expect(fmtWorkDay('2026-11-01')).toBe('Sun, 1 Nov 2026');
  });

  it('returns a dash for missing or bad input', () => {
    expect(fmtWorkDay(null)).toBe('-');
    expect(fmtWorkDay(undefined)).toBe('-');
    expect(fmtWorkDay('')).toBe('-');
    expect(fmtWorkDay('29 Oct')).toBe('-');
  });
});

describe('istDateKey', () => {
  it('reads the IST calendar date of an instant', () => {
    expect(istDateKey('2026-10-30T01:00:00+05:30')).toBe('2026-10-30');
    expect(istDateKey('2026-10-29T20:00:00Z')).toBe('2026-10-30');
    expect(istDateKey('nope')).toBeNull();
  });
});

describe('fmtMeetingTime', () => {
  it('adds the real date only when it differs from the working day', () => {
    expect(fmtMeetingTime('2026-10-30T01:00:00+05:30', '2026-10-29')).toBe('1:00 AM, Fri 30 Oct');
    expect(fmtMeetingTime('2026-10-29T17:30:00+05:30', '2026-10-29')).toBe('5:30 PM');
  });

  it('falls back to the plain clock time without a working day', () => {
    expect(fmtMeetingTime('2026-10-21T16:30:00', null)).toBe('4:30 PM');
    expect(fmtMeetingTime('2026-10-21T16:30:00', undefined)).toBe('4:30 PM');
  });

  it('returns a dash for a bad instant', () => {
    expect(fmtMeetingTime('nope', '2026-10-29')).toBe('-');
  });
});
