import { Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, SectionTitle } from '@/components/ui';
import { promptInstall, pwaSupported, useInstallState } from '@/platform/pwa';

/** Offers to install the web app (home screen / desktop app) so it works offline. */
export function InstallSection() {
  const state = useInstallState();
  if (!pwaSupported || state === 'installed') return null;
  const ios = Platform.OS === 'web' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <>
      <SectionTitle>Install app</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Add Budget Bill to your home screen or desktop. It opens like an app and works without an
          internet connection. Your data stays exactly where it is.
        </ThemedText>
        {state === 'available' ? (
          <Button label="Install Budget Bill" onPress={promptInstall} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {ios
              ? 'In Safari, tap the Share button, then “Add to Home Screen”.'
              : 'Use your browser’s menu and choose “Install app” or “Add to Home screen”.'}
          </ThemedText>
        )}
      </Card>
    </>
  );
}
