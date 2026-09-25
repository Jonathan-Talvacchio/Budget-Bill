import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { useMoney } from '@/components/money';
import { StrengthMeter } from '@/components/strength-meter';
import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  secretInputProps,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { nextDueDate, todayISO } from '@/domain/billing';
import { formatDueDate } from '@/domain/format';
import { parseMoneyToCents } from '@/domain/money';
import {
  AUTO_LOCK_OPTIONS,
  CURRENCIES,
  FREQUENCY_LABELS,
  isoDate,
  type Frequency,
  type IncomeMode,
} from '@/domain/schema';
import { confirmAction, notify } from '@/platform/dialog';
import { filesSupported, pickTextFile, saveTextFile } from '@/platform/files';
import { passphraseProblem } from '@/security/passphrase';
import { newId, useStore } from '@/state/store';

export default function Settings() {
  return (
    <Screen>
      <IncomeSection />
      <PreferencesSection />
      <PassphraseSection />
      {filesSupported && <BackupSection />}
      <PrivacySection />
      <DangerSection />
    </Screen>
  );
}

const INCOME_FREQUENCIES = (['weekly', 'monthly', 'yearly'] as const).map((f) => ({
  value: f,
  label: FREQUENCY_LABELS[f],
}));

const INCOME_MODE_OPTIONS: { value: IncomeMode; label: string }[] = [
  { value: 'spread', label: 'Spread evenly' },
  { value: 'paydays', label: 'On paydays' },
];

const INCOME_MODE_HELP: Record<IncomeMode, string> = {
  spread: 'Each month gets an equal share of your yearly income, so months are easy to compare.',
  paydays:
    'Income counts in the month each paycheck actually arrives, so a month with an extra payday shows more. Income without a payday set is still spread evenly.',
};

function IncomeSection() {
  const incomes = useStore((s) => s.vault!.incomes);
  const incomeMode = useStore((s) => s.vault!.settings.incomeMode);
  const updateSettings = useStore((s) => s.updateSettings);
  const saveIncome = useStore((s) => s.saveIncome);
  const deleteIncome = useStore((s) => s.deleteIncome);
  const format = useMoney();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [payday, setPayday] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [paydayError, setPaydayError] = useState<string | null>(null);
  const today = todayISO();

  async function add() {
    const cents = parseMoneyToCents(amount);
    const badAmount = cents === null || cents === 0;
    const badPayday = !isoDate.safeParse(payday).success;
    setError(badAmount ? 'Enter an amount like 3200 or 3200.50' : null);
    setPaydayError(badPayday ? 'Choose a valid date.' : null);
    if (badAmount || badPayday || cents === null) return;
    await saveIncome({
      id: newId(),
      label: label.trim() || 'Income',
      amountCents: cents,
      frequency,
      anchorDate: payday,
    });
    setLabel('');
    setAmount('');
  }

  return (
    <>
      <SectionTitle>Income</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          How should income be counted?
        </ThemedText>
        <Segmented
          options={INCOME_MODE_OPTIONS}
          value={incomeMode}
          onChange={(m) => updateSettings({ incomeMode: m })}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {INCOME_MODE_HELP[incomeMode]}
        </ThemedText>
        <Divider />
        {incomes.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Add take-home pay so the overview can show what is left to spend.
          </ThemedText>
        )}
        {incomes.map((i) => (
          <View key={i.id}>
            <Row style={styles.item}>
              <View style={styles.grow}>
                <ThemedText>{i.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {format(i.amountCents)} · {FREQUENCY_LABELS[i.frequency]} · {paydayText(i.anchorDate, i.frequency, today)}
                </ThemedText>
              </View>
              <Button label="Remove" variant="secondary" compact onPress={() => deleteIncome(i.id)} />
            </Row>
            <Divider />
          </View>
        ))}
        <Field label="Source" value={label} onChangeText={setLabel} placeholder="Take-home pay" maxLength={60} />
        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          error={error}
        />
        <Segmented options={INCOME_FREQUENCIES} value={frequency} onChange={setFrequency} />
        <DateField label="Next payday" value={payday} onChange={setPayday} error={paydayError} />
        <Button label="Add income" variant="secondary" onPress={add} />
      </Card>
    </>
  );
}

