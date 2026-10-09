import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkPresentCard from './MarkPresentCard';
import { makeMyWindow, makeWindow } from '../../test/attendanceFixtures';
import { callsTo, stubFetch } from '../../test/stubFetch';

vi.mock('../../auth/CrmAuthContext', () => ({
  useCrmAuth: () => ({
    token: 'test-token',
    user: { email: 'bda@example.test', name: 'Test BDA', permissions: [] },
    hasPermission: () => false,
  }),
}));

// The PC clock is deliberately wrong (2030). Everything must still follow the server clock.
const PC_CLOCK = new Date('2030-01-01T00:00:00.000Z');

/** Serves my-window with a serverTime that moves with the (fake) PC clock from a fixed anchor. */
function serverClock(anchorIso: string) {
  const anchor = Date.parse(anchorIso);
  const started = Date.now();
  return () => new Date(anchor + (Date.now() - started)).toISOString();
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MarkPresentCard />
    </QueryClientProvider>,
  );
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(PC_CLOCK);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function myWindowRoute(anchor: string, overrides: Parameters<typeof makeMyWindow>[0] = {}) {
  const now = serverClock(anchor);
  return () => ({ body: makeMyWindow({ ...overrides, serverTime: now() }) });
}

describe('MarkPresentCard states', () => {
  it('renders nothing when the user is not tracked', async () => {
    stubFetch({
      '/my-window': () => ({ body: makeMyWindow({ tracked: false, current: null, next: null }) }),
    });
    const { container } = renderCard();
    await flush();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a disabled "Opens at" button before the window opens', async () => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T10:50:00.000Z') });
    renderCard();
    await flush();
    const button = screen.getByRole('button', { name: 'Opens at 4:25 PM' });
    expect(button).toBeDisabled();
  });

  it('shows a pulsing "Mark Present" button with a countdown while the window is open', async () => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z') });
    renderCard();
    await flush();
    const button = screen.getByRole('button', { name: 'Mark Present (0:42 left)' });
    expect(button).toBeEnabled();
    expect(button.className).toContain('animate-pulse');
    // Honours prefers-reduced-motion.
    expect(button.className).toContain('motion-reduce:animate-none');
  });

  it('says "Window closed, not marked" after the window and never says absent', async () => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:02:00.000Z') });
    renderCard();
    await flush();
    expect(screen.getByRole('button', { name: 'Window closed, not marked' })).toBeDisabled();
    expect(screen.queryByText(/absent/i)).not.toBeInTheDocument();
  });

  it('shows the time and the signal once marked', async () => {
    stubFetch({
      '/my-window': myWindowRoute('2026-10-08T11:00:30.000Z', {
        current: makeWindow({
          marked: true,
          markedPresentAt: '2026-10-08T10:59:51.000Z',
          verdict: 'present',
          verdictSignal: 'button_crm',
        }),
      }),
    });
    renderCard();
    await flush();
    expect(screen.getByRole('button', { name: 'Present at 4:29:51 PM' })).toBeDisabled();
    expect(screen.getByText('via CRM button')).toBeInTheDocument();
  });

  it('shows the next meeting line', async () => {
    stubFetch({
      '/my-window': myWindowRoute('2026-10-08T10:50:00.000Z', {
        next: makeWindow({ bookingId: 'bk_2', clientName: 'Diya Rao', scheduledStart: '2026-10-08T12:00:00.000Z' }),
      }),
    });
    renderCard();
    await flush();
    expect(screen.getByText(/Diya Rao at 5:30 PM/)).toBeInTheDocument();
  });

  it('keeps the live region to state changes only, not the ticking countdown', async () => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z') });
    renderCard();
    await flush();
    const live = screen.getByText('Mark Present window is open');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).not.toMatch(/left/);
    await flush(5000);
    expect(live).toHaveTextContent('Mark Present window is open');
  });

  it('announces the time left only at 60, 30 and 10 seconds', async () => {
    // 42 s left at render.
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z') });
    renderCard();
    await flush();
    const announcer = screen.getByTestId('time-left-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('Under a minute left to mark present');
    await flush(5000); // 37 s: no change, so nothing new is spoken
    expect(announcer).toHaveTextContent('Under a minute left to mark present');
    await flush(8000); // 29 s
    expect(announcer).toHaveTextContent('30 seconds left to mark present');
    await flush(20_000); // 9 s
    expect(announcer).toHaveTextContent('10 seconds left to mark present');
  });
});

