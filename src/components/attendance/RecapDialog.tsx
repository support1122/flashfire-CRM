import { useEffect, useId, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { fetchBookingRecap } from '../../api/attendance';

// The Calendly Notetaker summary of one meeting, saved by the Gmail Apps Script (BDA attendance/apps-script).
// Loaded on open, cached by booking, shown in a native <dialog> so focus and Escape work without extra code.

const SECTION_ORDER = ['summary', 'action items', 'next steps', 'key points', 'key takeaways', 'highlights', 'topics', 'questions', 'attendees'];

function sectionTitle(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function RecapDialog({ bookingId, clientName, onClose }: { bookingId: string; clientName?: string; onClose: () => void }) {
  const { token } = useCrmAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);

  const recap = useQuery({
    queryKey: ['booking-recap', bookingId],
    queryFn: ({ signal }) => fetchBookingRecap(token, bookingId, signal),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal; a real browser always does.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    const back = opener.current;
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const latest = recap.data?.recaps?.[0] ?? null;
  const sections = latest
    ? SECTION_ORDER.filter((k) => latest.sections?.[k]).concat(
        Object.keys(latest.sections || {}).filter((k) => !SECTION_ORDER.includes(k) && k !== 'preamble' && latest.sections[k]),
      )
    : [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="w-[min(42rem,calc(100vw-2rem))] max-h-[85vh] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold text-slate-900">
            Calendly meeting summary
          </h2>
          <p className="truncate text-sm text-slate-600">{latest?.subject || clientName || ''}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close summary"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-800">
        {recap.isPending && <p className="text-slate-500">Loading the summary…</p>}
        {recap.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
            <span>The summary could not load.</span>
            <button type="button" onClick={() => recap.refetch()} className="rounded-md border border-rose-300 bg-white px-2 py-0.5 font-semibold">
              Retry
            </button>
          </div>
        )}
        {recap.isSuccess && !latest && <p className="text-slate-500">No Calendly summary for this meeting yet.</p>}
        {latest && (
          <>
            {latest.sentAt && (
              <p className="mb-3 text-xs text-slate-500">
                Received {new Date(latest.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
              </p>
            )}
            {sections.length > 0 ? (
              sections.map((k) => (
                <section key={k} className="mb-4">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{sectionTitle(k)}</h3>
                  <p className="whitespace-pre-wrap">{latest.sections[k]}</p>
                </section>
              ))
            ) : (
              <p className="whitespace-pre-wrap">{latest.summary}</p>
            )}
          </>
        )}
      </div>

      {latest?.recapUrl && (
        <div className="border-t border-slate-200 px-5 py-3">
          <a
            href={latest.recapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-800"
          >
            Open the full recap in Calendly
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      )}
    </dialog>
  );
}
