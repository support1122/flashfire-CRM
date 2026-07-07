import { Phone } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { useCallerNumbers, useAgentPresence, type PresenceStatus } from '../hooks/useZoomCall';

const dotColor: Record<PresenceStatus, string> = {
  available: 'bg-emerald-500',
  on_call: 'bg-red-500',
  busy: 'bg-amber-500',
  away: 'bg-amber-400',
  offline: 'bg-slate-400',
  unknown: 'bg-slate-300',
};
const dotLabel: Record<PresenceStatus, string> = {
  available: 'Available',
  on_call: 'On a call',
  busy: 'Busy',
  away: 'Away',
  offline: 'Offline',
  unknown: 'Availability unknown',
};

/**
 * Toolbar control to choose which Zoom number outbound calls go out from, plus
 * the agent's availability. The selection is shared (localStorage + in-memory)
 * so every CallButton on the page dials from the chosen number.
 */
export default function CallerIdSelector({ className = '' }: { className?: string }) {
  const { token, user } = useCrmAuth();
  const email = user?.email ?? null;
  const { numbers, selected, setSelected, source } = useCallerNumbers(token, email);
  const presence = useAgentPresence(token, email);

  if (numbers.length === 0) return null;

  return (
    <div className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
        <Phone size={12} className="text-orange-500" /> Call from
      </span>
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
        className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-medium hover:border-orange-300 focus:outline-none focus:border-orange-400 max-w-[220px] truncate"
      >
        {numbers.map((n) => (
          <option key={n.number} value={n.number} disabled={!n.live}>
            {n.label ? `${n.label} · ${n.number}` : n.number}
            {n.live ? '' : ' (offline)'}
          </option>
        ))}
      </select>
      {presence.status !== 'unknown' && (
        <span className="inline-flex items-center gap-1 text-slate-500" title={`You: ${dotLabel[presence.status]}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor[presence.status]}`} />
          <span className="hidden sm:inline">{dotLabel[presence.status]}</span>
        </span>
      )}
      {source === 'config' && (
        <span className="text-[10px] text-slate-400" title="Numbers from server config (Zoom API not authorized for live listing yet)">
          (config)
        </span>
      )}
    </div>
  );
}