describe('MarkPresentCard clock', () => {
  it('counts down from serverTime, not the PC clock', async () => {
    // PC says 2030. The server says 18 seconds past the start, so 42 seconds remain.
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z') });
    renderCard();
    await flush();
    expect(screen.getByRole('button', { name: 'Mark Present (0:42 left)' })).toBeInTheDocument();
    await flush(1000);
    expect(screen.getByRole('button', { name: 'Mark Present (0:41 left)' })).toBeInTheDocument();
    await flush(10_000);
    expect(screen.getByRole('button', { name: 'Mark Present (0:31 left)' })).toBeInTheDocument();
  });

  it('flips from open to closed by itself when the countdown reaches zero', async () => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:57.000Z') });
    renderCard();
    await flush();
    expect(screen.getByRole('button', { name: 'Mark Present (0:03 left)' })).toBeInTheDocument();
    await flush(4000);
    expect(screen.getByRole('button', { name: 'Window closed, not marked' })).toBeDisabled();
  });

  it('polls my-window every 15 seconds', async () => {
    const fetchMock = stubFetch({ '/my-window': myWindowRoute('2026-10-08T10:50:00.000Z') });
    renderCard();
    await flush();
    expect(callsTo(fetchMock, '/my-window')).toHaveLength(1);
    await flush(15_000);
    expect(callsTo(fetchMock, '/my-window')).toHaveLength(2);
    await flush(15_000);
    expect(callsTo(fetchMock, '/my-window')).toHaveLength(3);
  });
});

describe('MarkPresentCard click', () => {
  it('posts once even when clicked twice quickly, then shows the server time', async () => {
    const fetchMock = stubFetch({
      '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z'),
      '/mark-present': () => ({ body: { success: true, marked: true, markedPresentAt: '2026-10-08T11:00:19.000Z' } }),
    });
    renderCard();
    await flush();
    const button = screen.getByRole('button', { name: 'Mark Present (0:42 left)' });
    fireEvent.click(button);
    fireEvent.click(button);
    await flush();
    expect(callsTo(fetchMock, '/mark-present', 'POST')).toHaveLength(1);
    expect(callsTo(fetchMock, '/api/crm/attendance/bk_1/mark-present', 'POST')).toHaveLength(1);
    const init = callsTo(fetchMock, '/mark-present')[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(screen.getByRole('button', { name: 'Present at 4:30:19 PM' })).toBeDisabled();
  });

  it('flips to closed on 409 window_closed even though the local countdown disagreed', async () => {
    stubFetch({
      '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z'),
      '/mark-present': () => ({
        status: 409,
        body: { success: false, error: { code: 'window_closed', message: 'The window has closed' } },
      }),
    });
    renderCard();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Present (0:42 left)' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Window closed, not marked' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [
      '409 window_not_open',
      { status: 409, body: { success: false, error: { code: 'window_not_open', message: 'Too early', windowOpensAt: '2026-10-08T10:55:00.000Z' } } },
      /has not opened yet. It opens at 4:25 PM/,
    ],
    ['403 not_assigned', { status: 403, body: { success: false, error: { code: 'not_assigned', message: 'No' } } }, /not assigned to you/],
    ['403 not_tracked', { status: 403, body: { success: false, error: { code: 'not_tracked', message: 'No' } } }, /not on the attendance list/],
    ['429 rate_limited', { status: 429, body: { success: false, error: { code: 'rate_limited', message: 'Slow' } } }, /Too many tries/],
    ['500', { status: 500, body: { success: false, error: { code: 'boom', message: 'Boom' } } }, /server had a problem/],
  ])('shows a clear message on %s and does not look idle', async (_name, response, message) => {
    stubFetch({ '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z'), '/mark-present': () => response });
    renderCard();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Present (0:42 left)' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    // The pulsing blue "Mark Present" button is gone: it is either a retry or a dead-end state.
    expect(screen.queryByRole('button', { name: /^Mark Present \(/ })).not.toBeInTheDocument();
  });

  it('shows a network error message and lets the BDA try again', async () => {
    let fail = true;
    stubFetch({
      '/my-window': myWindowRoute('2026-10-08T11:00:18.000Z'),
      '/mark-present': () =>
        fail ? new Error('offline') : { body: { success: true, marked: true, markedPresentAt: '2026-10-08T11:00:40.000Z' } },
    });
    renderCard();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Present (0:42 left)' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not reach the server/);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: /^Try again/ }));
    await flush();
    expect(screen.getByRole('button', { name: /^Present at/ })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MarkPresentCard load errors', () => {
  it('shows a retry strip when the first load fails with a server error', async () => {
    stubFetch({ '/my-window': () => ({ status: 503, body: { success: false, error: { code: 'down', message: 'Down' } } }) });
    renderCard();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your Mark Present window/);
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeEnabled();
  });

  it('stays out of the way when the endpoint is missing or forbidden', async () => {
    stubFetch({ '/my-window': () => ({ status: 404, body: { success: false, error: { code: 'not_found', message: 'No' } } }) });
    const { container } = renderCard();
    await flush();
    expect(container).toBeEmptyDOMElement();
  });
});
