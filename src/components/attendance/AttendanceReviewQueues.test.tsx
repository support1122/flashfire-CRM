import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttendanceReviewQueues from './AttendanceReviewQueues';
import {
  apiError,
  emptyQueues,
  installFetch,
  profilesResponse,
  queuesResponse,
  type Handler,
} from './attendanceAdminFixtures';

function setup(routes: Record<string, Handler> = {}, queues = queuesResponse()) {
  const stub = installFetch({
    'GET /api/crm/admin/attendance/review-queues': () => queues,
    'GET /api/crm/admin/bda-profiles': () => profilesResponse(),
    ...routes,
  });
  vi.stubGlobal('fetch', stub.impl);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AttendanceReviewQueues token="tok" />
    </QueryClientProvider>,
  );
  return stub.calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function row(client: string): Promise<HTMLElement> {
  return (await screen.findByText(client)).closest('tr') as HTMLElement;
}

describe('AttendanceReviewQueues', () => {
  it('shows the four queues with their counts', async () => {
    setup();
    await screen.findByRole('region', { name: 'Needs review' });
    for (const [name, count] of [
      ['Needs review', '1'],
      ['Marked present, never joined', '2'],
      ['Stuck on scheduled', '2'],
      ['Needs reassignment', '2'],
    ] as const) {
      const region = screen.getByRole('region', { name });
      expect(within(region).getByText(count, { selector: 'span' })).toBeInTheDocument();
    }
  });

  it('shows an empty message for each queue when nothing is waiting', async () => {
    setup({}, emptyQueues);
    expect(await screen.findByText('Nothing waiting for review.')).toBeInTheDocument();
    expect(screen.getByText('No button-only presence flags.')).toBeInTheDocument();
    expect(screen.getByText('No meetings stuck on scheduled.')).toBeInTheDocument();
    expect(screen.getByText('No meetings need a new assignee.')).toBeInTheDocument();
  });

  it('shows an error with a retry when the queues cannot load', async () => {
    setup({ 'GET /api/crm/admin/attendance/review-queues': () => apiError(500, 'server_error', 'The queue job crashed.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('The queue job crashed.');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('converts a never-joined flag to a miss with the reason and the BDA', async () => {
    const calls = setup({ 'POST /api/crm/admin/attendance/bk_nj_1/convert-to-miss': () => ({ success: true }) });
    await userEvent.click(await screen.findByRole('button', { name: /convert Sanjana Iyer to a missed meeting/i }));
    const dialog = await screen.findByRole('dialog', { name: /convert to a missed meeting/i });
    const submit = within(dialog).getByRole('button', { name: 'Convert to miss' });
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Meet log shows an empty room');
    await userEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ reason: 'Meet log shows an empty room', bdaEmail: 'siddhartha@flashfirehq.com' });
  });

  it('dismisses a flag with a reason, and says so plainly when the server has no such endpoint', async () => {
    setup(); // no stub for the dismiss endpoint: the router answers 404
    await userEvent.click(await screen.findByRole('button', { name: /dismiss the flag for Daniel Brooks/i }));
    const dialog = await screen.findByRole('dialog', { name: /dismiss this flag/i });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Joined from a phone, confirmed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss flag' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/No stub for POST/);
  });

  it('activates or waives a needs_review row through the activate endpoint', async () => {
    const calls = setup({ 'POST /api/crm/deductions/ded_1007/activate': () => ({ success: true }) });
    await userEvent.click(await screen.findByRole('button', { name: /waive deduction for Tomasz Kowalczyk/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Zoom sync was down that hour');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Waive deduction' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Zoom sync was down that hour', action: 'waive' });
  });

  describe('Reassign', () => {
    it('is disabled with a clear message once the mark window has opened', async () => {
      setup();
      const open = await row('Meera Pillai');
      const select = within(open).getByLabelText(/Reassign Meera Pillai to/);
      expect(select).toBeDisabled();
      expect(within(open).getByRole('button', { name: 'Reassign' })).toBeDisabled();
      expect(within(open).getByText(/The mark window opened at/)).toBeInTheDocument();
      expect(within(open).getByText(/cannot be handed to someone else/)).toBeInTheDocument();

      const later = await row('Jonas Lindqvist');
      expect(within(later).getByLabelText(/Reassign Jonas Lindqvist to/)).toBeEnabled();
      expect(within(later).getByRole('button', { name: 'Reassign' })).toBeDisabled(); // nothing picked yet
    });

    it('offers only active tracked BDAs other than the assignee', async () => {
      setup();
      const later = await row('Jonas Lindqvist');
      const select = within(later).getByLabelText(/Reassign Jonas Lindqvist to/);
      const options = within(select).getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['Pick a BDA', 'Siddhartha']);
    });

    it('sends the pick, then handles 409 window_open', async () => {
      const calls = setup({
        'PUT /api/crm/admin/bookings/bk_ra_later/attendance-assignee': () =>
          apiError(409, 'window_open', 'Too late.'),
      });
      const later = await row('Jonas Lindqvist');
      await userEvent.selectOptions(within(later).getByLabelText(/Reassign Jonas Lindqvist to/), 'siddhartha@flashfirehq.com');
      await userEvent.click(within(later).getByRole('button', { name: 'Reassign' }));
      expect(await within(later).findByRole('alert')).toHaveTextContent(/mark window has already opened on the server/);
      const put = calls.find((c) => c.method === 'PUT');
      expect(put?.body).toEqual({ email: 'siddhartha@flashfirehq.com' });
    });

    it('handles 422 not_tracked_bda', async () => {
      setup({
        'PUT /api/crm/admin/bookings/bk_ra_later/attendance-assignee': () =>
          apiError(422, 'not_tracked_bda', 'Not a tracked BDA.'),
      });
      const later = await row('Jonas Lindqvist');
      await userEvent.selectOptions(within(later).getByLabelText(/Reassign Jonas Lindqvist to/), 'siddhartha@flashfirehq.com');
      await userEvent.click(within(later).getByRole('button', { name: 'Reassign' }));
      expect(await within(later).findByRole('alert')).toHaveTextContent('That person is not a tracked BDA. Pick someone from the list.');
    });
  });
});
