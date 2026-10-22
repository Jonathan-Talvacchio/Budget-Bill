/**
 * Installable web app (PWA) support: service worker for offline use, the
 * browser's install prompt, and local notifications for bill reminders.
 * The service worker itself (dist/sw.js) is generated at build time by
 * scripts/postexport-pages.mjs.
 */
import { useSyncExternalStore } from 'react';

const BASE = process.env.EXPO_BASE_URL ?? '';

export const pwaSupported = true;

let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null);

/** Registers the offline service worker (production builds only; the dev server has none). */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  registration = navigator.serviceWorker
    .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
    .catch(() => null);
}

// ---- install prompt

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  // Chrome/Edge/Android fire this when the app can be installed; keep it for our own button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

function isStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstallState(): 'installed' | 'available' | 'manual' {
  return useSyncExternalStore(
    subscribe,
    () => (isStandalone() ? 'installed' : deferredPrompt ? 'available' : 'manual'),
    () => 'manual',
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return outcome === 'accepted';
}

// ---- notifications

export type Permission = NotificationPermission | 'unsupported';

export function notificationPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestNotificationPermission(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/** Shows a local notification. Nothing is sent over the network. */
export async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options: NotificationOptions = { body, tag, icon: `${BASE}/icons/icon-1024.png` };
  const reg = await registration;
  try {
    // Android Chrome only allows notifications through a service worker.
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
