import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeductionsView from './DeductionsView';
import {
  adminRows,
  allocationManual,
  bookingManualEscalated,
  missedActive,
  apiError,
  deductionsResponse,
  emptyQueues,
  installFetch,
  siddharthaRows,
  summaryResponse,
  type Handler,
} from './attendanceAdminFixtures';
import { pendingNew, pendingOld, report } from './absenceFixtures';
import { DEFAULT_FILTERS, applyLedgerFilters, deriveTotals } from './deductionHelpers';
import { fmtTime, fmtWeekdayDate, formatInr } from './format';

const auth = vi.hoisted(() => ({
  current: { token: 'tok', user: { email: 'x', name: 'x', permissions: [] as string[], role: 'bda' as string, isAdmin: false } },
}));
vi.mock('../../auth/CrmAuthContext', () => ({ useCrmAuth: () => auth.current }));

function asBda() {
  auth.current = { token: 'tok', user: { email: 'siddhartha@flashfirehq.com', name: 'Siddhartha', permissions: [], role: 'bda', isAdmin: false } };
}
function asAdmin() {
  auth.current = { token: 'tok', user: { email: 'sohith@flashfirehq.com', name: 'Sohith', permissions: [], role: 'admin', isAdmin: true } };
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeductionsView />
    </QueryClientProvider>,
  );
}

function install(routes: Record<string, Handler>) {
  const fetchStub = installFetch(routes);
  vi.stubGlobal('fetch', fetchStub.impl);
  return fetchStub.calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DeductionsView totals', () => {
  it('adds up active rows only and matches the rule cards', async () => {
    asAdmin();
    install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
    });
    renderView();

    // 500 + 500 missed, 100 no-show, 50 status. Waived, voided, review and shadow rows do not count.
    expect(await screen.findByTestId('total-active')).toHaveTextContent('₹1,150');
    expect(screen.getByTestId('total-missed_meeting')).toHaveTextContent('₹1,000');
    expect(screen.getByTestId('total-no_show_not_called')).toHaveTextContent('₹100');
    expect(screen.getByTestId('total-status_not_updated')).toHaveTextContent('₹50');
    const sum = 1000 + 100 + 50;
    expect(sum).toBe(1150);
    expect(screen.getByText('1 under review, not counted')).toBeInTheDocument();
  });

  it('asks the server for the BDA that the filter picks', async () => {
    asAdmin();
    const calls = install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
    });
    renderView();
    const select = await screen.findByLabelText('BDA');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Kalpataru' })).toBeInTheDocument());
    await userEvent.selectOptions(select, 'kalpataru@flashfirehq.com');
    await waitFor(() =>
      expect(calls.some((c) => c.path.includes('/api/crm/deductions?') && c.path.includes('bdaEmail=kalpataru%40flashfirehq.com'))).toBe(true),
    );
  });
});

describe('DeductionsView fines banner', () => {
  it('does not show the fines switch to an admin (it lives on the Lead Allocation tab)', async () => {
    asAdmin();
    install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
    });
    renderView();
    await screen.findByTestId('ledger-count');
    expect(screen.queryByText(/^Fines:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shadow mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });
});

