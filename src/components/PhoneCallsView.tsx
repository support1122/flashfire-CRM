import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2, Phone, PhoneIncoming, PhoneOutgoing, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

interface CallRow {
  callId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  status: string;
  callResult?: string;
  recordingStatus?: string;
  salesEmail?: string;
  salesName?: string;
  salesNumber?: string;
  callerExtNumber?: string;
  callerDeviceType?: string;
  callerCountryIso?: string;
  leadName?: string;
  leadEmail?: string;
  leadNumber?: string;
  calleeExtNumber?: string;
  calleeCountryIso?: string;
  bookingId?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  durationSec?: number;
  callType?: string;
  connectType?: string;
  international?: boolean;
  hideCallerId?: boolean;
  endToEnd?: boolean;
  source?: 'webhook' | 'sync' | 'unknown';
  recordingUrl?: string;
  transcriptUrl?: string;
  aiSummary?: string;
}

const fmtDuration = (s = 0) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m > 0 ? `${m}m ${ss}s` : `${ss}s`;
};

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
};

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  const v = value && String(value).trim() !== '' ? String(value) : '—';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className={`text-[11px] text-slate-800 break-all ${mono ? 'font-mono' : ''}`}>{v}</div>
    </div>
  );
}

const statusColor = (s: string) => {
  if (s === 'answered' || s === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'missed') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (s === 'voicemail') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'ringing') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export default function PhoneCallsView() {
  const { token } = useCrmAuth();
  const [rows, setRows] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [transcripts, setTranscripts] = useState<Record<string, { loading: boolean; text?: string; error?: string }>>({});

  const toggleExpand = useCallback(async (call: CallRow) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(call.callId)) n.delete(call.callId);
      else n.add(call.callId);
      return n;
    });
    // Lazy-fetch the transcript on first expand if a URL exists and we don't have it yet.
    if (!expanded.has(call.callId) && call.transcriptUrl && !transcripts[call.callId]) {
      setTranscripts((t) => ({ ...t, [call.callId]: { loading: true } }));
      try {
        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(
          `${API_BASE_URL}/api/crm/call-logs/${encodeURIComponent(call.callId)}/transcript`,
          { headers }
        );
        if (!res.ok) throw new Error(`Server ${res.status}`);
        const text = await res.text();
        setTranscripts((t) => ({ ...t, [call.callId]: { loading: false, text } }));
      } catch (e) {
        setTranscripts((t) => ({
          ...t,
          [call.callId]: { loading: false, error: e instanceof Error ? e.message : 'Failed' },
        }));
      }
    }
  }, [expanded, transcripts, token]);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Array<{ bookingId: string; clientName?: string; clientEmail?: string; clientPhone?: string; scheduledEventStartTime?: string }>>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(true);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: '100' });
      if (direction !== 'all') params.append('direction', direction);
      if (search.trim()) params.append('search', search.trim());
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/call-logs/recent?${params}`, { headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server ${res.status}`);
      setRows(json.data || []);
      setTotal(json.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  }, [token, direction, search]);

  /** Pull fresh data from Zoom (calls /api/crm/call-logs/sync) then refresh the table. */
  const syncFromZoom = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncMsg(null);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/call-logs/sync?lookbackDays=30`, {
        method: 'POST',
        headers,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSyncMsg(json.error || `Sync failed (${res.status})`);
      } else {
        setSyncMsg(`Pulled ${json.fetched} call(s) • ${json.matched} matched leads`);
      }
      await Promise.all([fetchRows(), fetchGaps()]);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [token, fetchRows, fetchGaps]);

  useEffect(() => {
    const t = setTimeout(fetchRows, 300); // debounce search
    return () => clearTimeout(t);
  }, [fetchRows]);

  const fetchGaps = useCallback(async () => {
    try {
      setGapsLoading(true);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/phone-gaps/no-show?days=60&limit=200`, { headers });
      const json = await res.json();
      if (res.ok && json.success) setGaps(json.data || []);
    } catch {
      /* ignore — UI degrades gracefully */
    } finally {
      setGapsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Phone size={18} className="text-orange-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Phone Calls</h2>
            <p className="text-xs text-slate-500">Zoom Phone calls — auto-matched to leads by number.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && <span className="text-[11px] text-slate-500">{syncMsg}</span>}
          <button
            onClick={syncFromZoom}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50"
            title="Pull latest from Zoom now (also runs every 5 min)"
          >
            <RefreshCcw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from Zoom'}
          </button>
          <button
            onClick={fetchRows}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            title="Refresh table (no Zoom call)"
          >
            <RefreshCcw size={14} className={`text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lead / sales / number…"
            className="h-9 pl-8 pr-3 w-72 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(['all', 'inbound', 'outbound'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${direction === d ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}
            >
              {d === 'all' ? 'All' : d === 'inbound' ? 'Inbound' : 'Outbound'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">
          {loading ? 'Loading…' : `${rows.length} of ${total}`}
        </span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* No-show leads never called — surfaces the gap so the BDA can follow up. */}
      {(gapsLoading || gaps.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setGapsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-100/40 transition text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-700 text-base">📵</span>
              <div>
                <div className="text-sm font-bold text-amber-900">
                  {gapsLoading ? 'Checking…' : `${gaps.length} no-show lead${gaps.length === 1 ? '' : 's'} never called`}
                </div>
                <div className="text-[11px] text-amber-700">
                  Last 60 days · bookingStatus = no-show, zero outbound calls on file.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); fetchGaps(); }}
                className="p-1 rounded hover:bg-amber-100 text-amber-700"
                title="Re-check now"
              >
                <RefreshCcw size={12} className={gapsLoading ? 'animate-spin' : ''} />
              </span>
              {gapsOpen ? <ChevronDown size={14} className="text-amber-700" /> : <ChevronRight size={14} className="text-amber-700" />}
            </div>
          </button>
          {gapsOpen && gaps.length > 0 && (
            <div className="max-h-72 overflow-auto border-t border-amber-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-amber-50">
                  <tr className="text-left text-amber-800 border-b border-amber-200">
                    <th className="py-2 px-3 font-semibold">Lead</th>
                    <th className="py-2 px-3 font-semibold">Email</th>
                    <th className="py-2 px-3 font-semibold">Phone</th>
                    <th className="py-2 px-3 font-semibold">Meeting (no-show)</th>
                    <th className="py-2 px-3 font-semibold w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => (
                    <tr key={g.bookingId} className="border-b border-amber-100 hover:bg-amber-100/40">
                      <td className="py-2 px-3 text-slate-800 font-semibold">{g.clientName || '—'}</td>
                      <td className="py-2 px-3 text-slate-700">{g.clientEmail || '—'}</td>
                      <td className="py-2 px-3 text-slate-700 font-mono">{g.clientPhone || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{fmtTime(g.scheduledEventStartTime)}</td>
                      <td className="py-2 px-3">
                        {g.clientPhone ? (
                          <a
                            href={`zoomphonecall://${g.clientPhone.replace(/[^\d+]/g, '')}`}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600"
                            title={`Call ${g.clientPhone} via Zoom Phone`}
                          >
                            <Phone size={11} /> Call
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-orange-500" size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Phone size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-semibold">No calls yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Zoom Phone events will appear here. Make a test call to verify the webhook.
            Backend must have <code className="bg-slate-100 px-1 rounded">ZOOM_*</code> env vars set,
            and the Zoom Marketplace app must point at{' '}
            <code className="bg-slate-100 px-1 rounded">/api/zoom-phone/webhook</code>.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="py-2 px-2 font-semibold w-6"></th>
                  <th className="py-2 px-3 font-semibold">When</th>
                  <th className="py-2 px-3 font-semibold">Dir</th>
                  <th className="py-2 px-3 font-semibold">Sales</th>
                  <th className="py-2 px-3 font-semibold">Lead</th>
                  <th className="py-2 px-3 font-semibold">Number</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 font-semibold text-right">Duration</th>
                  <th className="py-2 px-3 font-semibold">Recording</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = expanded.has(r.callId);
                  // Always allow expand — we show full metadata (Zoom fields)
                  // even when there is no recording / transcript / AI summary.
                  const hasDetails = true;
                  return (
                    <Fragment key={r.callId}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-2 align-top">
                          {hasDetails ? (
                            <button
                              onClick={() => toggleExpand(r)}
                              className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                              title={isOpen ? 'Hide details' : 'Show what happened on the call'}
                            >
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{fmtTime(r.startedAt)}</td>
                        <td className="py-2 px-3">
                          {r.direction === 'inbound' ? (
                            <PhoneIncoming size={14} className="text-blue-600" />
                          ) : r.direction === 'outbound' ? (
                            <PhoneOutgoing size={14} className="text-emerald-600" />
                          ) : (
                            <Phone size={14} className="text-slate-400" />
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          <div className="font-semibold">{r.salesName || '—'}</div>
                          <div className="text-[10px] text-slate-500">{r.salesEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          <div className="font-semibold">{r.leadName || '—'}</div>
                          <div className="text-[10px] text-slate-500">{r.leadEmail || ''}</div>
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-mono">{r.leadNumber || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusColor(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-700 font-semibold">{fmtDuration(r.durationSec)}</td>
                        <td className="py-2 px-3">
                          {r.recordingUrl ? (
                            <audio
                              src={`${API_BASE_URL}/api/crm/call-logs/${encodeURIComponent(r.callId)}/recording`}
                              controls
                              preload="none"
                              className="h-7 w-44"
                            />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && hasDetails && (
                        <tr className="bg-slate-50/60 border-b border-slate-200">
                          <td></td>
                          <td colSpan={8} className="py-3 px-3">
                            {/* Full metadata grid */}
                            <div className="mb-3 p-3 rounded-lg bg-white border border-slate-200">
                              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px] mb-2">
                                <Phone size={12} /> Call Details
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
                                <Field label="Call ID" value={r.callId} mono />
                                <Field label="Started" value={fmtTime(r.startedAt)} />
                                <Field label="Answered" value={fmtTime(r.answeredAt)} />
                                <Field label="Ended" value={fmtTime(r.endedAt)} />
                                <Field label="Duration" value={fmtDuration(r.durationSec)} />
                                <Field label="Direction" value={r.direction} />
                                <Field label="Result" value={r.callResult || r.status} />
                                <Field label="Recording" value={r.recordingStatus || '—'} />
                                <Field label="Call type" value={r.callType} />
                                <Field label="Connect type" value={r.connectType} />
                                <Field label="International" value={r.international == null ? '—' : r.international ? 'Yes' : 'No'} />
                                <Field label="End-to-end" value={r.endToEnd == null ? '—' : r.endToEnd ? 'Yes' : 'No'} />
                                <Field label="Hide caller ID" value={r.hideCallerId == null ? '—' : r.hideCallerId ? 'Yes' : 'No'} />
                                <Field label="Source" value={r.source} />
                                <Field label="Sales name" value={r.salesName} />
                                <Field label="Sales email" value={r.salesEmail} />
                                <Field label="Sales number" value={r.salesNumber} mono />
                                <Field label="Sales ext" value={r.callerExtNumber} mono />
                                <Field label="Sales device" value={r.callerDeviceType} />
                                <Field label="Sales country" value={r.callerCountryIso} />
                                <Field label="Lead name" value={r.leadName} />
                                <Field label="Lead email" value={r.leadEmail} />
                                <Field label="Lead number" value={r.leadNumber} mono />
                                <Field label="Lead ext" value={r.calleeExtNumber} mono />
                                <Field label="Lead country" value={r.calleeCountryIso} />
                                <Field label="Matched bookingId" value={r.bookingId || '—'} mono />
                              </div>
                            </div>

                            {r.aiSummary && (
                              <div className="mb-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                                <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-[11px] mb-1">
                                  <Sparkles size={12} /> AI Summary
                                </div>
                                <p className="text-[12px] text-slate-800 whitespace-pre-wrap leading-relaxed">{r.aiSummary}</p>
                              </div>
                            )}
                            {r.transcriptUrl && (
                              <div className="p-3 rounded-lg bg-white border border-slate-200">
                                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px] mb-1">
                                  <FileText size={12} /> Transcript
                                </div>
                                {transcripts[r.callId]?.loading ? (
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <Loader2 size={12} className="animate-spin" /> Loading transcript…
                                  </div>
                                ) : transcripts[r.callId]?.error ? (
                                  <p className="text-[11px] text-rose-600">{transcripts[r.callId]?.error}</p>
                                ) : (
                                  <pre className="text-[11px] text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-auto">
                                    {transcripts[r.callId]?.text || '—'}
                                  </pre>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
