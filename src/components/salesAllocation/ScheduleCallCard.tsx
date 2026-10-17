import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Search } from 'lucide-react';
import { ApiError } from '../../api/attendance';
import { useBdaAvailability, useCreateAllocation, useLeadLookup } from '../../api/salesAllocation';
import type { LeadMatch } from '../../types/salesAllocation';
import { FIELD_CLASS, LABEL_CLASS, errorMessage, useDebounced } from './helpers';
import {
  INDIA_ZONE,
  ZONE_GROUPS,
  formatInZone,
  isKnownZone,
  zoneLabel,
  zonedWallToUtc,
} from './timeZones';

const DEFAULT_ZONE = 'America/New_York';

function StepHeading({ n, children }: { n: number; children: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white">{n}</span>
      {children}
    </h3>
  );
}

export default function ScheduleCallCard({ token }: { token: string | null }) {
  const create = useCreateAllocation(token);
  const uid = useId();

  const [search, setSearch] = useState('');
  const [showMatches, setShowMatches] = useState(false);
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [zone, setZone] = useState(DEFAULT_ZONE);
  const [wall, setWall] = useState('');
  const [bdaEmail, setBdaEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 300);
  const lookup = useLeadLookup(token, debouncedSearch);
  const matches = debouncedSearch.length >= 3 ? (lookup.data?.matches ?? []) : [];

  const instant = useMemo(() => (wall ? zonedWallToUtc(wall, zone) : null), [wall, zone]);
  const callAtIso = instant ? instant.toISOString() : null;
  const bdas = useBdaAvailability(token, callAtIso);

  // A BDA who was picked but is unavailable for a newly chosen time must be unpicked.
  const selectedBda = bdas.data?.bdas.find((b) => b.email === bdaEmail);
  useEffect(() => {
    if (bdaEmail && selectedBda && !selectedBda.available) setBdaEmail('');
  }, [bdaEmail, selectedBda]);

  const zoneLabelAt = instant ?? new Date();
  const inPast = Boolean(instant && instant.getTime() < Date.now());
  const contactMissing = !phone.trim() && !email.trim();
  const blocked =
    create.isPending || !clientName.trim() || contactMissing || !instant || !bdaEmail || !isKnownZone(zone);

  function pick(m: LeadMatch) {
    setClientName(m.clientName);
    setPhone(m.phone ?? '');
    setEmail(m.email ?? '');
    if (isKnownZone(m.timezone)) setZone(m.timezone);
    setSearch('');
    setShowMatches(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    if (blocked || !instant) return;
    try {
      const res = await create.mutateAsync({
        clientName: clientName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        timezone: zone,
        callAt: instant.toISOString(),
        bdaEmail,
        notes: notes.trim() || undefined,
      });
      setDone(
        `Scheduled ${res.allocation.clientName} with ${res.allocation.bdaName} for ${formatInZone(
          new Date(res.allocation.callAt),
          INDIA_ZONE,
        )}. The BDA has been notified.`,
      );
      setSearch('');
      setClientName('');
      setPhone('');
      setEmail('');
      setWall('');
      setBdaEmail('');
      setNotes('');
    } catch (cause) {
      setError({
        code: cause instanceof ApiError ? cause.code : null,
        message:
          cause instanceof ApiError && cause.code === 'bda_on_leave'
            ? `${cause.message} Pick another BDA.`
            : errorMessage(cause, 'Could not schedule the call'),
      });
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarClock size={18} className="text-slate-500" /> Schedule a call
      </h2>
      <p className="mt-1 text-sm text-slate-500">Pick the lead, set the time in their time zone, then choose a BDA.</p>

      {/* Step 1 */}
      <section className="mt-5 space-y-3">
        <StepHeading n={1}>Find or add lead</StepHeading>
        <div className="relative">
          <label htmlFor={`${uid}-search`} className={LABEL_CLASS}>
            Search by phone or email
          </label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400" />
            <input
              id={`${uid}-search`}
              type="search"
              autoComplete="off"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowMatches(true);
              }}
              onFocus={() => setShowMatches(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowMatches(false);
              }}
              placeholder="At least 3 characters"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>
          {showMatches && debouncedSearch.length >= 3 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {lookup.isFetching && matches.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Searching
                </p>
              ) : lookup.isError ? (
                <p className="px-3 py-2 text-sm text-rose-600">{errorMessage(lookup.error, 'Search failed')}</p>
              ) : matches.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">No match. Fill the fields below to add a new lead.</p>
              ) : (
                <ul>
                  {matches.map((m) => (
                    <li key={`${m.source}-${m.email ?? ''}-${m.phone ?? ''}-${m.clientName}`}>
                      <button
                        type="button"
                        onClick={() => pick(m)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        <span className="text-sm font-medium text-slate-900">{m.clientName}</span>
                        <span className="text-xs text-slate-500">
                          {[m.phone, m.email].filter(Boolean).join(' · ') || 'No contact on file'}
                          {m.timezone ? ` · ${m.timezone}` : ''} · {m.source}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-name`} className={LABEL_CLASS}>
              Client name
            </label>
            <input id={`${uid}-name`} required value={clientName} onChange={(e) => setClientName(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label htmlFor={`${uid}-phone`} className={LABEL_CLASS}>
              Phone
            </label>
            <input id={`${uid}-phone`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label htmlFor={`${uid}-email`} className={LABEL_CLASS}>
              Email
            </label>
            <input id={`${uid}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>
        {contactMissing && clientName.trim() && <p className="text-xs text-slate-500">Add a phone number or an email.</p>}
      </section>

      {/* Step 2 */}
      <section className="mt-6 space-y-3">
        <StepHeading n={2}>When</StepHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-zone`} className={LABEL_CLASS}>
              Client time zone
            </label>
            <select id={`${uid}-zone`} value={zone} onChange={(e) => setZone(e.target.value)} className={FIELD_CLASS}>
              {ZONE_GROUPS.map((g) => (
                <optgroup key={g.region} label={g.region}>
                  {g.zones.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {zoneLabel(opt, zoneLabelAt)}
                    </option>
                  ))}
                </optgroup>
              ))}
              {!isKnownZone(zone) && <option value={zone}>{zone}</option>}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-when`} className={LABEL_CLASS}>
              Date and time in the client zone
            </label>
            <input
              id={`${uid}-when`}
              type="datetime-local"
              step={300}
              value={wall}
              onChange={(e) => setWall(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div aria-live="polite" className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {instant ? (
            <>
              <p className="text-slate-900">
                <span className="inline-block w-32 whitespace-nowrap text-slate-500">Client time:</span>
                <span className="font-semibold">{formatInZone(instant, zone)}</span>
              </p>
              <p className="text-slate-900">
                <span className="inline-block w-32 whitespace-nowrap text-slate-500">India time:</span>
                <span className="font-semibold">{formatInZone(instant, INDIA_ZONE)}</span>
              </p>
              {inPast && <p className="mt-1 text-xs text-amber-700">That time has already passed.</p>}
            </>
          ) : (
            <p className="text-slate-500">Pick a date and time to see it in both zones.</p>
          )}
        </div>
      </section>

      {/* Step 3 */}
      <section className="mt-6 space-y-3">
        <StepHeading n={3}>Assign BDA</StepHeading>
        {!instant ? (
          <p className="text-sm text-slate-500">Choose the time first, then we show who is free.</p>
        ) : bdas.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Checking who is free
          </p>
        ) : bdas.isError ? (
          <p role="alert" className="text-sm text-rose-600">
            {errorMessage(bdas.error, 'Could not load BDAs')}
          </p>
        ) : (bdas.data?.bdas.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No BDAs found.</p>
        ) : (
          <fieldset>
            <legend className="sr-only">BDA for this call</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bdas.data?.bdas.map((b) => {
                const checked = bdaEmail === b.email;
                return (
                  <label
                    key={b.email}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                      !b.available
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                        : checked
                          ? 'cursor-pointer border-orange-400 bg-orange-50 ring-2 ring-orange-500/20'
                          : 'cursor-pointer border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${uid}-bda`}
                      value={b.email}
                      checked={checked}
                      disabled={!b.available}
                      onChange={() => setBdaEmail(b.email)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{b.name}</span>
                      {b.available ? (
                        <span className="block text-xs text-slate-500">
                          {b.callsThatDay} call{b.callsThatDay === 1 ? '' : 's'} that day
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                          Absent (on leave)
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor={`${uid}-notes`} className={LABEL_CLASS}>
            Notes for the BDA <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <textarea
            id={`${uid}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error.message}
        </p>
      )}
      {done && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {done}
        </p>
      )}

      <button
        type="submit"
        disabled={blocked}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {create.isPending && <Loader2 size={14} className="animate-spin" />}
        Schedule call and notify
      </button>
    </form>
  );
}
