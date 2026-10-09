import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, Check, ClipboardList, Loader2, Lock } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { ApiError, postMarkPresent } from '../../api/attendance';
import type { SignalKind, Window } from '../../types/attendance';
import { deriveCardState } from './cardState';
import { SIGNAL_LABEL, fmtClock, formatCountdown } from './format';
import { myWindowKey, useMyWindow } from './useMyWindow';

interface MarkProblem {
  message: string;
  /** true when pressing the button again could work */
  retryable: boolean;
}

/** Turns a failed mark-present call into words a BDA can act on. */
function describeProblem(error: unknown): MarkProblem {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return { message: 'Could not reach the server. Check your connection and press the button again.', retryable: true };
    }
    if (error.status === 429) {
      return { message: 'Too many tries in a row. Wait a few seconds and press the button again.', retryable: true };
    }
    if (error.status === 409 && error.code === 'window_not_open') {
      const opensAt = typeof error.details.windowOpensAt === 'string' ? error.details.windowOpensAt : null;
      return {
        message: opensAt
          ? `The server says the window has not opened yet. It opens at ${fmtClock(opensAt)}.`
          : 'The server says the window has not opened yet.',
        retryable: true,
      };
    }
    if (error.status === 403) {
      return {
        message:
          error.code === 'not_tracked'
            ? 'You are not on the attendance list, so you cannot mark present. Ask an admin.'
            : 'This meeting is not assigned to you, so you cannot mark it.',
        retryable: false,
      };
    }
    if (error.status === 404) {
      return { message: 'The server could not find this meeting. Refresh the page and try again.', retryable: false };
    }
    return { message: 'The server had a problem. Press the button again in a moment.', retryable: true };
  }
  return { message: 'Something went wrong. Press the button again.', retryable: true };
}

function signalNote(signal: SignalKind | null): string | null {
  if (!signal) return null;
  return `via ${SIGNAL_LABEL[signal]}`;
}

interface MarkPresentCardProps {
  /** When given, a "My attendance" button is shown and calls this. */
  onOpenMyAttendance?: () => void;
}

/**
 * Mark Present card for tracked BDAs. Renders nothing unless the server says `tracked: true`.
 * All timing is derived from the server clock (see useMyWindow), never the PC clock alone.
 */
