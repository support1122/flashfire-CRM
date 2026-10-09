import type { Deduction, DeductionRule, DeductionStatus } from '../../types/attendance';
import type { RuleTotals } from '../../types/attendanceAdmin';
import { RULE_LABEL, SIGNAL_LABEL, formatInr, formatTalk } from './format';

export const RULES: DeductionRule[] = ['missed_meeting', 'no_show_not_called', 'status_not_updated'];

/** Matches the backend rule: role "admin" or the isAdmin flag. Never role "bda" alone. */
export function isCrmAdminUser(user: { role?: string; isAdmin?: boolean } | null | undefined): boolean {
  return Boolean(user && (user.role === 'admin' || user.isAdmin === true));
}

// ---------------------------------------------------------------------------
// Months. Keys are YYYY-MM in IST, the same as the backend.
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function currentMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? String(now.getUTCFullYear());
  const month = parts.find((p) => p.type === 'month')?.value ?? String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[(m || 1) - 1] ?? key} ${y}`;
}

// ---------------------------------------------------------------------------
// Status and wording
// ---------------------------------------------------------------------------

export function statusLabel(status: DeductionStatus, admin: boolean): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'needs_review':
      return admin ? 'Needs review' : 'Under review';
    case 'waived':
      return 'Waived';
    case 'voided':
      return 'Voided';
    case 'shadow':
      return 'Shadow';
  }
}

export const STATUS_CHIP: Record<DeductionStatus, string> = {
  active: 'bg-red-100 text-red-800',
  needs_review: 'bg-amber-100 text-amber-800',
  waived: 'bg-slate-200 text-slate-700',
  voided: 'bg-slate-200 text-slate-700',
  shadow: 'bg-indigo-100 text-indigo-800',
};

/** Only active amounts count towards pay. Everything else is shown but not counted. */
export function countsTowardsPay(d: Pick<Deduction, 'status'>): boolean {
  return d.status === 'active';
}

const VOID_REASONS: Record<string, string> = {
  late_evidence: 'Late evidence arrived, so the BDA was present after all',
  reassigned: 'The meeting was reassigned before the window opened',
  meeting_reassigned: 'The meeting was reassigned before the window opened',
  booking_canceled: 'The booking was canceled',
};

export function voidReasonText(reason: string | null): string {
  if (!reason) return 'No reason recorded';
  return VOID_REASONS[reason] ?? reason.replace(/_/g, ' ');
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "5th miss this month" for a missed meeting with a tier, nothing for other rules. */
export function tierText(d: Pick<Deduction, 'rule' | 'tierIndex'>): string | null {
  if (d.rule !== 'missed_meeting' || !d.tierIndex) return null;
  return `${ordinal(d.tierIndex)} miss this month`;
}

/** Time of an event relative to the scheduled start: "2m 10s after the start", "3m before the start". */
export function offsetFromStart(eventAt: string, scheduledStart: string): string {
  const diffSec = Math.round((Date.parse(eventAt) - Date.parse(scheduledStart)) / 1000);
  if (!Number.isFinite(diffSec)) return '';
  const abs = Math.abs(diffSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const span = m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
  if (diffSec === 0) return 'at the start';
  return diffSec < 0 ? `${span} before the start` : `${span} after the start`;
}

export function signalName(kind: string): string {
  return (SIGNAL_LABEL as Record<string, string>)[kind] ?? kind.replace(/_/g, ' ');
}

/** One plain sentence on why this fine exists, built from the frozen evidence. */
export function whyText(d: Deduction): string {
  switch (d.rule) {
    case 'missed_meeting':
      return 'No presence signal arrived before the mark window closed one minute after the scheduled start.';
    case 'no_show_not_called':
      return 'The client did not show up and no outbound call to the client was placed within 30 minutes of the scheduled start.';
    case 'status_not_updated':
      return 'The booking was still marked scheduled when the status deadline passed.';
  }
}

export function callSummaryText(cs: Deduction['evidence']['callSummary']): string {
  if (!cs || cs.calls == null) return 'No call data was recorded.';
  if (cs.calls === 0) return 'No outbound calls to the client.';
  const parts = [`${cs.calls} ${cs.calls === 1 ? 'call' : 'calls'}`];
  if (cs.firstCallOffsetMin != null) {
    const off = cs.firstCallOffsetMin;
    parts.push(off < 0 ? `first ${Math.abs(off)}m before the start` : `first +${off}m after the start`);
  }
  parts.push(cs.connected ? 'connected' : 'not connected');
  if (cs.talkSec) parts.push(`${formatTalk(cs.talkSec)} talk time`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export function emptyRuleTotals(): RuleTotals {
  return {
    missed_meeting: { count: 0, amountInr: 0 },
    no_show_not_called: { count: 0, amountInr: 0 },
    status_not_updated: { count: 0, amountInr: 0 },
  };
}

/** Totals the table would show, used only when the response carries none. Active rows only. */
export function deriveTotals(rows: Deduction[]): { byRule: RuleTotals; activeAmountInr: number } {
  const byRule = emptyRuleTotals();
  let activeAmountInr = 0;
  for (const row of rows) {
    if (!countsTowardsPay(row)) continue;
    byRule[row.rule].count += 1;
    byRule[row.rule].amountInr += row.amountInr;
    activeAmountInr += row.amountInr;
  }
  return { byRule, activeAmountInr };
}

// ---------------------------------------------------------------------------
// Ledger filters and sorting (client side, over the month the server already returned)
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | DeductionStatus;
export type RuleFilter = 'all' | DeductionRule;
export type LedgerSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export interface LedgerFilters {
  status: StatusFilter;
  rule: RuleFilter;
  /** Free text. Matches client name, BDA name or email, booking id and the waiver or void reason. Case and accent blind. */
  search: string;
  sort: LedgerSort;
}

export const DEFAULT_FILTERS: LedgerFilters = { status: 'all', rule: 'all', search: '', sort: 'newest' };

export const SORT_LABEL: Record<LedgerSort, string> = {
  newest: 'Meeting date, newest first',
  oldest: 'Meeting date, oldest first',
  amount_high: 'Amount, highest first',
  amount_low: 'Amount, lowest first',
};

/** True when any filter differs from the default. Sorting alone is not a filter. */
export function hasActiveFilters(f: LedgerFilters): boolean {
  return f.status !== 'all' || f.rule !== 'all' || f.search.trim() !== '';
}

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** The text a search is matched against, for one row. */
function searchable(d: Deduction): string {
  return fold(
    [d.clientName, d.bdaName, d.bdaEmail, d.bookingId, d.waiverReason, d.voidReason, d.waivedByName]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' '),
  );
}

const startMs = (d: Deduction) => {
  const t = Date.parse(d.evidence?.scheduledStart ?? '');
  return Number.isFinite(t) ? t : 0;
};

/** Filters then sorts. Never mutates its input, and ties keep a stable order (by deduction id). */
export function applyLedgerFilters(rows: Deduction[], f: LedgerFilters): Deduction[] {
  const words = fold(f.search.trim()).split(/\s+/).filter(Boolean);
  const kept = rows.filter((d) => {
    if (f.status !== 'all' && d.status !== f.status) return false;
    if (f.rule !== 'all' && d.rule !== f.rule) return false;
    if (words.length === 0) return true;
    const haystack = searchable(d);
    return words.every((w) => haystack.includes(w)); // every word must match, in any order
  });
  const by = {
    newest: (a: Deduction, b: Deduction) => startMs(b) - startMs(a),
    oldest: (a: Deduction, b: Deduction) => startMs(a) - startMs(b),
    amount_high: (a: Deduction, b: Deduction) => b.amountInr - a.amountInr || startMs(b) - startMs(a),
    amount_low: (a: Deduction, b: Deduction) => a.amountInr - b.amountInr || startMs(b) - startMs(a),
  }[f.sort];
  return [...kept].sort((a, b) => by(a, b) || a.deductionId.localeCompare(b.deductionId));
}

/** How many rows each status has, for the counts in the status filter. Ignores the other filters on purpose. */
export function countByStatus(rows: Deduction[]): Record<DeductionStatus, number> {
  const out: Record<DeductionStatus, number> = { active: 0, needs_review: 0, waived: 0, voided: 0, shadow: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

export { RULE_LABEL, formatInr };

// ---------------------------------------------------------------------------
// Reason validation (waive, activate, convert, dismiss)
// ---------------------------------------------------------------------------

export const REASON_MIN = 5;
export const REASON_MAX = 500;

export function reasonProblem(reason: string): string | null {
  const len = reason.trim().length;
  if (len === 0) return `A reason is required (at least ${REASON_MIN} characters).`;
  if (len < REASON_MIN) return `Add ${REASON_MIN - len} more ${REASON_MIN - len === 1 ? 'character' : 'characters'} (minimum ${REASON_MIN}).`;
  if (len > REASON_MAX) return `Too long by ${len - REASON_MAX} ${len - REASON_MAX === 1 ? 'character' : 'characters'} (maximum ${REASON_MAX}).`;
  return null;
}

// ---------------------------------------------------------------------------
// Focus return for dialogs
// ---------------------------------------------------------------------------

/** An element, or a function that finds one when the dialog closes (the trigger may be gone by then). */
export type FocusTarget = HTMLElement | null | (() => HTMLElement | null);

export function resolveFocusTarget(target: FocusTarget | undefined): HTMLElement | null {
  const el = typeof target === 'function' ? target() : (target ?? null);
  return el && el.isConnected ? el : null;
}
