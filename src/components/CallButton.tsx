import { useMemo, type ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { useCallerNumbers, useAgentPresence, useLiveCall, type PresenceStatus, type LivePhase } from '../hooks/useZoomCall';

interface CallButtonProps {
  /** The lead's phone number (any format). */
  leadPhone?: string | null;
  /** Content of the main call link. Defaults to a phone icon + "Call". */
  children?: ReactNode;
  /** Classes for the main call anchor (keep each call site's existing look). */
  className?: string;
  title?: string;
  /** Show the compact "from number" picker (default true). */
  showPicker?: boolean;
  /** Show the agent-availability dot (default true). */
  showPresence?: boolean;
  /** Wrapper classes. */
  wrapperClassName?: string;
}

const clean = (s: string) => (s || '').replace(/[^\d+]/g, '');

const presenceMeta: Record<PresenceStatus, { color: string; label: string }> = {
  available: { color: 'bg-emerald-500', label: 'Available' },
  on_call: { color: 'bg-red-500', label: 'On a call' },
  busy: { color: 'bg-amber-500', label: 'Busy' },
  away: { color: 'bg-amber-400', label: 'Away' },
  offline: { color: 'bg-slate-400', label: 'Offline' },
  unknown: { color: 'bg-slate-300', label: 'Availability unknown' },
};

function LivePill({ phase }: { phase: LivePhase }) {
  if (phase === 'idle') return null;
  const map: Record<Exclude<LivePhase, 'idle'>, { text: string; cls: string; pulse?: boolean }> = {
    dialing: { text: 'Dialing…', cls: 'bg-sky-50 text-sky-700 border-sky-200', pulse: true },
    ringing: { text: 'Ringing…', cls: 'bg-sky-50 text-sky-700 border-sky-200', pulse: true },
    connected: { text: 'Connected', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', pulse: true },
    ended: { text: 'Ended', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
    missed: { text: 'No answer', cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const m = map[phase as Exclude<LivePhase, 'idle'>];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${m.cls}`}>
      {m.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {m.text}
    </span>
  );
}

export default function CallButton({
  leadPhone,
  children,
  className,
  title,
  showPicker = true,
  showPresence = true,
  wrapperClassName,
}: CallButtonProps) {
  const { token, user } = useCrmAuth();
  const agentEmail = user?.email ?? null;

  const { numbers, selected, setSelected } = useCallerNumbers(token, agentEmail);
  const presence = useAgentPresence(showPresence ? token : null, showPresence ? agentEmail : null);
  const { phase, start } = useLiveCall(token, leadPhone ?? null, agentEmail);

  const leadClean = clean(leadPhone ?? '');
  const fromClean = selected ? clean(selected) : '';

  const href = useMemo(() => {
    if (!leadClean) return undefined;
    return `zoomphonecall://${leadClean}${fromClean ? `?callerid=${fromClean}` : ''}`;
  }, [leadClean, fromClean]);

  if (!leadClean) {
    return <span className={className}>{children ?? <span className="text-slate-400">—</span>}</span>;
  }

  const pMeta = presenceMeta[presence.status] ?? presenceMeta.unknown;
  const selectedMeta = numbers.find((n) => clean(n.number) === fromClean);
  const fromTitle = selected
    ? `Calling from ${selectedMeta?.label ? `${selectedMeta.label} · ` : ''}${selected}`
    : 'Calling from your default Zoom number';

  const anchor = (
    <a
      href={href}
      className={className}
      title={title ? `${title} · ${fromTitle}` : fromTitle}
      onClick={() => start()}
    >
      {children ?? (
        <span className="inline-flex items-center gap-1">
          <Phone size={11} /> Call
        </span>
      )}
    </a>
  );

  const showPresenceDot = showPresence && presence.status !== 'unknown';
  const showNumberPicker = showPicker && numbers.length > 1;

  // Bare mode: no inline controls. Keep the anchor exactly as it was (so
  // `truncate`/`block` in dense tables still work) and drop the live pill
  // underneath, matching the existing "minutes" badge style.
  if (!showPresenceDot && !showNumberPicker) {
    if (phase === 'idle') return anchor;
    return (
      <>
        {anchor}
        <span className="block mt-0.5">
          <LivePill phase={phase} />
        </span>
      </>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${wrapperClassName ?? ''}`}>
      {anchor}

      {showPresenceDot && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${pMeta.color} shrink-0`}
          title={`Agent: ${pMeta.label}`}
        />
      )}

      {showNumberPicker && (
        <select
          value={selected ?? ''}
          onChange={(e) => setSelected(e.target.value || null)}
          onClick={(e) => e.stopPropagation()}
          title="Choose which number to call from"
          className="text-[9px] leading-none max-w-[92px] truncate bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-slate-600 hover:border-orange-300 focus:outline-none focus:border-orange-400"
        >
          {numbers.map((n) => (
            <option key={n.number} value={n.number} disabled={!n.live}>
              {(n.label || n.number) + (n.live ? '' : ' (offline)')}
            </option>
          ))}
        </select>
      )}

      <LivePill phase={phase} />
    </span>
  );
}
