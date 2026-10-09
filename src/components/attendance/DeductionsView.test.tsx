import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeductionsView from './DeductionsView';
import {
  adminRows,
  apiError,
  deductionsResponse,
  emptyQueues,
  installFetch,
  siddharthaRows,
  summaryResponse,
  type Handler,
} from './attendanceAdminFixtures';

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
    expect(details).toHaveTextContent('₹500 each for the first 5 misses');
    expect(details).toHaveTextContent('₹1,000 each from the 6th');
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
