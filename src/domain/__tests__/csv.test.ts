/**
 * @jest-environment node
 */
import {
  billsToCSV,
  csvCell,
  isDuplicate,
  parseBillsCSV,
  parseCSV,
  parseDate,
  parseFrequency,
  paymentsToCSV,
} from '../csv';
import type { Bill } from '../schema';

let n = 0;
const makeId = () => `id${++n}`;

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: 'b1',
    name: 'Netflix',
    category: 'streaming',
    amountCents: 1599,
    frequency: 'monthly',
    anchorDate: '2026-01-20',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('writing', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('exports bills with a header row', () => {
    const csv = billsToCSV([bill({ notes: 'family plan, 4K' })], '2026-03-01');
    const rows = parseCSV(csv);
    expect(rows[0]).toEqual(['Name', 'Amount', 'Frequency', 'First due', 'Next due', 'End date', 'Category', 'Auto pay', 'Notes']);
    expect(rows[1]).toEqual(['Netflix', '15.99', 'Monthly', '2026-01-20', '2026-03-20', '', 'Streaming', 'No', 'family plan, 4K']);
  });

  it('exports payments with bill names', () => {
    const csv = paymentsToCSV(
      [{ billId: 'b1', dueDate: '2026-02-20', paidAt: '2026-02-19T10:00:00Z', amountCents: 1599 }],
      [bill({})],
    );
    expect(parseCSV(csv)[1]).toEqual(['Netflix', '2026-02-20', '15.99', '2026-02-19', 'Manual']);
  });
});

describe('parseCSV', () => {
  it('handles quotes, CRLF, BOM and blank lines', () => {
    expect(parseCSV('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"multi\nline",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
});

describe('field parsing', () => {
  it('reads frequencies', () => {
    expect(parseFrequency('Monthly')).toBe('monthly');
    expect(parseFrequency('annual')).toBe('yearly');
    expect(parseFrequency('Every Week')).toBe('weekly');
    expect(parseFrequency('')).toBe('monthly');
    expect(parseFrequency('fortnightly')).toBeNull();
  });

  it('reads ISO and US dates', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05');
    expect(parseDate('3/5/2026')).toBe('2026-03-05');
    expect(parseDate('13/5/2026')).toBeNull();
    expect(parseDate('March 5')).toBeNull();
  });
});

describe('parseBillsCSV', () => {
  it('round-trips its own export, keeping the schedule', () => {
    const original = [
      bill({ notes: 'shared, with "Sam"' }),
      bill({ id: 'b2', name: '=Rent', category: 'housing', amountCents: 150000, anchorDate: '2026-01-31', endDate: '2027-01-31' }),
    ];
    const { bills, skipped } = parseBillsCSV(billsToCSV(original, '2026-03-01'), makeId, '2026-03-01');
    expect(skipped).toEqual([]);
    const strip = ({ id: _i, createdAt: _c, updatedAt: _u, ...rest }: Bill) => rest;
    expect(bills.map(strip)).toEqual(original.map(strip));
  });

  it('accepts a simple spreadsheet with other headers', () => {
    const csv = 'Service,Price,Billing cycle,Due date\nSpotify,$11.99,monthly,10/15/2026\nCostco,65,Annual,2027-01-03\n';
    const { bills, skipped } = parseBillsCSV(csv, makeId, '2026-10-01');
    expect(skipped).toEqual([]);
    expect(bills.map((b) => [b.name, b.amountCents, b.frequency, b.anchorDate, b.category])).toEqual([
      ['Spotify', 1199, 'monthly', '2026-10-15', 'music-audio'],
      // Category is guessed from the catalog when the name matches exactly ("Spotify"); otherwise Other.
      ['Costco', 6500, 'yearly', '2027-01-03', 'other'],
    ]);
  });

  it('defaults the date to today and frequency to monthly', () => {
    const { bills } = parseBillsCSV('name,amount\nGym,40', makeId, '2026-10-21');
    expect(bills[0]).toMatchObject({ name: 'Gym', amountCents: 4000, frequency: 'monthly', anchorDate: '2026-10-21' });
  });

  it('reports bad rows instead of guessing', () => {
    const csv = 'Name,Amount,Frequency,Due date\n,5,monthly,\nA,abc,monthly,\nB,5,fortnightly,\nC,5,monthly,soon\nD,5,monthly,2026-01-01\n';
    const { bills, skipped } = parseBillsCSV(csv, makeId, '2026-10-01');
    expect(bills.map((b) => b.name)).toEqual(['D']);
    expect(skipped.map((s) => s.row)).toEqual([2, 3, 4, 5]);
  });

  it('requires Name and Amount headers', () => {
    const { bills, skipped } = parseBillsCSV('foo,bar\n1,2', makeId);
    expect(bills).toEqual([]);
    expect(skipped[0].reason).toMatch(/Name.*Amount/);
  });

  it('detects duplicates', () => {
    expect(isDuplicate(bill({ id: 'x', name: ' netflix ' }), [bill({})])).toBe(true);
    expect(isDuplicate(bill({ id: 'x', amountCents: 1799 }), [bill({})])).toBe(false);
  });
});
