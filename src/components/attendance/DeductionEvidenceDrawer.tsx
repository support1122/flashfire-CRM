import { useEffect, useId, useRef, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import type { Deduction } from '../../types/attendance';
import {
  STATUS_CHIP,
  callSummaryText,
  countsTowardsPay,
  offsetFromStart,
  resolveFocusTarget,
  signalName,
  statusLabel,
  tierText,
  voidReasonText,
  whyText,
  type FocusTarget,
} from './deductionHelpers';
import { RULE_LABEL, formatInr } from './format';

function stamp(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  try {
    return format(parseISO(iso), 'MMM d, yyyy, h:mm:ss a');
  } catch {
    return 'Not recorded';
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-5 py-4 first:border-t-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

interface DeductionEvidenceDrawerProps {
  deduction: Deduction;
  /** Admins also see the BDA name and the Shadow wording. */
  admin: boolean;
  onClose: () => void;
  /** Where focus goes on close, when the browser did not focus the trigger button itself. */
  returnFocusTo?: FocusTarget;
}

/**
 * Side drawer with the frozen evidence behind one deduction. Mount it only while it should be
 * open. It is a modal <dialog>: Escape closes it, Tab stays inside, focus returns to the trigger.
 */
export default function DeductionEvidenceDrawer({ deduction: d, admin, onClose, returnFocusTo }: DeductionEvidenceDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const titleId = useId();
  const ev = d.evidence;
  const tier = tierText(d);
  const counted = countsTowardsPay(d);

  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    closeRef.current?.focus();
    const remembered = opener.current;
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      const target = resolveFocusTarget(returnRef.current) ?? resolveFocusTarget(remembered instanceof HTMLElement ? remembered : null);
      target?.focus();
    };
  }, []);

  const signals = [...(ev.signals ?? [])].sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="ml-auto mr-0 mt-0 mb-0 h-dvh max-h-dvh w-[min(28rem,100vw)] max-w-none overflow-y-auto rounded-none border-l border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Evidence</p>
          <h2 id={titleId} className="mt-0.5 text-lg font-bold leading-snug">
            {RULE_LABEL[d.rule]}
          </h2>
          <p className="mt-0.5 truncate text-sm text-slate-600">
            {ev.clientName || d.clientName}
            {admin && d.bdaName ? ` · ${d.bdaName}` : ''}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close evidence"
          className="-mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <Section title="Outcome">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[d.status]}`}>
            {statusLabel(d.status, admin)}
          </span>
          <span className={`text-lg font-bold tabular-nums ${counted ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
            {formatInr(d.amountInr)}
          </span>
          {tier && <span className="text-xs text-slate-500">{tier}</span>}
        </div>
        {d.status === 'needs_review' && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {admin
              ? 'A data source was unhealthy when this was judged, so it does not count until an admin activates or waives it.'
              : 'This is under review. A data source was unreliable when it was judged, so an admin will check it first. It is not counted in your total.'}
          </p>
        )}
        {d.status === 'shadow' && (
          <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            Recorded in shadow mode. It is visible to admins only and does not change anyone's pay.
          </p>
        )}
        <p className="mt-2 text-slate-600">{whyText(d)}</p>
      </Section>

      <Section title="The meeting">
        <dl>
          <Row label="Client">{ev.clientName || d.clientName}</Row>
          <Row label="Scheduled start">{stamp(ev.scheduledStart)}</Row>
          <Row label="Booking status">{ev.bookingStatus ?? 'Not recorded'}</Row>
          {d.rule === 'missed_meeting' && <Row label="Window closed">{stamp(ev.windowClosedAt)}</Row>}
        </dl>
      </Section>

      {d.rule === 'missed_meeting' && (
        <Section title="Presence signals">
          {signals.length === 0 ? (
            <p className="text-slate-600">No signal arrived. Nothing showed the BDA in the call.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                Only a signal at or before one minute after the start counts as present.
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {signals.map((s) => {
                  const late = Date.parse(s.eventAt) > Date.parse(ev.scheduledStart) + 60_000;
                  return (
                    <li key={`${s.kind}-${s.eventAt}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="font-medium">{signalName(s.kind)}</span>
                      <span className="text-right text-xs tabular-nums text-slate-600">
                        {stamp(s.eventAt)}
                        <span className={`block ${late ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                          {offsetFromStart(s.eventAt, ev.scheduledStart)}
                          {late ? ', too late' : ''}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Section>
      )}

      {d.rule === 'no_show_not_called' && (
        <Section title="Calls to the client">
          <p>{callSummaryText(ev.callSummary)}</p>
          {d.rule === 'no_show_not_called' && ev.callSummary?.calledWithin30Min === false && (
            <p className="mt-1 text-xs text-slate-500">No outbound call between the start and 30 minutes after it.</p>
          )}
        </Section>
      )}

      {d.rule === 'missed_meeting' && ev.callSummary && ev.callSummary.calls != null && (
        <Section title="Calls to the client">
          <p>{callSummaryText(ev.callSummary)}</p>
        </Section>
      )}

      {d.status === 'waived' && (
        <Section title="Waiver">
          <dl>
            <Row label="Waived by">{d.waivedByName || d.waivedBy || 'Unknown'}</Row>
            <Row label="When">{stamp(d.waivedAt)}</Row>
          </dl>
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{d.waiverReason || 'No reason recorded'}</p>
        </Section>
      )}

      {d.status === 'voided' && (
        <Section title="Voided">
          <dl>
            <Row label="When">{stamp(d.voidedAt)}</Row>
          </dl>
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{voidReasonText(d.voidReason)}</p>
        </Section>
      )}

      <Section title="Record">
        <dl>
          <Row label="Created">{stamp(d.createdAt)}</Row>
          <Row label="Reference">
            <span className="font-mono text-xs">{d.deductionId}</span>
          </Row>
        </dl>
        <p className="mt-2 text-xs text-slate-500">This evidence was frozen when the deduction was created. It does not change afterwards.</p>
      </Section>
    </dialog>
  );
}
