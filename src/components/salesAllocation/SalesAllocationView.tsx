import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCrmAuth } from '../../auth/CrmAuthContext';
import { useSalesAllocations } from '../../api/salesAllocation';
import AdminAllocations from './AdminAllocations';
import BdaAllocations from './BdaAllocations';
import FinesSwitch from '../attendance/FinesSwitch';
import { errorMessage } from './helpers';

/** Reads the Discord deep link (?id=<allocationId>) once, on mount. */
function readDeepLinkId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('id');
  } catch {
    return null;
  }
}

/**
 * Sales lead allocation tab. The server says who the caller is (`isAdmin`), so the UI never guesses:
 * admins get the scheduler plus every call, BDAs get their own calls.
 */
export default function SalesAllocationView() {
  const { token } = useCrmAuth();
  const [deepLinkId] = useState(readDeepLinkId);
  // Same key as the admin list's default tab, so admins do not pay for a second request.
  const probe = useSalesAllocations(token, { scope: deepLinkId ? 'all' : 'upcoming', status: '', bdaEmail: '' });

  if (probe.isLoading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading sales calls
      </p>
    );
  }
  if (probe.isError || !probe.data) {
    return (
      <div role="alert" className="space-y-2 py-10">
        <p className="text-sm text-rose-600">{errorMessage(probe.error, 'Could not load sales calls')}</p>
        <button
          type="button"
          onClick={() => probe.refetch()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Try again
        </button>
      </div>
    );
  }

  if (probe.data.isAdmin) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Sales lead allocation</h1>
          <p className="mt-1 text-sm text-slate-500">Book a call with a lead and hand it to a BDA who is free.</p>
        </header>
        {/* The same global switch as the Deductions tab: one setting, so flipping it here applies everywhere. */}
        <FinesSwitch token={token} />
        <AdminAllocations token={token} highlightId={deepLinkId} initialScope={deepLinkId ? 'all' : 'upcoming'} />
      </div>
    );
  }
  return <BdaAllocations token={token} highlightId={deepLinkId} />;
}
