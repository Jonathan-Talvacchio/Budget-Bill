/**
 * @jest-environment node
 */
import { isAutoPaid, monthPeriod, priceOn, summarize } from '../billing';
import { billsToCSV, parseBillsCSV, parseCSV, parseYesNo, paymentsToCSV } from '../csv';
import { dueReminders } from '../reminders';
import type { Bill } from '../schema';

const TODAY = '2026-10-25';

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: 'net',
    name: 'Netflix',
    category: 'streaming',
    amountCents: 1799,
    frequency: 'monthly',
    anchorDate: '2026-01-20',
    autoPay: true,
    autoPaySince: '2026-01-20',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('isAutoPaid', () => {
  const none = new Set<string>();
  it('counts due dates that have arrived, from when auto pay started', () => {
    const b = bill({ autoPaySince: '2026-06-01' });
    expect(isAutoPaid(b, '2026-10-20', TODAY, none)).toBe(true);
    expect(isAutoPaid(b, '2026-10-25', TODAY, none)).toBe(true); // due today
    expect(isAutoPaid(b, '2026-11-20', TODAY, none)).toBe(false); // not yet due
    expect(isAutoPaid(b, '2026-05-20', TODAY, none)).toBe(false); // before auto pay was on
  });

  it('respects occurrences marked as not paid, and bills without auto pay', () => {
    expect(isAutoPaid(bill({}), '2026-10-20', TODAY, new Set(['net|2026-10-20']))).toBe(false);
    expect(isAutoPaid(bill({ autoPay: undefined }), '2026-10-20', TODAY, none)).toBe(false);
  });

  it('falls back to the first due date when no start date is stored (e.g. imported)', () => {
    expect(isAutoPaid(bill({ autoPaySince: undefined }), '2026-01-20', TODAY, none)).toBe(true);
  });
});

describe('priceOn', () => {
  it('uses the price that applied on the date', () => {
    const b = bill({ amountCents: 1999, priceHistory: [{ amountCents: 1599, until: '2026-03-01' }, { amountCents: 1799, until: '2026-09-01' }] });
    expect(priceOn(b, '2026-02-20')).toBe(1599);
    expect(priceOn(b, '2026-03-01')).toBe(1799);
    expect(priceOn(b, '2026-08-20')).toBe(1799);
    expect(priceOn(b, '2026-09-20')).toBe(1999);
  });
});

describe('summaries with auto pay', () => {
  const rent = bill({ id: 'rent', name: 'Rent', amountCents: 150000, anchorDate: '2026-01-01', autoPay: undefined, autoPaySince: undefined });

  it('counts auto-paid occurrences as paid, at the price on that date', () => {
    const net = bill({ amountCents: 1999, priceHistory: [{ amountCents: 1799, until: '2026-10-22' }] });
    const s = summarize([net, rent], [], [], monthPeriod(2026, 10), 'spread', { today: TODAY });
    const o = s.occurrences.find((x) => x.bill.id === 'net')!;
    expect(o).toMatchObject({ paid: true, autoPaid: true, amountCents: 1799 });
    expect(s.paid).toBe(1799);
    expect(s.remaining).toBe(150000); // rent isn't on auto pay
  });

  it('leaves future and skipped occurrences unpaid', () => {
    const future = summarize([bill({})], [], [], monthPeriod(2026, 11), 'spread', { today: TODAY });
    expect(future.occurrences[0]).toMatchObject({ paid: false, autoPaid: false, amountCents: 1799 });
    const skipped = summarize([bill({})], [], [], monthPeriod(2026, 10), 'spread', { today: TODAY, skipped: ['net|2026-10-20'] });
    expect(skipped.occurrences[0]).toMatchObject({ paid: false, autoPaid: false });
  });

  it('prefers a recorded payment over auto pay', () => {
    const payments = [{ billId: 'net', dueDate: '2026-10-20', paidAt: '', amountCents: 2500 }];
    const s = summarize([bill({})], payments, [], monthPeriod(2026, 10), 'spread', { today: TODAY });
    expect(s.occurrences[0]).toMatchObject({ paid: true, autoPaid: false, amountCents: 2500 });
  });
});

describe('reminders skip auto pay', () => {
  it('only reminds about bills you have to pay yourself', () => {
    const manual = bill({ id: 'water', name: 'Water', anchorDate: '2026-01-27', autoPay: undefined });
    const auto = bill({ anchorDate: '2026-01-27' });
    expect(dueReminders([manual, auto], [], [], TODAY, 3).map((d) => d.bill.name)).toEqual(['Water']);
  });
});

describe('CSV with auto pay', () => {
  it('round-trips the auto pay flag', () => {
    const csv = billsToCSV([bill({}), bill({ id: 'w', name: 'Water', autoPay: undefined })], TODAY);
    expect(parseCSV(csv)[0]).toContain('Auto pay');
    const { bills } = parseBillsCSV(csv, () => 'x', TODAY);
    expect(bills.map((b) => [b.name, b.autoPay])).toEqual([
      ['Netflix', true],
      ['Water', undefined],
    ]);
  });

  it('reads Yes/No style values and rejects others', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('autopay')).toBe(true);
    expect(parseYesNo('')).toBe(false);
    expect(parseYesNo('manual')).toBe(false);
    expect(parseYesNo('sometimes')).toBeNull();
    const { skipped } = parseBillsCSV('Name,Amount,Auto pay\nGym,40,sometimes', () => 'x', TODAY);
    expect(skipped[0].reason).toMatch(/Yes or No/);
  });

  it('includes auto-paid occurrences in the payment history', () => {
    const b = bill({ autoPaySince: '2026-09-01' });
    const csv = paymentsToCSV(
      [{ billId: 'net', dueDate: '2026-10-20', paidAt: '2026-10-19T00:00:00Z', amountCents: 1799 }],
      [b],
      [],
      TODAY,
    );
    expect(parseCSV(csv)).toEqual([
      ['Bill', 'Due date', 'Amount paid', 'Paid on', 'How'],
      ['Netflix', '2026-09-20', '17.99', '2026-09-20', 'Auto pay'],
      ['Netflix', '2026-10-20', '17.99', '2026-10-19', 'Manual'],
    ]);
  });
});
