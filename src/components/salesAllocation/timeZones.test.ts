import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  dayKeyInZone,
  formatInZone,
  formatOffset,
  zoneOffsetMinutes,
  zonedWallToUtc,
} from './timeZones';

describe('zoneOffsetMinutes', () => {
  it('follows DST', () => {
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(-240);
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-12-01T12:00:00Z'))).toBe(-300);
  });
  it('handles half-hour zones and no-DST zones', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-07-01T00:00:00Z'))).toBe(330);
    expect(zoneOffsetMinutes('America/Phoenix', new Date('2026-07-01T00:00:00Z'))).toBe(-420);
    expect(zoneOffsetMinutes('America/St_Johns', new Date('2026-01-15T00:00:00Z'))).toBe(-210);
  });
});

describe('formatOffset', () => {
  it('prints whole and half hours', () => {
    expect(formatOffset(-240)).toBe('UTC-4');
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(0)).toBe('UTC+0');
  });
});

describe('zonedWallToUtc', () => {
  it('converts a summer New York time', () => {
    expect(zonedWallToUtc('2026-10-15T12:30', 'America/New_York')?.toISOString()).toBe('2026-10-15T16:30:00.000Z');
  });
  it('converts a winter New York time', () => {
    expect(zonedWallToUtc('2026-12-15T12:30', 'America/New_York')?.toISOString()).toBe('2026-12-15T17:30:00.000Z');
  });
  it('converts India and Sydney', () => {
    expect(zonedWallToUtc('2026-10-15T22:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-10-15T16:30:00.000Z');
    expect(zonedWallToUtc('2026-01-15T09:00', 'Australia/Sydney')?.toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });
  it('is correct either side of the US fall-back (2026-11-01)', () => {
    expect(zonedWallToUtc('2026-11-01T00:30', 'America/New_York')?.toISOString()).toBe('2026-11-01T04:30:00.000Z');
    expect(zonedWallToUtc('2026-11-01T03:30', 'America/New_York')?.toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });
  it('is correct either side of the US spring-forward (2026-03-08)', () => {
    expect(zonedWallToUtc('2026-03-08T01:30', 'America/New_York')?.toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(zonedWallToUtc('2026-03-08T03:30', 'America/New_York')?.toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });
  it('rejects junk', () => {
    expect(zonedWallToUtc('', 'Asia/Kolkata')).toBeNull();
    expect(zonedWallToUtc('tomorrow', 'Asia/Kolkata')).toBeNull();
  });
});

describe('formatInZone', () => {
  const instant = new Date('2026-10-15T16:30:00Z');
  it('shows the client wall time with its abbreviation', () => {
    expect(formatInZone(instant, 'America/New_York')).toBe('Thu, Oct 15, 12:30 PM EDT');
  });
  it('shows India as IST', () => {
    expect(formatInZone(instant, 'Asia/Kolkata')).toBe('Thu, Oct 15, 10:00 PM IST');
  });
});

describe('countdownLabel', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  it('reads naturally', () => {
    expect(countdownLabel(new Date('2026-10-15T10:42:00Z'), now)).toBe('in 42 min');
    expect(countdownLabel(new Date('2026-10-15T13:05:00Z'), now)).toBe('in 3 h 5 min');
    expect(countdownLabel(new Date('2026-10-17T10:00:00Z'), now)).toBe('in 2 days');
    expect(countdownLabel(new Date('2026-10-15T09:48:00Z'), now)).toBe('12 min ago');
  });
});

describe('dayKeyInZone', () => {
  it('rolls the date by zone', () => {
    const i = new Date('2026-10-15T20:00:00Z');
    expect(dayKeyInZone(i, 'Asia/Kolkata')).toBe('2026-10-16');
    expect(dayKeyInZone(i, 'America/New_York')).toBe('2026-10-15');
  });
});
