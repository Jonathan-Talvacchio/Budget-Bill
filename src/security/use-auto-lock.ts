import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useStore } from '@/state/store';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Locks the vault after `minutes` without user activity. The check is based
 * on wall-clock time, so a backgrounded tab or a sleeping device is locked
 * as soon as it comes back, even if timers were paused in the meantime.
 */
export function useAutoLock(minutes: number | undefined) {
  const lock = useStore((s) => s.lock);

  useEffect(() => {
    if (!minutes) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const check = () => {
      if (Date.now() - last >= limit) lock();
    };

    const interval = setInterval(check, 10_000);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });

    if (Platform.OS === 'web') {
      ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
      document.addEventListener('visibilitychange', check);
    }
    return () => {
      clearInterval(interval);
      appState.remove();
      if (Platform.OS === 'web') {
        ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
        document.removeEventListener('visibilitychange', check);
      }
    };
  }, [minutes, lock]);
}
