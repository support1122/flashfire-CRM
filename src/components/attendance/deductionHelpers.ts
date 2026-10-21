import type { Deduction, DeductionOrigin, DeductionRule, DeductionSource, DeductionStatus } from '../../types/attendance';
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
  if (rowOrigin(d) === 'manual') {
    return rowSource(d) === 'allocation'
      ? 'A person marked this Lead Allocation call as missed. Their reason is below.'
      : 'A person marked this meeting as missed. Their reason is below.';
  }
  switch (d.rule) {
    case 'missed_meeting':
      return 'No presence signal arrived before the mark window closed one minute after the scheduled start.';
    case 'no_show_not_called':
      return 'The client did not show up and no outbound call to the client was placed within 30 minutes of the scheduled start.';
    case 'status_not_updated':
      return 'The booking was still marked scheduled when the status deadline passed.';
  }
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/** Plain-language device phrase for the join, or null when nobody saw one. */
function joinedFrom(a: NonNullable<Deduction['attendance']>): string | null {
  switch (a.joinDevice) {
    case 'mobile': return 'from a mobile phone';
    case 'phone_dial_in': return 'by phone dial-in';
    case 'pc': return 'from the PC';
    case 'unknown': return 'from an unknown device';
    default: return null;
  }
}

/**
 * What the system actually saw for this meeting, as short facts. This is the part a BDA needs to judge whether the
 * fine is right: for example "Joined from a mobile phone at 8:07 pm, 7m late". The extension cannot report from a
 * phone, so a phone join looks like no join at all.
 */
export function seenFacts(d: Deduction): string[] {
  if (d.rule === 'status_not_updated') {
    return [`The booking was still "${d.evidence.bookingStatus ?? 'scheduled'}" when the status deadline passed.`];
  }
  if (rowOrigin(d) === 'manual') return [];
  const a = d.attendance;
  const facts: string[] = [];
  for (const c of d.evidence.coveredBy ?? []) {
    facts.push(`${c.bdaName || c.bdaEmail} was in this meeting${c.minutes > 0 ? ` for about ${c.minutes} minutes` : ''}${c.joinedAt ? `, joined at ${clock(c.joinedAt)}` : ''}. The meeting was not reassigned in the CRM, so it is held for review.`);
  }
  if (d.rule === 'missed_meeting') {
    const signals = d.evidence.signals ?? [];
    if (signals.length === 0) facts.push('No presence signal arrived before the window closed, one minute after the start.');
    else facts.push('A signal arrived, but after the one minute window had closed.');
  }
  if (a?.joinedAt) {
    const device = joinedFrom(a);
    const late = a.lateByMs != null && a.lateByMs > 0 ? `, ${Math.max(1, Math.round(a.lateByMs / 60000))}m after the start` : '';
    facts.push(`Google Meet shows a join${device ? ` ${device}` : ''} at ${clock(a.joinedAt)}${late}.`);
    if (a.joinDevice === 'mobile' || a.joinDevice === 'phone_dial_in') {
      facts.push('The attendance extension runs on the PC, so it cannot report a join from a phone.');
    }
  } else if (d.rule === 'missed_meeting') {
    facts.push('Google Meet shows nobody from the BDA in the call.');
  }
  if (d.rule === 'no_show_not_called') {
    facts.push(callSummaryText(d.evidence.callSummary));
  }
  return facts;
}

/** Short headline for each automatic rule, shown after "Why:" in the ledger row. */
export const RULE_REASON_TITLE: Record<DeductionRule, string> = {
  missed_meeting: 'not seen in the meeting',
  no_show_not_called: 'client did not show and was not called',
  status_not_updated: 'booking status not updated',
};

/** Who a BDA should talk to about a fine they think is wrong. */
export const CONTACT_LINE = 'If this looks wrong, contact an admin with the reference below and they can review or waive it.';

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

/** Active totals per BDA email, for the rows given. A BDA with no active row is simply absent. */
export function deriveTotalsByBda(rows: Deduction[]): Map<string, { byRule: RuleTotals; activeAmountInr: number }> {
  const groups = new Map<string, Deduction[]>();
  for (const row of rows) groups.set(row.bdaEmail, [...(groups.get(row.bdaEmail) ?? []), row]);
  return new Map([...groups].map(([email, list]) => [email, deriveTotals(list)]));
}

/** "12 Oct to 20 Oct", "from 12 Oct" or "up to 20 Oct" for a YYYY-MM-DD range. */
export function dayRangeLabel(from: string, to: string): string {
  const short = (day: string) => {
    const [, m, d] = day.split('-').map(Number);
    return `${d} ${MONTH_NAMES[(m || 1) - 1].slice(0, 3)}`;
  };
  if (from && to) return from === to ? short(from) : `${short(from)} to ${short(to)}`;
  return from ? `from ${short(from)}` : `up to ${short(to)}`;
}

// ---------------------------------------------------------------------------
// Ledger filters and sorting (client side, over the month the server already returned)
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | DeductionStatus;
export type RuleFilter = 'all' | DeductionRule;
export type LedgerSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export type SourceFilter = 'all' | DeductionSource;
export type RaisedByFilter = 'all' | DeductionOrigin;
/** tier1 = the first-miss amount (INR 500), escalated = INR 1,000 or more. */
export type AmountFilter = 'all' | 'tier1' | 'escalated';

export const TIER1_AMOUNT_INR = 500;
export const ESCALATED_AMOUNT_INR = 1000;

