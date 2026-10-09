import { render as rtlRender, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MeetingInfoView from './MeetingInfoView';
import type { TranscriptRef } from '../types/attendance';
import { makeAttendance, makeCalls, makeStatus } from '../test/attendanceFixtures';
import { callsTo, stubFetch } from '../test/stubFetch';

// The BDA dropdown loads through TanStack Query, so every render needs a fresh client.
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

let isAdmin = true;
vi.mock('../auth/CrmAuthContext', () => ({
  useCrmAuth: () => ({
    token: 'test-token',
    user: { email: 'viewer@example.test', name: 'Viewer', permissions: ['meeting_links'], role: isAdmin ? 'admin' : 'bda' },
    hasPermission: () => false,
  }),
}));

const rows = [
  {
    bookingId: 'bk_1',
    clientName: 'Aarav Mehta',
    dateOfMeet: '2026-10-08T11:00:00.000Z',
    meetingVideoUrl: 'https://drive.example.test/rec1',
    bdaAbsent: false,
    attendance: makeAttendance({ matchedBy: 'name', integrityFlag: 'marked_never_joined' }),
    callSummary: makeCalls(),
    statusUpdate: makeStatus(),
    deductions: [{ deductionId: 'd1', rule: 'status_not_updated', amountInr: 50, status: 'waived', waiverReason: 'Admin cover' }],
    transcript: { url: 'https://example.test/t/1' } as TranscriptRef | null,
  },
  {
    bookingId: 'bk_2',
    clientName: 'Diya Rao',
    dateOfMeet: '2026-10-08T12:00:00.000Z',
    meetingVideoUrl: null,
    bdaAbsent: true,
    attendance: makeAttendance({ verdict: 'absent', markedPresentAt: null, signals: [], inAt: null, outAt: null, timeSpentMs: 0, sessions: [] }),
    callSummary: makeCalls({ calls: 0, connected: false, firstCallOffsetMin: null, talkSec: 0 }),
    statusUpdate: makeStatus({ status: 'scheduled', updatedBy: null, updatedAt: null, stuck: true }),
    deductions: [{ deductionId: 'd2', rule: 'missed_meeting', amountInr: 500, status: 'active', waiverReason: null }],
    transcript: null as TranscriptRef | null,
  },
];

function stubBackend() {
  return stubFetch({
    '/api/meeting-links': () => ({ body: { success: true, data: rows, pagination: { page: 1, limit: 15, totalCount: 2, totalPages: 1 }, bdaAbsentCount: 1 } }),
    '/api/bda-attendance/bulk': () => ({ body: { success: true, attendanceMap: {} } }),
    '/api/bda-attendance/missed-logs': () => ({ body: { success: true, data: [] } }),
    '/api/crm/attendance/bdas': () => ({
      body: { success: true, bdas: [{ email: 'kal@example.test', displayName: 'Kalpataru' }, { email: 'sid@example.test', displayName: 'Siddhartha' }] },
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MeetingInfoView attendance columns', () => {
  it('renders every attendance column and chip variant for an admin', async () => {
    isAdmin = true;
    stubBackend();
    render(<MeetingInfoView />);
    const row1 = (await screen.findByRole('rowheader', { name: /Aarav Mehta/ })).closest('tr') as HTMLElement;
    const row2 = screen.getByRole('rowheader', { name: /Diya Rao/ }).closest('tr') as HTMLElement;

    for (const name of ['Marked', 'In / Out', 'Time spent', 'Called client', 'Status updated', 'Deductions', 'Flags']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }

    // Row 1: present, verified, two sessions, called, completed, waived deduction, both flags, transcript.
    expect(within(row1).getByText('4:29:51 PM')).toBeInTheDocument();
    expect(within(row1).getByText('Google verified')).toBeInTheDocument();
    expect(within(row1).getByText('2 sessions')).toBeInTheDocument();
    expect(within(row1).getByText('3 calls, first +8m, connected')).toBeInTheDocument();
    expect(within(row1).getByText(/by Siddhartha/)).toBeInTheDocument();
    expect(within(row1).getByText('Status not updated ₹50')).toHaveClass('line-through');
    expect(within(row1).getByText('Matched by name')).toBeInTheDocument();
    expect(within(row1).getByText('Marked present, never joined')).toBeInTheDocument();
    expect(within(row1).getByRole('link', { name: /Open in Calendly/ })).toHaveAttribute('href', 'https://example.test/t/1');
    expect(within(row1).getByRole('link', { name: /Recording/ })).toHaveAttribute('href', 'https://drive.example.test/rec1');

    // Row 2: absent, not called, stuck on scheduled, active deduction, no transcript.
    expect(within(row2).getByText('Absent')).toBeInTheDocument();
    expect(within(row2).getByText('Not called')).toBeInTheDocument();
    expect(within(row2).getByText('Still scheduled')).toBeInTheDocument();
    expect(within(row2).getByText(/Stuck/)).toBeInTheDocument();
    expect(within(row2).getByText('Missed meeting ₹500')).not.toHaveClass('line-through');
    expect(within(row2).getByText('No summary')).toBeInTheDocument();
  });

  it('expands the sessions list', async () => {
    isAdmin = true;
    stubBackend();
    const user = userEvent.setup();
    render(<MeetingInfoView />);
    const summary = await screen.findByText('2 sessions');
    // Enter and Space on a <summary> are browser behaviour; jsdom only models the click, so keyboard use is checked in the browser preview.
    await user.click(summary);
    expect((summary.closest('details') as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText(/4:29:40 PM to 4:50:00 PM/)).toBeInTheDocument();
  });

  it('hides the admin-only Flags column from a BDA', async () => {
    isAdmin = false;
    stubBackend();
    render(<MeetingInfoView />);
    await screen.findByRole('rowheader', { name: /Aarav Mehta/ });
    expect(screen.queryByRole('columnheader', { name: 'Flags' })).not.toBeInTheDocument();
    expect(screen.queryByText('Matched by name')).not.toBeInTheDocument();
    expect(screen.queryByText('Marked present, never joined')).not.toBeInTheDocument();
  });

  it('falls back to the old attendance row until the new fields ship', async () => {
    isAdmin = true;
    stubFetch({
      '/api/meeting-links': () => ({
        body: {
          success: true,
          data: [{ bookingId: 'bk_9', clientName: 'Old Shape', dateOfMeet: '2026-10-08T11:00:00.000Z', meetingVideoUrl: null, bdaAbsent: false }],
          pagination: { page: 1, limit: 15, totalCount: 1, totalPages: 1 },
          bdaAbsentCount: 0,
        },
      }),
      '/api/bda-attendance/bulk': () => ({
        body: {
          success: true,
          attendanceMap: {
            bk_9: {
              status: 'present',
              source: 'meet_api',
              bdaName: 'Siddhartha',
              bdaEmail: 's@example.test',
              joinedAt: '2026-10-08T10:59:00.000Z',
              leftAt: '2026-10-08T11:30:00.000Z',
              markedAt: '2026-10-08T10:59:30.000Z',
              cumulativeDurationMs: 1_860_000,
              verified: true,
              sessions: [{ startTime: '2026-10-08T10:59:00.000Z', endTime: '2026-10-08T11:30:00.000Z', durationMs: 1_860_000 }],
            },
          },
        },
      }),
      '/api/bda-attendance/missed-logs': () => ({ body: { success: true, data: [] } }),
    });
    render(<MeetingInfoView />);
    const row = (await screen.findByRole('rowheader', { name: /Old Shape/ })).closest('tr') as HTMLElement;
    expect(within(row).getByText('4:29:30 PM')).toBeInTheDocument();
    expect(within(row).getByText('31m')).toBeInTheDocument();
    expect(within(row).getByText('1 session')).toBeInTheDocument();
    // New fields are absent, so the chips say so instead of crashing.
    expect(within(row).getByText('No call data')).toBeInTheDocument();
  });
});

describe('MeetingInfoView BDA filter and summary', () => {
  it('filters the table and the missed logs by the chosen BDA', async () => {
    isAdmin = true;
    const fetchFn = stubBackend();
    render(<MeetingInfoView />);
    const select = await screen.findByRole('combobox', { name: 'BDA' });
    await screen.findByRole('option', { name: 'Siddhartha' });
    await userEvent.selectOptions(select, 'sid@example.test');
    await vi.waitFor(() => {
      expect(callsTo(fetchFn, 'bdaEmail=sid%40example.test').some(([u]) => String(u).includes('/api/meeting-links'))).toBe(true);
      expect(callsTo(fetchFn, 'bdaEmail=sid%40example.test').some(([u]) => String(u).includes('/missed-logs'))).toBe(true);
    });
  });

  it('shows the stored Calendly summary text in its own column', async () => {
    isAdmin = false;
    rows[1] = { ...rows[1], transcript: { bookingId: 'bk_2', summaryPreview: 'Client wants data analyst roles in Texas.', url: null } };
    stubBackend();
    render(<MeetingInfoView />);
    expect(await screen.findByRole('columnheader', { name: 'Summary' })).toBeInTheDocument();
    expect(await screen.findByText('Client wants data analyst roles in Texas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Read full summary/ })).toBeInTheDocument();
    expect(screen.getByText('Open in Calendly')).toBeInTheDocument();
  });
});
