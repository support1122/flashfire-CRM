import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinDeviceChip, TranscriptLink } from './AttendanceCells';
import { callsTo, stubFetch } from '../../test/stubFetch';

vi.mock('../../auth/CrmAuthContext', () => ({
  useCrmAuth: () => ({ token: 'test-token', user: { email: 'admin@example.test', name: 'A', permissions: [] }, hasPermission: () => true }),
}));

afterEach(() => vi.unstubAllGlobals());

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('JoinDeviceChip', () => {
  it('names each device, with the reason reachable by screen readers', () => {
    const { rerender } = render(<JoinDeviceChip device="mobile" />);
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText(/extension ran on the PC without this call open/)).toHaveClass('sr-only');
    rerender(<JoinDeviceChip device="pc" />);
    expect(screen.getByText('PC')).toBeInTheDocument();
    rerender(<JoinDeviceChip device="phone_dial_in" />);
    expect(screen.getByText('Dial-in')).toBeInTheDocument();
    rerender(<JoinDeviceChip device="unknown" />);
    expect(screen.getByText('Device unknown')).toBeInTheDocument();
  });

  it('renders nothing when nobody saw the join', () => {
    const { container } = render(<JoinDeviceChip device={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TranscriptLink with a stored Calendly recap', () => {
  it('opens the summary in a dialog, loaded once, with the Calendly link', async () => {
    const fetchFn = stubFetch({
      '/api/crm/bookings/b1/recap': () => ({
        body: {
          success: true,
          recaps: [
            {
              messageId: 'm1',
              subject: 'Meeting summary: Consultation with Priya Raman',
              sentAt: '2026-10-08T12:00:00.000Z',
              summary: 'Priya wants data roles in Canada.',
              sections: { summary: 'Priya wants data roles in Canada.', 'action items': '- Send plan details' },
              recapUrl: 'https://calendly.com/app/notetaker/recaps/abc',
              attendees: [],
              matchStatus: 'matched',
            },
          ],
        },
      }),
    });
    wrap(<TranscriptLink transcript={{ bookingId: 'b1', url: 'https://calendly.com/app/notetaker/recaps/abc', summaryPreview: 'Priya wants' }} clientName="Priya" />);
    await userEvent.click(screen.getByRole('button', { name: 'View Calendly meeting summary' }));
    expect(await screen.findByText('Priya wants data roles in Canada.')).toBeInTheDocument();
    expect(screen.getByText('- Send plan details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the full recap in Calendly/ })).toHaveAttribute('href', 'https://calendly.com/app/notetaker/recaps/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Close summary' }));
    expect(screen.queryByText('Priya wants data roles in Canada.')).not.toBeInTheDocument();
    expect(callsTo(fetchFn, '/recap').length).toBe(1);
  });

  it('shows a retry when the summary cannot load', async () => {
    stubFetch({ '/api/crm/bookings/b2/recap': () => ({ status: 500, body: { success: false, error: { code: 'internal_error', message: 'x' } } }) });
    wrap(<TranscriptLink transcript={{ bookingId: 'b2' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'View Calendly meeting summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The summary could not load.');
  });
});
