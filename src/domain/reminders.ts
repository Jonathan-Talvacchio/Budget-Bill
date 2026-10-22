/**
 * Which bills to remind about. Pure logic; showing the notification lives in
 * src/platform/notifications and scheduling in src/state/use-reminders.
 */
import { addDays, occurrencesInRange, paymentKey } from './billing';
import type { Bill, Payment } from './schema';

export type DueReminder = { bill: Bill; dueDate: string; key: string };

/** Unpaid occurrences due from today through `daysBefore` days ahead that haven't been reminded yet. */
export function dueReminders(
  bills: Bill[],
  payments: Payment[],
  reminded: readonly string[],
  today: string,
  daysBefore: number,
): DueReminder[] {
  const paid = new Set(payments.map((p) => paymentKey(p.billId, p.dueDate)));
  const done = new Set(reminded);
  const end = addDays(today, daysBefore);
  const out: DueReminder[] = [];
  for (const bill of bills) {
    for (const dueDate of occurrencesInRange(bill, today, end)) {
      const key = paymentKey(bill.id, dueDate);
      if (!paid.has(key) && !done.has(key)) out.push({ bill, dueDate, key });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.bill.name.localeCompare(b.bill.name));
}

/** Adds keys to the reminder log, dropping entries for occurrences more than 60 days old. */
export function updateReminderLog(log: readonly string[], add: readonly string[], today: string): string[] {
  const cutoff = addDays(today, -60);
  const keep = log.filter((k) => (k.split('|')[1] ?? '') >= cutoff);
  return [...new Set([...keep, ...add])].slice(-2000);
}

/** Notification text. Without details it reveals only how many bills are due. */
export function reminderMessage(
  items: DueReminder[],
  daysBefore: number,
  showDetails: boolean,
  formatMoney: (cents: number) => string,
  formatDate: (iso: string) => string,
): { title: string; body: string } {
  const n = items.length;
  const when = daysBefore === 0 ? 'today' : `in the next ${daysBefore} day${daysBefore === 1 ? '' : 's'}`;
  const title = n === 1 ? `1 bill due ${when}` : `${n} bills due ${when}`;
  if (!showDetails) return { title, body: 'Open Budget Bill to see them.' };
  const lines = items
    .slice(0, 5)
    .map((i) => `${i.bill.name} · ${formatMoney(i.bill.amountCents)} · ${formatDate(i.dueDate)}`);
  if (n > 5) lines.push(`and ${n - 5} more`);
  return { title, body: lines.join('\n') };
}