export interface LedgerFilters {
  status: StatusFilter;
  rule: RuleFilter;
  /** Free text. Matches client name, BDA name or email, booking id, the marker's name and the waiver, void or absence reason. Case and accent blind. */
  search: string;
  sort: LedgerSort;
  /** Calendly meeting or Lead Allocation call. */
  source: SourceFilter;
  /** Admin filter. Automatic rule or marked by a person. */
  raisedBy: RaisedByFilter;
  /** Admin filter. */
  amount: AmountFilter;
  /** BDA filter. Active rows only, the ones that count towards pay. */
  countingOnly: boolean;
  /** Meeting day range, YYYY-MM-DD in IST, both ends included. '' = no limit. */
  from: string;
  to: string;
}

export const DEFAULT_FILTERS: LedgerFilters = {
  status: 'all',
  rule: 'all',
  search: '',
  sort: 'newest',
  source: 'all',
  raisedBy: 'all',
  amount: 'all',
  countingOnly: false,
  from: '',
  to: '',
};

export const SOURCE_LABEL: Record<DeductionSource, string> = {
  booking: 'Calendly meeting',
  allocation: 'Lead Allocation call',
};

export const RAISED_BY_LABEL: Record<DeductionOrigin, string> = {
  auto: 'Automatic',
  manual: 'Marked by admin',
};

export const AMOUNT_LABEL: Record<Exclude<AmountFilter, 'all'>, string> = {
  tier1: 'Tier 1, ₹500',
  escalated: 'Escalated, ₹1,000 or more',
};

/** Rows from before the absence feature carry neither field; they are automatic Calendly fines. */
export const rowSource = (d: Pick<Deduction, 'source'>): DeductionSource => (d.source === 'allocation' ? 'allocation' : 'booking');
export const rowOrigin = (d: Pick<Deduction, 'origin'>): DeductionOrigin => (d.origin === 'manual' ? 'manual' : 'auto');

/** "Marked by Sohith" for an admin, "Marked absent by Sohith" for the BDA it was marked against. Null on automatic rows. */
export function markedByText(d: Pick<Deduction, 'origin' | 'manualAbsent'>, admin: boolean): string | null {
  if (rowOrigin(d) !== 'manual') return null;
  const who = d.manualAbsent?.markedByName || d.manualAbsent?.markedBy || 'an admin';
  return admin ? `Marked by ${who}` : `Marked absent by ${who}`;
}

export const SORT_LABEL: Record<LedgerSort, string> = {
  newest: 'Meeting date, newest first',
  oldest: 'Meeting date, oldest first',
  amount_high: 'Amount, highest first',
  amount_low: 'Amount, lowest first',
};

/** True when any filter differs from the default. Sorting alone is not a filter. */
export function hasActiveFilters(f: LedgerFilters): boolean {
  return (
    f.status !== 'all' ||
    f.rule !== 'all' ||
    f.search.trim() !== '' ||
    f.source !== 'all' ||
    f.raisedBy !== 'all' ||
    f.amount !== 'all' ||
    f.countingOnly ||
    f.from !== '' ||
    f.to !== ''
  );
}

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** The text a search is matched against, for one row. */
function searchable(d: Deduction): string {
  return fold(
    [
      d.clientName,
      d.bdaName,
      d.bdaEmail,
      d.bookingId,
      d.waiverReason,
      d.voidReason,
      d.waivedByName,
      d.manualAbsent?.markedByName,
      d.manualAbsent?.reason,
    ]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' '),
  );
}

/** The IST calendar day of an instant, as YYYY-MM-DD. Null when the instant is missing or not a date. */
export function istDayKey(iso: string | null | undefined): string | null {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

export type DatePreset = 'today' | 'yesterday' | 'last7';
export const DATE_PRESET_LABEL: Record<DatePreset, string> = { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days' };

/** { from, to } for a quick-date chip, counted back from `now` in IST. */
export function presetRange(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const day = (back: number) => istDayKey(new Date(now.getTime() - back * 24 * 3600 * 1000).toISOString()) ?? '';
  if (preset === 'today') return { from: day(0), to: day(0) };
  if (preset === 'yesterday') return { from: day(1), to: day(1) };
  return { from: day(6), to: day(0) };
}

/** First and last day of a YYYY-MM month, for the limits of the date inputs. */
export function monthDayBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` };
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
    if (f.source !== 'all' && rowSource(d) !== f.source) return false;
    if (f.raisedBy !== 'all' && rowOrigin(d) !== f.raisedBy) return false;
    if (f.amount === 'tier1' && d.amountInr !== TIER1_AMOUNT_INR) return false;
    if (f.amount === 'escalated' && d.amountInr < ESCALATED_AMOUNT_INR) return false;
    if (f.countingOnly && !countsTowardsPay(d)) return false;
    if (f.from || f.to) {
      const day = istDayKey(d.evidence?.scheduledStart);
      if (!day) return false; // a row with no meeting time cannot be placed in a date range
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
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

/** Marking or reporting an absence needs a real sentence, the same rule as the server: 10 characters, 8 letters, 2 words. */
export function absenceReasonProblem(reason: string): string | null {
  const base = reasonProblem(reason);
  if (base) return base;
  const text = reason.trim();
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const words = text.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
  if (text.length < 10 || letters < 8 || words < 2) return 'Say what happened in a sentence (at least 10 characters), for example "Did not join and did not call the client".';
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
