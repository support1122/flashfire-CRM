import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  CallChip,
  DeductionChips,
  FlagChips,
  InOutCell,
  MarkedCell,
  StatusUpdatedCell,
  TimeSpentCell,
  TranscriptLink,
} from './AttendanceCells';
import { makeAttendance, makeCalls, makeStatus } from '../../test/attendanceFixtures';
import type { DeductionChip } from '../../types/attendance';

describe('CallChip', () => {
  it('shows calls, first call offset and connected', () => {
    render(<CallChip summary={makeCalls()} />);
    expect(screen.getByText('3 calls, first +8m, connected')).toBeInTheDocument();
  });

  it('shows a single call and a call that did not connect', () => {
    render(<CallChip summary={makeCalls({ calls: 1, connected: false, firstCallOffsetMin: 2 })} />);
    expect(screen.getByText('1 call, first +2m, not connected')).toBeInTheDocument();
  });

  it('shows a first call made before the start', () => {
    render(<CallChip summary={makeCalls({ firstCallOffsetMin: -4 })} />);
    expect(screen.getByText('3 calls, first 4m before, connected')).toBeInTheDocument();
  });

  it('shows "Not called" when there are no calls', () => {
    render(<CallChip summary={makeCalls({ calls: 0, connected: false, firstCallAt: null, firstCallOffsetMin: null, talkSec: 0 })} />);
    expect(screen.getByText('Not called')).toBeInTheDocument();
  });

  it('shows "No call data" when the summary is not computed yet', () => {
    render(<CallChip summary={null} />);
    expect(screen.getByText('No call data')).toBeInTheDocument();
  });
});

describe('MarkedCell', () => {
  it('shows the exact time and the button that won', () => {
    render(<MarkedCell attendance={makeAttendance()} />);
    expect(screen.getByText('4:29:51 PM')).toBeInTheDocument();
    expect(screen.getByText('Meet button')).toBeInTheDocument();
  });

  it('shows auto-detected when no button was pressed', () => {
    render(
      <MarkedCell
        attendance={makeAttendance({ markedPresentAt: null, signals: [{ kind: 'extension_join', eventAt: '2026-10-08T10:58:00.000Z' }] })}
      />,
    );
    expect(screen.getByText('Present')).toBeInTheDocument();
    expect(screen.getByText('auto-detected')).toBeInTheDocument();
  });

  it('shows Absent for an absent verdict, Pending when undecided, Not tracked without data', () => {
    const { rerender } = render(<MarkedCell attendance={makeAttendance({ verdict: 'absent', markedPresentAt: null, signals: [] })} />);
    expect(screen.getByText('Absent')).toBeInTheDocument();
    rerender(<MarkedCell attendance={makeAttendance({ verdict: null, markedPresentAt: null, signals: [] })} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    rerender(<MarkedCell attendance={null} />);
    expect(screen.getByText('Not tracked')).toBeInTheDocument();
  });
});

describe('InOutCell and TimeSpentCell', () => {
  it('shows exact times, the Google verified badge and lateness', () => {
    render(<InOutCell attendance={makeAttendance({ inAt: '2026-10-08T11:03:10.000Z' })} scheduledStart="2026-10-08T11:00:00.000Z" />);
    expect(screen.getByText('4:33:10 PM')).toBeInTheDocument();
    expect(screen.getByText('Google verified')).toBeInTheDocument();
    expect(screen.getByText('3m late')).toBeInTheDocument();
  });

  it('omits the verified badge and uses minute precision for extension data', () => {
    render(<InOutCell attendance={makeAttendance({ verified: false })} scheduledStart="2026-10-08T11:00:00.000Z" />);
    expect(screen.queryByText('Google verified')).not.toBeInTheDocument();
    expect(screen.getByText('4:29 PM')).toBeInTheDocument();
  });

  it('expands every session in the time spent cell', async () => {
    const user = userEvent.setup();
    render(<TimeSpentCell attendance={makeAttendance()} />);
    expect(screen.getByText('41m')).toBeInTheDocument();
    const summary = screen.getByText('2 sessions');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByText(/4:29:40 PM to 4:50:00 PM/)).toBeInTheDocument();
    expect(screen.getByText(/4:55:00 PM to 5:11:12 PM/)).toBeInTheDocument();
  });

  it('marks a session that has no leave time as still in', () => {
    render(
      <TimeSpentCell
        attendance={makeAttendance({ sessions: [{ joinedAt: '2026-10-08T11:00:00.000Z', leftAt: null }] })}
      />,
    );
    expect(screen.getByText('1 session')).toBeInTheDocument();
    expect(screen.getByText(/to still in/)).toBeInTheDocument();
  });
});

