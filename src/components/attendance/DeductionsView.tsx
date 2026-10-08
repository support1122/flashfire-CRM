import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, Info, Loader2, RefreshCw } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { useDeductionSummary, useDeductions, useResolveDeduction, useReviewQueues } from '../../api/attendanceAdmin';
import type { Deduction } from '../../types/attendance';
import type { DeductionsMode } from '../../types/attendanceAdmin';
import AttendanceReviewQueues from './AttendanceReviewQueues';
import DeductionEvidenceDrawer from './DeductionEvidenceDrawer';
import WaiveDialog from './WaiveDialog';
import {
  RULES,
  STATUS_CHIP,
  currentMonthKey,
  deriveTotals,
  countsTowardsPay,
  isCrmAdminUser,
  monthLabel,
  shiftMonth,
  statusLabel,
  tierText,
  voidReasonText,
} from './deductionHelpers';
import { RULE_LABEL, fmtDayTime, formatInr } from './format';

type View = 'ledger' | 'queues';

interface DialogState {
  kind: 'waive' | 'activate';
  deduction: Deduction;
  trigger: HTMLElement | null;
}

interface EvidenceState {
  deduction: Deduction;
  trigger: HTMLElement | null;
}

/** The trigger if it is still on the page, else the same row's Evidence button (a waived row loses its Waive button). */
function focusAfterClose(trigger: HTMLElement | null, deductionId: string) {
  return () =>
    trigger && trigger.isConnected
      ? trigger
      : (Array.from(document.querySelectorAll<HTMLElement>('[data-evidence-for]')).find(
          (el) => el.getAttribute('data-evidence-for') === deductionId,
        ) ?? null);
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function ModeBanner({ mode, admin }: { mode: DeductionsMode; admin: boolean }) {
  if (mode === 'live') return null;
  const body = admin
    ? mode === 'shadow'
      ? 'Shadow mode: rows are recorded for admins only. They are labelled Shadow, are not counted in any total and BDAs cannot see them.'
      : 'The deduction engine is switched off, so no rows are being created.'
    : 'These rules are being tested. Nothing below is deducted from your pay for now.';
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold">Fines are not active yet</p>
        <p className="mt-0.5 text-sm text-amber-900">{body}</p>
      </div>
    </div>
  );
}

function PolicyDetails() {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-500 [&::-webkit-details-marker]:hidden">
        <Info size={16} className="text-slate-500" aria-hidden="true" />
        How deductions work
        <ChevronRight size={16} className="ml-auto text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Missed meeting:</strong> {formatInr(500)} each for the first 5 misses in a month, {formatInr(1000)} each from the 6th. You
            are present if any signal reaches the server by one minute after the start: Mark Present in the CRM or the Meet page,
            the extension seeing you in the call, or Google Meet records.
          </li>
          <li>
            <strong>No-show not called:</strong> {formatInr(100)} when the client is a no-show and you placed no outbound call to them within 30
            minutes of the start.
          </li>
          <li>
            <strong>Status not updated:</strong> {formatInr(50)} when the booking is still marked scheduled 2 hours after the start.
          </li>
        </ul>
        <p>
          The miss count restarts on the 1st of each month (IST). An admin can waive any deduction with a written reason, and a waived one
          no longer counts. A deduction marked under review does not count until an admin decides.
        </p>
      </div>
    </details>
  );
}

