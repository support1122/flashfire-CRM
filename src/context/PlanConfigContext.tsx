import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

export type PlanName = 'PRIME' | 'IGNITE' | 'PROFESSIONAL' | 'EXECUTIVE';

export interface PlanOption {
  key: PlanName;
  label: string;
  price: number;
  displayPrice: string;
  currency: string;
}

export interface IncentiveConfigEntry {
  incentivePerLeadInr: number;
  basePriceUsd: number;
}

interface PlanConfigState {
  planOptions: PlanOption[];
  incentiveConfig: Record<PlanName, IncentiveConfigEntry>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEFAULT_INCENTIVE_ENTRY: IncentiveConfigEntry = { incentivePerLeadInr: 0, basePriceUsd: 0 };
const DEFAULT_PLAN_OPTIONS: PlanOption[] = [
  { key: 'PRIME', label: 'PRIME', price: 99, displayPrice: '$99', currency: 'USD' },
  { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199', currency: 'USD' },
  { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349', currency: 'USD' },
  { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599', currency: 'USD' },
];

const PlanConfigContext = createContext<PlanConfigState | null>(null);

export function PlanConfigProvider({ children }: { children: React.ReactNode }) {
  const { token } = useCrmAuth();
  const [planOptions, setPlanOptions] = useState<PlanOption[]>(DEFAULT_PLAN_OPTIONS);
  const [incentiveConfig, setIncentiveConfig] = useState<Record<PlanName, IncentiveConfigEntry>>({
    PRIME: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 99 },
    IGNITE: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 199 },
    PROFESSIONAL: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 349 },
    EXECUTIVE: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 599 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bda/incentives/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!body.success || !Array.isArray(body.configs)) {
        throw new Error(body.message || 'Failed to load plan config');
      }
      const options: PlanOption[] = [];
      const config: Record<PlanName, IncentiveConfigEntry> = {
        PRIME: { incentivePerLeadInr: 0, basePriceUsd: 99 },
        IGNITE: { incentivePerLeadInr: 0, basePriceUsd: 199 },
        PROFESSIONAL: { incentivePerLeadInr: 0, basePriceUsd: 349 },
        EXECUTIVE: { incentivePerLeadInr: 0, basePriceUsd: 599 },
      };
      for (const c of body.configs) {
        const name = c.planName as PlanName;
        const basePriceUsd = c.basePriceUsd != null ? Number(c.basePriceUsd) : (config[name]?.basePriceUsd ?? 0);
        const incentivePerLeadInr = Number(c.incentivePerLeadInr) ?? 0;
        if (['PRIME', 'IGNITE', 'PROFESSIONAL', 'EXECUTIVE'].includes(name)) {
          options.push({
            key: name,
            label: name,
            price: basePriceUsd,
            displayPrice: `$${basePriceUsd}`,
            currency: c.currency || 'USD',
          });
          config[name] = { incentivePerLeadInr, basePriceUsd };
        }
      }
      if (options.length > 0) {
        setPlanOptions(options);
        setIncentiveConfig(config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan config');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const value: PlanConfigState = {
    planOptions,
    incentiveConfig,
    loading,
    error,
    refetch: fetchConfig,
  };

  return (
    <PlanConfigContext.Provider value={value}>
      {children}
    </PlanConfigContext.Provider>
  );
}

export function usePlanConfig(): PlanConfigState {
  const ctx = useContext(PlanConfigContext);
  if (!ctx) {
    return {
      planOptions: DEFAULT_PLAN_OPTIONS,
      incentiveConfig: {
        PRIME: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 99 },
        IGNITE: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 199 },
        PROFESSIONAL: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 349 },
        EXECUTIVE: { ...DEFAULT_INCENTIVE_ENTRY, basePriceUsd: 599 },
      },
      loading: false,
      error: null,
      refetch: async () => {},
    };
  }
  return ctx;
}