function paydayText(anchorDate: string | undefined, frequency: Frequency, today: string): string {
  if (!anchorDate) return 'no payday set (spread evenly)';
  const next = nextDueDate({ frequency, anchorDate }, today);
  return next ? `next payday ${formatDueDate(next)}` : 'no upcoming payday';
}

function PreferencesSection() {
  const settings = useStore((s) => s.vault!.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <>
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Currency (changes the symbol only; amounts are not converted)
        </ThemedText>
        <Row style={styles.wrap}>
          {CURRENCIES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={c === settings.currency}
              onPress={() => updateSettings({ currency: c })}
            />
          ))}
        </Row>
        <ThemedText type="small" themeColor="textSecondary">
          Lock automatically after inactivity
        </ThemedText>
        <Segmented
          options={AUTO_LOCK_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
          value={settings.autoLockMinutes}
          onChange={(m) => updateSettings({ autoLockMinutes: m })}
        />
      </Card>
    </>
  );
}

function PassphraseSection() {
  const changePassphrase = useStore((s) => s.changePassphrase);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const problem = passphraseProblem(next, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (!(await changePassphrase(current, next))) return setError('Current passphrase is not correct.');
      setCurrent('');
      setNext('');
      setConfirm('');
      notify('Passphrase changed', 'Use the new passphrase next time you unlock. Older backups still use the old one.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>Passphrase</SectionTitle>
      <Card>
        <Field label="Current passphrase" value={current} onChangeText={setCurrent} {...secretInputProps} />
        <Field label="New passphrase" value={next} onChangeText={setNext} {...secretInputProps} />
        {next ? <StrengthMeter passphrase={next} /> : null}
        <Field
          label="Confirm new passphrase"
          value={confirm}
          onChangeText={setConfirm}
          error={error}
          {...secretInputProps}
        />
        <Button
          label="Change passphrase"
          variant="secondary"
          onPress={submit}
          busy={busy}
          disabled={!current || !next}
        />
      </Card>
    </>
  );
}

function BackupSection() {
  const exportBackup = useStore((s) => s.exportBackup);
  const importBackup = useStore((s) => s.importBackup);
  const [file, setFile] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doExport() {
    try {
      await saveTextFile(`budget-bill-${todayISO()}.bbvault`, await exportBackup());
    } catch (e) {
      notify('Export failed', (e as Error).message);
    }
  }

  async function choose() {
    setError(null);
    try {
      setFile(await pickTextFile());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function doImport() {
    if (!file) return;
    const ok = await confirmAction(
      'Replace all data?',
      'Everything currently in Budget Bill on this device will be replaced by the backup, and the backup’s passphrase becomes your passphrase.',
      'Replace',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(file, passphrase);
      setFile(null);
      setPassphrase('');
      notify('Backup restored', 'Your data was restored from the backup.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Backups are encrypted with your current passphrase and saved as a file on your device.
          Use them to move your data to another browser or device.
        </ThemedText>
        <Button label="Export encrypted backup" variant="secondary" onPress={doExport} />
        <Divider />
        <Button
          label={file ? 'Backup selected ✓ — choose another' : 'Choose a backup to restore'}
          variant="secondary"
          onPress={choose}
        />
        {file && (
          <>
            <Field
              label="Backup passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              {...secretInputProps}
            />
            <Button label="Restore backup" onPress={doImport} busy={busy} disabled={!passphrase} />
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

function PrivacySection() {
  return (
    <>
      <SectionTitle>Privacy</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Budget Bill has no accounts, servers, analytics or trackers. Your bills and income are
          encrypted (AES-256-GCM) with a key made from your passphrase and stored only in this
          browser. Nothing is sent over the network. The passphrase itself is never stored.
        </ThemedText>
      </Card>
    </>
  );
}

function DangerSection() {
  const wipe = useStore((s) => s.wipe);
  async function erase() {
    const ok = await confirmAction(
      'Erase all data?',
      'This permanently deletes every bill, payment and setting on this device. Export a backup first if you might need it.',
      'Erase',
    );
    if (ok) await wipe();
  }
  return (
    <>
      <SectionTitle>Danger zone</SectionTitle>
      <Button label="Erase all data on this device" variant="danger" onPress={erase} />
    </>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: Spacing.two },
  grow: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
});
