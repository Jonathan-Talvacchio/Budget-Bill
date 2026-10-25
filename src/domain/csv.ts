/**
 * CSV export and import. CSV is the one place data leaves the app unencrypted,
 * so the UI warns before export. Export defends against spreadsheet formula
 * injection; import validates every row through the bill schema.
 */
import { isAutoPaid, nextDueDate, occurrencesInRange, paymentKey, priceOn, todayISO } from './billing';
import { CATALOG } from './catalog';
import { centsToInput, parseMoneyToCents } from './money';
import {
  billSchema,
  CATEGORIES,
  CATEGORY_LABELS,
  FREQUENCY_LABELS,
  isoDate,
  type Bill,
  type Category,
  type Frequency,
  type Payment,
} from './schema';

// ---------------------------------------------------------------- writing

/** Cells starting with these are run as formulas by Excel, Sheets and LibreOffice. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  // A leading apostrophe makes spreadsheets treat the cell as plain text.
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const BILL_CSV_HEADERS = [
  'Name',
  'Amount',
  'Frequency',
  'First due',
  'Next due',
  'End date',
  'Category',
  'Auto pay',
  'Notes',
] as const;

export function billsToCSV(bills: Bill[], today = todayISO()): string {
  const rows = bills.map((b) => [
    b.name,
    centsToInput(b.amountCents),
    FREQUENCY_LABELS[b.frequency],
    b.anchorDate,
    nextDueDate(b, today) ?? '',
    b.endDate ?? '',
    CATEGORY_LABELS[b.category],
    b.autoPay ? 'Yes' : 'No',
    b.notes ?? '',
  ]);
  return toCSV([[...BILL_CSV_HEADERS], ...rows]);
}

/** Payment history: payments the user recorded plus occurrences paid by auto pay up to today. */
export function paymentsToCSV(
  payments: Payment[],
  bills: Bill[],
  autoPaySkips: readonly string[] = [],
  today = todayISO(),
): string {
  const names = new Map(bills.map((b) => [b.id, b.name]));
  const recorded = new Set(payments.map((p) => paymentKey(p.billId, p.dueDate)));
  const skips = new Set(autoPaySkips);
  const rows: { due: string; cells: string[] }[] = payments.map((p) => ({
    due: p.dueDate,
    cells: [names.get(p.billId) ?? '(deleted bill)', p.dueDate, centsToInput(p.amountCents), p.paidAt.slice(0, 10), 'Manual'],
  }));
  for (const b of bills.filter((x) => x.autoPay)) {
    for (const due of occurrencesInRange(b, b.autoPaySince ?? b.anchorDate, today)) {
      if (recorded.has(paymentKey(b.id, due)) || !isAutoPaid(b, due, today, skips)) continue;
      rows.push({ due, cells: [b.name, due, centsToInput(priceOn(b, due)), due, 'Auto pay'] });
    }
  }
  rows.sort((a, b) => a.due.localeCompare(b.due) || a.cells[0].localeCompare(b.cells[0]));
  return toCSV([['Bill', 'Due date', 'Amount paid', 'Paid on', 'How'], ...rows.map((r) => r.cells)]);
}

// ---------------------------------------------------------------- reading

export const MAX_CSV_ROWS = 2000;

/** RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF/LF. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > MAX_CSV_ROWS + 1) break;
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type Field = 'name' | 'amount' | 'frequency' | 'firstDue' | 'nextDue' | 'endDate' | 'category' | 'autoPay' | 'notes';

const HEADER_ALIASES: Record<Field, string[]> = {
  name: ['name', 'bill', 'service', 'payee', 'description', 'subscription'],
  amount: ['amount', 'price', 'cost', 'payment'],
  frequency: ['frequency', 'how often', 'billing cycle', 'cycle', 'interval', 'billed'],
  firstDue: ['first due', 'start date', 'start', 'anchor date'],
  nextDue: ['next due', 'due date', 'due', 'date', 'next payment', 'renews'],
  endDate: ['end date', 'ends', 'end'],
  category: ['category', 'type'],
  autoPay: ['auto pay', 'autopay', 'auto-pay', 'automatic payment', 'auto debit'],
  notes: ['notes', 'note', 'memo', 'comment'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');

function mapHeaders(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      if (map[field] === undefined && aliases.includes(key)) map[field] = i;
    }
  });
  return map;
}

/** Undo the formula-injection guard added on export. */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s).trim();

export function parseFrequency(s: string): Frequency | null {
  const v = norm(s);
  if (!v) return 'monthly';
  if (/^(weekly|week|wk|every week)$/.test(v)) return 'weekly';
  if (/^(monthly|month|mo|every month|per month|\/mo)$/.test(v)) return 'monthly';
  if (/^(quarterly|quarter|every 3 months)$/.test(v)) return 'quarterly';
  if (/^(yearly|year|yr|annual|annually|every year|per year|\/yr)$/.test(v)) return 'yearly';
  return null;
}