describe('DeductionsView as a BDA', () => {
  beforeEach(() => {
    asBda();
    install({ 'GET /api/crm/deductions': () => deductionsResponse(siddharthaRows) });
  });

  it('hides every admin control and never asks for admin endpoints', async () => {
    const calls = install({ 'GET /api/crm/deductions': () => deductionsResponse(siddharthaRows) });
    renderView();
    await screen.findByTestId('total-active');
    expect(screen.queryByRole('button', { name: /waive/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('BDA')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review queues/i })).not.toBeInTheDocument();
    expect(calls.every((c) => !c.path.includes('/summary') && !c.path.includes('/admin/'))).toBe(true);
    expect(calls.some((c) => c.path.includes('bdaEmail'))).toBe(false);
  });

  it('shows a needs_review row as Under review and leaves it out of the total', async () => {
    renderView();
    await screen.findByTestId('total-active');
    const row = screen.getByText('Imran Qureshi').closest('tr') as HTMLElement;
    expect(within(row).getByText('Under review')).toBeInTheDocument();
    expect(within(row).getByText('not counted')).toBeInTheDocument();
    // 500 missed + 50 status. The waived 500 and the review 500 are not in it.
    expect(screen.getByTestId('total-active')).toHaveTextContent('₹550');
    expect(screen.queryByText('Grace Okafor')).not.toBeInTheDocument();
    expect(screen.queryByText('Shadow')).not.toBeInTheDocument();
  });

  it('shows who waived a row, when and why, with the amount struck through', async () => {
    renderView();
    await screen.findByTestId('total-active');
    const row = screen.getByText('Rohan Deshpande').closest('tr') as HTMLElement;
    expect(within(row).getByText(/Waived by/)).toHaveTextContent('Sohith');
    expect(within(row).getByText(/Power cut at the BDA home/)).toBeInTheDocument();
    expect(row.querySelector('.line-through')).not.toBeNull();
  });

  it('shows the absence date and time in their own Absent on column, muted when resolved', async () => {
    renderView();
    await screen.findByTestId('total-active');
    expect(screen.getByRole('columnheader', { name: 'Absent on' })).toHaveAttribute('scope', 'col');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.indexOf('Absent on')).toBe(headers.indexOf('Meeting') + 1);

    const start = '2026-10-05T10:00:00.000Z';
    const row = screen.getByText('Rohan Deshpande').closest('tr') as HTMLElement;
    const cell = within(row).getByTestId('absent-on');
    expect(cell).toHaveTextContent(fmtWeekdayDate(start));
    expect(cell).toHaveTextContent(fmtTime(start));
    expect(cell.querySelector('.line-through')).not.toBeNull();
    // The Meeting cell no longer repeats the date.
    expect(within(row).getByText('Rohan Deshpande').closest('td')).not.toHaveTextContent(fmtTime(start));

    const activeRow = screen.getByText('Ananya Krishnamurthy').closest('tr') as HTMLElement;
    expect(within(activeRow).getByTestId('absent-on').querySelector('.line-through')).toBeNull();
  });

  it('shows the working day in Absent on, with the real date only when it differs', async () => {
    const late = { ...missedActive, deductionId: 'ded_late', clientName: 'Late Shift Client', workDay: '2026-10-29', evidence: { ...missedActive.evidence, scheduledStart: '2026-10-30T01:00:00+05:30' } };
    const legacy = { ...missedActive, deductionId: 'ded_legacy', clientName: 'Legacy Client', workDay: undefined, evidence: { ...missedActive.evidence, scheduledStart: '2026-10-21T16:30:00' } };
    install({ 'GET /api/crm/deductions': () => deductionsResponse([late, legacy]) });
    renderView();
    await screen.findByText('Late Shift Client');
    const lateCell = within(screen.getByText('Late Shift Client').closest('tr') as HTMLElement).getByTestId('absent-on');
    expect(lateCell).toHaveTextContent('Thu, 29 Oct 2026');
    expect(lateCell).toHaveTextContent('1:00 AM, Fri 30 Oct');
    const legacyCell = within(screen.getByText('Legacy Client').closest('tr') as HTMLElement).getByTestId('absent-on');
    expect(legacyCell).toHaveTextContent('Wed, 21 Oct 2026');
    expect(legacyCell).toHaveTextContent('4:30 PM');
  });

  it('shows the Fines are not active yet banner in shadow and off mode, and none when live', async () => {
    install({ 'GET /api/crm/deductions': () => deductionsResponse([], 'shadow') });
    const { unmount } = renderView();
    expect(await screen.findByText('Fines are not active yet')).toBeInTheDocument();
    expect(screen.getByText(/Nothing below is deducted from your pay/)).toBeInTheDocument();
    unmount();

    install({ 'GET /api/crm/deductions': () => deductionsResponse([], 'off') });
    const second = renderView();
    expect(await screen.findByText('Fines are not active yet')).toBeInTheDocument();
    second.unmount();

    install({ 'GET /api/crm/deductions': () => deductionsResponse(siddharthaRows, 'live') });
    renderView();
    await screen.findByTestId('total-active');
    expect(screen.queryByText('Fines are not active yet')).not.toBeInTheDocument();
  });

  it('explains the policy in a collapsible', async () => {
    renderView();
    await screen.findByTestId('total-active');
    const summary = screen.getByText('How deductions work');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('₹500 each, however many in a month');
    expect(details).toHaveTextContent('Meetings before 22 Oct 2026 were ₹500 for the first 5 misses of a month and ₹1,000 from the 6th');
    expect(details).toHaveTextContent('₹100');
    expect(details).toHaveTextContent('₹50');
  });

  it('shows a loading state, then an error with a working Try again', async () => {
    let fail = true;
    install({
      'GET /api/crm/deductions': () => (fail ? apiError(503, 'unavailable', 'The ledger is busy right now.') : deductionsResponse(siddharthaRows)),
    });
    renderView();
    expect(screen.getByTestId('deductions-loading')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('The ledger is busy right now.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('total-active')).toBeInTheDocument();
  });

  it('shows an empty month message', async () => {
    install({ 'GET /api/crm/deductions': () => deductionsResponse([]) });
    renderView();
    expect(await screen.findByText(/No deductions in October 2026/)).toBeInTheDocument();
  });

  it('opens the evidence drawer with the frozen signals and returns focus on close', async () => {
    install({ 'GET /api/crm/deductions': () => deductionsResponse([adminRows[1]]) });
    renderView();
    const trigger = await screen.findByRole('button', { name: /view evidence for Priya Raghavan/i });
    await userEvent.click(trigger);
    const drawer = await screen.findByRole('dialog', { name: /missed meeting/i });
    expect(within(drawer).getByText('auto-detected')).toBeInTheDocument();
    expect(within(drawer).getByText(/2m 10s after the start, too late/)).toBeInTheDocument();
    expect(within(drawer).getByText(/frozen when the deduction was created/)).toBeInTheDocument();
    fireEvent(drawer, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe('DeductionsView as an admin: waive', () => {
  function setup(waive: Handler) {
    asAdmin();
    return install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
      'POST /api/crm/deductions/ded_1001/waive': waive,
    });
  }

  it('labels shadow rows and shows the admin controls', async () => {
    setup(() => ({ success: true }));
    renderView();
    await screen.findByTestId('total-active');
    const row = screen.getByText('Grace Okafor').closest('tr') as HTMLElement;
    expect(within(row).getByText('Shadow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review queues/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /waive deduction for Hemanth Dasu/i })).toBeInTheDocument();
    const reviewRow = screen.getByText('Tomasz Kowalczyk').closest('tr') as HTMLElement;
    expect(within(reviewRow).getByText('Needs review')).toBeInTheDocument();
  });

  it('requires a reason of 5 to 500 characters and posts exactly once', async () => {
    const calls = setup(() => ({ success: true, deduction: adminRows[0] }));
    renderView();
    const trigger = await screen.findByRole('button', { name: /waive deduction for Hemanth Dasu/i });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /waive this deduction/i });
    const submit = within(dialog).getByRole('button', { name: 'Waive deduction' });
    const box = within(dialog).getByLabelText('Reason');
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText('0 / 500')).toBeInTheDocument();

    await userEvent.type(box, 'abc');
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText('3 / 500')).toBeInTheDocument();
    expect(within(dialog).getByText('Add 2 more characters (minimum 5).')).toBeInTheDocument();

    await userEvent.type(box, 'de');
    expect(submit).toBeEnabled();

    fireEvent.change(box, { target: { value: 'x'.repeat(501) } });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText('Too long by 1 character (maximum 500).')).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, 'Client joined from a second account');
    await userEvent.dblClick(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/api/crm/deductions/ded_1001/waive');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ reason: 'Client joined from a second account' });
  });

  it('shows the server error text and keeps the dialog open', async () => {
    setup(() => apiError(409, 'already_resolved', 'Someone already waived this deduction.'));
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /waive deduction for Hemanth Dasu/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Checked the recording');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Waive deduction' }));
    expect(await within(dialog).findByText('Someone already waived this deduction.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Waive deduction' })).toBeEnabled();
  });

  it('closes on Escape without posting and returns focus to the Waive button', async () => {
    const calls = setup(() => ({ success: true }));
    renderView();
    const trigger = await screen.findByRole('button', { name: /waive deduction for Hemanth Dasu/i });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('activates a needs_review row through the activate endpoint with the action', async () => {
    asAdmin();
    const calls = install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
      'POST /api/crm/deductions/ded_1007/activate': () => ({ success: true }),
    });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /activate deduction for Tomasz Kowalczyk/i }));
    const dialog = await screen.findByRole('dialog', { name: /activate this deduction/i });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Zoom sync was down, call log confirms no call');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Activate deduction' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/api/crm/deductions/ded_1007/activate');
    expect(post?.body).toEqual({ reason: 'Zoom sync was down, call log confirms no call', action: 'activate' });
  });
});

