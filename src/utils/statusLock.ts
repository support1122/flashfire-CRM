/**
 * Status-ownership lock (mirrors the server rule in
 * CampaignBookingController.updateBookingStatus).
 *
 * Once a BDA sets a FINAL decision on a lead, that lead's status belongs to
 * them: another BDA cannot change it. Only the same BDA, or an admin, may.
 * This is a UX guard — the server enforces the same rule authoritatively and
 * returns HTTP 403 with { locked: true } if a non-owner tries anyway.
 */

export const FINAL_DECISION_STATUSES = ['completed', 'no-show', 'paid', 'canceled', 'ignored'];

export interface StatusLockBooking {
  bookingStatus?: string | null;
  statusChangedBy?: string | null;
  statusChangeSource?: string | null;
  statusChangedByName?: string | null;
}

export interface StatusLockUser {
  email?: string | null;
  role?: 'admin' | 'bda' | string | null;
}

/** True when the given user is NOT allowed to change this booking's status. */
export function isStatusLockedForUser(
  booking: StatusLockBooking | null | undefined,
  user: StatusLockUser | null | undefined
): boolean {
  if (!booking) return false;
  if (user?.role === 'admin') return false; // admins always override

  const owner = booking.statusChangedBy ? booking.statusChangedBy.toLowerCase() : null;
  const lockActive =
    booking.statusChangeSource === 'bda' &&
    !!booking.bookingStatus &&
    FINAL_DECISION_STATUSES.includes(booking.bookingStatus) &&
    !!owner;

  if (!lockActive) return false;
  const me = user?.email ? user.email.toLowerCase() : null;
  return owner !== me;
}

/** Human-readable owner name for lock tooltips/toasts. */
export function statusLockOwnerName(booking: StatusLockBooking | null | undefined): string {
  return booking?.statusChangedByName || booking?.statusChangedBy || 'another BDA';
}

/** Tooltip/toast message for a locked booking. */
export function statusLockMessage(booking: StatusLockBooking | null | undefined): string {
  const who = statusLockOwnerName(booking);
  const status = booking?.bookingStatus || 'a final status';
  return `Marked "${status}" by ${who}. Only ${who} or an admin can change it.`;
}
