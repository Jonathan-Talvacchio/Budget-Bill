import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Chip,
  Field,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  secretInputProps,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseMoneyToCents } from '@/domain/money';
import { CURRENCIES, FREQUENCY_LABELS, type Currency, type Frequency } from '@/domain/schema';
import { filesSupported, pickTextFile } from '@/platform/files';
import { passphraseProblem } from '@/security/passphrase';
import { newId, useStore } from '@/state/store';

const INCOME_FREQUENCIES = (['weekly', 'monthly', 'yearly'] as const).map((f) => ({
  value: f,
  label: FREQUENCY_LABELS[f],
}));

export function Onboarding() {
  const [mode, setMode] = useState<'create' | 'restore'>('create');
  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">Budget Bill</ThemedText>
        <ThemedText themeColor="textSecondary">
          Track upcoming bills and see what is left to spend. Your data stays on this device,
          encrypted with a passphrase only you know.
        </ThemedText>
      </View>
      {filesSupported && (
        <Segmented
          options={[
            { value: 'create', label: 'Start fresh' },
            { value: 'restore', label: 'Restore a backup' },
          ]}
          value={mode}
          onChange={setMode}
        />
      )}
      {mode === 'create' ? <CreateVault /> : <RestoreBackup />}
    </Screen>
  );
}

function CreateVault() {
  const createVault = useStore((s) => s.createVault);
  const saveIncome = useStore((s) => s.saveIncome);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [income, setIncome] = useState('');
  const [incomeFrequency, setIncomeFrequency] = useState<Frequency>('monthly');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem = passphraseProblem(passphrase, confirm);
  const incomeCents = income.trim() ? parseMoneyToCents(income) : 0;
  const incomeError = incomeCents === null ? 'Enter an amount like 3200 or 3200.50' : null;

  async function submit() {
    setSubmitted(true);
    if (problem || incomeError || !acknowledged || incomeCents === null) return;
    setBusy(true);
    try {
      await createVault(passphrase, { currency });
      if (incomeCents > 0) {
        await saveIncome({
          id: newId(),
          label: 'Take-home pay',
          amountCents: incomeCents,
          frequency: incomeFrequency,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <SectionTitle>1. Choose a passphrase</SectionTitle>
        <Field
          label="Passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          error={submitted ? passphraseProblem(passphrase) : null}
          hint="At least 12 characters. A few random words works well."
          {...secretInputProps}
        />
        <Field
          label="Confirm passphrase"
          value={confirm}
          onChangeText={setConfirm}
          error={submitted && confirm !== passphrase ? 'Passphrases do not match.' : null}
          onSubmitEditing={submit}
          {...secretInputProps}
        />
        <ThemedText type="small" themeColor="textSecondary">
          There is no account and no password reset. If you forget this passphrase, your data
          cannot be recovered by anyone, including us.
        </ThemedText>
        <Row>
          <Chip
            label={acknowledged ? '✓ I understand' : 'I understand'}
            selected={acknowledged}
            onPress={() => setAcknowledged(!acknowledged)}
          />
        </Row>
        {submitted && !acknowledged && (
          <ThemedText type="small" themeColor="negative">
            Please confirm you understand the passphrase cannot be recovered.
          </ThemedText>
        )}
      </Card>

      <Card>
        <SectionTitle>2. Currency</SectionTitle>
        <Row style={styles.wrap}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} selected={c === currency} onPress={() => setCurrency(c)} />
          ))}
        </Row>
      </Card>

      <Card>
        <SectionTitle>3. Income (optional)</SectionTitle>
        <ThemedText type="small" themeColor="textSecondary">
          Used to show how much is left to spend after bills. You can add more sources later in
          Settings.
        </ThemedText>
        <Field
          label="Take-home pay"
          value={income}
          onChangeText={setIncome}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          error={submitted ? incomeError : null}
        />
        <Segmented options={INCOME_FREQUENCIES} value={incomeFrequency} onChange={setIncomeFrequency} />
      </Card>

      <Button label="Create encrypted vault" onPress={submit} busy={busy} />
    </>
  );
}

function RestoreBackup() {
  const importBackup = useStore((s) => s.importBackup);
  const [file, setFile] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    setError(null);
    try {
      setFile(await pickTextFile());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function restore() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(file, passphrase);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        Choose a .bbvault backup file exported from Budget Bill, then enter the passphrase that was
        in use when it was exported.
      </ThemedText>
      <Button
        label={file ? 'Backup selected ✓ — choose another' : 'Choose backup file'}
        variant="secondary"
        onPress={choose}
      />
      <Field
        label="Backup passphrase"
        value={passphrase}
        onChangeText={setPassphrase}
        onSubmitEditing={restore}
        {...secretInputProps}
      />
      {error && (
        <ThemedText type="small" themeColor="negative">
          {error}
        </ThemedText>
      )}
      <Button label="Restore" onPress={restore} disabled={!file || !passphrase} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.four },
  wrap: { flexWrap: 'wrap' },
});
