import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

/**
 * Zoom outbound-call helpers shared by every Call button in the CRM.
 *
 * Three concerns, each backed by a module-level singleton so a table with
 * hundreds of rows still makes at most one request of each kind:
 *   - useCallerNumbers: the agent's allowed "call from" numbers (fetched once)
 *   - useAgentPresence: the logged-in agent's availability (one ref-counted poller)
 *   - useLiveCall:      live status of a specific call after the agent dials
 */

export interface CallerNumber {
  number: string;
  label: string | null;
  status: string;
  live: boolean;
}

export type PresenceStatus = 'available' | 'busy' | 'on_call' | 'away' | 'offline' | 'unknown';

const SELECTED_KEY = 'flashfire_crm_caller_id';
const digitsOf = (s: string) => (s || '').replace(/\D+/g, '');

// ---------------------------------------------------------------------------
// Caller numbers (shared across all buttons)
// ---------------------------------------------------------------------------
let numbersCache: { email: string; data: CallerNumber[]; source: string } | null = null;
let numbersPromise: Promise<void> | null = null;
let selectedNumber: string | null = localStorage.getItem(SELECTED_KEY);
const numberListeners = new Set<() => void>();
const emitNumbers = () => numberListeners.forEach((l) => l());

export function setSelectedCallerId(num: string | null) {
  selectedNumber = num;
  if (num) localStorage.setItem(SELECTED_KEY, num);
  else localStorage.removeItem(SELECTED_KEY);
  emitNumbers();
}

async function ensureNumbers(token: string | null, email: string) {
  if (numbersCache && numbersCache.email === email) return;
  if (numbersPromise) return numbersPromise;
  numbersPromise = (async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/crm/zoom-phone/numbers`, { headers });
      const json = await res.json();
      const data: CallerNumber[] = Array.isArray(json?.numbers) ? json.numbers : [];
      numbersCache = { email, data, source: json?.source || 'none' };
      // Keep the stored selection if it is still offered; otherwise default to
      // the first live number (or the first number at all).
      const stillValid = selectedNumber && data.some((n) => digitsOf(n.number) === digitsOf(selectedNumber!));
      if (!stillValid) {
        const fallback = data.find((n) => n.live) || data[0] || null;
        selectedNumber = fallback ? fallback.number : null;
        if (selectedNumber) localStorage.setItem(SELECTED_KEY, selectedNumber);
        else localStorage.removeItem(SELECTED_KEY);
      }
    } catch {
      numbersCache = { email, data: [], source: 'none' };
    } finally {
      numbersPromise = null;
      emitNumbers();
    }
  })();
  return numbersPromise;
}

export function useCallerNumbers(token: string | null, email: string | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    numberListeners.add(l);
    if (email) ensureNumbers(token, email.toLowerCase());
    return () => {
      numberListeners.delete(l);
    };
  }, [token, email]);

  return {
    numbers: numbersCache?.data ?? [],
    source: numbersCache?.source ?? 'none',
    selected: selectedNumber,
    setSelected: setSelectedCallerId,
  };
}

// ---------------------------------------------------------------------------
// Agent presence (single logged-in agent — one poller for the whole page)
// ---------------------------------------------------------------------------
let presenceCache: { email: string; status: PresenceStatus; onCall: boolean } | null = null;
let presenceRefCount = 0;
let presenceInterval: ReturnType<typeof setInterval> | null = null;
const presenceListeners = new Set<() => void>();

async function fetchPresence(token: string | null, email: string) {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/api/crm/agents/${encodeURIComponent(email)}/presence`, { headers });
    const json = await res.json();
    const next = {
      email: email.toLowerCase(),
      status: (json?.status as PresenceStatus) || 'unknown',
      onCall: !!json?.onCall,
    };
    // Only re-render subscribers when the value actually changed — a table with
    // many rows should not repaint on every 30s poll that returns the same state.
    const changed =
      !presenceCache ||
      presenceCache.email !== next.email ||
      presenceCache.status !== next.status ||
      presenceCache.onCall !== next.onCall;
    presenceCache = next;
    if (changed) presenceListeners.forEach((l) => l());
  } catch {
    /* keep last known */
  }
}

export function useAgentPresence(token: string | null, email: string | null) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!email) return;
    const l = () => force((x) => x + 1);
    presenceListeners.add(l);
    presenceRefCount += 1;
    if (!presenceInterval) {
      fetchPresence(token, email);
      presenceInterval = setInterval(() => fetchPresence(token, email), 30_000);
    }
    return () => {
      presenceListeners.delete(l);
      presenceRefCount -= 1;
      if (presenceRefCount <= 0 && presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
        presenceRefCount = 0;
      }
    };
  }, [token, email]);

  const p = presenceCache && email && presenceCache.email === email.toLowerCase() ? presenceCache : null;
  return { status: p?.status ?? ('unknown' as PresenceStatus), onCall: p?.onCall ?? false };
}

// ---------------------------------------------------------------------------
// Live call status for one lead (polled only after the agent clicks Call)
// ---------------------------------------------------------------------------
export type LivePhase = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'missed';

const TERMINAL = new Set(['completed', 'missed', 'voicemail', 'cancelled', 'busy']);

export function useLiveCall(token: string | null, leadPhone: string | null, agentEmail: string | null) {
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active || !leadPhone) return;
    let cancelled = false;
    const startedAt = Date.now();
    const MAX_MS = 150_000; // stop polling after ~2.5 min

    const poll = async () => {
      if (cancelled) return;
      try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const params = new URLSearchParams({ phone: leadPhone });
        if (agentEmail) params.set('agentEmail', agentEmail);
        const res = await fetch(`${API_BASE_URL}/api/crm/call-logs/live?${params}`, { headers });
        const json = await res.json();
        if (cancelled) return;
        const call = json?.call;
        if (call) {
          const s = String(call.status || '').toLowerCase();
          if (s === 'ringing') setPhase('ringing');
          else if (s === 'answered') setPhase('connected');
          else if (s === 'missed') setPhase('missed');
          else if (TERMINAL.has(s)) setPhase('ended');
          else setPhase((p) => (p === 'dialing' ? 'dialing' : p));
          if (TERMINAL.has(s)) {
            setActive(false);
            return;
          }
        }
      } catch {
        /* ignore, keep polling */
      }
      if (Date.now() - startedAt > MAX_MS) {
        setActive(false);
        return;
      }
    };

    poll();
    const t = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active, leadPhone, agentEmail, token]);

  const start = () => {
    setPhase('dialing');
    setActive(true);
  };

  return { phase, active, start };
}
