import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';

import type { VaultStore } from './vault-store';

const KEY = 'vault';
// IndexedDB stores the CryptoKey object itself; being non-extractable, its raw
// bytes can't be read back by page scripts.
const DEVICE_KEY = 'deviceKey';
let db: UseStore | null = null;
// Created lazily so static rendering (which runs in Node) never touches IndexedDB.
const store = () => (db ??= createStore('budget-bill', 'vault'));

export const vaultStore: VaultStore = {
  load: async () => (await get(KEY, store())) ?? null,
  save: (envelope) => set(KEY, envelope, store()),
  loadDeviceKey: async () => {
    const k = await get(DEVICE_KEY, store());
    return k instanceof CryptoKey ? k : null;
  },
  saveDeviceKey: (key) => set(DEVICE_KEY, key, store()),
  deleteDeviceKey: () => del(DEVICE_KEY, store()),
  wipe: async () => {
    await clear(store());
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Storage may be blocked (private mode); nothing else to clear.
    }
  },
};
