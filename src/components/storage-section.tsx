import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, SectionTitle } from '@/components/ui';
import {
  pwaSupported,
  requestPersistentStorage,
  storageProtection,
  type StorageProtection,
} from '@/platform/pwa';

/** Shows whether the browser may clear the vault on its own, and lets the user ask it not to. */
export function StorageSection() {
  const [state, setState] = useState<StorageProtection | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    storageProtection().then(setState, () => setState('unsupported'));
  }, []);

  if (!pwaSupported || state === null || state === 'unsupported') return null;

  async function ask() {
    setState(await requestPersistentStorage());
    setAsked(true);
  }

  return (
    <>
      <SectionTitle>Storage on this device</SectionTitle>
      <Card>
        {state === 'persisted' ? (
          <ThemedText type="small" themeColor="textSecondary">
            ✓ Your browser has agreed to keep Budget Bill’s data and not clear it on its own to free
            up space. Clearing site data or uninstalling the browser still removes it, so keep a
            backup.
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Your browser may clear Budget Bill’s data on its own if the device runs low on space.
              Ask it to keep your data, and export a backup now and then.
            </ThemedText>
            <Button label="Ask browser to keep my data" variant="secondary" onPress={ask} />
            {asked && (
              <ThemedText type="small" themeColor="textSecondary">
                The browser said no for now. Browsers usually agree once Budget Bill is installed
                (see “Install app”) or used regularly. Until then, backups are your safety net.
              </ThemedText>
            )}
          </>
        )}
      </Card>
    </>
  );
}
