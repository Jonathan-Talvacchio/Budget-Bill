import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen, secretInputProps } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { confirmAction } from '@/platform/dialog';
import { useStore } from '@/state/store';

export function Unlock() {
  const unlock = useStore((s) => s.unlock);
  const wipe = useStore((s) => s.wipe);
  const failedAttempts = useStore((s) => s.failedAttempts);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlock(passphrase);
      if (!ok) setError('That passphrase is not correct.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPassphrase('');
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await confirmAction(
      'Erase all data?',
      'This permanently deletes the encrypted vault on this device. Only do this if you have forgotten your passphrase and have no way to recover it.',
      'Erase',
    );
    if (ok) await wipe();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">Budget Bill</ThemedText>
        <ThemedText themeColor="textSecondary">Your vault is locked.</ThemedText>
      </View>
      <Card>
        <Field
          label="Passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          onSubmitEditing={submit}
          autoFocus
          error={error}
          {...secretInputProps}
        />
        <Button label="Unlock" onPress={submit} busy={busy} disabled={!passphrase} />
        {failedAttempts >= 3 && (
          <ThemedText type="small" themeColor="textSecondary">
            Several wrong attempts — each new try now waits a little longer.
          </ThemedText>
        )}
      </Card>
      <Button label="Forgot passphrase? Erase and start over" variant="secondary" onPress={reset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.four },
});