function StatusChip({ status, admin }: { status: Deduction['status']; admin: boolean }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[status]}`}>
      {statusLabel(status, admin)}
    </span>
  );
}

function AmountCell({ d }: { d: Deduction }) {
  if (countsTowardsPay(d)) return <span className="font-bold text-slate-900">{formatInr(d.amountInr)}</span>;
  if (d.status === 'waived' || d.status === 'voided') {
    return (
      <span className="text-slate-400 line-through">
        {formatInr(d.amountInr)}
        <span className="sr-only"> ({d.status})</span>
      </span>
    );
  }
  return (
    <span className="text-slate-500">
      <span className="italic">{formatInr(d.amountInr)}</span>
      <span className="block text-[10px] font-normal not-italic text-slate-500">not counted</span>
    </span>
  );
}

function ResolutionNote({ d }: { d: Deduction }) {
  if (d.status === 'waived') {
    return (
      <p className="mt-1 max-w-md text-[11px] leading-snug text-slate-500">
        Waived by <span className="font-medium text-slate-700">{d.waivedByName || d.waivedBy || 'an admin'}</span>
        {d.waivedAt ? `, ${fmtDayTime(d.waivedAt)}` : ''}. Reason: {d.waiverReason || 'none recorded'}
      </p>
    );
  }
  if (d.status === 'voided') {
    return (
      <p className="mt-1 max-w-md text-[11px] leading-snug text-slate-500">
        Voided{d.voidedAt ? `, ${fmtDayTime(d.voidedAt)}` : ''}. {voidReasonText(d.voidReason)}
      </p>
    );
  }
  return null;
}

function TotalsCards({
  totals,
  underReview,
  admin,
  filtered,
}: {
  totals: ReturnType<typeof deriveTotals>;
  underReview: number;
  admin: boolean;
  filtered: boolean;
}) {
  const label = admin ? (filtered ? 'Active for this BDA' : 'Active, all BDAs') : 'Deducted this month';
  return (
    <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3 lg:col-span-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900" data-testid="total-active">
          {formatInr(totals.activeAmountInr)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {underReview > 0
            ? `${underReview} under review, not counted`
            : 'Active deductions only'}
        </p>
      </div>
      {RULES.map((rule) => (
        <div key={rule} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{RULE_LABEL[rule]}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900" data-testid={`total-${rule}`}>
            {formatInr(totals.byRule[rule].amountInr)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.byRule[rule].count} {totals.byRule[rule].count === 1 ? 'deduction' : 'deductions'}
          </p>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function DeductionsView() {
  const { user, token } = useCrmAuth();
  const admin = isCrmAdminUser(user);
  const [view, setView] = useState<View>('ledger');
  const [month, setMonth] = useState(() => currentMonthKey());
  const [bdaEmail, setBdaEmail] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);

  const thisMonth = currentMonthKey();
  const query = useDeductions(token, month, admin ? bdaEmail : '');
  const summary = useDeductionSummary(token, month, admin);
  const queues = useReviewQueues(token, admin);
  const resolve = useResolveDeduction(token);

  const data = query.data;
  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])].sort(
        (a, b) => Date.parse(b.evidence.scheduledStart) - Date.parse(a.evidence.scheduledStart),
      ),
    [data],
  );

  const totals = useMemo(() => {
    const derived = deriveTotals(rows);
    if (!data?.totals) return derived;
    return {
      activeAmountInr: data.totals.activeAmountInr,
      byRule: { ...derived.byRule, ...data.totals.byRule },
    };
  }, [data, rows]);

  const underReview = rows.filter((r) => r.status === 'needs_review').length;
  const queueCount = queues.data
    ? queues.data.needsReview.length +
      queues.data.markedNeverJoined.length +
      queues.data.stuckStatus.length +
      queues.data.needsReassignment.length
    : 0;
  const bdaOptions = summary.data?.perBda ?? [];

  const dialogSubject = dialog && {
    heading: `${RULE_LABEL[dialog.deduction.rule]}, ${formatInr(dialog.deduction.amountInr)}`,
    details: [
      dialog.deduction.clientName,
      ...(admin && dialog.deduction.bdaName ? [dialog.deduction.bdaName] : []),
      fmtDayTime(dialog.deduction.evidence.scheduledStart),
    ],
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deductions</h1>
          <p className="mt-1 text-sm text-slate-600">
            {admin
              ? 'Every deduction with the evidence behind it. Waive one with a written reason.'
              : 'Every deduction against you, with the evidence behind it.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Month">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <p className="min-w-36 text-center text-sm font-semibold text-slate-900" aria-live="polite" data-testid="month-label">
            {monthLabel(month)}
          </p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= thisMonth}
            aria-label="Next month"
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {month !== thisMonth && (
            <button
              type="button"
              onClick={() => setMonth(thisMonth)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              This month
            </button>
          )}
        </div>
      </header>

      {admin && (
        <nav aria-label="Deductions sections" className="flex gap-1 border-b border-slate-200">
          {(
            [
              { id: 'ledger', label: 'Ledger' },
              { id: 'queues', label: 'Review queues' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-500 ${
                view === item.id
                  ? 'border-orange-500 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.id === 'queues' && <ClipboardList size={15} aria-hidden="true" />}
              {item.label}
              {item.id === 'queues' && queueCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {queueCount}
                  <span className="sr-only"> items waiting</span>
                </span>
              )}
            </button>
          ))}
        </nav>
      )}

      {admin && view === 'queues' ? (
        <AttendanceReviewQueues token={token} />
      ) : (
        <>
          {data && <ModeBanner mode={data.mode} admin={admin} />}
          <PolicyDetails />

          {admin && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="deductions-bda-filter" className="text-sm font-semibold text-slate-700">
                BDA
              </label>
              <select
                id="deductions-bda-filter"
                value={bdaEmail}
                onChange={(e) => setBdaEmail(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500"
              >
                <option value="">All BDAs</option>
                {bdaOptions.map((b) => (
                  <option key={b.bdaEmail} value={b.bdaEmail}>
                    {b.name || b.bdaEmail}
                  </option>
                ))}
              </select>
            </div>
          )}

          {query.isPending ? (
            <div role="status" aria-busy="true" className="space-y-3" data-testid="deductions-loading">
              <span className="sr-only">Loading deductions</span>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-red-900">Could not load deductions</p>
                <p className="mt-0.5 text-sm text-red-800">{query.error.message}</p>
              </div>
              <button
                type="button"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
              >
                {query.isFetching ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                Try again
              </button>
            </div>
          ) : (
            <>
              <TotalsCards totals={totals} underReview={underReview} admin={admin} filtered={Boolean(bdaEmail)} />

              {admin && !bdaEmail && bdaOptions.length > 0 && (
                <section aria-labelledby="per-bda-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <h2 id="per-bda-heading" className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
                    Per BDA, {monthLabel(month)}
                  </h2>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <tr>
                        <th scope="col" className="px-4 py-2">BDA</th>
                        {RULES.map((r) => (
                          <th key={r} scope="col" className="px-4 py-2 text-right">{RULE_LABEL[r]}</th>
                        ))}
                        <th scope="col" className="px-4 py-2 text-right">Active total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bdaOptions.map((b) => (
                        <tr key={b.bdaEmail}>
                          <th scope="row" className="px-4 py-2 text-left font-medium text-slate-900">
                            <button
                              type="button"
                              onClick={() => setBdaEmail(b.bdaEmail)}
                              className="rounded text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                              aria-label={`Show only ${b.name || b.bdaEmail}`}
                            >
                              {b.name || b.bdaEmail}
                            </button>
                          </th>
                          {RULES.map((r) => {
                            const t = b.byRule?.[r];
                            return (
                              <td key={r} className="px-4 py-2 text-right tabular-nums text-slate-700">
                                {t && t.count > 0 ? (
                                  <>
                                    {formatInr(t.amountInr)}
                                    <span className="ml-1 text-xs text-slate-500">x{t.count}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">{formatInr(b.activeAmountInr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section aria-labelledby="ledger-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h2 id="ledger-heading" className="text-sm font-bold text-slate-900">
                    {monthLabel(month)}
                  </h2>
                  {query.isFetching && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" role="status">
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      Refreshing
                    </span>
                  )}
                </div>

                {rows.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-800">
                      {admin && bdaEmail ? 'No deductions for this BDA' : 'No deductions'} in {monthLabel(month)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {data && data.mode !== 'live'
                        ? 'Fines are not active yet, so nothing is recorded for you.'
                        : 'Rows appear here as soon as a rule applies to one of your meetings.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Deductions for {monthLabel(month)}</caption>
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                        <tr>
                          <th scope="col" className="min-w-60 px-3 py-2.5">Meeting</th>
                          {admin && <th scope="col" className="px-3 py-2.5">BDA</th>}
                          <th scope="col" className="px-3 py-2.5">Rule</th>
                          <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
                          <th scope="col" className="px-3 py-2.5">Status</th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((d) => {
                          const resolved = d.status === 'waived' || d.status === 'voided';
                          const tier = tierText(d);
                          const rowTone =
                            d.status === 'needs_review'
                              ? 'bg-amber-50/60'
                              : d.status === 'shadow'
                                ? 'bg-indigo-50/50'
                                : resolved
                                  ? 'bg-slate-50/70'
                                  : 'bg-white';
                          const when = fmtDayTime(d.evidence.scheduledStart);
                          return (
                            <tr key={d.deductionId} className={rowTone}>
                              <td className="min-w-60 px-3 py-3 align-top">
                                <p className={`font-medium ${resolved ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                                  {d.clientName}
                                </p>
                                <p className="text-xs text-slate-500">{when}</p>
                                <ResolutionNote d={d} />
                              </td>
                              {admin && <td className="whitespace-nowrap px-3 py-3 align-top text-slate-700">{d.bdaName || d.bdaEmail}</td>}
                              <td className="min-w-36 px-3 py-3 align-top">
                                <p className={resolved ? 'text-slate-500 line-through' : 'text-slate-800'}>{RULE_LABEL[d.rule]}</p>
                                {tier && (
                                  <p className="text-xs text-slate-500" title={tier}>
                                    {tier.replace(' this month', '')}
                                  </p>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">
                                <AmountCell d={d} />
                              </td>
                              <td className="px-3 py-3 align-top">
                                <StatusChip status={d.status} admin={admin} />
                              </td>
                              <td className="min-w-40 px-3 py-3 text-right align-top">
                                <div className="ml-auto flex max-w-46 flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => setEvidence({ deduction: d, trigger: e.currentTarget })}
                                    data-evidence-for={d.deductionId}
                                    aria-label={`View evidence for ${d.clientName}, ${when}`}
                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                                  >
                                    Evidence
                                  </button>
                                  {admin && d.status === 'needs_review' && (
                                    <button
                                      type="button"
                                      onClick={(e) => setDialog({ kind: 'activate', deduction: d, trigger: e.currentTarget })}
                                      aria-label={`Activate deduction for ${d.clientName}, ${when}`}
                                      className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                                    >
                                      Activate
                                    </button>
                                  )}
                                  {admin && (d.status === 'active' || d.status === 'needs_review') && (
                                    <button
                                      type="button"
                                      onClick={(e) => setDialog({ kind: 'waive', deduction: d, trigger: e.currentTarget })}
                                      aria-label={`Waive deduction for ${d.clientName}, ${when}`}
                                      className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
                                    >
                                      Waive
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {evidence && (
        <DeductionEvidenceDrawer
          deduction={evidence.deduction}
          admin={admin}
          returnFocusTo={focusAfterClose(evidence.trigger, evidence.deduction.deductionId)}
          onClose={() => setEvidence(null)}
        />
      )}
      {dialog && dialogSubject && (
        <WaiveDialog
          variant={dialog.kind}
          subject={dialogSubject}
          returnFocusTo={focusAfterClose(dialog.trigger, dialog.deduction.deductionId)}
          onSubmit={(reason) => resolve(dialog.deduction, dialog.kind, reason)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
