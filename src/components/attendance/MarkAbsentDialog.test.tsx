import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarkAbsentDialog, { type AbsenceTarget } from './MarkAbsentDialog';
import { apiError, installFetch, KALPATARU, SIDDHARTHA, type Handler } from './attendanceAdminFixtures';
import { candidateAllocation, candidateAllocation2, candidateBooking, report } from './absenceFixtures';
import type { AbsenceCandidate, AbsenceKind } from '../../types/absence';

const GOOD_REASON = 'BDA never picked up and the client waited ten minutes.';

function install(routes: Record<string, Handler>) {
  const stub = installFetch(routes);
  vi.stubGlobal('fetch', stub.impl);
  return stub.calls;
}

function candidatesFor(all: AbsenceCandidate[]): Handler {
  return ({ path }) => {
    const url = new URL(path, 'http://localhost');
    const kind = url.searchParams.get('kind');
    const bda = url.searchParams.get('bdaEmail');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const day = (c: AbsenceCandidate) => c.callStart.slice(0, 10);
    const candidates = all.filter(
      (c) =>
        c.kind === kind &&
        (!bda || c.bdaEmail === bda) &&
        (!q || c.clientName.toLowerCase().includes(q)) &&
        (!from || day(c) >= from) &&
        (!to || day(c) <= to),
    );
    return { success: true, kind, candidates };
  };
}

type BatchBody = { items: { kind: AbsenceKind; refId: string }[]; reason: string };

/** A batch answer where every call is saved. `refuse` lists calls the server turns down, by refId. */
function batchReply(status: 'approved' | 'pending', refuse: Record<string, { code: string; message: string }> = {}): Handler {
  return ({ body }) => {
    const { items } = body as BatchBody;
    const results = items.map((i) =>
      refuse[i.refId]
        ? { kind: i.kind, refId: i.refId, ok: false as const, error: refuse[i.refId] }
        : { kind: i.kind, refId: i.refId, ok: true as const, report: report(`abs_${i.refId}`, { status, kind: i.kind, refId: i.refId, clientName: i.refId }) },
    );
    const succeeded = results.filter((r) => r.ok).length;
    return { success: true, results, succeeded, failed: results.length - succeeded };
  };
}

const BDAS: Handler = () => ({
  success: true,
  bdas: [
    { email: SIDDHARTHA.email, displayName: SIDDHARTHA.name },
    { email: KALPATARU.email, displayName: KALPATARU.name },
  ],
});

