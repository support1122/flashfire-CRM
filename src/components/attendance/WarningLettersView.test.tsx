import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WarningLettersView from './WarningLettersView';
import AbsenceNotice from './AbsenceNotice';
import { apiError, installFetch, type Handler } from './attendanceAdminFixtures';
import type { WarningLetter, WarningLettersResponse, WarningStanding } from '../../types/warningLetter';

function letter(id: string, partial: Partial<WarningLetter>): WarningLetter {
  return {
    letterId: id,
    bdaEmail: 'siddhartha@flashfirehq.com',
    bdaName: 'Siddhartha',
    level: 1,
    title: 'First warning',
    threshold: 7,
    missedCount: 7,
    windowFrom: '2026-09-08T00:00:00.000+05:30',
    windowTo: '2026-10-07T23:59:59.000+05:30',
    totalAmountInr: 3500,
    missed: [
      { bookingId: 'bk_1', clientName: 'Tomasz Kowalczyk', scheduledStart: '2026-10-06T12:00:00.000+05:30', amountInr: 500 },
      { bookingId: 'bk_2', clientName: 'Meera Pillai', scheduledStart: '2026-10-05T16:30:00.000+05:30', amountInr: 500 },
    ],
    status: 'draft',
    subject: 'First warning: missed meetings',
    bodyText: 'Hi Siddhartha,\n\nYou missed 7 meetings in November.\n\nRegards,\nFlashfire',
    toEmail: 'siddhartha@flashfirehq.com',
    ccEmails: ['sohith@flashfirehq.com'],
    sentAt: null,
    sentBy: null,
    error: null,
    dismissedAt: null,
    dismissedBy: null,
    dismissNote: null,
    createdAt: '2026-10-07T10:00:00.000+05:30',
    ...partial,
  };
}

const draft = letter('wl_1', {});
const sent = letter('wl_2', {
  level: 2,
  title: 'Second warning',
  threshold: 10,
  missedCount: 10,
  status: 'sent',
  sentAt: '2026-10-06T11:00:00.000+05:30',
  sentBy: 'Sohith',
  createdAt: '2026-10-06T10:00:00.000+05:30',
});
const failed = letter('wl_3', {
  bdaEmail: 'kalpataru@flashfirehq.com',
  bdaName: 'Kalpataru',
  status: 'failed',
  error: 'Mailbox unavailable',
  createdAt: '2026-10-04T10:00:00.000+05:30',
});

const standings: WarningStanding[] = [
  { bdaEmail: 'siddhartha@flashfirehq.com', bdaName: 'Siddhartha', missedCount: 10, level: 2, nextThreshold: 15 },
  { bdaEmail: 'kalpataru@flashfirehq.com', bdaName: 'Kalpataru', missedCount: 3, level: 0, nextThreshold: 7 },
  { bdaEmail: 'maxed@flashfirehq.com', bdaName: 'Maxed Out', missedCount: 16, level: 3, nextThreshold: null },
];

function payload(letters: WarningLetter[], extra: Partial<WarningLettersResponse> = {}): WarningLettersResponse {
  return {
    success: true,
    mode: 'draft',
    window: { from: '2026-11-12T18:30:00.000Z', to: '2026-11-30T18:29:59.999Z', label: 'November 2026' },
    policy: [
      { level: 1, threshold: 7, title: 'First warning' },
      { level: 2, threshold: 10, title: 'Second warning' },
      { level: 3, threshold: 15, title: 'Third warning' },
    ],
    letters,
    standings,
    draftCount: 2,
    ...extra,
  };
}

function install(routes: Record<string, Handler>) {
  const stub = installFetch(routes);
  vi.stubGlobal('fetch', stub.impl);
  return stub.calls;
}

function Host({ admin }: { admin: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <AbsenceNotice message={notice} onDismiss={() => setNotice(null)} />
      <WarningLettersView token="tok" admin={admin} onNotice={setNotice} />
    </>
  );
}