/** Yes/No-style cells; blank means no. Returns null if unreadable. */
export function parseYesNo(s: string): boolean | null {
  const v = norm(s);
  if (['', 'no', 'n', 'false', '0', 'off', 'manual'].includes(v)) return false;
  if (['yes', 'y', 'true', '1', 'on', 'auto', 'auto pay', 'autopay'].includes(v)) return true;
  return null;
}

/** Accepts YYYY-MM-DD or US-style M/D/YYYY. */
export function parseDate(s: string): string | null {
  const v = s.trim();
  if (isoDate.safeParse(v).success) return v;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return isoDate.safeParse(iso).success ? iso : null;
}

function parseCategory(s: string, name: string): Category {
  const v = norm(s);
  if (v) {
    const byKey = CATEGORIES.find((c) => c === v.replace(/ /g, '-'));
    if (byKey) return byKey;
    const byLabel = CATEGORIES.find((c) => norm(CATEGORY_LABELS[c]) === v);
    if (byLabel) return byLabel;
  }
  // No usable category: guess from the catalog by name, e.g. "Netflix" -> Streaming.
  return CATALOG.find((c) => norm(c.name) === norm(name))?.category ?? 'other';
}

export type CsvImport = {
  bills: Bill[];
  skipped: { row: number; reason: string }[];
};

/**
 * Turns a CSV (Budget Bill's own export or a simple spreadsheet) into new bills.
 * Requires Name and Amount columns. Rows that can't be read are reported, not guessed.
 */
export function parseBillsCSV(text: string, makeId: () => string, today = todayISO()): CsvImport {
  const rows = parseCSV(text);
  if (rows.length === 0) return { bills: [], skipped: [{ row: 1, reason: 'The file is empty.' }] };
  const cols = mapHeaders(rows[0]);
  if (cols.name === undefined || cols.amount === undefined) {
    return {
      bills: [],
      skipped: [{ row: 1, reason: 'The first row needs column headers including “Name” and “Amount”.' }],
    };
  }

  const bills: Bill[] = [];
  const skipped: CsvImport['skipped'] = [];
  const now = new Date().toISOString();
  rows.slice(1, MAX_CSV_ROWS + 1).forEach((r, i) => {
    const rowNo = i + 2;
    const get = (f: Field) => (cols[f] === undefined ? '' : unguard(r[cols[f]!] ?? ''));
    const name = get('name');
    if (!name) return skipped.push({ row: rowNo, reason: 'Missing name.' });
    const amountCents = parseMoneyToCents(get('amount'));
    if (amountCents === null) return skipped.push({ row: rowNo, reason: `“${get('amount')}” is not an amount.` });
    const frequency = parseFrequency(get('frequency'));
    if (!frequency) return skipped.push({ row: rowNo, reason: `Unknown frequency “${get('frequency')}”.` });

    // Prefer the schedule's first due date so the repeat pattern is kept exactly.
    const dateText = get('firstDue') || get('nextDue');
    const anchorDate = dateText ? parseDate(dateText) : today;
    if (!anchorDate) return skipped.push({ row: rowNo, reason: `“${dateText}” is not a date (use YYYY-MM-DD).` });
    const endText = get('endDate');
    const endDate = endText ? parseDate(endText) : undefined;
    if (endDate === null) return skipped.push({ row: rowNo, reason: `“${endText}” is not an end date.` });
    const autoPay = parseYesNo(get('autoPay'));
    if (autoPay === null) return skipped.push({ row: rowNo, reason: `Use Yes or No for auto pay, not “${get('autoPay')}”.` });

    const candidate = {
      id: makeId(),
      name: name.slice(0, 80),
      category: parseCategory(get('category'), name),
      amountCents,
      frequency,
      anchorDate,
      endDate,
      autoPay: autoPay || undefined,
      notes: get('notes').slice(0, 500) || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = billSchema.safeParse(candidate);
    if (!parsed.success) return skipped.push({ row: rowNo, reason: 'Invalid values.' });
    bills.push(parsed.data);
  });
  if (rows.length - 1 > MAX_CSV_ROWS) {
    skipped.push({ row: MAX_CSV_ROWS + 2, reason: `Only the first ${MAX_CSV_ROWS} rows are imported.` });
  }
  return { bills, skipped };
}

/** True if an equivalent bill (same name, amount and frequency) already exists. */
export function isDuplicate(bill: Bill, existing: Bill[]): boolean {
  return existing.some(
    (b) =>
      norm(b.name) === norm(bill.name) &&
      b.amountCents === bill.amountCents &&
      b.frequency === bill.frequency,
  );
}