describe('DeductionsView filters', () => {
  function adminInstall() {
    asAdmin();
    install({
      'GET /api/crm/deductions': () => deductionsResponse(adminRows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
    });
  }
  // Rows of the ledger table only (the per-BDA table above it has rows too), minus its header row.
  const ledger = () => screen.getByRole('table', { name: /^Deductions for/ });
  const rowsShown = () => within(ledger()).getAllByRole('row').length - 1;

  it('shows every row and a count, then narrows by status without a new request', async () => {
    adminInstall();
    renderView();
    expect(await screen.findByTestId('ledger-count')).toHaveTextContent('Showing 8 of 8');
    expect(rowsShown()).toBe(8);

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'waived');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('Showing 1 of 8');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('The totals above still cover the whole month');
    expect(rowsShown()).toBe(1);
    expect(screen.getByText('Rohan Deshpande')).toBeInTheDocument();
    // The cards above still show the whole month, not the filtered list.
    expect(screen.getByTestId('total-active')).toHaveTextContent('₹1,150');
  });

  it('narrows to a day with a quick date chip, and the chip toggles back off', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    const yesterday = screen.getByRole('button', { name: 'Yesterday' });
    await userEvent.click(yesterday);
    expect(yesterday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('From date')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-10-07');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing ${rowsShown()} of 8`);
    expect(rowsShown()).toBeLessThan(8);
    expect(rowsShown()).toBeGreaterThan(0);
    await userEvent.click(yesterday);
    expect(yesterday).toHaveAttribute('aria-pressed', 'false');
    expect(rowsShown()).toBe(8);
  });

  it('a date range re-totals the cards and the per-BDA table to that range only', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    const month = deriveTotals(adminRows);
    expect(screen.getByTestId('total-active')).toHaveTextContent(formatInr(month.activeAmountInr));

    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    const day = deriveTotals(applyLedgerFilters(adminRows, { ...DEFAULT_FILTERS, from: '2026-10-07', to: '2026-10-07' }));
    expect(day.activeAmountInr).toBeLessThan(month.activeAmountInr);
    expect(screen.getByTestId('total-active')).toHaveTextContent(formatInr(day.activeAmountInr));
    expect(screen.getByText(/Active, all BDAs, 7 Oct/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Per BDA, 7 Oct' })).toBeInTheDocument();
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('The totals above cover 7 Oct');

    // Other filters only narrow the table, the cards stay the range figure.
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'waived');
    expect(screen.getByTestId('total-active')).toHaveTextContent(formatInr(day.activeAmountInr));
  });

  it('filters by typed dates, offers only days of the month, and Clear filters resets them', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    const from = screen.getByLabelText('From date');
    expect(from).toHaveAttribute('min', '2026-10-01');
    expect(screen.getByLabelText('To date')).toHaveAttribute('max', '2026-10-31');
    await userEvent.type(from, '2026-10-06');
    expect(rowsShown()).toBeLessThan(8);
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('The totals above cover from 6 Oct');
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    expect(rowsShown()).toBe(8);
    expect(screen.getByLabelText('From date')).toHaveValue('');
  });

  it('shows the empty-match state for a day with no deductions', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    await userEvent.type(screen.getByLabelText('From date'), '2026-10-30');
    expect(await screen.findByTestId('ledger-no-match')).toBeInTheDocument();
  });

  it('puts a count next to every status', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    const options = within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All statuses (8)', 'Active (4)', 'Needs review (1)', 'Waived (1)', 'Voided (1)', 'Shadow (1)']);
  });

  it('filters by rule and by a search, and the two combine', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    await userEvent.selectOptions(screen.getByLabelText('Rule'), 'no_show_not_called');
    expect(rowsShown()).toBe(2);
    await userEvent.type(screen.getByLabelText('Search'), 'tomasz');
    expect(rowsShown()).toBe(1);
    expect(screen.getByText('Tomasz Kowalczyk')).toBeInTheDocument();
  });

  it('says so when nothing matches, and Clear filters brings everything back', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    await userEvent.type(screen.getByLabelText('Search'), 'no such client');
    expect(await screen.findByTestId('ledger-no-match')).toHaveTextContent('No deductions match these filters');
    await userEvent.click(within(screen.getByTestId('ledger-no-match')).getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByTestId('ledger-no-match')).not.toBeInTheDocument();
    expect(rowsShown()).toBe(8);
    expect(screen.getByLabelText('Search')).toHaveValue('');
  });

  it('keeps the chosen sort when filters are cleared, and sorting by amount reorders the rows', async () => {
    adminInstall();
    renderView();
    await screen.findByTestId('ledger-count');
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'amount_high');
    const firstAmount = within(within(ledger()).getAllByRole('row')[1]).getByText('₹500');
    expect(firstAmount).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Sort')).toHaveValue('amount_high');
  });

  it('a BDA gets the filters too, but no Shadow option and no BDA search wording', async () => {
    asBda();
    install({ 'GET /api/crm/deductions': () => deductionsResponse(siddharthaRows) });
    renderView();
    await screen.findByTestId('ledger-count');
    const options = within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.textContent);
    expect(options.join('|')).not.toMatch(/Shadow/);
    expect(options).toContain('Under review (1)');
    expect(screen.getByLabelText('Search')).toHaveAttribute('placeholder', 'Client, booking id or reason');
  });

  it('shows no filter bar for an empty month', async () => {
    asBda();
    install({ 'GET /api/crm/deductions': () => deductionsResponse([]) });
    renderView();
    await screen.findByText(/No deductions in/);
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });
});

