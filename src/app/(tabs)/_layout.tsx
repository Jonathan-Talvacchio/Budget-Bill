import { Tabs } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/state/store';

function LockButton() {
  const lock = useStore((s) => s.lock);
  return (
    <Pressable
      onPress={lock}
      accessibilityRole="button"
      style={{ paddingHorizontal: Spacing.three }}>
      <ThemedText type="smallBold" themeColor="tint">
        Lock
      </ThemedText>
    </Pressable>
  );
}

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <LockButton />,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        tabBarLabelPosition: 'beside-icon',
      }}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="bills" options={{ title: 'Bills' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
