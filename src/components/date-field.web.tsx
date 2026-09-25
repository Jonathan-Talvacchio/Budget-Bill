import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = { label: string; value: string; onChange: (iso: string) => void; error?: string | null };

/** Uses the browser's built-in date picker, which already yields YYYY-MM-DD. */
export function DateField({ label, value, onChange, error }: Props) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          minHeight: 44,
          boxSizing: 'border-box',
          border: `1px solid ${error ? theme.negative : theme.border}`,
          borderRadius: Radius - 4,
          padding: `${Spacing.two}px ${Spacing.three}px`,
          fontSize: 16,
          fontFamily: 'inherit',
          color: theme.text,
          background: theme.background,
          colorScheme: 'light dark',
        }}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.negative }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}
