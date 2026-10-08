import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MyAttendancePanel from './MyAttendancePanel';
import { summarise } from './summary';
import { makeAttendance, makeCalls, makeStatus } from '../../test/attendanceFixtures';
import { callsTo, stubFetch } from '../../test/stubFetch';
import type { MyMonthRow } from '../../types/attendance';

vi.mock('../../auth/CrmAuthContext', () => ({
  useCrmAuth: () => ({ token: 'test-token', user: { email: 'bda@example.test', name: 'BDA', permissions: [] }, hasPermission: () => false }),
}));

const rows: MyMonthRow[] = [
  {
    bookingId: 'bk_1',
    clientName: 'Aarav Mehta',
    scheduledStart: '2026-10-08T11:00:00.000Z',
    scheduledEnd: '2026-10-08T11:30:00.000Z',
    bookingStatus: 'completed',
    attendance: makeAttendance(),
    callSummary: makeCalls(),
    statusUpdate: makeStatus(),
    deductions: [],
    transcript: null,
  },
  {
    bookingId: 'bk_2',
    clientName: 'Diya Rao',
    scheduledStart: '2026-10-07T11:00:00.000Z',
    scheduledEnd: null,
    bookingStatus: 'no-show',
    attendance: makeAttendance({ verdict: 'absent', markedPresentAt: null, signals: [], inAt: null, outAt: null, timeSpentMs: 0, sessions: [] }),
    callSummary: makeCalls({ calls: 0, connected: false, firstCallOffsetMin: null, talkSec: 0 }),
    statusUpdate: makeStatus({ status: 'scheduled', updatedBy: null, updatedAt: null, stuck: true }),
    deductions: [
      { deductionId: 'd1', rule: 'missed_meeting', amountInr: 500, status: 'active', waiverReason: null },
      { deductionId: 'd2', rule: 'no_show_not_called', amountInr: 100, status: 'needs_review', waiverReason: null },
    ],
    transcript: null,
  },
];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MyAttendancePanel initialMonth="2026-10" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('summarise', () => {
  it('counts verdicts and only active deductions toward the amount', () => {
    expect(summarise(rows)).toMatchObject({
      meetings: 2,
      present: 1,
      absent: 1,
      notCalled: 1,
      stuck: 1,
      activeInr: 500,
      underReview: 1,
    });
  });
});

describe('MyAttendancePanel', () => {
  it('shows the month, tiles and a row per meeting with the same chips as Meeting Info', async () => {
    const fetchMock = stubFetch({ '/my-month': () => ({ body: { success: true, month: '2026-10', rows } }) });
    renderPanel();
    const row2 = (await screen.findByRole('rowheader', { name: /Diya Rao/ })).closest('tr') as HTMLElement;
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'month=2026-10')).toHaveLength(1);
    expect(within(row2).getByText('Absent')).toBeInTheDocument();
    expect(within(row2).getByText('Not called')).toBeInTheDocument();
    expect(within(row2).getByText('Missed meeting ₹500')).toBeInTheDocument();
    expect(within(row2).getByText('under review')).toBeInTheDocument();
    expect(screen.getByText('₹500')).toBeInTheDocument();
    expect(screen.getByText(/1 deduction is under review/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Flags' })).not.toBeInTheDocument();
  });

  it('loads the previous month when the BDA steps back', async () => {
    const fetchMock = stubFetch({ '/my-month': () => ({ body: { success: true, month: '2026-10', rows: [] } }) });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('cell', { name: /in October 2026/ });
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('cell', { name: /in September 2026/ })).toBeInTheDocument();
    expect(callsTo(fetchMock, 'month=2026-09')).toHaveLength(1);
  });

  it('shows an error with a retry button when the load fails', async () => {
    stubFetch({ '/my-month': () => ({ status: 500, body: { success: false, error: { code: 'boom', message: 'Boom' } } }) });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your attendance for this month.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
