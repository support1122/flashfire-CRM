import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { useBdaProfiles, useSaveBdaProfile } from '../../api/attendanceAdmin';
import type { BdaProfile, BdaProfileUpdate } from '../../types/attendanceAdmin';
import { fmtDayTime } from './format';

const DISCORD_ID = /^\d{15,25}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function leaveLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${names[(m || 1) - 1]} ${y}`;
}

type SaveState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'saved' } | { phase: 'error'; message: string };

function Switch({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-semibold text-slate-900">
          {label}
        </p>
        <p id={`${id}-help`} className="mt-0.5 text-xs text-slate-500">
          {help}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-emerald-600' : 'bg-slate-300'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

function Chip({ children, onRemove, removeLabel, muted }: { children: string; onRemove: () => void; removeLabel: string; muted?: boolean }) {
  return (
    <li
      className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs font-medium ${
        muted ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-300 bg-white text-slate-800'
      }`}
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </li>
  );
}

function ProfileCard({ profile, token }: { profile: BdaProfile; token: string | null }) {
  const save = useSaveBdaProfile(token);
  const [state, setState] = useState<SaveState>({ phase: 'idle' });
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [leaveDraft, setLeaveDraft] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [discordDraft, setDiscordDraft] = useState(profile.discordUserId ?? '');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idBase = useId();
  const today = todayIst();

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // Follow the server value when it changes underneath us (another admin, or a rollback).
  const serverDiscord = profile.discordUserId ?? '';
  const [seenDiscord, setSeenDiscord] = useState(serverDiscord);
  if (seenDiscord !== serverDiscord) {
    setSeenDiscord(serverDiscord);
    setDiscordDraft(serverDiscord);
  }

  const sortedLeave = useMemo(() => [...profile.leaveDays].sort(), [profile.leaveDays]);

  async function commit(patch: Partial<BdaProfileUpdate>): Promise<boolean> {
    const update: BdaProfileUpdate = {
      aliases: profile.aliases,
      discordUserId: profile.discordUserId,
      leaveDays: profile.leaveDays,
      tracked: profile.tracked,
      active: profile.active,
      ...patch,
    };
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setState({ phase: 'saving' });
    try {
      await save.mutateAsync({ email: profile.email, update });
      setState({ phase: 'saved' });
      savedTimer.current = setTimeout(() => setState({ phase: 'idle' }), 2500);
      return true;
    } catch (error) {
      setState({
        phase: 'error',
        message: `${error instanceof Error ? error.message : 'Could not save.'} The change was undone.`,
      });
      return false;
    }
  }

  async function addAlias(event: FormEvent) {
    event.preventDefault();
    const value = aliasDraft.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (value.length > 60) {
      setAliasError('Keep an alias under 60 characters.');
      return;
    }
    if (profile.aliases.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setAliasError('That alias is already listed.');
      return;
    }
    setAliasError(null);
    setAliasDraft('');
    await commit({ aliases: [...profile.aliases, value] });
  }

  async function addLeave(event: FormEvent) {
    event.preventDefault();
    if (!DATE_ONLY.test(leaveDraft)) {
      setLeaveError('Pick a date.');
      return;
    }
    if (profile.leaveDays.includes(leaveDraft)) {
      setLeaveError('That day is already listed.');
      return;
    }
    setLeaveError(null);
    const day = leaveDraft;
    setLeaveDraft('');
    await commit({ leaveDays: [...profile.leaveDays, day].sort() });
  }

  const discordTrimmed = discordDraft.trim();
  const discordDirty = discordTrimmed !== serverDiscord;
  const discordInvalid = discordTrimmed !== '' && !DISCORD_ID.test(discordTrimmed);

  async function saveDiscord(event: FormEvent) {
    event.preventDefault();
    if (!discordDirty || discordInvalid) return;
    await commit({ discordUserId: discordTrimmed === '' ? null : discordTrimmed });
  }

  const busy = state.phase === 'saving';

  return (
    <article aria-labelledby={`${idBase}-name`} className="rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h3 id={`${idBase}-name`} className="text-base font-bold text-slate-900">
            {profile.displayName}
          </h3>
          <p className="truncate text-xs text-slate-500">{profile.email}</p>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          {state.phase === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Saving
            </span>
          )}
          {state.phase === 'saved' && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
        </div>
      </header>

      {state.phase === 'error' && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {state.message}
        </p>
      )}

      <div className="space-y-5 px-4 py-4">
        <div className="space-y-4">
          <Switch
            label="Tracked"
            help="On: attendance, calls and deductions apply to this person. Off: they are ignored by all of it."
            checked={profile.tracked}
            disabled={busy}
            onChange={(next) => commit({ tracked: next })}
          />
          <Switch
            label="Active"
            help="Off means they left the company. They disappear from the reassign list."
            checked={profile.active}
            disabled={busy}
            onChange={(next) => commit({ active: next })}
          />
        </div>

        <div>
          <p id={`${idBase}-aliases`} className="text-sm font-semibold text-slate-900">
            Aliases
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Other spellings of this name seen in Meet, Zoom or Calendly.</p>
          {profile.aliases.length > 0 ? (
            <ul aria-labelledby={`${idBase}-aliases`} className="mt-2 flex flex-wrap gap-1.5">
              {profile.aliases.map((alias) => (
                <Chip key={alias} removeLabel={`Remove alias ${alias}`} onRemove={() => commit({ aliases: profile.aliases.filter((a) => a !== alias) })}>
                  {alias}
                </Chip>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs italic text-slate-400">No aliases yet.</p>
          )}
          <form onSubmit={addAlias} className="mt-2 flex gap-2">
            <label htmlFor={`${idBase}-alias-input`} className="sr-only">
              New alias for {profile.displayName}
            </label>
            <input
              id={`${idBase}-alias-input`}
              value={aliasDraft}
              onChange={(e) => {
                setAliasDraft(e.target.value);
                setAliasError(null);
              }}
              placeholder="For example: siddhartha b"
              disabled={busy}
              aria-invalid={aliasError !== null}
              aria-describedby={aliasError ? `${idBase}-alias-error` : undefined}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || aliasDraft.trim() === ''}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} aria-hidden="true" />
              Add alias
            </button>
          </form>
          {aliasError && (
            <p id={`${idBase}-alias-error`} role="alert" className="mt-1 text-xs font-medium text-red-700">
              {aliasError}
            </p>
          )}
        </div>

        <form onSubmit={saveDiscord}>
          <label htmlFor={`${idBase}-discord`} className="text-sm font-semibold text-slate-900">
            Discord user ID
          </label>
          <p className="mt-0.5 text-xs text-slate-500">Used to @mention them in alerts. In Discord, turn on Developer Mode, right-click their name, then Copy User ID.</p>
          <div className="mt-2 flex gap-2">
            <input
              id={`${idBase}-discord`}
              value={discordDraft}
              onChange={(e) => setDiscordDraft(e.target.value)}
              inputMode="numeric"
              placeholder="Digits only, for example 123456789012345678"
              disabled={busy}
              aria-invalid={discordInvalid}
              aria-describedby={discordInvalid ? `${idBase}-discord-error` : undefined}
              className={`min-w-0 flex-1 rounded-lg border px-3 py-1.5 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 disabled:bg-slate-50 ${
                discordInvalid ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            <button
              type="submit"
              disabled={busy || !discordDirty || discordInvalid}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save ID
            </button>
          </div>
          {discordInvalid && (
            <p id={`${idBase}-discord-error`} role="alert" className="mt-1 text-xs font-medium text-red-700">
              A Discord user ID is 15 to 25 digits.
            </p>
          )}
        </form>

        <div>
          <p id={`${idBase}-leave`} className="text-sm font-semibold text-slate-900">
            Leave days
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Meetings on these days (IST) move to the reassignment list from the evening before.</p>
          {sortedLeave.length > 0 ? (
            <ul aria-labelledby={`${idBase}-leave`} className="mt-2 flex flex-wrap gap-1.5">
              {sortedLeave.map((day) => (
                <Chip
                  key={day}
                  muted={day < today}
                  removeLabel={`Remove leave day ${leaveLabel(day)}`}
                  onRemove={() => commit({ leaveDays: profile.leaveDays.filter((d) => d !== day) })}
                >
                  {leaveLabel(day)}
                </Chip>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs italic text-slate-400">No leave days booked.</p>
          )}
          <form onSubmit={addLeave} className="mt-2 flex gap-2">
            <label htmlFor={`${idBase}-leave-input`} className="sr-only">
              Leave day to add for {profile.displayName}
            </label>
            <input
              id={`${idBase}-leave-input`}
              type="date"
              value={leaveDraft}
              onChange={(e) => {
                setLeaveDraft(e.target.value);
                setLeaveError(null);
              }}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || leaveDraft === ''}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} aria-hidden="true" />
              Add day
            </button>
          </form>
          {leaveError && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-700">
              {leaveError}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Admin section: who counts as a BDA and how each source's name for them is recognised.
 * Pass the token of an admin session. Edits save at once, show immediately, and roll back on error.
 */
export default function BdaRegistryAdmin({ token }: { token: string | null }) {
  const query = useBdaProfiles(token, true);
  const headingId = useId();

  const unknown = useMemo(
    () =>
      [...(query.data?.unknownNames ?? [])]
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
        .slice(0, 20),
    [query.data],
  );

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-bold text-slate-900">
            BDA registry
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-600">
            Decides who attendance, calls and deductions apply to, and how Meet, Zoom and Calendly names map to each person.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-60"
        >
          {query.isFetching ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
          Refresh
        </button>
      </div>

      {query.isPending ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2" data-testid="registry-loading">
          <span className="sr-only">Loading the BDA registry</span>
          <div className="h-96 animate-pulse rounded-xl bg-slate-200/70" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-200/70" />
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-red-900">Could not load the BDA registry</p>
            <p className="mt-0.5 text-sm text-red-800">{query.error.message}</p>
          </div>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {query.data.profiles.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              No profiles yet. Run the seed script to create the first two.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {query.data.profiles.map((p) => (
                <ProfileCard key={p.email} profile={p} token={token} />
              ))}
            </div>
          )}

          <section aria-labelledby={`${headingId}-unknown`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 id={`${headingId}-unknown`} className="text-sm font-bold text-slate-900">
                Names nobody recognised
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                The last 20 names the matcher could not tie to one BDA. If one is a spelling of a BDA, add it as an alias above.
              </p>
            </div>
            {unknown.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No unknown names logged.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Unrecognised names</caption>
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-2">Name</th>
                    <th scope="col" className="px-4 py-2">Source</th>
                    <th scope="col" className="px-4 py-2 text-right">Times seen</th>
                    <th scope="col" className="px-4 py-2 text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unknown.map((u) => (
                    <tr key={`${u.source}-${u.name}`}>
                      <td className="px-4 py-2 font-medium text-slate-900">{u.name}</td>
                      <td className="px-4 py-2 text-slate-600">{u.source.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{u.count}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600">{fmtDayTime(u.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}
