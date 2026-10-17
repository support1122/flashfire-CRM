import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AbsenceReportsView from './AbsenceReportsView';
import { apiError, installFetch, type Handler } from './attendanceAdminFixtures';
import AbsenceNotice from './AbsenceNotice';
import { approvedReport, pendingNew, pendingOld, rejectedReport, report, withdrawnReport } from './absenceFixtures';
import type { AbsenceReport } from '../../types/absence';

function install(routes: Record<string, Handler>) {
  const stub = installFetch(routes);
  vi.stubGlobal('fetch', stub.impl);
  return stub.calls;
}

/** Answers GET /api/crm/absences/ the way the server does: filters by the status and month in the query string. */
function reportsRoute(all: AbsenceReport[], extra: Record<string, unknown> = {}): Handler {
  return ({ path }) => {
    const url = new URL(path, 'http://localhost');
    const status = url.searchParams.get('status');
    const reports = all.filter((r) => !status || r.status === status);
    return { success: true, reports, ...(status === 'pending' ? extra : {}) };
  };
}

/** Shows the notice the way DeductionsView does, so the tests see what a person would see. */
function Host({ admin }: { admin: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <AbsenceNotice message={notice} onDismiss={() => setNotice(null)} />
      <AbsenceReportsView token="tok" admin={admin} month="2026-10" onNotice={setNotice} />
    </>
  );
}

function renderView(admin: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Host admin={admin} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AbsenceReportsView as an admin', () => {
  const all = [pendingNew, pendingOld, approvedReport, rejectedReport, withdrawnReport];

  it('lists pending reports oldest first with who, when, the reason and how long ago', async () => {
    install({ 'GET /api/crm/absences/': reportsRoute(all, { pendingCount: 7 }) });
    renderView(true);
    const pendingSection = await screen.findByRole('region', { name: /waiting for review/i });
    const cards = await within(pendingSection).findAllByTestId('absence-report');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Hemanth Dasu')).toBeInTheDocument(); // oldest first
    expect(within(cards[0]).getByText('Siddhartha')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/The call dropped and the client never rang back/)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Reported 2d ago by the BDA/)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Call at Tue, Oct 6, 12:00 PM IST/)).toBeInTheDocument();
    expect(within(cards[1]).getByText('Calendly meeting')).toBeInTheDocument();
    // The heading shows the server's global pending count, not the length of this page.
    expect(screen.getByRole('heading', { name: 'Waiting for review (7)' })).toBeInTheDocument();
  });

  it('shows decided reports with who decided and when, and filters them by outcome', async () => {
    const calls = install({ 'GET /api/crm/absences/': reportsRoute(all) });
    renderView(true);
    const history = await screen.findByRole('region', { name: /decided in october 2026/i });
    const cards = await within(history).findAllByTestId('absence-report');
    expect(cards).toHaveLength(3);
    expect(within(history).getByText(/Approved by/)).toHaveTextContent('Sohith');
    expect(within(history).getByText(/Checked the call log, confirmed/)).toBeInTheDocument();
    expect(within(history).getByText(/12 minute connected call/)).toBeInTheDocument();
    expect(within(history).getByText(/Withdrawn by the BDA/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('month=2026-10'))).toBe(true);

    await userEvent.selectOptions(within(history).getByLabelText('Outcome'), 'rejected');
    await waitFor(() => expect(within(history).getAllByTestId('absence-report')).toHaveLength(1));
    expect(calls.some((c) => c.path.includes('status=rejected') && c.path.includes('month=2026-10'))).toBe(true);
  });

  it('approves with an optional note in one call', async () => {
    const calls = install({
      'GET /api/crm/absences/': reportsRoute(all),
      'POST /api/crm/absences/abs_1/approve': () => ({ success: true, report: { ...pendingOld, status: 'approved' }, deductionId: 'ded_x' }),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /approve report for Hemanth Dasu/i }));
    const dialog = await screen.findByRole('dialog', { name: /approve this report/i });
    await userEvent.type(within(dialog).getByLabelText(/note for the bda/i), 'Call log confirms it.');
    await userEvent.click(within(dialog).getByRole('button', { name: /approve and fine/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ note: 'Call log confirms it.' });
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('fine for Hemanth Dasu was added to the ledger');
  });

  it('refreshes the lists after a decision', async () => {
    let decided = false;
    const calls = install({
      'GET /api/crm/absences/': (call) => reportsRoute(decided ? [pendingNew, { ...pendingOld, status: 'approved' }] : [pendingNew, pendingOld])(call),
      'POST /api/crm/absences/abs_1/approve': () => {
        decided = true;
        return { success: true, report: pendingOld };
      },
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /approve report for Hemanth Dasu/i }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /approve and fine/i }));
    const pendingSection = screen.getByRole('region', { name: /waiting for review/i });
    await waitFor(() => expect(within(pendingSection).getAllByTestId('absence-report')).toHaveLength(1));
    expect(calls.filter((c) => c.method === 'GET' && c.path.includes('status=pending')).length).toBeGreaterThan(1);
  });

  it('requires a reason of at least 5 characters to reject', async () => {
    const calls = install({
      'GET /api/crm/absences/': reportsRoute(all),
      'POST /api/crm/absences/abs_2/reject': () => ({ success: true, report: { ...pendingNew, status: 'rejected' } }),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /reject report for Priya Raghavan/i }));
    const dialog = await screen.findByRole('dialog', { name: /reject this report/i });
    const submit = within(dialog).getByRole('button', { name: 'Reject report' });
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'no');
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'pe, the call log shows a connected call.');
    await userEvent.click(submit);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'nope, the call log shows a connected call.' });
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('Nobody was fined for Priya Raghavan');
  });

  it('shows the server message when someone else decided first', async () => {
    install({
      'GET /api/crm/absences/': reportsRoute(all),
      'POST /api/crm/absences/abs_1/approve': () => apiError(409, 'not_pending', 'This report was already decided by Kalpataru.'),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /approve report for Hemanth Dasu/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /approve and fine/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This report was already decided by Kalpataru.');
  });

  it('has empty, loading and error states', async () => {
    let mode: 'empty' | 'error' = 'error';
    install({
      'GET /api/crm/absences/': () => (mode === 'error' ? apiError(500, 'server_error', 'The reports are unavailable.') : { success: true, reports: [], pendingCount: 0 }),
    });
    renderView(true);
    expect(screen.getAllByTestId('reports-loading').length).toBeGreaterThan(0);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('The reports are unavailable.');
    mode = 'empty';
    expect(alerts).toHaveLength(2); // the queue and the history fail on their own
    for (const retry of screen.getAllByRole('button', { name: /try again/i })) await userEvent.click(retry);
    expect(await screen.findByText('Nothing is waiting for review')).toBeInTheDocument();
    expect(await screen.findByText(/No decided reports in October 2026/)).toBeInTheDocument();
  });
});

