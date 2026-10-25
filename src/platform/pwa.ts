/**
 * Native placeholder: install prompts don't apply to native apps, and native
 * reminders will use expo-notifications in the mobile milestone (docs/DESIGN.md §9).
 */
export const pwaSupported = false;

export function registerServiceWorker(): void {}

export function useInstallState(): 'installed' | 'available' | 'manual' {
  return 'installed';
}

export async function promptInstall(): Promise<boolean> {
  return false;
}

export type Permission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): Permission {
  return 'unsupported';
}

export async function requestNotificationPermission(): Promise<Permission> {
  return 'unsupported';
}

export async function showNotification(_title: string, _body: string, _tag: string): Promise<boolean> {
  return false;
}

export type StorageProtection = 'persisted' | 'not-persisted' | 'unsupported';

/** Native app storage isn't cleared under storage pressure the way browser storage can be. */
export async function storageProtection(): Promise<StorageProtection> {
  return 'unsupported';
}

export async function requestPersistentStorage(): Promise<StorageProtection> {
  return 'unsupported';
}
