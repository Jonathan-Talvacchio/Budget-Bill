/**
 * Single source of truth for the vault's data shape. Every object loaded from
 * storage or imported from a backup file is parsed through these schemas, so
 * malformed or hostile data never reaches the UI.
 */
import { z } from 'zod';

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const CATEGORIES = [
  'housing',
  'utilities',
  'phone-internet',
  'streaming',
  'music-audio',
  'software-cloud',
  'insurance',
  'transportation',
  'loans-debt',
  'health-fitness',
  'memberships',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Only 2-decimal currencies for now, so stored minor units never need rescaling. */
export const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF', 'MXN', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30] as const;

/**
 * How income is counted in a month/year:
 * - 'spread': the yearly total is spread evenly (each month gets 1/12)
 * - 'paydays': each paycheck counts in the period it is paid (needs Income.anchorDate)
 */
export const INCOME_MODES = ['spread', 'paydays'] as const;
export type IncomeMode = (typeof INCOME_MODES)[number];

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isoDate = z.string().regex(ISO_DATE, 'Expected YYYY-MM-DD');

/** Amounts are integer minor units (cents). Capped to keep sums well inside safe integers. */
const cents = z.number().int().min(0).max(1_000_000_000_00);
const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);

export const billSchema = z.object({
  id,
  name: text(80).min(1),
  catalogId: text(64).optional(),
  category: z.enum(CATEGORIES),
  amountCents: cents,
  frequency: z.enum(FREQUENCIES),
  /** First due date; later occurrences repeat from here. */
  anchorDate: isoDate,
  endDate: isoDate.optional(),
  notes: text(500).optional(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type Bill = z.infer<typeof billSchema>;

export const paymentSchema = z.object({
  billId: id,
  /** The occurrence this payment settles. */
  dueDate: isoDate,
  paidAt: z.string().max(40),
  amountCents: cents,
});
export type Payment = z.infer<typeof paymentSchema>;

export const incomeSchema = z.object({
  id,
  label: text(60).min(1),
  amountCents: cents,
  frequency: z.enum(FREQUENCIES),
  /** A payday; later paydays repeat from here. Needed for the 'paydays' income mode. */
  anchorDate: isoDate.optional(),
});
export type Income = z.infer<typeof incomeSchema>;

export const settingsSchema = z.object({
  currency: z.enum(CURRENCIES),
  autoLockMinutes: z.number().int().min(1).max(60),
  // Defaulted so vaults and backups saved before this setting existed still load.
  incomeMode: z.enum(INCOME_MODES).default('spread'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const vaultSchema = z.object({
  version: z.literal(1),
  bills: z.array(billSchema).max(2000),
  payments: z.array(paymentSchema).max(50000),
  incomes: z.array(incomeSchema).max(100),
  settings: settingsSchema,
});
export type Vault = z.infer<typeof vaultSchema>;

export function emptyVault(settings?: Partial<Settings>): Vault {
  return {
    version: 1,
    bills: [],
    payments: [],
    incomes: [],
    settings: { currency: 'USD', autoLockMinutes: 5, incomeMode: 'spread', ...settings },
  };
}

export const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  utilities: 'Utilities',
  'phone-internet': 'Phone & Internet',
  streaming: 'Streaming',
  'music-audio': 'Music & Audio',
  'software-cloud': 'Software & Cloud',
  insurance: 'Insurance',
  transportation: 'Transportation',
  'loans-debt': 'Loans & Debt',
  'health-fitness': 'Health & Fitness',
  memberships: 'Memberships',
  other: 'Other',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
