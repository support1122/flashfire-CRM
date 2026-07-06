import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from 'lucide-react';

// One entry in a booking's append-only status trail. Shape mirrors the backend
// CampaignBooking.statusHistory sub-document.
export interface StatusHistoryEntry {
  status?: string;
  previousStatus?: string | null;
  changedByEmail?: string | null;
  changedByName?: string | null;
  source?: string | null;
  changedAt?: string | null;
}

interface StatusHistoryPopoverProps {
  history?: StatusHistoryEntry[] | null;
  // Latest change, used as a fallback when history is empty (older records).
  latestStatus?: string | null;
  latestChangedByName?: string | null;
  latestChangedAt?: string | null;
  latestSource?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  'not-scheduled': 'Not Scheduled',
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
  'no-show': 'No Show',
  ignored: 'Ignored',
  paid: 'Paid',
};

const STATUS_DOT: Record<string, string> = {
  'not-scheduled': 'bg-blue-400',
  scheduled: 'bg-orange-400',
  completed: 'bg-emerald-500',
  canceled: 'bg-rose-500',
  rescheduled: 'bg-amber-400',
  'no-show': 'bg-rose-400',
  ignored: 'bg-slate-300',
  paid: 'bg-teal-500',
};

const SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin',
  bda: 'BDA',
  calendly: 'Calendly',
  system: 'System',
  microservice: 'System',
};

function statusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] || status;
}

function formatAbsolute(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A small clock button that opens a portal popover showing the full status-change
 * timeline for a booking. Self-contained: positioning, click-outside, and Esc are
 * handled internally so any table view can drop it into a Status cell.
 */
export default function StatusHistoryPopover({
  history,
  latestStatus,
  latestChangedByName,
  latestChangedAt,
  latestSource,
}: StatusHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Build the list newest-first. Fall back to the latest-* fields for records that
  // predate history tracking so there is always something to show.
  const entries: StatusHistoryEntry[] =
    Array.isArray(history) && history.length > 0
      ? [...history].sort(
          (a, b) => new Date(b.changedAt || 0).getTime() - new Date(a.changedAt || 0).getTime()
        )
      : latestStatus
        ? [
            {
              status: latestStatus,
              changedByName: latestChangedByName,
              changedAt: latestChangedAt,
              source: latestSource,
            },
          ]
        : [];

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const panelWidth = 288;
    let left = rect.left;
    // Keep the panel on screen horizontally.
    if (left + panelWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelWidth - 8);
    }
    setPos({ top: rect.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const count = entries.length;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border border-slate-200 text-slate-500 bg-white hover:border-slate-300 hover:text-slate-800 hover:bg-slate-50 transition shrink-0"
        title="View status history"
        aria-label="View status history"
      >
        <Clock size={11} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[60] w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Status history</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">
                  {count} {count === 1 ? 'change' : 'changes'}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Close"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {count === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">No history yet.</div>
            ) : (
              <ul className="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
                {entries.map((e, i) => {
                  const dot = STATUS_DOT[e.status || ''] || 'bg-slate-300';
                  const sourceLabel = e.source ? SOURCE_LABELS[e.source] || e.source : null;
                  const who = e.changedByName || sourceLabel || 'Unknown';
                  // For human actors (admin/bda) the person's name is the attribution,
                  // so skip the generic source chip. Keep it for automated sources.
                  const isHumanSource = e.source === 'admin' || e.source === 'bda';
                  const showSourceChip = Boolean(sourceLabel) && !isHumanSource;
                  return (
                    <li key={i} className="flex gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-semibold text-slate-800">
                            {statusLabel(e.status)}
                          </span>
                          {showSourceChip && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1 py-px">
                              {sourceLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-600">{who}</span>
                          {e.changedAt && (
                            <>
                              {' · '}
                              <span title={formatAbsolute(e.changedAt)}>{formatAbsolute(e.changedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
