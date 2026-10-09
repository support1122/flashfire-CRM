// Regression: the query cache must NOT be cleared when /auth/me first fills in the user. Doing so orphaned every query that
// had already started with the stored token, so screens like Deductions stayed on "Loading" forever. It must still be
// cleared when a known user logs out, so the next person never sees the previous one's cached rows.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../api/queryClient';
import { CrmAuthProvider, useCrmAuth } from './CrmAuthContext';

function Probe() {
  const { user, logout } = useCrmAuth();
  // Starts immediately with the stored token, before /auth/me has answered, exactly like the Deductions screen does.
  const q = useQuery({
    queryKey: ['probe'],
    queryFn: () => new Promise<string>((resolve) => setTimeout(() => resolve('loaded'), 30)),
  });
  return (
    <div>
      <p data-testid="user">{user?.email ?? 'none'}</p>
      <p data-testid="query">{q.isPending ? 'loading' : q.data}</p>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

describe('CrmAuthProvider and the query cache', () => {
  beforeEach(() => {
    localStorage.setItem('flashfire_crm_user_token', 'tok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ user: { email: 'a@x.test', name: 'A', role: 'bda', permissions: [] } }), { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    queryClient.clear();
  });

  it('a query that started before the user loaded still finishes (no clear on the first load)', async () => {
    const clear = vi.spyOn(queryClient, 'clear');
    render(
      <QueryClientProvider client={queryClient}>
        <CrmAuthProvider>
          <Probe />
        </CrmAuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('a@x.test'));
    await waitFor(() => expect(screen.getByTestId('query')).toHaveTextContent('loaded'));
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears the cache when the signed-in user logs out', async () => {
    const clear = vi.spyOn(queryClient, 'clear');
    render(
      <QueryClientProvider client={queryClient}>
        <CrmAuthProvider>
          <Probe />
        </CrmAuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('a@x.test'));
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
