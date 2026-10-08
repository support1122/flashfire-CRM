import type { SignalKind, Window } from '../../types/attendance';

/** The visible state of the Mark Present button. Mirrors plan 4.4.3. */
export type CardState =
  | { kind: 'before'; opensAt: string }
  | { kind: 'open'; msLeft: number; closesAt: string }
  | { kind: 'closed' }
  | { kind: 'marked'; at: string | null; signal: SignalKind | null };

/**
 * Works out the state from a window and the SERVER clock (`serverNowMs`).
 * The PC clock never appears here; the caller adds the offset to it first.
 * The server owns the verdict, so a window that closed unmarked is "closed", never "absent".
 */
export function deriveCardState(win: Window, serverNowMs: number, forcedClosed = false): CardState {
  if (win.marked || win.verdict === 'present') {
    return { kind: 'marked', at: win.markedPresentAt, signal: win.verdictSignal };
  }
  if (forcedClosed || win.verdict === 'absent') return { kind: 'closed' };

  const opens = Date.parse(win.windowOpensAt);
  const closes = Date.parse(win.windowClosesAt);
  if (serverNowMs < opens) return { kind: 'before', opensAt: win.windowOpensAt };
  if (serverNowMs <= closes) return { kind: 'open', msLeft: closes - serverNowMs, closesAt: win.windowClosesAt };
  return { kind: 'closed' };
}
