import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Onboarding } from '@/components/onboarding';
import { Unlock } from '@/components/unlock';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useAutoLock } from '@/security/use-auto-lock';
import { useStore } from '@/state/store';

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const base = dark ? DarkTheme : DefaultTheme;
  const c = Colors[dark ? 'dark' : 'light'];
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: c.tint,
          background: c.background,
          card: c.backgroundElement,
          text: c.text,
          border: c.border,
        },
      }}>
      <Gate />
    </ThemeProvider>
  );
}

/** Nothing behind the gate renders until the vault has been decrypted. */
function Gate() {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const autoLockMinutes = useStore((s) => s.vault?.settings.autoLockMinutes);
  const theme = useTheme();
  useAutoLock(status === 'unlocked' ? autoLockMinutes : undefined);

  useEffect(() => {
    init().catch(() => useStore.setState({ status: 'new' }));
  }, [init]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }
  if (status === 'new') return <Onboarding />;
  if (status === 'locked') return <Unlock />;
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Budget Bill' }} />
      <Stack.Screen name="bill/new" options={{ title: 'Add a bill', presentation: 'modal' }} />
      <Stack.Screen name="bill/edit" options={{ title: 'Edit bill', presentation: 'modal' }} />
    </Stack>
  );
}
