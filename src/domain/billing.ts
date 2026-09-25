/**
 * Pure date + money math for recurring bills. Dates are plain "YYYY-MM-DD"
 * strings and all arithmetic is done on calendar fields (or UTC days), so the
 * results never depend on the device time zone or daylight saving.
 */
import type { Bill, Frequency, Income, Payment } from './schema';

export type YMD = { y: number; m: number; d: number }; // m is 1-12

export function parseISODate(iso: string): YMD {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function toISODate({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Today's date in the user's local calendar. */
export function todayISO(now = new Date()): string {
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISODate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

function daysBetween(a: string, b: string): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000,
  );
}

const monthIndex = ({ y, m }: YMD) => y * 12 + (m - 1);

const MONTH_STEP: Record<Exclude<Frequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/**
 * All due dates of `bill` between `start` and `end` (inclusive), in order.
 * A due day that doesn't exist in a month is moved to that month's last day
 * (the 31st becomes the 30th, or Feb 28/29), without drifting later months.
 */
export function occurrencesInRange(bill: Bill, start: string, end: string): string[] {
  const from = bill.anchorDate > start ? bill.anchorDate : start;
  const to = bill.endDate && bill.endDate < end ? bill.endDate : end;
  if (from > to) return [];

  const out: string[] = [];
  if (bill.frequency === 'weekly') {
    const offset = daysBetween(bill.anchorDate, from);
    let cur = addDays(bill.anchorDate, Math.ceil(offset / 7) * 7);
    while (cur <= to) {
      out.push(cur);
      cur = addDays(cur, 7);
    }
    return out;
  }

  const step = MONTH_STEP[bill.frequency];
  const anchor = parseISODate(bill.anchorDate);
  const anchorIdx = monthIndex(anchor);
  const firstIdx = monthIndex(parseISODate(from));
  const lastIdx = monthIndex(parseISODate(to));
  let k = Math.max(0, Math.floor((firstIdx - anchorIdx) / step));
  for (let idx = anchorIdx + k * step; idx <= lastIdx; k++, idx = anchorIdx + k * step) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const date = toISODate({ y, m, d: Math.min(anchor.d, daysInMonth(y, m)) });
    if (date >= from && date <= to) out.push(date);
  }
  return out;
}

export type Period = { kind: 'month' | 'year'; start: string; end: string; label: string };

export function monthPeriod(year: number, month: number): Period {
  const start = toISODate({ y: year, m: month, d: 1 });
  const end = toISODate({ y: year, m: month, d: daysInMonth(year, month) });
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { kind: 'month', start, end, label };
}

export function yearPeriod(year: number): Period {
  return { kind: 'year', start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
}

const PER_YEAR: Record<Frequency, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

/** Income is spread evenly: a month gets 1/12 of the yearly total. */
export function incomeForPeriod(incomes: Income[], kind: Period['kind']): number {
  const yearly = incomes.reduce((sum, i) => sum + i.amountCents * PER_YEAR[i.frequency], 0);
  return kind === 'year' ? yearly : Math.round(yearly / 12);
}

/** Average monthly cost of a bill, e.g. a $120/yr bill -> $10/mo. */
export function monthlyEquivalent(bill: Pick<Bill, 'amountCents' | 'frequency'>): number {
  return Math.round((bill.amountCents * PER_YEAR[bill.frequency]) / 12);
}

export const paymentKey = (billId: string, dueDate: string) => `${billId}|${dueDate}`;

export type Occurrence = {
  bill: Bill;
  dueDate: string;
  amountCents: number;
  paid: boolean;
};

export type PeriodSummary = {
  /** Every bill due in the period, whether paid or not. */
  totalDue: number;
  paid: number;
  /** Still to be paid in the period. */
  remaining: number;
  income: number;
  /** Income minus all bills due in the period; negative means a shortfall. */
  leftToSpend: number;
  occurrences: Occurrence[];
};

export function summarize(
  bills: Bill[],
  payments: Payment[],
  incomes: Income[],
  period: Period,
): PeriodSummary {
  const paidByKey = new Map(payments.map((p) => [paymentKey(p.billId, p.dueDate), p]));
  const occurrences: Occurrence[] = [];
  for (const bill of bills) {
    for (const dueDate of occurrencesInRange(bill, period.start, period.end)) {
      const payment = paidByKey.get(paymentKey(bill.id, dueDate));
      occurrences.push({
        bill,
        dueDate,
        amountCents: payment?.amountCents ?? bill.amountCents,
        paid: payment !== undefined,
      });
    }
  }
  occurrences.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.bill.name.localeCompare(b.bill.name),
  );

  const totalDue = occurrences.reduce((s, o) => s + o.amountCents, 0);
  const paid = occurrences.reduce((s, o) => s + (o.paid ? o.amountCents : 0), 0);
  const income = incomeForPeriod(incomes, period.kind);
  return {
    totalDue,
    paid,
    remaining: totalDue - paid,
    income,
    leftToSpend: income - totalDue,
    occurrences,
  };
}

/** The next due date on or after `from`, looking ahead up to two years. */
export function nextDueDate(bill: Bill, from: string): string | null {
  const { y, m, d } = parseISODate(from);
  const horizon = toISODate({ y: y + 2, m, d: Math.min(d, daysInMonth(y + 2, m)) });
  return occurrencesInRange(bill, from, horizon)[0] ?? null;
}
