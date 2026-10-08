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
