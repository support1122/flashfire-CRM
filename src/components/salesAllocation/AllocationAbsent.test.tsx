import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAllocations from './AdminAllocations';
import BdaAllocations from './BdaAllocations';
import { installFetch, type Handler } from '../attendance/attendanceAdminFixtures';
import { report } from '../attendance/absenceFixtures';
import type { SalesAllocation } from '../../types/salesAllocation';
import { STATUS_LABEL } from './helpers';

function allocation(id: string, partial: Partial<SalesAllocation>): SalesAllocation {
  return {
    allocationId: id,
    clientName: 'Client',
    phone: '+1 415 555 0134',
    email: null,
    timezone: 'America/New_York',
    callAt: '2026-10-07T09:30:00.000Z',
    bdaEmail: 'siddhartha@flashfirehq.com',
    bdaName: 'Siddhartha',
    status: 'scheduled',
    notes: null,
    outcomeNote: null,
    createdBy: 'sohith@flashfirehq.com',
    createdByName: 'Sohith',
    createdAt: '2026-10-01T10:00:00.000Z',
    reminderState: null,
    reminderSentAt: null,
    crmUrl: 'https://crm.example.com/x',
    ...partial,
  };
}

const pastOpen = allocation('alloc_past', { clientName: 'Tomasz Kowalczyk' });
const futureOpen = allocation('alloc_future', { clientName: 'Meera Pillai', callAt: '2026-10-20T09:30:00.000Z' });
const absent = allocation('alloc_absent', { clientName: 'Nadia Rahman', status: 'absent', callAt: '2026-10-05T09:30:00.000Z' });
const done = allocation('alloc_done', { clientName: 'Elena Fischer', status: 'completed', callAt: '2026-10-04T09:30:00.000Z' });

function install(routes: Record<string, Handler>) {
  const stub = installFetch(routes);
  vi.stubGlobal('fetch', stub.impl);
  return stub.calls;
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Absent status', () => {
  it('has a red Absent label', () => {
    expect(STATUS_LABEL.absent).toBe('Absent');
  });
});

describe('AdminAllocations: Mark absent', () => {
  const list = (rows: SalesAllocation[], pending: unknown[] = []): Record<string, Handler> => ({
    'GET /api/crm/sales-allocations/': () => ({ success: true, isAdmin: true, allocations: rows }),
    'GET /api/crm/absences/': () => ({ success: true, reports: pending, pendingCount: pending.length }),
  });

  it('shows Mark absent only on scheduled calls whose time has passed, and Absent on absent ones', async () => {
    install(list([pastOpen, futureOpen, absent, done]));
    wrap(<AdminAllocations token="tok" highlightId={null} initialScope="all" />);
    const pastRow = (await screen.findByText('Tomasz Kowalczyk')).closest('li') as HTMLElement;
    expect(within(pastRow).getByRole('button', { name: /mark absent/i })).toBeInTheDocument();
    const futureRow = screen.getByText('Meera Pillai').closest('li') as HTMLElement;
    expect(within(futureRow).queryByRole('button', { name: /mark absent/i })).not.toBeInTheDocument();
    expect(within(futureRow).getByRole('button', { name: 'Reassign' })).toBeInTheDocument(); // existing buttons still work
    const absentRow = screen.getByText('Nadia Rahman').closest('li') as HTMLElement;
    expect(within(absentRow).getByText('Absent')).toHaveClass('bg-red-100');
    expect(within(absentRow).queryByRole('button', { name: /mark absent/i })).not.toBeInTheDocument();
    const doneRow = screen.getByText('Elena Fischer').closest('li') as HTMLElement;
    expect(within(doneRow).queryByRole('button', { name: /mark absent/i })).not.toBeInTheDocument();
  });

  it('opens the reason dialog prefilled with that call and fines in one call', async () => {
    const calls = install({
      ...list([pastOpen]),
      'POST /api/crm/absences/': () => ({ success: true, report: report('abs_new', { status: 'approved', clientName: 'Tomasz Kowalczyk' }), deductionId: 'ded_n' }),
    });
    wrap(<AdminAllocations token="tok" highlightId={null} initialScope="all" />);
    await userEvent.click(await screen.findByRole('button', { name: /mark absent: Tomasz Kowalczyk/i }));
    const dialog = await screen.findByRole('dialog', { name: /mark absent/i });
    expect(within(dialog).getByText('Tomasz Kowalczyk')).toBeInTheDocument();
    expect(within(dialog).getByText(/Siddhartha · Wed, Oct 7, 3:00 PM IST · Lead Allocation call/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'BDA did not pick up for ten minutes.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark absent' }));
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('Absence recorded for Tomasz Kowalczyk');
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ kind: 'allocation', refId: 'alloc_past', reason: 'BDA did not pick up for ten minutes.' });
  });

  it('shows "Report waiting for review" instead of the button when a BDA already reported the call', async () => {
    install(list([pastOpen], [report('abs_p', { refId: 'alloc_past', kind: 'allocation' })]));
    wrap(<AdminAllocations token="tok" highlightId={null} initialScope="all" />);
    expect(await screen.findByText('Report waiting for review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark absent/i })).not.toBeInTheDocument();
  });
});