export default function MarkPresentCard({ onOpenMyAttendance }: MarkPresentCardProps) {
  const { token, user } = useCrmAuth();
  const queryClient = useQueryClient();
  const { data, error: loadError, isPending, refetch, serverOffsetMs } = useMyWindow();

  const [, forceTick] = useReducer((n: number) => n + 1, 0);
  const [forcedClosedFor, setForcedClosedFor] = useState<string | null>(null);
  const [localMarked, setLocalMarked] = useState<{ bookingId: string; at: string } | null>(null);
  const [problem, setProblem] = useState<{ bookingId: string; value: MarkProblem } | null>(null);
  const inFlight = useRef(false);

  const mark = useMutation({
    mutationFn: (bookingId: string) => postMarkPresent(token, bookingId),
  });

  // Take the window and overlay anything this browser just learned (a successful mark, a 409 closed).
  const current: Window | null = data?.current ?? null;
  const win: Window | null =
    current && localMarked?.bookingId === current.bookingId && !current.marked
      ? { ...current, marked: true, markedPresentAt: localMarked.at, verdictSignal: current.verdictSignal ?? 'button_crm' }
      : current;

  // The server clock: PC clock plus the offset measured at the last poll.
  const serverNowMs = Date.now() + serverOffsetMs;
  const state = win ? deriveCardState(win, serverNowMs, forcedClosedFor === win.bookingId) : null;

  const ticking = state?.kind === 'before' || state?.kind === 'open';
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(forceTick, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // A problem belongs to one meeting and one state; leaving the open state clears it.
  const activeProblem = problem && win && problem.bookingId === win.bookingId && state?.kind === 'open' ? problem.value : null;

  if (isPending) {
    return (
      <section aria-label="Mark Present" aria-busy="true" className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Checking your attendance window
        </div>
      </section>
    );
  }

  if (loadError && !data) {
    // A missing or forbidden endpoint means this user has no card; stay out of their way.
    if (loadError instanceof ApiError && [401, 403, 404].includes(loadError.status)) return null;
    return (
      <section aria-label="Mark Present" className="bg-white border border-red-200 rounded-lg shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-red-700" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>Could not load your Mark Present window. Retrying every 15 seconds.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-3 py-1 rounded-md border border-red-300 bg-white text-red-700 font-semibold hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Retry now
          </button>
        </div>
      </section>
    );
  }

  if (!data || !data.tracked) return null;

  const handleMark = () => {
    if (!win || inFlight.current) return;
    inFlight.current = true;
    setProblem(null);
    mark.mutate(win.bookingId, {
      onSuccess: (res) => {
        setLocalMarked({ bookingId: win.bookingId, at: res.markedPresentAt });
        void queryClient.invalidateQueries({ queryKey: myWindowKey(user?.email) });
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409 && err.code === 'window_closed') {
          // The server decides. If it says closed, we are closed, whatever our countdown showed.
          setForcedClosedFor(win.bookingId);
          setProblem(null);
        } else {
          setProblem({ bookingId: win.bookingId, value: describeProblem(err) });
        }
        // Re-measure the server clock so the countdown agrees with the server again.
        void queryClient.invalidateQueries({ queryKey: myWindowKey(user?.email) });
      },
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const next = data.next;
  const marking = mark.isPending;

  let button: ReactNode = null;
  let caption = '';
  if (win && state) {
    const base =
      'inline-flex items-center justify-center gap-2 min-w-[17rem] px-5 py-3 rounded-lg text-sm font-semibold ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors';
    if (state.kind === 'marked') {
      caption = 'Marked present';
      button = (
        <button type="button" disabled className={`${base} bg-emerald-50 text-emerald-800 border border-emerald-300`}>
          <Check size={16} aria-hidden="true" />
          {state.at
            ? `Present at ${fmtClock(state.at, true)}`
            : `Present (${state.signal ? SIGNAL_LABEL[state.signal] : 'auto-detected'})`}
        </button>
      );
    } else if (state.kind === 'closed') {
      caption = 'Mark Present window closed one minute after the start';
      button = (
        <button type="button" disabled className={`${base} bg-red-50 text-red-700 border border-red-300`}>
          <Lock size={16} aria-hidden="true" />
          Window closed, not marked
        </button>
      );
    } else if (state.kind === 'before') {
      caption = 'Mark Present window not open yet';
      button = (
        <button type="button" disabled className={`${base} bg-gray-100 text-gray-500 border border-gray-200`}>
          <CalendarClock size={16} aria-hidden="true" />
          {`Opens at ${fmtClock(state.opensAt)}`}
        </button>
      );
    } else if (marking) {
      caption = 'Mark Present window is open';
      button = (
        <button type="button" disabled aria-busy="true" className={`${base} bg-blue-600 text-white opacity-80`}>
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Marking present
        </button>
      );
    } else if (activeProblem && !activeProblem.retryable) {
      caption = 'Mark Present window is open';
      button = (
        <button type="button" disabled className={`${base} bg-red-50 text-red-700 border border-red-300`}>
          <AlertCircle size={16} aria-hidden="true" />
          Could not mark
        </button>
      );
    } else if (activeProblem) {
      caption = 'Mark Present window is open';
      button = (
        <button
          type="button"
          onClick={handleMark}
          className={`${base} bg-white text-red-700 border-2 border-red-500 hover:bg-red-50`}
        >
          <AlertCircle size={16} aria-hidden="true" />
          {`Try again (${formatCountdown(state.msLeft)} left)`}
        </button>
      );
    } else {
      caption = 'Mark Present window is open';
      button = (
        <button
          type="button"
          onClick={handleMark}
          className={`${base} bg-blue-600 text-white hover:bg-blue-700 animate-pulse motion-reduce:animate-none ring-4 ring-blue-200`}
        >
          {`Mark Present (${formatCountdown(state.msLeft)} left)`}
        </button>
      );
    }
  }

  // Screen readers hear the time left only at thresholds; announcing the per-second countdown would be noise.
  // The text changes just three times, so the polite live region speaks just three times.
  let timeLeftAnnouncement = '';
  if (state?.kind === 'open' && state.msLeft <= 60_000) {
    timeLeftAnnouncement =
      state.msLeft <= 10_000 ? '10 seconds left to mark present' : state.msLeft <= 30_000 ? '30 seconds left to mark present' : 'Under a minute left to mark present';
  }

  return (
    <section
      aria-label="Mark Present"
      className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <p aria-live="polite" className="sr-only" data-testid="time-left-announcer">{timeLeftAnnouncement}</p>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Mark Present</p>
        {win ? (
          <>
            <p className="text-base font-bold text-gray-900 truncate" title={win.clientName}>
              {win.clientName}
              <span className="font-medium text-gray-600">{` at ${fmtClock(win.scheduledStart)}`}</span>
            </p>
            <p aria-live="polite" className="text-xs text-gray-600">
              {caption}
            </p>
          </>
        ) : (
          <p aria-live="polite" className="text-sm text-gray-700">
            No meeting to mark right now
          </p>
        )}
      </div>

      {win && state && (
        <div className="flex flex-col gap-1.5 items-start">
          {button}
          {state.kind === 'marked' && state.at && signalNote(win.verdictSignal) && (
            <p className="text-xs text-gray-600">{signalNote(win.verdictSignal)}</p>
          )}
          {activeProblem && (
            <p role="alert" className="max-w-[17rem] text-xs text-red-700">
              {activeProblem.message}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 items-start sm:items-end text-sm">
        <p className="text-gray-700">
          {next ? (
            <>
              <span className="font-semibold text-gray-900">Next:</span> {next.clientName} at {fmtClock(next.scheduledStart)}
            </>
          ) : (
            <span className="text-gray-500">No more meetings to mark today</span>
          )}
        </p>
        {onOpenMyAttendance && (
          <button
            type="button"
            onClick={onOpenMyAttendance}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ClipboardList size={14} aria-hidden="true" />
            My attendance
          </button>
        )}
      </div>
    </section>
  );
}
