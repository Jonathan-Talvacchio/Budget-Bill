import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Row, SectionTitle, Segmented } from '@/components/ui';
import { REMINDER_DAY_OPTIONS } from '@/domain/schema';
import {
  notificationPermission,
  pwaSupported,
  requestNotificationPermission,
  type Permission,
} from '@/platform/pwa';
import { useStore } from '@/state/store';

const DAY_LABELS: Record<(typeof REMINDER_DAY_OPTIONS)[number], string> = {
  0: 'Same day',
  1: '1 day',
  3: '3 days',
  7: '1 week',
};

export function RemindersSection() {
  const reminders = useStore((s) => s.vault!.settings.reminders);
  const updateSettings = useStore((s) => s.updateSettings);
  const [permission, setPermission] = useState<Permission>(notificationPermission);

  if (!pwaSupported) return null;

  async function setEnabled(enabled: boolean) {
    if (enabled && permission !== 'granted') {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== 'granted') return;
    }
    await updateSettings({ reminders: { ...reminders, enabled } });
  }

  const update = (patch: Partial<typeof reminders>) => updateSettings({ reminders: { ...reminders, ...patch } });

  return (
    <>
      <SectionTitle>Bill reminders</SectionTitle>
      <Card>
        {permission === 'unsupported' ? (
          <ThemedText type="small" themeColor="textSecondary">
            This browser can’t show notifications.
          </ThemedText>
        ) : (
          <>
            <Segmented
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
              value={reminders.enabled && permission === 'granted' ? 'on' : 'off'}
              onChange={(v) => setEnabled(v === 'on')}
            />
            {permission === 'denied' && (
              <ThemedText type="small" themeColor="negative">
                Notifications are blocked for this site. Allow them in your browser’s site settings,
                then turn reminders on again.
              </ThemedText>
            )}
            {reminders.enabled && permission === 'granted' && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Remind me before a bill is due
                </ThemedText>
                <Segmented
                  options={REMINDER_DAY_OPTIONS.map((d) => ({ value: d, label: DAY_LABELS[d] }))}
                  value={reminders.daysBefore as (typeof REMINDER_DAY_OPTIONS)[number]}
                  onChange={(d) => update({ daysBefore: d })}
                />
                <Row>
                  <Chip
                    label={reminders.showDetails ? '✓ Show bill names and amounts' : 'Show bill names and amounts'}
                    selected={reminders.showDetails}
                    onPress={() => update({ showDetails: !reminders.showDetails })}
                  />
                </Row>
                <ThemedText type="small" themeColor="textSecondary">
                  {reminders.showDetails
                    ? 'Notifications will show bill names and amounts, which may be visible on your lock screen.'
                    : 'Notifications only say how many bills are due, so nothing private shows on your lock screen.'}
                </ThemedText>
              </>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              Reminders are created on this device; nothing is sent to a server. Because of that, the
              web app can only remind you while it is open (installed apps can stay open in the
              background). Reminders that work when closed come with the Android and iOS apps.
            </ThemedText>
          </>
        )}
      </Card>
    </>
  );
}