describe('AbsenceReportsView as a BDA', () => {
  const mine = [
    report('abs_a', { clientName: 'Pending Person', createdAt: '2026-10-07T10:00:00.000Z' }),
    approvedReport,
    rejectedReport,
    withdrawnReport,
  ];

  it('shows status chips, the admin note on a rejection and a Withdraw button only on pending', async () => {
    install({ 'GET /api/crm/absences/': reportsRoute(mine) });
    renderView(false);
    const cards = await screen.findAllByTestId('absence-report');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('Pending review')).toBeInTheDocument(); // pending first
    expect(within(cards[0]).getByRole('button', { name: /withdraw report for Pending Person/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /withdraw/i })).toHaveLength(1);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    const rejected = screen.getByText('Elena Fischer').closest('li') as HTMLElement;
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejected).getByText(/Reason: The call log shows a 12 minute connected call/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve|reject/i })).not.toBeInTheDocument();
  });

  it('withdraws a pending report in one call and says so', async () => {
    const calls = install({
      'GET /api/crm/absences/': reportsRoute(mine),
      'POST /api/crm/absences/abs_a/cancel': () => ({ success: true, report: { ...mine[0], status: 'cancelled' } }),
    });
    renderView(false);
    await userEvent.click(await screen.findByRole('button', { name: /withdraw report for Pending Person/i }));
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('Report withdrawn for Pending Person');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('shows the server message when the withdraw fails', async () => {
    install({
      'GET /api/crm/absences/': reportsRoute(mine),
      'POST /api/crm/absences/abs_a/cancel': () => apiError(409, 'not_pending', 'An admin already decided this report.'),
    });
    renderView(false);
    await userEvent.click(await screen.findByRole('button', { name: /withdraw report/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An admin already decided this report.');
  });

  it('only asks for the BDA own reports and never for admin data', async () => {
    const calls = install({ 'GET /api/crm/absences/': reportsRoute(mine) });
    renderView(false);
    await screen.findAllByTestId('absence-report');
    expect(calls.every((c) => !c.path.includes('bdaEmail'))).toBe(true);
  });

  it('has an empty state that points at Report a missed call', async () => {
    install({ 'GET /api/crm/absences/': () => ({ success: true, reports: [] }) });
    renderView(false);
    expect(await screen.findByText('You have not reported any calls')).toBeInTheDocument();
    expect(screen.getByText(/use Report a missed call/)).toBeInTheDocument();
  });
});
