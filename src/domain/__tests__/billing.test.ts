/**
 * @jest-environment node
 */
import {
  daysInMonth,
  incomeForPeriod,
  monthlyEquivalent,
  monthPeriod,
  nextDueDate,
  occurrencesInRange,
  summarize,
  yearPeriod,
} from '../billing';
import type { Bill, Income } from '../schema';

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: overrides.id ?? 'b1',
    name: 'Test',
    category: 'other',
    amountCents: 1000,
    frequency: 'monthly',
    anchorDate: '2026-01-15',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('occurrencesInRange', () => {
  it('lists monthly occurrences in a range', () => {
    expect(occurrencesInRange(bill({}), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('never returns dates before the anchor', () => {
    expect(occurrencesInRange(bill({ anchorDate: '2026-03-10' }), '2026-01-01', '2026-03-31')).toEqual([
      '2026-03-10',
    ]);
  });

  it('clamps the 31st to the end of shorter months without drifting', () => {
    const b = bill({ anchorDate: '2026-01-31' });
    expect(occurrencesInRange(b, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(occurrencesInRange(b, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('handles yearly bills anchored on Feb 29', () => {
    const b = bill({ frequency: 'yearly', anchorDate: '2024-02-29' });
    expect(occurrencesInRange(b, '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('handles quarterly bills across years', () => {
    const b = bill({ frequency: 'quarterly', anchorDate: '2025-11-05' });
    expect(occurrencesInRange(b, '2026-01-01', '2026-12-31')).toEqual([
      '2026-02-05',
      '2026-05-05',
      '2026-08-05',
      '2026-11-05',
    ]);
  });

  it('handles weekly bills, including across DST changes', () => {
    const b = bill({ frequency: 'weekly', anchorDate: '2026-03-02' });
    expect(occurrencesInRange(b, '2026-03-01', '2026-03-31')).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ]);
    expect(occurrencesInRange(b, '2026-11-01', '2026-11-10')).toEqual(['2026-11-02', '2026-11-09']);
  });

  it('stops at the end date', () => {
    const b = bill({ endDate: '2026-03-15' });
    expect(occurrencesInRange(b, '2026-01-01', '2026-12-31')).toHaveLength(3);
    expect(occurrencesInRange(b, '2026-04-01', '2026-12-31')).toEqual([]);
  });

  it('is inclusive of range boundaries', () => {
    const b = bill({ anchorDate: '2026-01-01' });
    expect(occurrencesInRange(b, '2026-02-01', '2026-02-01')).toEqual(['2026-02-01']);
  });
});

describe('summaries', () => {
  const rent = bill({ id: 'rent', name: 'Rent', amountCents: 150000, anchorDate: '2026-01-01' });
  const netflix = bill({ id: 'nf', name: 'Netflix', amountCents: 1599, anchorDate: '2026-01-20' });
  const prime = bill({ id: 'prime', name: 'Prime', amountCents: 13900, frequency: 'yearly', anchorDate: '2026-06-10' });
  const bills = [rent, netflix, prime];
  const incomes: Income[] = [{ id: 'i', label: 'Pay', amountCents: 400000, frequency: 'monthly' }];

  it('computes a month', () => {
    const payments = [{ billId: 'rent', dueDate: '2026-06-01', paidAt: '', amountCents: 150000 }];
    const s = summarize(bills, payments, incomes, monthPeriod(2026, 6));
    expect(s.totalDue).toBe(150000 + 1599 + 13900);
    expect(s.paid).toBe(150000);
    expect(s.remaining).toBe(1599 + 13900);
    expect(s.income).toBe(400000);
    expect(s.leftToSpend).toBe(400000 - 165499);
    expect(s.occurrences.map((o) => o.bill.id)).toEqual(['rent', 'prime', 'nf']);
  });

  it('computes a year', () => {
    const s = summarize(bills, [], incomes, yearPeriod(2026));
    expect(s.totalDue).toBe(150000 * 12 + 1599 * 12 + 13900);
    expect(s.income).toBe(400000 * 12);
  });

  it('uses the recorded payment amount when it differs', () => {
    const payments = [{ billId: 'nf', dueDate: '2026-06-20', paidAt: '', amountCents: 1799 }];
    const s = summarize([netflix], payments, [], monthPeriod(2026, 6));
    expect(s.totalDue).toBe(1799);
    expect(s.paid).toBe(1799);
  });

  it('reports a shortfall as negative', () => {
    const s = summarize([rent], [], [{ ...incomes[0], amountCents: 100000 }], monthPeriod(2026, 3));
    expect(s.leftToSpend).toBe(-50000);
  });
});

describe('normalization', () => {
  it('spreads income over months', () => {
    const weekly: Income = { id: 'w', label: 'W', amountCents: 100000, frequency: 'weekly' };
    expect(incomeForPeriod([weekly], yearPeriod(2026))).toBe(5_200_000);
    expect(incomeForPeriod([weekly], monthPeriod(2026, 7))).toBe(433_333);
    // Spread is the default even when a payday is known.
    expect(incomeForPeriod([{ ...weekly, anchorDate: '2026-01-02' }], monthPeriod(2026, 7))).toBe(433_333);
  });

  it('counts actual paychecks in paydays mode', () => {
    // Fridays from 2026-01-02: July 2026 has five (3, 10, 17, 24, 31), June has four.
    const weekly: Income = { id: 'w', label: 'W', amountCents: 100000, frequency: 'weekly', anchorDate: '2026-01-02' };
    expect(incomeForPeriod([weekly], monthPeriod(2026, 7), 'paydays')).toBe(500_000);
    expect(incomeForPeriod([weekly], monthPeriod(2026, 6), 'paydays')).toBe(400_000);
    expect(incomeForPeriod([weekly], yearPeriod(2026), 'paydays')).toBe(5_200_000);
    // 2026 starts and ends on a Thursday, so a Thursday payday lands 53 times.
    const thursday = { ...weekly, anchorDate: '2026-01-01' };
    expect(incomeForPeriod([thursday], yearPeriod(2026), 'paydays')).toBe(5_300_000);

    const bonus: Income = { id: 'q', label: 'Bonus', amountCents: 250000, frequency: 'quarterly', anchorDate: '2026-03-15' };
    expect(incomeForPeriod([bonus], monthPeriod(2026, 3), 'paydays')).toBe(250_000);
    expect(incomeForPeriod([bonus], monthPeriod(2026, 4), 'paydays')).toBe(0);
  });

  it('counts paydays before the entered payday too', () => {
    // Entered as "next payday Oct 2, 2026" (a Friday): September still has four Fridays.
    const weekly: Income = { id: 'w', label: 'W', amountCents: 100000, frequency: 'weekly', anchorDate: '2026-10-02' };
    expect(incomeForPeriod([weekly], monthPeriod(2026, 9), 'paydays')).toBe(400_000);
    expect(incomeForPeriod([weekly], monthPeriod(2026, 10), 'paydays')).toBe(500_000);
    expect(incomeForPeriod([weekly], yearPeriod(2026), 'paydays')).toBe(5_200_000);

    // Monthly on the 31st keeps clamping correctly in earlier months, including leap Februaries.
    const monthly: Income = { id: 'm', label: 'M', amountCents: 300000, frequency: 'monthly', anchorDate: '2028-10-31' };
    expect(incomeForPeriod([monthly], monthPeriod(2028, 2), 'paydays')).toBe(300_000);
    expect(incomeForPeriod([monthly], yearPeriod(2027), 'paydays')).toBe(3_600_000);
  });

  it('spreads incomes without a payday even in paydays mode', () => {
    const monthly: Income = { id: 'm', label: 'M', amountCents: 300000, frequency: 'monthly' };
    expect(incomeForPeriod([monthly], monthPeriod(2026, 2), 'paydays')).toBe(300_000);
  });

  it('uses the income mode in summaries', () => {
    const weekly: Income = { id: 'w', label: 'W', amountCents: 100000, frequency: 'weekly', anchorDate: '2026-01-02' };
    expect(summarize([], [], [weekly], monthPeriod(2026, 7), 'paydays').leftToSpend).toBe(500_000);
    expect(summarize([], [], [weekly], monthPeriod(2026, 7)).leftToSpend).toBe(433_333);
  });

  it('gives a monthly equivalent', () => {
    expect(monthlyEquivalent({ amountCents: 12000, frequency: 'yearly' })).toBe(1000);
    expect(monthlyEquivalent({ amountCents: 3000, frequency: 'quarterly' })).toBe(1000);
  });

  it('finds the next due date', () => {
    expect(nextDueDate(bill({ anchorDate: '2026-01-31' }), '2026-02-01')).toBe('2026-02-28');
    expect(nextDueDate(bill({ frequency: 'yearly', anchorDate: '2026-06-10' }), '2026-06-11')).toBe('2027-06-10');
    expect(nextDueDate(bill({ endDate: '2026-02-15' }), '2026-03-01')).toBeNull();
  });
});
