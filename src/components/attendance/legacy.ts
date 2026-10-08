import type { MeetingAttendance } from '../../types/attendance';

/** The old /api/bda-attendance/bulk row, kept so Meeting Info still works before the new fields ship. */
export interface LegacyBdaAttendance {
  status: 'present' | 'absent' | 'manual' | 'unmarked';
  source: 'auto' | 'manual' | 'scheduler' | 'meet_api';
  joinedAt?: string;
  leftAt?: string;
  markedAt?: string;
  durationMs?: number | null;
  cumulativeDurationMs?: number | null;
  verified?: boolean;
  sessions?: { startTime?: string | null; endTime?: string | null; durationMs?: number }[];
}

/** Maps the old row onto the new shape, so there is one render path. */
export function legacyToAttendance(legacy: LegacyBdaAttendance): MeetingAttendance {
  const verdict = legacy.status === 'present' || legacy.status === 'manual' ? 'present' : legacy.status === 'absent' ? 'absent' : null;
  return {
    verdict,
    verdictAt: null,
    markedPresentAt: legacy.markedAt ?? null,
    signals: [],
    inAt: legacy.joinedAt ?? null,
    outAt: legacy.leftAt ?? null,
    timeSpentMs: legacy.cumulativeDurationMs ?? legacy.durationMs ?? 0,
    sessions: (legacy.sessions ?? [])
      .filter((s) => !!s.startTime)
      .map((s) => ({ joinedAt: s.startTime as string, leftAt: s.endTime ?? null })),
    verified: !!legacy.verified,
    matchedBy: null,
    integrityFlag: null,
  };
}
