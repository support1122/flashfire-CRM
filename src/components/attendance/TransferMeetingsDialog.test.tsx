import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TransferMeetingsDialog from './TransferMeetingsDialog';
import { installFetch, type Handler } from './attendanceAdminFixtures';

const SOON = '2026-10-25T05:00:00.000Z';
const bdas = [
  { email: 'kal@x', displayName: 'Kalpataru', leaveDays: ['2026-10-25'], loadByDay: {} },
  { email: 'sid@x', displayName: 'Siddhartha', leaveDays: [], loadByDay: { '2026-10-25': 2 } },
  { email: 'adit@x', displayName: 'Adit', leaveDays: ['2026-10-25'], loadByDay: {} },
];
const candidates = {
  success: true,
  bdaEmail: 'kal@x',
  from: '2026-10-25',
  to: '2026-10-25',
  bdas,
  meetings: [
    { bookingId: 'bk1', clientName: 'Asha Rao', bookingStatus: 'scheduled', scheduledStart: SOON, day: '2026-10-25', canMove: true },
    { bookingId: 'bk2', clientName: 'Bram Vos', bookingStatus: 'scheduled', scheduledStart: '2026-10-25T06:00:00.000Z', day: '2026-10-25', canMove: true },
    { bookingId: 'bk3', clientName: 'Late Lena', bookingStatus: 'scheduled', scheduledStart: '2026-10-08T06:01:00.000Z', day: '2026-10-25', canMove: false },
  ],
};

function mount(routes: Record<string, Handler>, props: Partial<React.ComponentProps<typeof TransferMeetingsDialog>> = {}) {
  const stub = installFetch({
    'GET /api/crm/attendance/bdas': () => ({ success: true, bdas: bdas.map((b) => ({ email: b.email, displayName: b.displayName })) }),
    ...routes,
  });
  vi.stubGlobal('fetch', stub.impl);
  const onClose = vi.fn();
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TransferMeetingsDialog token="tok" defaultBdaEmail="kal@x" defaultFrom="2026-10-25" defaultTo="2026-10-25" onClose={onClose} onDone={onDone} {...props} />
    </QueryClientProvider>,
  );
  return { calls: stub.calls, onClose, onDone };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TransferMeetingsDialog', () => {
  it('lists the meetings, disables "Too late" ones, and sends every ticked meeting to one BDA in one call', async () => {
    const { calls, onDone, onClose } = mount({
      'GET /api/crm/admin/transfer-meetings': () => candidates,
      'POST /api/crm/admin/bookings/reassign': () => ({
        success: true,
        summary: { moved: 2, failed: 0 },
        results: [
          { bookingId: 'bk1', ok: true, clientName: 'Asha Rao', assignedBdaEmail: 'sid@x' },
          { bookingId: 'bk2', ok: true, clientName: 'Bram Vos', assignedBdaEmail: 'sid@x' },
        ],
      }),
    });
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-count')).toHaveTextContent('2 of 3 selected');
    expect(screen.getByText('Too late')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Late Lena/ })).toBeDisabled();

    // Adit is on leave that day, so the picker says so.
    expect(screen.getByRole('option', { name: /Adit \(on leave for 2 of these\)/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('New BDA'), 'sid@x');
    await userEvent.click(screen.getByRole('button', { name: 'Move 2 meetings' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ items: [{ bookingId: 'bk1', email: 'sid@x' }, { bookingId: 'bk2', email: 'sid@x' }] });
  });

  it('spreads across whoever is free and shows the plan before sending', async () => {
    mount({ 'GET /api/crm/admin/transfer-meetings': () => candidates });
    await screen.findByText('Asha Rao');
    await userEvent.click(screen.getByRole('radio', { name: /Spread evenly/ }));
    const plan = within(screen.getByTestId('transfer-plan'));
    // Only Siddhartha is free that day (Adit and Kalpataru are on leave).
    expect(plan.getAllByText('Siddhartha')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Move 2 meetings' })).toBeEnabled();
  });

  it('keeps the dialog open and names what failed when only some meetings move', async () => {
    const { onClose } = mount({
      'GET /api/crm/admin/transfer-meetings': () => candidates,
      'POST /api/crm/admin/bookings/reassign': () => ({
        success: true,
        summary: { moved: 1, failed: 1 },
        results: [
          { bookingId: 'bk1', ok: true, clientName: 'Asha Rao', assignedBdaEmail: 'sid@x', warnings: ['double_booked:Cara'] },
          { bookingId: 'bk2', ok: false, clientName: 'Bram Vos', error: { code: 'window_open', message: 'The mark window has opened, so this meeting can no longer be reassigned' } },
        ],
      }),
    });
    await screen.findByText('Asha Rao');
    await userEvent.selectOptions(screen.getByLabelText('New BDA'), 'sid@x');
    await userEvent.click(screen.getByRole('button', { name: 'Move 2 meetings' }));
    const res = await screen.findByTestId('transfer-results');
    expect(res).toHaveTextContent('1 moved, 1 could not move');
    expect(res).toHaveTextContent('Bram Vos: The mark window has opened');
    expect(res).toHaveTextContent('Already has a meeting with Cara at that time');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says so when the BDA has no upcoming meetings', async () => {
    mount({ 'GET /api/crm/admin/transfer-meetings': () => ({ ...candidates, meetings: [] }) });
    expect(await screen.findByTestId('transfer-empty')).toBeInTheDocument();
  });
});
