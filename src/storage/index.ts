import type { VaultStore } from './vault-store';

/**
 * Native storage is not implemented yet: the web app ships first. The plan is
 * expo-file-system for the envelope (see docs/DESIGN.md, "Platform strategy").
 * Until then data lives only for the session so the app can still be run.
 */
let memory: unknown = null;

export const vaultStore: VaultStore = {
  load: async () => memory,
  save: async (envelope) => {
    memory = envelope;
  },
  wipe: async () => {
    memory = null;
  },
};