function renderDialog(props: { admin: boolean; target?: AbsenceTarget; defaultBdaEmail?: string }) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MarkAbsentDialog token="tok" onClose={onClose} onDone={onDone} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, onDone };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MarkAbsentDialog as an admin', () => {
  const routes = (post?: Handler): Record<string, Handler> => ({
    'GET /api/crm/absences/candidates': candidatesFor([candidateAllocation, candidateAllocation2, candidateBooking]),
    'GET /api/crm/attendance/bdas': BDAS,
    'POST /api/crm/absences/batch': post ?? batchReply('approved'),
  });

  it('lists past calls in IST, keeps Mark absent disabled until a call and a valid reason exist, then posts once', async () => {
    const calls = install(routes());
    const { onDone, onClose } = renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog', { name: /mark absent/i });

    const boxes = await within(dialog).findAllByRole('checkbox');
    expect(boxes).toHaveLength(3); // two calls plus "select all"
    expect(within(dialog).getByRole('checkbox', { name: /Select all 2 shown/ })).not.toBeChecked();
    expect(within(dialog).getByText(/Wed, Oct 7, 3:00 PM IST/)).toBeInTheDocument();
    expect(within(dialog).getByText('Siddhartha · Wed, Oct 7, 3:00 PM IST')).toBeInTheDocument();
    expect(within(dialog).getByTestId('candidates-count')).toHaveTextContent('2 calls found');

    const submit = within(dialog).getByRole('button', { name: 'Mark absent' });
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    expect(submit).toBeDisabled(); // reason is fine, but no call is picked

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Tomasz Kowalczyk/ }));
    expect(within(dialog).getByTestId('candidate-selected')).toHaveTextContent('Tomasz Kowalczyk, Siddhartha');
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0].saved[0].status).toBe('approved');
    expect(onDone.mock.calls[0][0].failed).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('/api/crm/absences/batch');
    expect(posts[0].body).toEqual({ items: [{ kind: 'allocation', refId: 'alloc_9' }], reason: GOOD_REASON });
  });

  it('rejects a reason under 5 characters and shows the live counter', async () => {
    install(routes());
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'abc');
    expect(within(dialog).getByRole('button', { name: 'Mark absent' })).toBeDisabled();
    expect(within(dialog).getByText('3 / 500')).toBeInTheDocument();
    expect(within(dialog).getByText(/Add 2 more characters/)).toBeInTheDocument();
  });

  it('switches to Calendly meetings and keeps the picks made on the other tab', async () => {
    const calls = install(routes());
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Calendly meeting' }));
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Daniel Brooks/ }));
    expect(within(dialog).getByTestId('candidate-selected')).toHaveTextContent('2 calls selected');
    expect(calls.some((c) => c.path.includes('candidates?kind=booking'))).toBe(true);
  });

  it('narrows by BDA and by a debounced search, sending both to the server', async () => {
    const calls = install(routes());
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('checkbox');
    const select = within(dialog).getByLabelText('BDA');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Kalpataru' })).toBeInTheDocument());
    await userEvent.selectOptions(select, KALPATARU.email);
    expect(await within(dialog).findByRole('checkbox', { name: /Meera Pillai/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /Tomasz/ })).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Search'), 'zzz');
    expect(await within(dialog).findByTestId('candidates-empty')).toHaveTextContent('No lead allocation call matches "zzz"');
    const searches = calls.filter((c) => c.path.includes('q='));
    expect(searches.length).toBeGreaterThan(0);
    // Debounced: three keystrokes must not become three requests.
    expect(searches.filter((c) => /q=z(?:&|$)/.test(c.path) || /q=zz(?:&|$)/.test(c.path))).toHaveLength(0);
    expect(searches.some((c) => c.path.includes('bdaEmail=kalpataru%40flashfirehq.com') && c.path.includes('q=zzz'))).toBe(true);
  });

  it('starts on the BDA picked in the ledger', async () => {
    const calls = install(routes());
    renderDialog({ admin: true, defaultBdaEmail: KALPATARU.email });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('checkbox', { name: /Meera Pillai/ })).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('bdaEmail=kalpataru%40flashfirehq.com'))).toBe(true);
  });

  it('shows the server message in the dialog and stays open when the call was already fined', async () => {
    install(routes(() => apiError(409, 'already_fined', 'This call already has a fine.')));
    const { onClose, onDone } = renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark absent' }));
    expect(await within(dialog).findByText('This call already has a fine.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows an empty state with the 30 day rule', async () => {
    install({ ...routes(), 'GET /api/crm/absences/candidates': candidatesFor([]) });
    renderDialog({ admin: true });
    const empty = await screen.findByTestId('candidates-empty');
    expect(empty).toHaveTextContent('No lead allocation call to mark');
    expect(empty).toHaveTextContent('last 30 days');
  });

  it('shows a load error with a working Try again', async () => {
    let fail = true;
    install({
      ...routes(),
      'GET /api/crm/absences/candidates': (call) => (fail ? apiError(503, 'unavailable', 'Calls are busy right now.') : candidatesFor([candidateAllocation])(call)),
    });
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Calls are busy right now.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(dialog).getByRole('button', { name: /try again/i }));
    expect(await within(dialog).findByRole('checkbox', { name: /Tomasz/ })).toBeInTheDocument();
  });
});

