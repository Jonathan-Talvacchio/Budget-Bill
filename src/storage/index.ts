import type { VaultStore } from './vault-store';

/**
 * Native storage is not implemented yet: the web app ships first. The plan is
 * expo-file-system for the envelope and expo-secure-store for a device key
 * (see docs/DESIGN.md, "Platform strategy"). Until then data lives only for
 * the session so the app can still be run.
 */
let memory: unknown = null;
let deviceKey: CryptoKey | null = null;

export const vaultStore: VaultStore = {
  load: async () => memory,
  save: async (envelope) => {
    memory = envelope;
  },
  loadDeviceKey: async () => deviceKey,
  saveDeviceKey: async (key) => {
    deviceKey = key;
  },
  deleteDeviceKey: async () => {
    deviceKey = null;
  },
  wipe: async () => {
    memory = null;
    deviceKey = null;
  },
};
