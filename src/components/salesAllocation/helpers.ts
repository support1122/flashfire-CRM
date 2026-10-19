import { useEffect, useState } from 'react';
import type { AllocationStatus, CallCheck } from '../../types/salesAllocation';

export const STATUS_CHIP: Record<AllocationStatus, string> = {
  scheduled: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  no_answer: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-200 text-slate-700',
  absent: 'bg-red-100 text-red-800',
};

export const STATUS_LABEL: Record<AllocationStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  no_answer: 'No answer',
  cancelled: 'Cancelled',
  absent: 'Absent',
};

/** Re-renders every `everyMs` so countdowns stay honest without a refetch. */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** The value after it has stopped changing for `ms`. Keeps a search box from firing a request per keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export const FIELD_CLASS =
  'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20';
export const LABEL_CLASS = 'block text-xs font-medium uppercase tracking-wide text-slate-500';

/** Copies text, with a textarea fallback for non-secure contexts. Resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

export type CallCheckTone = 'good' | 'warn' | 'bad' | 'muted';

/** "5 min before", "12 min after", "at the call time". */
function offsetText(min: number): string {
  if (min === 0) return 'at the call time';
  return `${Math.abs(min)} min ${min < 0 ? 'before' : 'after'}`;
}

/**
 * The chip for "did the BDA call the client". Null when there is nothing worth saying: no check, a call still in the
 * future, or a cancelled call. `callAtMs` is the call time, so "waiting" only appears once that time has come.
 */
export function callCheckInfo(
  check: CallCheck | null | undefined,
  status: AllocationStatus,
  callAtMs: number,
  nowMs: number,
): { label: string; detail: string; tone: CallCheckTone } | null {
  if (!check || status === 'cancelled') return null;
  switch (check.verdict) {
    case 'called_in_time':
      return { label: 'Called in time', detail: `First call ${offsetText(check.firstCallOffsetMin ?? 0)}${check.connected ? ', connected' : ', not connected'}`, tone: 'good' };
    case 'called_late':
      return { label: 'Called late', detail: `First call ${offsetText(check.firstCallOffsetMin ?? 0)}${check.connected ? ', connected' : ', not connected'}`, tone: 'warn' };
    case 'not_called':
      return { label: 'Not called', detail: 'No outbound Zoom call to this number from the BDA', tone: 'bad' };
    case 'waiting':
      return nowMs < callAtMs ? null : { label: 'No call yet', detail: 'Nothing in the Zoom call log so far', tone: 'muted' };
    case 'no_phone':
      return { label: 'Cannot check', detail: 'This call has no usable phone number', tone: 'muted' };
  }
}

export const CALL_CHECK_CHIP: Record<CallCheckTone, string> = {
  good: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-800',
  muted: 'bg-slate-100 text-slate-600',
};
