import { describe, expect, it } from 'vitest';
import {
  currentMonthKey,
  deriveTotals,
  isCrmAdminUser,
  monthLabel,
  offsetFromStart,
  reasonProblem,
  shiftMonth,
  tierText,
  voidReasonText,
} from './deductionHelpers';
import { adminRows } from './attendanceAdminFixtures';

describe('isCrmAdminUser', () => {
  it('is true for role admin or the isAdmin flag, never for role bda alone', () => {
    expect(isCrmAdminUser({ role: 'admin' })).toBe(true);
    expect(isCrmAdminUser({ role: 'bda', isAdmin: true })).toBe(true);
    expect(isCrmAdminUser({ role: 'bda' })).toBe(false);
    expect(isCrmAdminUser({ role: 'bda', isAdmin: false })).toBe(false);
    expect(isCrmAdminUser(null)).toBe(false);
  });
});

describe('months', () => {
  it('uses the IST month, not the UTC one', () => {
    expect(currentMonthKey(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10'); // 00:30 IST on 1 Oct
    expect(currentMonthKey(new Date('2026-10-31T17:00:00Z'))).toBe('2026-10'); // 22:30 IST on 31 Oct
  });
  it('shifts across a year boundary and labels', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
});

describe('reasonProblem', () => {
  it('accepts 5 to 500 trimmed characters', () => {
    expect(reasonProblem('')).toMatch(/required/);
    expect(reasonProblem('   abc  ')).toMatch(/2 more characters/);
    expect(reasonProblem('abcde')).toBeNull();
    expect(reasonProblem('x'.repeat(500))).toBeNull();
    expect(reasonProblem('x'.repeat(501))).toMatch(/Too long by 1 character/);
  });
});

describe('deriveTotals', () => {
  it('counts active rows only', () => {
    const t = deriveTotals(adminRows);
    expect(t.activeAmountInr).toBe(1150);
    expect(t.byRule.missed_meeting).toEqual({ count: 2, amountInr: 1000 });
  });
});

describe('wording', () => {
  it('describes tiers, offsets and void reasons', () => {
    expect(tierText({ rule: 'missed_meeting', tierIndex: 6 })).toBe('6th miss this month');
    expect(tierText({ rule: 'missed_meeting', tierIndex: 11 })).toBe('11th miss this month');
    expect(tierText({ rule: 'no_show_not_called', tierIndex: null })).toBeNull();
    expect(offsetFromStart('2026-10-02T11:32:10Z', '2026-10-02T11:30:00Z')).toBe('2m 10s after the start');
    expect(offsetFromStart('2026-10-02T11:27:00Z', '2026-10-02T11:30:00Z')).toBe('3m before the start');
    expect(voidReasonText('late_evidence')).toMatch(/present after all/);
    expect(voidReasonText('some_new_code')).toBe('some new code');
  });
});
