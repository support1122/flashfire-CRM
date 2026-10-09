import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  applyLedgerFilters,
  countByStatus,
  hasActiveFilters,
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

describe('ledger filters', () => {
  const ids = (rows: { deductionId: string }[]) => rows.map((r) => r.deductionId);

  it('with default filters shows every row, newest meeting first, and does not mutate the input', () => {
    const copy = [...adminRows];
    const out = applyLedgerFilters(adminRows, DEFAULT_FILTERS);
    expect(out).toHaveLength(adminRows.length);
    expect(ids(out)[0]).toBe('ded_1008'); // 7 Oct 12:00, the latest meeting
    expect(ids(out).at(-1)).toBe('ded_1001'); // 1 Oct, the earliest
    expect(adminRows).toEqual(copy);
  });

  it('filters by status', () => {
    expect(ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, status: 'active' }))).toEqual(['ded_1004', 'ded_1003', 'ded_1002', 'ded_1001']);
    expect(ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, status: 'waived' }))).toEqual(['ded_1005']);
    expect(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, status: 'shadow' })).toHaveLength(1);
  });

  it('filters by rule, and status and rule combine (both must match)', () => {
    const noShow = applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, rule: 'no_show_not_called' });
    expect(ids(noShow)).toEqual(['ded_1007', 'ded_1003']);
    const both = applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, rule: 'no_show_not_called', status: 'needs_review' });
    expect(ids(both)).toEqual(['ded_1007']);
  });

  it('search matches client, BDA name, booking id and the waiver reason; case and accents do not matter', () => {
    const search = (q: string) => ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, search: q }));
    expect(search('hemanth')).toEqual(['ded_1001']);
    expect(search('OYELARAN')).toEqual(['ded_1003']);
    expect(search('kalpataru')).toEqual(expect.arrayContaining(['ded_1002', 'ded_1003', 'ded_1006', 'ded_1007']));
    expect(search('power cut')).toEqual(['ded_1005']); // the waiver reason
    expect(search('late_evidence')).toEqual(['ded_1006']); // the void reason
    expect(search(adminRows[3].bookingId)).toEqual([adminRows[3].deductionId]); // booking id
    expect(applyLedgerFilters([{ ...adminRows[0], clientName: 'Zoë Müller' }], { ...DEFAULT_FILTERS, search: 'zoe muller' })).toHaveLength(1);
  });

  it('every word of a search must match, in any order', () => {
    expect(ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, search: 'dasu hemanth' }))).toEqual(['ded_1001']);
    expect(ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, search: 'hemanth priya' }))).toEqual([]);
  });

  it('a blank or whitespace search filters nothing and is not an active filter', () => {
    expect(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, search: '   ' })).toHaveLength(adminRows.length);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'oldest' })).toBe(false); // sorting is not filtering
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'active' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, rule: 'missed_meeting' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'x' })).toBe(true);
  });

  it('sorts by date and by amount, with a stable tie order', () => {
    const oldest = ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, sort: 'oldest' }));
    expect(oldest[0]).toBe('ded_1001');
    expect(oldest.at(-1)).toBe('ded_1008');
    const high = applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, sort: 'amount_high' });
    expect(high[0].amountInr).toBe(500);
    expect(high.map((r) => r.amountInr)).toEqual([...high.map((r) => r.amountInr)].sort((a, b) => b - a));
    const low = applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, sort: 'amount_low' });
    expect(low[0].amountInr).toBe(50);
    expect(ids(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, sort: 'amount_high' }))).toEqual(ids(high));
  });

  it('rows with no usable meeting time sort last when newest first, and never crash', () => {
    const broken = { ...adminRows[0], deductionId: 'ded_x', evidence: { ...adminRows[0].evidence, scheduledStart: 'not a date' } };
    const out = applyLedgerFilters([broken, adminRows[1]], DEFAULT_FILTERS);
    expect(ids(out)).toEqual([adminRows[1].deductionId, 'ded_x']);
  });

  it('counts rows per status, ignoring the other filters', () => {
    expect(countByStatus(adminRows)).toEqual({ active: 4, needs_review: 1, waived: 1, voided: 1, shadow: 1 });
  });
});