describe('BdaAllocations: Report missed call', () => {
  const list = (rows: SalesAllocation[], pending: unknown[] = []): Record<string, Handler> => ({
    'GET /api/crm/sales-allocations/': () => ({ success: true, isAdmin: false, allocations: rows }),
    'GET /api/crm/absences/': () => ({ success: true, reports: pending }),
  });

  it('offers Report missed call on past scheduled cards only, next to the existing buttons', async () => {
    install(list([pastOpen, futureOpen, absent, done]));
    wrap(<BdaAllocations token="tok" highlightId={null} />);
    const pastCard = (await screen.findByText('Tomasz Kowalczyk')).closest('li') as HTMLElement;
    expect(within(pastCard).getByRole('button', { name: /report missed call/i })).toBeInTheDocument();
    expect(within(pastCard).getByRole('button', { name: 'Mark completed' })).toBeInTheDocument();
    expect(within(pastCard).getByRole('button', { name: 'No answer' })).toBeInTheDocument();
    const futureCard = screen.getByText('Meera Pillai').closest('li') as HTMLElement;
    expect(within(futureCard).queryByRole('button', { name: /report missed call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark absent/i })).not.toBeInTheDocument();
  });

  it('counts and groups absent calls under Past with a red badge', async () => {
    install(list([pastOpen, futureOpen, absent, done]));
    wrap(<BdaAllocations token="tok" highlightId={null} />);
    await screen.findByText('Nadia Rahman');
    const summary = screen.getByRole('list', { name: 'Summary' });
    expect(within(summary).getByText('Absent: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Done: 1')).toBeInTheDocument();
    const past = screen.getByRole('heading', { name: /^Past/ }).closest('section') as HTMLElement;
    const absentCard = within(past).getByText('Nadia Rahman').closest('li') as HTMLElement;
    expect(within(absentCard).getByText('Absent')).toHaveClass('bg-red-100');
    expect(within(absentCard).queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the Absent counter when there are none', async () => {
    install(list([futureOpen]));
    wrap(<BdaAllocations token="tok" highlightId={null} />);
    await screen.findByText('Meera Pillai');
    expect(screen.queryByText(/^Absent:/)).not.toBeInTheDocument();
  });

  it('files a pending report in one call and then shows "Report sent"', async () => {
    let sent = false;
    const calls = install({
      'GET /api/crm/sales-allocations/': () => ({ success: true, isAdmin: false, allocations: [pastOpen] }),
      'GET /api/crm/absences/': () => ({ success: true, reports: sent ? [report('abs_n', { refId: 'alloc_past', kind: 'allocation' })] : [] }),
      'POST /api/crm/absences/': () => {
        sent = true;
        return { success: true, report: report('abs_n', { status: 'pending', clientName: 'Tomasz Kowalczyk' }) };
      },
    });
    wrap(<BdaAllocations token="tok" highlightId={null} />);
    await userEvent.click(await screen.findByRole('button', { name: /report missed call/i }));
    const dialog = await screen.findByRole('dialog', { name: /report a missed call/i });
    expect(within(dialog).getByText(/fine only starts after they approve it/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'The client never dialled in.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('An admin will review it');
    await waitFor(() => expect(screen.getByText('Report sent, waiting for review')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /report missed call/i })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});
