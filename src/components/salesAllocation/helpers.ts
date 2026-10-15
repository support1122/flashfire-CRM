import { useEffect, useState } from 'react';
import type { AllocationStatus } from '../../types/salesAllocation';

export const STATUS_CHIP: Record<AllocationStatus, string> = {
  scheduled: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  no_answer: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

export const STATUS_LABEL: Record<AllocationStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  no_answer: 'No answer',
  cancelled: 'Cancelled',
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
