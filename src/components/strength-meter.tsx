import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { passphraseStrength } from '@/security/passphrase';

/** Live feedback that nudges toward a stronger passphrase without blocking a weak one. */
export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const theme = useTheme();
  if (!passphrase) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        At least 4 characters. For real protection, use a few random words, e.g. “maple rocket
        velvet harbor”.
      </ThemedText>
    );
  }
  const { level, label, tip } = passphraseStrength(passphrase);
  const color = [theme.negative, '#D4A72C', theme.tint, theme.positive][level];
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i <= level ? color : theme.backgroundSelected }]}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        <ThemedText type="smallBold" style={{ color }}>
          {label}
        </ThemedText>
        {tip ? ` — ${tip}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  bars: { flexDirection: 'row', gap: Spacing.one },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