function renderView(admin: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Host admin={admin} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WarningLettersView as an admin', () => {
  const all = [draft, sent, failed];

  it('shows the policy, mode banner, standings and letters newest first', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload(all) });
    renderView(true);
    expect(await screen.findByText('Letters are written as drafts. Review and send them here.')).toBeInTheDocument();
    expect(screen.getByText('Missed meetings this month (November 2026)')).toBeInTheDocument();
    expect(screen.getByText('Third warning letter')).toBeInTheDocument();
    expect(screen.getByText(/waived deduction stops counting/)).toBeInTheDocument();

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText('Siddhartha')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2nd')).toBeInTheDocument();
    expect(within(rows[1]).getByText('15 missed')).toBeInTheDocument();
    expect(within(rows[2]).getByText('None')).toBeInTheDocument();
    expect(within(rows[3]).getByText('None left')).toBeInTheDocument();

    const cards = screen.getAllByTestId('warning-letter');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('First warning')).toBeInTheDocument(); // wl_1, newest
    expect(within(cards[0]).getByText('Draft')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Sent')).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Sent Tue, Oct 6, 11:00 AM IST by Sohith/)).toBeInTheDocument();
    expect(within(cards[2]).getByText('Failed')).toBeInTheDocument();
    expect(within(cards[2]).getByText(/Send failed: Mailbox unavailable/)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/8 Sep 2026 to 7 Oct 2026/)).toBeInTheDocument();
  });

  it('shows the other mode banners and disables Check now when off', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([], { mode: 'off' }) });
    renderView(true);
    expect(await screen.findByText('Warning letters are switched off.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check now/i })).toBeDisabled();
  });

  it('shows the live banner', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([sent], { mode: 'live' }) });
    renderView(true);
    expect(await screen.findByText('Letters are emailed automatically to the BDA, with admins copied.')).toBeInTheDocument();
  });

  it('runs Check now and reports what it made', async () => {
    const calls = install({
      'GET /api/crm/warning-letters': () => payload(all),
      'POST /api/crm/warning-letters/evaluate': () => ({ success: true, mode: 'draft', created: ['a', 'b'], sent: [], failed: [] }),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /check now/i }));
    expect(await screen.findByText('2 drafts created')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('shows the server message when Check now is refused', async () => {
    install({
      'GET /api/crm/warning-letters': () => payload(all),
      'POST /api/crm/warning-letters/evaluate': () => apiError(409, 'warnings_off', 'Warning letters are switched off.'),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /check now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Warning letters are switched off.');
  });

  it('previews the subject, To, Cc, body line breaks and the missed meetings', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload(all) });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /preview first warning for siddhartha/i }));
    const dialog = await screen.findByRole('dialog', { name: /first warning: siddhartha/i });
    expect(within(dialog).getByText('First warning: missed meetings')).toBeInTheDocument();
    expect(within(dialog).getByText('siddhartha@flashfirehq.com')).toBeInTheDocument();
    expect(within(dialog).getByText('sohith@flashfirehq.com')).toBeInTheDocument();
    const body = within(dialog).getByTestId('letter-body');
    expect(body.textContent).toBe(draft.bodyText);
    expect(body.className).toMatch(/whitespace-pre-wrap/);
    expect(within(dialog).getByText('Tomasz Kowalczyk')).toBeInTheDocument();
    expect(within(dialog).getByText('Tue, Oct 6, 12:00 PM IST')).toBeInTheDocument();
    expect(within(dialog).getByText('Meera Pillai')).toBeInTheDocument();
  });

  it('sends only after the confirm step and then shows the letter as Sent', async () => {
    let done = false;
    const calls = install({
      'GET /api/crm/warning-letters': () => payload(done ? [{ ...draft, status: 'sent', sentAt: '2026-10-08T11:00:00.000+05:30', sentBy: 'Sohith' }, sent, failed] : all),
      'POST /api/crm/warning-letters/wl_1/send': () => {
        done = true;
        return { success: true, letter: { ...draft, status: 'sent' } };
      },
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /preview first warning for siddhartha/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send email' }));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(within(dialog).getByText(/This emails siddhartha@flashfirehq.com now/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send to Siddhartha' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('/api/crm/warning-letters/wl_1/send');
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('First warning emailed to Siddhartha');
    await waitFor(() => expect(screen.getAllByText('Sent')).toHaveLength(2));
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('opens straight on the confirm step from the row Send email button', async () => {
    const calls = install({ 'GET /api/crm/warning-letters': () => payload(all) });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /send email for first warning to siddhartha/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Send to Siddhartha' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('keeps the dialog open and shows the server message when the send fails', async () => {
    install({
      'GET /api/crm/warning-letters': () => payload(all),
      'POST /api/crm/warning-letters/wl_1/send': () => apiError(502, 'send_failed', 'The mail provider rejected the message.'),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /send email for first warning to siddhartha/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send to Siddhartha' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The mail provider rejected the message.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send to Siddhartha' })).toBeEnabled();
  });

  it('dismisses with the optional note', async () => {
    const calls = install({
      'GET /api/crm/warning-letters': () => payload(all),
      'POST /api/crm/warning-letters/wl_1/dismiss': () => ({ success: true, letter: { ...draft, status: 'dismissed' } }),
    });
    renderView(true);
    await userEvent.click(await screen.findByRole('button', { name: /dismiss first warning for siddhartha/i }));
    const dialog = await screen.findByRole('dialog', { name: /dismiss this letter/i });
    await userEvent.type(within(dialog).getByLabelText(/note/i), 'Already spoke to him.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss letter' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('/api/crm/warning-letters/wl_1/dismiss');
    expect(posts[0].body).toEqual({ note: 'Already spoke to him.' });
    expect(await screen.findByTestId('absence-notice')).toHaveTextContent('dismissed');
  });

  it('offers no send or dismiss on sent letters', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([sent]) });
    renderView(true);
    await screen.findByTestId('warning-letter');
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send email|dismiss/i })).not.toBeInTheDocument();
  });

  it('has an empty state', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([]) });
    renderView(true);
    expect(await screen.findByText('No warning letters yet')).toBeInTheDocument();
  });

  it('shows a loading skeleton, then an error with retry', async () => {
    let fail = true;
    install({
      'GET /api/crm/warning-letters': () => (fail ? apiError(500, 'server_error', 'The letters are unavailable.') : payload([])),
    });
    renderView(true);
    expect(screen.getByTestId('warnings-loading')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('The letters are unavailable.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('No warning letters yet')).toBeInTheDocument();
  });
});

