/**
 * Money is stored as integer minor units (cents) to avoid floating-point drift.
 * All supported currencies use two decimal places (see CURRENCIES).
 */
import type { Currency } from './schema';

/**
 * Parses user input like "12", "12.5", "1,234.56" or "$9.99" into cents.
 * Returns null for anything that isn't a clean non-negative amount.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[\s,$€£₹]/g, '');
  if (!/^\d{1,10}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Renders cents as a plain editable string, e.g. 1999 -> "19.99". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(cents: number, currency: Currency): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    formatters.set(currency, fmt);
  }
  return fmt.format(cents / 100);
}
