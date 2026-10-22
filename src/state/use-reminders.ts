import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { todayISO } from '@/domain/billing';
import { formatDueDate } from '@/domain/format';
import { formatCents } from '@/domain/money';
import { dueReminders, reminderMessage } from '@/domain/reminders';
import { notificationPermission, showNotification } from '@/platform/pwa';
import { useStore } from '@/state/store';

const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Sends a local notification for bills coming due, once per bill occurrence.
 * Runs while the app is open (on start, every 30 minutes and when it comes back
 * to the foreground): there is no server to send reminders while it is closed.
 */
export function useReminders(active: boolean) {
  const vault = useStore((s) => s.vault);
  const markReminded = useStore((s) => s.markReminded);
  const running = useRef(false);
  const settings = vault?.settings.reminders;
  const enabled = active && !!vault && !!settings?.enabled;

  useEffect(() => {
    if (!enabled) return;
    async function check() {
      const v = useStore.getState().vault;
      const r = v?.settings.reminders;
      if (running.current || !v || !r?.enabled || notificationPermission() !== 'granted') return;
      running.current = true;
      try {
        const due = dueReminders(v.bills, v.payments, v.reminderLog, todayISO(), r.daysBefore);
        if (due.length === 0) return;
        const { title, body } = reminderMessage(
          due,
          r.daysBefore,
          r.showDetails,
          (c) => formatCents(c, v.settings.currency),
          (d) => formatDueDate(d),
        );
        if (await showNotification(title, body, 'budget-bill-due')) {
          await markReminded(due.map((d) => d.key));
        }
      } finally {
        running.current = false;
      }
    }
    check();
    const interval = setInterval(check, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [enabled, settings?.daysBefore, markReminded]);
}
