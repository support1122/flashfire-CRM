import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { callCheckInfo } from './helpers';
import { CallCheckChip } from './shared';
import type { CallCheck } from '../../types/salesAllocation';

const CALL_AT = Date.parse('2026-10-19T09:00:00.000Z');
const NOW_AFTER = new Date(CALL_AT + 2 * 3600_000);
const NOW_BEFORE = new Date(CALL_AT - 3600_000);
const check = (over: Partial<CallCheck>): CallCheck => ({
  verdict: 'not_called',
  calls: 0,
  connected: false,
  firstCallAt: null,
  firstCallOffsetMin: null,
  talkSec: 0,
  ...over,
});

describe('callCheckInfo', () => {
  it('words each verdict and tone', () => {
    expect(callCheckInfo(check({ verdict: 'called_in_time', calls: 1, connected: true, firstCallOffsetMin: -5 }), 'scheduled', CALL_AT, +NOW_AFTER)).toEqual({
      label: 'Called in time',
      detail: 'First call 5 min before, connected',
      tone: 'good',
    });
    expect(callCheckInfo(check({ verdict: 'called_late', calls: 1, firstCallOffsetMin: 12 }), 'scheduled', CALL_AT, +NOW_AFTER)).toEqual({
      label: 'Called late',
      detail: 'First call 12 min after, not connected',
      tone: 'warn',
    });
    expect(callCheckInfo(check({ verdict: 'not_called' }), 'scheduled', CALL_AT, +NOW_AFTER)?.tone).toBe('bad');
    expect(callCheckInfo(check({ verdict: 'called_in_time', calls: 1, firstCallOffsetMin: 0 }), 'scheduled', CALL_AT, +NOW_AFTER)?.detail).toContain('at the call time');
    expect(callCheckInfo(check({ verdict: 'no_phone' }), 'scheduled', CALL_AT, +NOW_AFTER)?.label).toBe('Cannot check');
  });

  it('says nothing for a missing check, a cancelled call, or a call that has not come yet', () => {
    expect(callCheckInfo(null, 'scheduled', CALL_AT, +NOW_AFTER)).toBeNull();
    expect(callCheckInfo(undefined, 'scheduled', CALL_AT, +NOW_AFTER)).toBeNull();
    expect(callCheckInfo(check({ verdict: 'not_called' }), 'cancelled', CALL_AT, +NOW_AFTER)).toBeNull();
    expect(callCheckInfo(check({ verdict: 'waiting' }), 'scheduled', CALL_AT, +NOW_BEFORE)).toBeNull();
    expect(callCheckInfo(check({ verdict: 'waiting' }), 'scheduled', CALL_AT, CALL_AT + 600_000)?.label).toBe('No call yet');
  });
});

describe('CallCheckChip', () => {
  it('shows the label and the detail', () => {
    render(<CallCheckChip check={check({ verdict: 'not_called' })} status="scheduled" callAt={new Date(CALL_AT).toISOString()} now={NOW_AFTER} />);
    expect(screen.getByTestId('call-check')).toHaveTextContent('Not called');
    expect(screen.getByText('No outbound Zoom call to this number from the BDA')).toBeInTheDocument();
  });
  it('renders nothing without a check', () => {
    const { container } = render(<CallCheckChip check={null} status="scheduled" callAt={new Date(CALL_AT).toISOString()} now={NOW_AFTER} />);
    expect(container).toBeEmptyDOMElement();
  });
});