describe('DeductionsView absence features as an admin', () => {
  const rows = [...adminRows, allocationManual, bookingManualEscalated];
  const pending = [pendingOld, pendingNew];

  function setupAdmin(extra: Record<string, Handler> = {}) {
    asAdmin();
    return install({
      'GET /api/crm/deductions': () => deductionsResponse(rows),
      'GET /api/crm/deductions/summary': () => summaryResponse(),
      'GET /api/crm/admin/attendance/review-queues': () => emptyQueues,
      'GET /api/crm/absences/': ({ path }) =>
        path.includes('status=pending') ? { success: true, reports: pending, pendingCount: 2 } : { success: true, reports: [] },
      ...extra,
    });
  }

  it('marks manual and Lead Allocation rows with who marked them and the source', async () => {
    setupAdmin();
    renderView();
    const row = (await screen.findByText('Nadia Rahman')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Lead Allocation')).toBeInTheDocument();
    expect(within(row).getByTestId('marked-by')).toHaveTextContent('Marked by Sohith');
    const calendlyRow = screen.getByText('Pavel Novak').closest('tr') as HTMLElement;
    expect(within(calendlyRow).queryByText('Lead Allocation')).not.toBeInTheDocument();
    expect(within(calendlyRow).getByTestId('marked-by')).toHaveTextContent('Marked by Sohith');
    const autoRow = screen.getByText('Hemanth Dasu').closest('tr') as HTMLElement;
    expect(within(autoRow).queryByTestId('marked-by')).not.toBeInTheDocument();
  });

  it('filters by source, raised by and amount, and Clear filters resets all of them', async () => {
    setupAdmin();
    renderView();
    await screen.findByText('Nadia Rahman');
    const total = rows.length;
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing ${total} of ${total}`);

    await userEvent.selectOptions(screen.getByLabelText('Source'), 'allocation');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing 1 of ${total}`);
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'all');

    await userEvent.selectOptions(screen.getByLabelText('Raised by'), 'manual');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing 2 of ${total}`);

    await userEvent.selectOptions(screen.getByLabelText('Amount'), 'escalated');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing 1 of ${total}`);
    expect(screen.getByText('Pavel Novak')).toBeInTheDocument();
    expect(screen.queryByText('Nadia Rahman')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing ${total} of ${total}`);
    expect(screen.getByLabelText('Raised by')).toHaveValue('all');
    expect(screen.getByLabelText('Amount')).toHaveValue('all');
    expect(screen.getByLabelText('Source')).toHaveValue('all');
  });

  it('offers a Needs review chip that toggles the status filter', async () => {
    setupAdmin();
    renderView();
    await screen.findByText('Nadia Rahman');
    const chip = screen.getByRole('button', { name: /needs review \(1\)/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Status')).toHaveValue('needs_review');
    expect(screen.getByTestId('ledger-count')).toHaveTextContent(`Showing 1 of ${rows.length}`);
    await userEvent.click(chip);
    expect(screen.getByLabelText('Status')).toHaveValue('all');
  });

  it('jumps to the review queue from the Pending reports chip and shows the pending badge on the tab', async () => {
    setupAdmin();
    renderView();
    await screen.findByText('Nadia Rahman');
    await waitFor(() => expect(screen.getByTestId('badge-absences')).toHaveTextContent('2'));
    await userEvent.click(screen.getByRole('button', { name: /pending reports \(2\)/i }));
    expect(await screen.findByRole('heading', { name: 'Waiting for review (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /absence reports/i })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Ledger' }));
    expect(await screen.findByTestId('ledger-count')).toBeInTheDocument();
  });

  it('opens Mark absent, fines in one call, tells the admin and refreshes the ledger', async () => {
    let ledgerCalls = 0;
    const calls = setupAdmin({
      'GET /api/crm/deductions': () => {
        ledgerCalls += 1;
        return deductionsResponse(rows);
      },
      'GET /api/crm/attendance/bdas': () => ({ success: true, bdas: [] }),
      'GET /api/crm/absences/candidates': () => ({
        success: true,
        kind: 'allocation',
        candidates: [
          { kind: 'allocation', refId: 'alloc_9', bdaEmail: 'siddhartha@flashfirehq.com', bdaName: 'Siddhartha', clientName: 'Tomasz Kowalczyk', callStart: '2026-10-07T09:30:00.000Z', detail: null },
        ],
      }),
      'POST /api/crm/absences/batch': () => ({
        success: true,
        succeeded: 1,
        failed: 0,
        results: [{ kind: 'allocation', refId: 'alloc_9', ok: true, report: report('abs_new', { status: 'approved', clientName: 'Tomasz Kowalczyk' }) }],
      }),
    });
    renderView();
    await screen.findByText('Nadia Rahman');
    const before = ledgerCalls;
    await userEvent.click(screen.getByRole('button', { name: 'Mark absent' }));
    const dialog = await screen.findByRole('dialog', { name: /mark absent/i });
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'BDA never joined the call.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark absent' }));
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('Absence recorded for Tomasz Kowalczyk. The fine was added to the ledger.');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    await waitFor(() => expect(ledgerCalls).toBeGreaterThan(before));
  });

  it('shows the manual reason in the evidence drawer and no presence signals', async () => {
    setupAdmin();
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /view evidence for Nadia Rahman/i }));
    const drawer = await screen.findByRole('dialog', { name: /missed meeting/i });
    expect(within(drawer).getByRole('heading', { name: /marked absent/i })).toBeInTheDocument();
    expect(within(drawer).getByTestId('manual-reason')).toHaveTextContent('BDA was offline for the whole call window');
    expect(within(drawer).getByText('Lead Allocation call')).toBeInTheDocument();
    expect(within(drawer).queryByText(/Presence signals/i)).not.toBeInTheDocument();
    expect(within(drawer).getByText(/A person marked this Lead Allocation call as missed/)).toBeInTheDocument();
  });
});

describe('DeductionsView absence features as a BDA', () => {
  const mine = [...siddharthaRows, { ...bookingManualEscalated }];

  function setupBda() {
    asBda();
    return install({
      'GET /api/crm/deductions': () => deductionsResponse(mine),
      'GET /api/crm/absences/': () => ({ success: true, reports: [report('abs_a', { clientName: 'Pending Person' })] }),
    });
  }

  it('offers Report a missed call and My reports, and no admin controls or admin filters', async () => {
    const calls = setupBda();
    renderView();
    await screen.findByTestId('total-active');
    expect(screen.getByRole('button', { name: 'Report a missed call' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^mark absent$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my reports/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /absence reports|review queues/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Raised by')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('BDA')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /needs review|pending reports/i })).not.toBeInTheDocument();
    for (const label of ['Search', 'Status', 'Rule', 'Source', 'Sort']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText('Counting toward pay')).not.toBeChecked();
    expect(calls.every((c) => !c.path.includes('/admin/') && !c.path.includes('/summary') && !c.path.includes('bdaEmail'))).toBe(true);
    await waitFor(() => expect(screen.getByTestId('badge-absences')).toHaveTextContent('1'));
  });

  it('writes "Marked absent by" on manual rows', async () => {
    setupBda();
    renderView();
    const row = (await screen.findByText('Pavel Novak')).closest('tr') as HTMLElement;
    expect(within(row).getByTestId('marked-by')).toHaveTextContent('Marked absent by Sohith');
  });

  it('narrows to rows that count toward pay with the toggle', async () => {
    setupBda();
    renderView();
    await screen.findByText('Pavel Novak');
    expect(screen.queryByText('Rohan Deshpande')).toBeInTheDocument(); // waived, shown but not counted
    await userEvent.click(screen.getByLabelText('Counting toward pay'));
    expect(screen.queryByText('Rohan Deshpande')).not.toBeInTheDocument();
    expect(screen.queryByText('Imran Qureshi')).not.toBeInTheDocument(); // under review
    expect(screen.getByText('Pavel Novak')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-count')).toHaveTextContent('Showing 3 of 5');
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByLabelText('Counting toward pay')).not.toBeChecked();
  });

  it('opens the report dialog from the ledger and shows My reports', async () => {
    setupBda();
    renderView();
    await screen.findByTestId('total-active');
    await userEvent.click(screen.getByRole('button', { name: 'Report a missed call' }));
    const dialog = await screen.findByRole('dialog', { name: /report a missed call/i });
    expect(within(dialog).getByText(/fine only starts after they approve it/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /my reports/i }));
    expect(await screen.findByText('Pending Person')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw report for Pending Person/i })).toBeInTheDocument();
  });
});
