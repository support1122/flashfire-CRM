import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CrmModule, CrmPermission, CrmUser } from './crmTypes';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export type VerifyOtpResult =
  | { status: 'authenticated' }
  | { status: 'pending_approval'; approvalId: string };

interface CrmAuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: CrmUser | null;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string, rememberMe?: boolean) => Promise<VerifyOtpResult>;
  pollLoginApproval: (approvalId: string) => Promise<'pending' | 'denied' | 'approved'>;
  logout: () => void;
  hasPermission: (permission: CrmPermission) => boolean;
  canEdit: (module: CrmModule) => boolean;
}

const CrmAuthContext = createContext<CrmAuthContextValue | null>(null);

const TOKEN_KEY = 'flashfire_crm_user_token';

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function CrmAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<CrmUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const requestOtp = useCallback(async (email: string) => {
    const res = await fetch(`${API_BASE_URL}/api/crm/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await safeJson(res);
      throw new Error(body?.error || 'Failed to send OTP');
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string, rememberMe: boolean = false): Promise<VerifyOtpResult> => {
    const res = await fetch(`${API_BASE_URL}/api/crm/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, rememberMe }),
    });
    const body = await safeJson(res);
    if (!res.ok || !body?.success) {
      throw new Error(body?.error || 'Invalid OTP');
    }
    if (body.pendingApproval) {
      return { status: 'pending_approval', approvalId: body.approvalId };
    }
    if (!body.token) {
      throw new Error('Unexpected response from server');
    }
    localStorage.setItem(TOKEN_KEY, body.token);
    setToken(body.token);
    setUser(body.user);
    setStatus('authenticated');
    return { status: 'authenticated' };
  }, []);

  const pollLoginApproval = useCallback(async (approvalId: string): Promise<'pending' | 'denied' | 'approved'> => {
    const res = await fetch(`${API_BASE_URL}/api/crm/auth/login-approval/${approvalId}/status`);
    const body = await safeJson(res);
    if (!res.ok || !body?.success) {
      throw new Error(body?.error || 'Failed to check approval status');
    }
    if (body.status === 'approved' && body.token) {
      localStorage.setItem(TOKEN_KEY, body.token);
      setToken(body.token);
      setUser(body.user);
      setStatus('authenticated');
    }
    return body.status;
  }, []);

  const hasPermission = useCallback(
    (permission: CrmPermission) => {
      const perms = user?.permissions;
      if (!perms) return false;
      if (perms.includes(permission)) return true;
      // Holding `<module>_edit` implies view access for that module.
      if (!permission.endsWith('_edit')) {
        return perms.includes(`${permission}_edit` as CrmPermission);
      }
      return false;
    },
    [user]
  );

  const canEdit = useCallback(
    (module: CrmModule) => !!user?.permissions?.includes(`${module}_edit` as CrmPermission),
    [user]
  );

  const loadMe = useCallback(async () => {
    const existingToken = localStorage.getItem(TOKEN_KEY);
    if (!existingToken) {
      setStatus('unauthenticated');
      setUser(null);
      setToken(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/auth/me`, {
        headers: {
          Authorization: `Bearer ${existingToken}`,
        },
      });
      const body = await safeJson(res);
      if (!res.ok || !body?.user) {
        logout();
        return;
      }
      setToken(existingToken);
      setUser(body.user);
      setStatus('authenticated');
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Poll for revocation while logged in, so a session killed from the admin panel
  // (or "My Sessions") logs the device out within seconds instead of waiting for
  // the user to trigger some other API call first.
  useEffect(() => {
    if (status !== 'authenticated' || !token) return;

    const checkStillValid = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/crm/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          logout();
        }
      } catch {
        // Network hiccup — don't log the user out over a transient failure.
      }
    };

    const id = setInterval(checkStillValid, 7000);
    return () => clearInterval(id);
  }, [status, token, logout]);

  const value = useMemo<CrmAuthContextValue>(
    () => ({
      status,
      token,
      user,
      requestOtp,
      verifyOtp,
      pollLoginApproval,
      logout,
      hasPermission,
      canEdit,
    }),
    [canEdit, hasPermission, logout, pollLoginApproval, requestOtp, status, token, user, verifyOtp]
  );

  return <CrmAuthContext.Provider value={value}>{children}</CrmAuthContext.Provider>;
}

export function useCrmAuth() {
  const ctx = useContext(CrmAuthContext);
  if (!ctx) throw new Error('useCrmAuth must be used within CrmAuthProvider');
  return ctx;
}


