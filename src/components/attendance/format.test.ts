import { describe, expect, it } from 'vitest';
import { fmtTime, fmtWeekdayDate } from './format';

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
