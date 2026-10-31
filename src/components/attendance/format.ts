import { format, parseISO } from 'date-fns';
import type { CallSummary, DeductionRule, SignalKind } from '../../types/attendance';

/** "4:29 PM", or "4:29:51 PM" when `seconds` is true. Returns "-" for missing or bad input. */
export function fmtClock(iso: string | null | undefined, seconds = false): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), seconds ? 'h:mm:ss a' : 'h:mm a');
  } catch {
    return '-';
  }
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return '-';
  }
}

/** "Wed, 21 Oct 2026". Returns "-" for missing or bad input. */
export function fmtWeekdayDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'EEE, d MMM yyyy');
  } catch {
    return '-';
  }
}

/** IST wall-clock parts of an instant, or null for missing or bad input. */
function istParts(iso: string | null | undefined) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
    clock: `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`,
  };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The IST calendar date of an instant as YYYY-MM-DD, or null for missing or bad input. */
export function istDateKey(iso: string | null | undefined): string | null {
  const p = istParts(iso);
  if (!p) return null;
  const m = MONTHS_SHORT.indexOf(p.month) + 1;
  return `${p.year}-${String(m).padStart(2, '0')}-${p.day.padStart(2, '0')}`;
}

/** A working day (YYYY-MM-DD, the day the shift began) as "Thu, 29 Oct 2026". Read as a plain calendar date, no timezone shift. */
export function fmtWorkDay(workDay: string | null | undefined): string {
  if (!workDay || !/^\d{4}-\d{2}-\d{2}$/.test(workDay)) return '-';
  try {
    return format(parseISO(workDay), 'EEE, d MMM yyyy');
  } catch {
    return '-';
  }
}

/**
 * The real meeting time in IST, plus the real date ("1:00 AM, Fri 30 Oct") only when it differs from the working day.
 * Without a working day it is the plain clock time, like fmtTime.
 */
export function fmtMeetingTime(iso: string | null | undefined, workDay: string | null | undefined): string {
  if (!workDay) return fmtTime(iso);
  const p = istParts(iso);
  if (!p) return '-';
  return istDateKey(iso) === workDay ? p.clock : `${p.clock}, ${p.weekday} ${p.day} ${p.month}`;
}

/** "4:29 PM". Returns "-" for missing or bad input. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return '-';
  }
}

export function fmtDayTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'MMM d, h:mm a');
  } catch {
    return '-';
  }
}

/** ms to "1h 12m", "8m", "45s", or "-" when there is nothing to show. */
export function formatDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '-';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Seconds of talk time to "6m 52s". */
export function formatTalk(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Milliseconds left to "0:42". Rounds up so the last second reads 0:01, never 0:00 while open. */
export function formatCountdown(msLeft: number): string {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  button_meet: 'Meet button',
  button_crm: 'CRM button',
  extension_join: 'auto-detected',
  google_meet: 'Google Meet',
};

export const RULE_LABEL: Record<DeductionRule, string> = {
  missed_meeting: 'Missed meeting',
  no_show_not_called: 'No-show not called',
  status_not_updated: 'Status not updated',
};

export function callChipText(summary: CallSummary): string {
  if (summary.calls === 0) return 'Not called';
  const parts = [`${summary.calls} ${summary.calls === 1 ? 'call' : 'calls'}`];
  const off = summary.firstCallOffsetMin;
  if (off != null && Number.isFinite(off)) parts.push(off >= 0 ? `first +${off}m` : `first ${-off}m before`);
  parts.push(summary.connected ? 'connected' : 'not connected');
  return parts.join(', ');
}
