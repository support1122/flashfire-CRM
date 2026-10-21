import type { TransferBda, TransferMeeting } from '../../types/attendanceAdmin';

export const TRANSFER_MAX = 50;

export type TransferMode = 'one' | 'spread';

export interface TransferPlanItem {
  bookingId: string;
  /** null when nobody can take it (spread mode, everyone is off that day). */
  email: string | null;
  note?: string;
}

/**
 * Who gets each meeting. `one`: everything to the chosen BDA. `spread`: each meeting goes to the free BDA with the
 * fewest meetings that day, counting the ones this plan already gave them, so a leave of twelve meetings does not
 * land on one person. Free means: not the BDA being covered, and not on leave that IST day. Ties go to the name that
 * sorts first, so the plan is the same every time.
 */
export function buildTransferPlan(
  meetings: TransferMeeting[],
  mode: TransferMode,
  oneEmail: string,
  bdas: TransferBda[],
  sourceEmail: string,
): TransferPlanItem[] {
  const sorted = [...meetings].sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart));
  if (mode === 'one') return sorted.map((m) => ({ bookingId: m.bookingId, email: oneEmail || null }));

  const pool = bdas.filter((b) => b.email !== sourceEmail).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const given = new Map<string, number>(); // `${email}|${day}` -> meetings this plan added
  return sorted.map((m) => {
    const free = pool.filter((b) => !b.leaveDays.includes(m.day));
    if (free.length === 0) return { bookingId: m.bookingId, email: null, note: 'Everyone else is on leave that day' };
    let best = free[0];
    let bestLoad = Infinity;
    for (const b of free) {
      const load = (b.loadByDay[m.day] ?? 0) + (given.get(`${b.email}|${m.day}`) ?? 0);
      if (load < bestLoad) {
        best = b;
        bestLoad = load;
      }
    }
    given.set(`${best.email}|${m.day}`, (given.get(`${best.email}|${m.day}`) ?? 0) + 1);
    return { bookingId: m.bookingId, email: best.email };
  });
}

/** Meetings the chosen BDA cannot take because they are on leave that day. Used to warn before sending. */
export function leaveClashes(meetings: TransferMeeting[], target: TransferBda | undefined): TransferMeeting[] {
  if (!target) return [];
  return meetings.filter((m) => target.leaveDays.includes(m.day));
}

/** "double_booked:Client 4" -> "Already has a meeting with Client 4 at that time". */
export function warningText(code: string): string {
  if (code.startsWith('double_booked:')) return `Already has a meeting with ${code.slice('double_booked:'.length) || 'someone'} at that time`;
  return code.replace(/_/g, ' ');
}
