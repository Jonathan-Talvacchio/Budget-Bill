/**
 * @jest-environment node
 */
import {
  categoryTotals,
  priceChanges,
  recentPriceChanges,
  subscriptionAudit,
  withPriceChange,
} from '../insights';
import { dueReminders, reminderMessage, updateReminderLog } from '../reminders';
import type { Bill } from '../schema';

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: overrides.id ?? overrides.name ?? 'b',
    name: 'Bill',
    category: 'other',
    amountCents: 1000,
    frequency: 'monthly',
    anchorDate: '2026-01-15',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const TODAY = '2026-10-21';
const rent = bill({ name: 'Rent', category: 'housing', amountCents: 150000 });
const netflix = bill({ name: 'Netflix', category: 'streaming', amountCents: 1599 });
const spotify = bill({ name: 'Spotify', category: 'music-audio', amountCents: 1199 });
const prime = bill({ name: 'Prime', category: 'memberships', amountCents: 13900, frequency: 'yearly' });
const ended = bill({ name: 'Old gym', category: 'health-fitness', amountCents: 5000, endDate: '2026-05-15' });

describe('categoryTotals', () => {
  it('sums monthly cost per category, largest first, ignoring ended bills', () => {
    expect(categoryTotals([netflix, rent, spotify, prime, ended], TODAY)).toEqual([
      { category: 'housing', monthlyCents: 150000, count: 1 },
      { category: 'streaming', monthlyCents: 1599, count: 1 },
      { category: 'music-audio', monthlyCents: 1199, count: 1 },
      { category: 'memberships', monthlyCents: 1158, count: 1 },
    ]);
  });
});

describe('subscriptionAudit', () => {
  it('lists subscriptions by yearly cost', () => {
    const audit = subscriptionAudit([rent, netflix, spotify, prime, ended], TODAY);
    expect(audit.items.map((i) => [i.bill.name, i.yearlyCents])).toEqual([
      ['Netflix', 19188],
      ['Spotify', 14388],
      ['Prime', 13900],
    ]);
    expect(audit.yearlyTotal).toBe(19188 + 14388 + 13900);
  });
});

describe('price history', () => {
  it('records a change when the amount is edited', () => {
    const next = withPriceChange(netflix, { ...netflix, amountCents: 1799 }, '2026-03-01');
    expect(next.priceHistory).toEqual([{ amountCents: 1599, until: '2026-03-01' }]);
    expect(priceChanges(next)).toEqual([{ bill: next, date: '2026-03-01', fromCents: 1599, toCents: 1799 }]);
  });

  it('keeps history across edits that do not change the amount', () => {
    const v2 = withPriceChange(netflix, { ...netflix, amountCents: 1799 }, '2026-03-01');
    const v3 = withPriceChange(v2, { ...netflix, amountCents: 1799, name: 'Netflix 4K' }, '2026-04-01');
    expect(v3.priceHistory).toEqual(v2.priceHistory);
  });

  it('chains several changes', () => {
    const v2 = withPriceChange(netflix, { ...netflix, amountCents: 1799 }, '2025-06-01');
    const v3 = withPriceChange(v2, { ...netflix, amountCents: 1999 }, '2026-03-01');
    expect(priceChanges(v3).map((c) => [c.date, c.fromCents, c.toCents])).toEqual([
      ['2025-06-01', 1599, 1799],
      ['2026-03-01', 1799, 1999],
    ]);
    expect(recentPriceChanges([v3, rent], '2026-01-01').map((c) => c.toCents)).toEqual([1999]);
  });

  it('treats several edits on one day as one change, and undoing it as none', () => {
    const a = withPriceChange(netflix, { ...netflix, amountCents: 1799 }, TODAY);
    const b = withPriceChange(a, { ...netflix, amountCents: 1899 }, TODAY);
    expect(b.priceHistory).toEqual([{ amountCents: 1599, until: TODAY }]);
    const c = withPriceChange(b, { ...netflix, amountCents: 1599 }, TODAY);
    expect(c.priceHistory).toBeUndefined();
  });

  it('does nothing for new bills', () => {
    expect(withPriceChange(undefined, netflix, TODAY).priceHistory).toBeUndefined();
  });
});

describe('reminders', () => {
  const water = bill({ id: 'w', name: 'Water', anchorDate: '2026-01-23', amountCents: 4500 });
  const phone = bill({ id: 'p', name: 'Phone', anchorDate: '2026-01-21', amountCents: 6000 });
  const later = bill({ id: 'l', name: 'Later', anchorDate: '2026-01-30' });

  it('finds unpaid, un-reminded bills in the window', () => {
    const due = dueReminders([water, phone, later], [], [], TODAY, 3);
    expect(due.map((d) => [d.bill.name, d.dueDate])).toEqual([
      ['Phone', '2026-10-21'],
      ['Water', '2026-10-23'],
    ]);
    const paid = [{ billId: 'p', dueDate: '2026-10-21', paidAt: '', amountCents: 6000 }];
    expect(dueReminders([water, phone], paid, ['w|2026-10-23'], TODAY, 3)).toEqual([]);
    expect(dueReminders([water, phone], [], [], TODAY, 0).map((d) => d.bill.name)).toEqual(['Phone']);
  });

  it('prunes old log entries', () => {
    expect(updateReminderLog(['a|2026-01-01', 'b|2026-10-01'], ['c|2026-10-23', 'b|2026-10-01'], TODAY)).toEqual([
      'b|2026-10-01',
      'c|2026-10-23',
    ]);
  });

  it('hides names and amounts unless details are enabled', () => {
    const due = dueReminders([water, phone], [], [], TODAY, 3);
    const money = (c: number) => `$${(c / 100).toFixed(2)}`;
    const date = (d: string) => d.slice(5);
    const plain = reminderMessage(due, 3, false, money, date);
    expect(plain).toEqual({ title: '2 bills due in the next 3 days', body: 'Open Budget Bill to see them.' });
    expect(JSON.stringify(plain)).not.toMatch(/Water|45/);
    expect(reminderMessage(due, 3, true, money, date).body).toBe('Phone · $60.00 · 10-21\nWater · $45.00 · 10-23');
    expect(reminderMessage(due.slice(0, 1), 0, false, money, date).title).toBe('1 bill due today');
  });
});
