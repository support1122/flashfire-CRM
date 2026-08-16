/**
 * Currency display for payment plans.
 *
 * `paymentPlan.currency` is not consistent in the database: older rows store the raw
 * symbol ("$", "₹") while newer ones store an ISO code ("USD", "CAD"). Everything here
 * accepts both, so no migration is required and legacy rows keep rendering correctly.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: 'CA$',
  EUR: '€',
  INR: '₹',
  GBP: '£',
  AUD: 'A$',
};

/** Currencies offered in the CRM's currency pickers. */
export const CURRENCY_OPTIONS = ['USD', 'CAD', 'EUR', 'GBP'] as const;

/** Legacy rows store the symbol itself instead of an ISO code — map those back. */
const LEGACY_SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  'CA$': 'CAD',
  '€': 'EUR',
  '₹': 'INR',
  '£': 'GBP',
  'A$': 'AUD',
};

/** Any stored currency value (ISO code or raw symbol) -> ISO code. Unknown -> USD. */
export function normalizeCurrency(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return 'USD';
  if (LEGACY_SYMBOL_TO_CODE[value]) return LEGACY_SYMBOL_TO_CODE[value];
  const upper = value.toUpperCase();
  return CURRENCY_SYMBOLS[upper] ? upper : 'USD';
}

export function currencySymbol(raw: string | null | undefined): string {
  return CURRENCY_SYMBOLS[normalizeCurrency(raw)] ?? '$';
}

/** "€599", "CA$749". Empty string when there is no usable amount. */
export function formatMoney(amount: number | null | undefined, raw: string | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  return `${currencySymbol(raw)}${Number(amount).toLocaleString()}`;
}

/**
 * Label for a stored plan. A stored `displayPrice` is only trusted when its symbol matches
 * the record's own currency — otherwise it is stale (e.g. "$599" left on a EUR record by an
 * older code path) and the label is rebuilt from price + currency instead.
 */
export function formatPlanPrice(
  plan: { price?: number | null; currency?: string | null; displayPrice?: string | null } | null | undefined
): string {
  if (!plan) return '';
  const symbol = currencySymbol(plan.currency);
  const stored = plan.displayPrice?.toString().trim() ?? '';
  const lower = stored.toLowerCase();
  const storedUsable =
    !!stored && lower !== 'null' && lower !== 'undefined' && lower !== '$null' && lower !== '$undefined';

  if (storedUsable && stored.startsWith(symbol)) return stored;
  return formatMoney(plan.price, plan.currency);
}
