import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CrmPermission, CrmUser } from './crmTypes';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface CrmAuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: CrmUser | null;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: CrmPermission) => boolean;
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

  const verifyOtp = useCallback(async (email: string, otp: string, rememberMe: boolean = false) => {
    const res = await fetch(`${API_BASE_URL}/api/crm/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, rememberMe }),
    });
    const body = await safeJson(res);
    if (!res.ok || !body?.token) {
      throw new Error(body?.error || 'Invalid OTP');
    }
    localStorage.setItem(TOKEN_KEY, body.token);
    setToken(body.token);
    setUser(body.user);
    setStatus('authenticated');
  }, []);

  const hasPermission = useCallback(
    (permission: CrmPermission) => {
      return !!user?.permissions?.includes(permission);
    },
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

  const value = useMemo<CrmAuthContextValue>(
    () => ({
      status,
      token,
      user,
      requestOtp,
      verifyOtp,
      logout,
      hasPermission,
    }),
    [hasPermission, logout, requestOtp, status, token, user, verifyOtp]
  );

  return <CrmAuthContext.Provider value={value}>{children}</CrmAuthContext.Provider>;
}

export function useCrmAuth() {
  const ctx = useContext(CrmAuthContext);
  if (!ctx) throw new Error('useCrmAuth must be used within CrmAuthProvider');
  return ctx;
}