describe('StatusUpdatedCell', () => {
  it('shows who completed it and when', () => {
    render(<StatusUpdatedCell statusUpdate={makeStatus()} />);
    expect(screen.getByText(/completed/)).toBeInTheDocument();
    expect(screen.getByText(/by Siddhartha/)).toBeInTheDocument();
    expect(screen.getByText(/5:12 PM/)).toBeInTheDocument();
  });

  it('shows still scheduled, and the stuck flag when it is stuck', () => {
    const { rerender } = render(<StatusUpdatedCell statusUpdate={makeStatus({ status: 'scheduled', updatedBy: null, updatedAt: null })} />);
    expect(screen.getByText('Still scheduled')).toBeInTheDocument();
    expect(screen.queryByText(/Stuck/)).not.toBeInTheDocument();
    rerender(<StatusUpdatedCell statusUpdate={makeStatus({ status: 'scheduled', updatedBy: null, updatedAt: null, stuck: true })} />);
    expect(screen.getByText(/Stuck, needs an update/)).toBeInTheDocument();
  });
});

describe('DeductionChips', () => {
  const base: DeductionChip = { deductionId: 'd1', rule: 'missed_meeting', amountInr: 500, status: 'active', waiverReason: null };

  it('shows an active chip with its amount', () => {
    render(<DeductionChips deductions={[base]} />);
    const chip = screen.getByText('Missed meeting ₹500');
    expect(chip).not.toHaveClass('line-through');
  });

  it('strikes through waived and voided chips and labels them', () => {
    render(
      <DeductionChips
        deductions={[
          { ...base, deductionId: 'd2', rule: 'no_show_not_called', amountInr: 100, status: 'waived', waiverReason: 'Client phone was wrong' },
          { ...base, deductionId: 'd3', rule: 'status_not_updated', amountInr: 50, status: 'voided' },
        ]}
      />,
    );
    expect(screen.getByText('No-show not called ₹100')).toHaveClass('line-through');
    expect(screen.getByText('waived')).toBeInTheDocument();
    expect(screen.getByText('Status not updated ₹50')).toHaveClass('line-through');
    expect(screen.getByText('voided')).toBeInTheDocument();
    expect(screen.getByTitle('Waived: Client phone was wrong')).toBeInTheDocument();
  });

  it('shows needs_review as under review without an amount for a BDA, with the amount for an admin', () => {
    const review = { ...base, status: 'needs_review' as const };
    const { rerender } = render(<DeductionChips deductions={[review]} />);
    expect(screen.getByText('under review')).toBeInTheDocument();
    expect(screen.queryByText(/₹500/)).not.toBeInTheDocument();
    rerender(<DeductionChips deductions={[review]} viewerIsAdmin />);
    expect(screen.getByText('Missed meeting ₹500')).toBeInTheDocument();
    expect(screen.getByText('to review')).toBeInTheDocument();
  });

  it('shows a dash when there are no deductions', () => {
    render(<DeductionChips deductions={[]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('FlagChips and TranscriptLink', () => {
  it('shows both integrity flags', () => {
    render(<FlagChips attendance={makeAttendance({ matchedBy: 'name', integrityFlag: 'marked_never_joined' })} />);
    expect(screen.getByText('Matched by name')).toBeInTheDocument();
    expect(screen.getByText('Marked present, never joined')).toBeInTheDocument();
  });

  it('shows nothing flagged for a clean row', () => {
    render(<FlagChips attendance={makeAttendance()} />);
    expect(screen.queryByText('Matched by name')).not.toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders the transcript icon only when a transcript exists', () => {
    const { rerender, container } = render(<TranscriptLink transcript={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TranscriptLink transcript={{ url: 'https://example.test/t/1' }} />);
    expect(screen.getByRole('link', { name: 'View transcript' })).toHaveAttribute('href', 'https://example.test/t/1');
    rerender(<TranscriptLink transcript={{ url: null }} />);
    expect(screen.getByRole('img', { name: 'Transcript is being prepared' })).toBeInTheDocument();
  });
});
