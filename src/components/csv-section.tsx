import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Divider, SectionTitle } from '@/components/ui';
import { todayISO } from '@/domain/billing';
import { billsToCSV, isDuplicate, parseBillsCSV, paymentsToCSV } from '@/domain/csv';
import type { Bill } from '@/domain/schema';
import { confirmAction, notify } from '@/platform/dialog';
import { pickTextFile, saveTextFile } from '@/platform/files';
import { newId, useStore } from '@/state/store';

type Preview = { add: Bill[]; duplicates: number; skipped: { row: number; reason: string }[] };

/** Spreadsheet export (unencrypted, with a warning) and import of bills. */
export function CsvSection() {
  const vault = useStore((s) => s.vault!);
  const importBills = useStore((s) => s.importBills);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportCsv(kind: 'bills' | 'payments') {
    const ok = await confirmAction(
      'Export an unencrypted file?',
      'Spreadsheet files are not encrypted or passphrase-protected. Anyone who gets the file can read your bills. Store it somewhere safe and delete it when you are done.',
      'Export',
    );
    if (!ok) return;
    const text = kind === 'bills' ? billsToCSV(vault.bills) : paymentsToCSV(vault.payments, vault.bills);
    try {
      await saveTextFile(`budget-bill-${kind}-${todayISO()}.csv`, text, 'text/csv');
    } catch (e) {
      notify('Export failed', (e as Error).message);
    }
  }

  async function chooseImport() {
    setError(null);
    setPreview(null);
    try {
      const text = await pickTextFile('.csv,text/csv');
      if (text === null) return;
      const { bills, skipped } = parseBillsCSV(text, newId);
      const add = bills.filter((b) => !isDuplicate(b, vault.bills));
      setPreview({ add, duplicates: bills.length - add.length, skipped });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    try {
      await importBills(preview.add);
      notify('Bills imported', `${preview.add.length} bill${preview.add.length === 1 ? '' : 's'} added.`);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>Spreadsheet (CSV)</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Open your bills in Excel, Numbers or Google Sheets. These files are not encrypted.
        </ThemedText>
        <Button
          label="Export bills (.csv)"
          variant="secondary"
          onPress={() => exportCsv('bills')}
          disabled={vault.bills.length === 0}
        />
        <Button
          label="Export payment history (.csv)"
          variant="secondary"
          onPress={() => exportCsv('payments')}
          disabled={vault.payments.length === 0}
        />
        <Divider />
        <ThemedText type="small" themeColor="textSecondary">
          Import bills from a spreadsheet. The first row needs headers; “Name” and “Amount” are
          required, and “Frequency”, “Due date”, “Category” and “Notes” are optional. Dates can be
          YYYY-MM-DD or MM/DD/YYYY. Imported bills are added to your existing ones.
        </ThemedText>
        <Button label="Choose a CSV file to import" variant="secondary" onPress={chooseImport} />
        {preview && (
          <>
            <ThemedText>
              {preview.add.length === 0
                ? 'No new bills to add.'
                : `Ready to add ${preview.add.length} bill${preview.add.length === 1 ? '' : 's'}: ${preview.add
                    .slice(0, 5)
                    .map((b) => b.name)
                    .join(', ')}${preview.add.length > 5 ? '…' : ''}`}
            </ThemedText>
            {preview.duplicates > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {preview.duplicates} already in Budget Bill (same name, amount and frequency) will be
                skipped.
              </ThemedText>
            )}
            {preview.skipped.length > 0 && (
              <ThemedText type="small" themeColor="negative">
                {preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} couldn’t be read:
                {'\n'}
                {preview.skipped
                  .slice(0, 5)
                  .map((s) => `Row ${s.row}: ${s.reason}`)
                  .join('\n')}
                {preview.skipped.length > 5 ? `\n…and ${preview.skipped.length - 5} more` : ''}
              </ThemedText>
            )}
            {preview.add.length > 0 && (
              <Button
                label={`Add ${preview.add.length} bill${preview.add.length === 1 ? '' : 's'}`}
                onPress={confirmImport}
                busy={busy}
              />
            )}
            <Button label="Cancel" variant="secondary" onPress={() => setPreview(null)} />
          </>
        )}
        {error && (
          <ThemedText type="small" themeColor="negative">
            {error}
          </ThemedText>
        )}
      </Card>
    </>
  );
}