describe('MarkAbsentDialog with several calls', () => {
  const all = [candidateAllocation, candidateAllocation2, candidateBooking];
  const setup = (post?: Handler) =>
    install({
      'GET /api/crm/absences/candidates': candidatesFor(all),
      'GET /api/crm/attendance/bdas': BDAS,
      'POST /api/crm/absences/batch': post ?? batchReply('approved'),
    });

  it('selects every shown call at once, counts them, and sends them in one request', async () => {
    const calls = setup();
    const { onDone } = renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    const selectAll = await within(dialog).findByRole('checkbox', { name: /Select all 2 shown/ });
    await userEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(within(dialog).getByTestId('candidate-selected')).toHaveTextContent('2 calls selected');

    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 2 absent' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect((posts[0].body as BatchBody).items).toEqual([
      { kind: 'allocation', refId: 'alloc_9' },
      { kind: 'allocation', refId: 'alloc_10' },
    ]);
    expect(onDone.mock.calls[0][0].saved).toHaveLength(2);
  });

  it('shows a half-selected "select all" and clears with the Clear button', async () => {
    setup();
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    const selectAll = await within(dialog).findByRole('checkbox', { name: /Select all 2 shown/ });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Tomasz/ }));
    expect((selectAll as HTMLInputElement).indeterminate).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));
    expect(within(dialog).queryByTestId('candidate-selected')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Mark absent' })).toBeDisabled();
  });

  it('closes and reports the calls the server refused when only some were saved', async () => {
    setup(batchReply('approved', { alloc_10: { code: 'already_fined', message: 'This call already has a fine.' } }));
    const { onDone, onClose } = renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Select all/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark 2 absent' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const outcome = onDone.mock.calls[0][0];
    expect(outcome.saved).toHaveLength(1);
    expect(outcome.failed).toEqual([{ clientName: 'Meera Pillai', message: 'This call already has a fine.' }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with the reasons when every call was refused', async () => {
    setup(batchReply('approved', { alloc_9: { code: 'already_fined', message: 'This call already has a fine.' } }));
    const { onDone, onClose } = renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark absent' }));
    expect(await within(dialog).findByText(/Tomasz Kowalczyk: This call already has a fine\./)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows what the Zoom call log says next to each Lead Allocation call', async () => {
    const miss = { verdict: 'not_called' as const, calls: 0, connected: false, firstCallAt: null, firstCallOffsetMin: null, talkSec: 0 };
    const ok = { verdict: 'called_in_time' as const, calls: 1, connected: true, firstCallAt: '2026-10-07T09:25:00.000Z', firstCallOffsetMin: -5, talkSec: 80 };
    install({
      'GET /api/crm/absences/candidates': candidatesFor([{ ...candidateAllocation, callCheck: miss }, { ...candidateAllocation2, callCheck: ok }]),
      'GET /api/crm/attendance/bdas': BDAS,
    });
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    const tomasz = await within(dialog).findByRole('checkbox', { name: /Tomasz/ });
    expect(tomasz).toHaveAccessibleName(/Not called/);
    expect(within(dialog).getByRole('checkbox', { name: /Meera/ })).toHaveAccessibleName(/Called in time/);
  });

  it('narrows the list by a date range and sends the range to the server', async () => {
    const calls = setup();
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: /Tomasz/ });
    await userEvent.type(within(dialog).getByLabelText('From date'), '2026-10-07');
    expect(await within(dialog).findByTestId('candidates-count')).toHaveTextContent('1 call found');
    expect(within(dialog).queryByRole('checkbox', { name: /Meera/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('from=2026-10-07'))).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear dates' }));
    expect(await within(dialog).findByRole('checkbox', { name: /Meera/ })).toBeInTheDocument();
  });

  it('warns instead of searching when From is after To', async () => {
    const calls = setup();
    renderDialog({ admin: true });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: /Tomasz/ });
    await userEvent.type(within(dialog).getByLabelText('To date'), '2026-10-01');
    await userEvent.type(within(dialog).getByLabelText('From date'), '2026-10-09');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('From date is after the To date');
    expect(calls.some((c) => c.path.includes('from=2026-10-09'))).toBe(false);
  });
});

describe('MarkAbsentDialog as a BDA', () => {
  it('has no BDA picker, explains the review step and files a pending report', async () => {
    const calls = install({
      'GET /api/crm/absences/candidates': candidatesFor([candidateAllocation, candidateBooking]),
      'POST /api/crm/absences/batch': batchReply('pending'),
    });
    const { onDone } = renderDialog({ admin: false });
    const dialog = await screen.findByRole('dialog', { name: /report a missed call/i });
    expect(within(dialog).queryByLabelText('BDA')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/fine only starts after they approve it/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Siddhartha · Wed, Oct 7, 3:00 PM IST')).not.toBeInTheDocument(); // no BDA name for the BDA's own list
    expect(calls.every((c) => !c.path.includes('/attendance/bdas') && !c.path.includes('bdaEmail'))).toBe(true);

    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Tomasz/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0].saved[0].status).toBe('pending');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ items: [{ kind: 'allocation', refId: 'alloc_9' }], reason: GOOD_REASON });
  });

  it('skips the picker for a known call and posts that call', async () => {
    const calls = install({ 'POST /api/crm/absences/': () => ({ success: true, report: report('abs_new', {}) }) });
    const { onDone } = renderDialog({
      admin: false,
      target: { kind: 'allocation', refId: 'alloc_42', clientName: 'Ava Stone', bdaName: 'Siddhartha', callStart: '2026-10-07T09:30:00.000Z' },
    });
    const dialog = await screen.findByRole('dialog', { name: /report a missed call/i });
    expect(within(dialog).getByText('Ava Stone')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Reason')).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText('Reason'), GOOD_REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/crm/absences/']);
    expect(calls[0].body).toEqual({ kind: 'allocation', refId: 'alloc_42', reason: GOOD_REASON });
  });
});