describe('WarningLettersView as a BDA', () => {
  it('shows only their own card and sent letters, with no admin controls', async () => {
    const calls = install({
      'GET /api/crm/warning-letters': () =>
        payload([sent], {
          mode: 'live',
          standings: [standings[0]],
          draftCount: undefined,
        }),
    });
    renderView(false);
    const card = await screen.findByTestId('my-standing');
    expect(within(card).getByText('10')).toBeInTheDocument();
    expect(within(card).getByText('2nd')).toBeInTheDocument();
    expect(within(card).getByText('15 missed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('warning-letter')).toHaveLength(1);
    expect(screen.getByText('Second warning')).toBeInTheDocument();
    expect(screen.queryByText('Letters are emailed automatically to the BDA, with admins copied.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check now|send email|dismiss/i })).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    // The BDA can still read the letter.
    await userEvent.click(screen.getByRole('button', { name: /preview second warning/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /send|dismiss/i })).not.toBeInTheDocument();
  });

  it('never shows a draft even if the server sent one', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([draft, sent], { standings: [standings[0]] }) });
    renderView(false);
    await screen.findByTestId('my-standing');
    expect(screen.getAllByTestId('warning-letter')).toHaveLength(1);
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('has an empty state', async () => {
    install({ 'GET /api/crm/warning-letters': () => payload([], { standings: [standings[1]] }) });
    renderView(false);
    expect(await screen.findByText('No warning letters yet')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows an error state', async () => {
    install({ 'GET /api/crm/warning-letters': () => apiError(500, 'server_error', 'Not available right now.') });
    renderView(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not available right now.');
  });
});
