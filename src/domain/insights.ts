/**
 * Read-only summaries for the Insights screen. Pure functions over the vault,
 * so they are unit-tested like the billing math.
 */
import { monthlyEquivalent, nextDueDate, yearlyCost } from './billing';
import { SUBSCRIPTION_CATEGORIES, type Bill, type Category } from './schema';

/** Bills that still have an upcoming due date (ended bills are left out of totals). */
export function activeBills(bills: Bill[], today: string): Bill[] {
  return bills.filter((b) => nextDueDate(b, today) !== null);
}

export type CategoryTotal = { category: Category; monthlyCents: number; count: number };

/** Average monthly cost per category, largest first. */
export function categoryTotals(bills: Bill[], today: string): CategoryTotal[] {
  const totals = new Map<Category, CategoryTotal>();
  for (const bill of activeBills(bills, today)) {
    const t = totals.get(bill.category) ?? { category: bill.category, monthlyCents: 0, count: 0 };
    t.monthlyCents += monthlyEquivalent(bill);
    t.count += 1;
    totals.set(bill.category, t);
  }
  return [...totals.values()].sort((a, b) => b.monthlyCents - a.monthlyCents);
}

export type SubscriptionAudit = {
  items: { bill: Bill; yearlyCents: number }[];
  yearlyTotal: number;
};

const SUBSCRIPTIONS = new Set<Category>(SUBSCRIPTION_CATEGORIES);

/** Active subscriptions (streaming, music, software, memberships) by yearly cost. */
export function subscriptionAudit(bills: Bill[], today: string): SubscriptionAudit {
  const items = activeBills(bills, today)
    .filter((b) => SUBSCRIPTIONS.has(b.category))
    .map((bill) => ({ bill, yearlyCents: yearlyCost(bill) }))
    .sort((a, b) => b.yearlyCents - a.yearlyCents || a.bill.name.localeCompare(b.bill.name));
  return { items, yearlyTotal: items.reduce((s, i) => s + i.yearlyCents, 0) };
}

export type PriceChange = { bill: Bill; date: string; fromCents: number; toCents: number };

/** Every recorded price change of a bill, oldest first. */
export function priceChanges(bill: Bill): PriceChange[] {
  const history = bill.priceHistory ?? [];
  return history.map((h, i) => ({
    bill,
    date: h.until,
    fromCents: h.amountCents,
    toCents: history[i + 1]?.amountCents ?? bill.amountCents,
  }));
}

/** Price changes on or after `since` across all bills, newest first. */
export function recentPriceChanges(bills: Bill[], since: string): PriceChange[] {
  return bills
    .flatMap(priceChanges)
    .filter((c) => c.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Returns `next` with its price history carried over from `prev`. If the
 * amount changed, the old amount is recorded as ending on `today`. Several
 * edits on the same day count as one change, and editing back to the original
 * price that day removes it.
 */
export function withPriceChange(prev: Bill | undefined, next: Bill, today: string): Bill {
  const history = prev?.priceHistory ?? [];
  const withHistory = (h: NonNullable<Bill['priceHistory']>): Bill => ({
    ...next,
    priceHistory: h.length ? h : undefined,
  });
  if (!prev || prev.amountCents === next.amountCents) return withHistory(history);
  const last = history[history.length - 1];
  if (last?.until === today) {
    return withHistory(last.amountCents === next.amountCents ? history.slice(0, -1) : history);
  }
  return withHistory([...history, { amountCents: prev.amountCents, until: today }].slice(-100));
}
