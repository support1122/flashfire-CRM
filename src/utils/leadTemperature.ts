import { Flame, Snowflake, Sun } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * How warm a lead felt to the BDA who ran the meeting. Captured right after the
 * meeting is marked completed. Separate from `qualification` (MQL/SQL/Converted),
 * which is derived from booking status and never hand-set.
 */
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export interface LeadTemperatureOption {
  value: LeadTemperature;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Rating panel: resting state. */
  idle: string;
  /** Rating panel: currently-selected state. */
  active: string;
  /** Table badge. */
  badge: string;
}

export const TEMPERATURE_OPTIONS: LeadTemperatureOption[] = [
  {
    value: 'hot',
    label: 'Hot',
    hint: 'Ready to buy',
    icon: Flame,
    idle: 'border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-700',
    active: 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-200',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    value: 'warm',
    label: 'Warm',
    hint: 'Interested, needs nurturing',
    icon: Sun,
    idle: 'border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-slate-700',
    active: 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-200',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    value: 'cold',
    label: 'Cold',
    hint: 'Not a fit right now',
    icon: Snowflake,
    idle: 'border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-700',
    active: 'border-sky-500 bg-sky-50 text-sky-700 ring-2 ring-sky-200',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
];

export const temperatureOption = (value?: LeadTemperature | null): LeadTemperatureOption | null =>
  TEMPERATURE_OPTIONS.find((o) => o.value === value) ?? null;
