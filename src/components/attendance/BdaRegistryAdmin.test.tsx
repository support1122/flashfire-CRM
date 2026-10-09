import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BdaRegistryAdmin from './BdaRegistryAdmin';
import { apiError, installFetch, profilesResponse, type Handler } from './attendanceAdminFixtures';

function setup(failWith?: Handler) {
  // A tiny stateful server: PUT stores the profile, GET returns what was stored.
  const server = profilesResponse();
  const put = (email: string): Handler => async (call) => {
    if (failWith) return failWith(call);
    server.profiles = server.profiles.map((p) => (p.email === email ? { ...p, ...(call.body as object) } : p));
    return { success: true };
  };
  const stub = installFetch({
    'GET /api/crm/admin/bda-profiles': () => server,
    'PUT /api/crm/admin/bda-profiles/siddhartha%40flashfirehq.com': put('siddhartha@flashfirehq.com'),
    'PUT /api/crm/admin/bda-profiles/kalpataru%40flashfirehq.com': put('kalpataru@flashfirehq.com'),
  });
  vi.stubGlobal('fetch', stub.impl);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BdaRegistryAdmin token="admin-tok" />
    </QueryClientProvider>,
  );
  return stub.calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function card(name: string) {
  const heading = await screen.findByRole('heading', { name });
  return heading.closest('article') as HTMLElement;
}

describe('BdaRegistryAdmin', () => {
  it('lists profiles with aliases, leave days and the unknown names', async () => {
    setup();
    const sid = await card('Siddhartha');
    expect(within(sid).getByText('siddhartha b')).toBeInTheDocument();
    expect(within(sid).getByText('12 Oct 2026')).toBeInTheDocument();
    expect(within(sid).getByLabelText('Discord user ID')).toHaveValue('412345678901234567');
    expect(within(sid).getByRole('switch', { name: 'Tracked' })).toBeChecked();
    const pranjal = await card('Pranjal Tripathi');
    expect(within(pranjal).getByRole('switch', { name: 'Tracked' })).not.toBeChecked();

    const unknown = screen.getByRole('table', { name: 'Unrecognised names' });
    expect(within(unknown).getByText('Siddharthan Rao')).toBeInTheDocument();
    expect(within(unknown).getAllByRole('row')).toHaveLength(4); // header + 3
  });

  it('flips a toggle at once and sends ONLY the changed field', async () => {
    const calls = setup();
    const sid = await card('Siddhartha');
    await userEvent.click(within(sid).getByRole('switch', { name: 'Tracked' }));
    await waitFor(() => expect(within(sid).getByRole('switch', { name: 'Tracked' })).not.toBeChecked());
    await waitFor(() => expect(within(sid).getByText('Saved')).toBeInTheDocument());
    const put = calls.find((c) => c.method === 'PUT');
    // Not the whole profile: a stale cache must never overwrite what another admin changed.
    expect(put?.body).toEqual({ tracked: false });
  });

  it('rolls the toggle back and shows the error when the save fails', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setup(async () => {
      await gate;
      return apiError(500, 'server_error', 'Database is read-only.');
    });
    const sid = await card('Siddhartha');
    await userEvent.click(within(sid).getByRole('switch', { name: 'Active' }));
    // Optimistic: shown as off while the request is still in flight.
    await waitFor(() => expect(within(sid).getByRole('switch', { name: 'Active' })).not.toBeChecked());
    release();
    const alert = await within(sid).findByRole('alert');
    expect(alert).toHaveTextContent('Database is read-only. The change was undone.');
    await waitFor(() => expect(within(sid).getByRole('switch', { name: 'Active' })).toBeChecked());
  });

  it('adds and removes an alias, and refuses a duplicate', async () => {
    const calls = setup();
    const kal = await card('Kalpataru');
    const input = within(kal).getByLabelText(/New alias for Kalpataru/);
    await userEvent.type(input, 'Kalpataru S');
    await userEvent.click(within(kal).getByRole('button', { name: 'Add alias' }));
    expect(within(kal).getByText('That alias is already listed.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await userEvent.clear(input);
    await userEvent.type(input, 'k samal');
    await userEvent.click(within(kal).getByRole('button', { name: 'Add alias' }));
    expect(await within(kal).findByText('k samal')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ aliases: ['kalpataru s', 'kalpataru samal', 'k samal'] });

    await userEvent.click(within(kal).getByRole('button', { name: 'Remove alias kalpataru s' }));
    await waitFor(() => expect(within(kal).queryByText('kalpataru s')).not.toBeInTheDocument());
  });

  it('adds a leave day in date order and validates the Discord ID', async () => {
    const calls = setup();
    const kal = await card('Kalpataru');
    const date = within(kal).getByLabelText(/Leave day to add for Kalpataru/);
    await userEvent.type(date, '2026-10-05');
    await userEvent.click(within(kal).getByRole('button', { name: 'Add day' }));
    await waitFor(() => expect(within(kal).getByText('5 Oct 2026')).toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ leaveDays: ['2026-10-05', '2026-10-09'] });

    const discord = within(kal).getByLabelText('Discord user ID');
    const save = within(kal).getByRole('button', { name: 'Save ID' });
    expect(save).toBeDisabled();
    await userEvent.type(discord, '12ab');
    expect(save).toBeDisabled();
    expect(within(kal).getByText('A Discord user ID is 15 to 25 digits.')).toBeInTheDocument();
    await userEvent.clear(discord);
    await userEvent.type(discord, '512345678901234567');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2));
    expect(calls.filter((c) => c.method === 'PUT')[1].body).toMatchObject({ discordUserId: '512345678901234567' });
  });

  it('shows an error with a retry when the registry cannot load', async () => {
    const stub = installFetch({ 'GET /api/crm/admin/bda-profiles': () => apiError(403, 'forbidden', 'Admins only.') });
    vi.stubGlobal('fetch', stub.impl);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <BdaRegistryAdmin token="x" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Admins only.');
  });
});
