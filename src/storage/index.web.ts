import { clear, createStore, get, set, type UseStore } from 'idb-keyval';

import type { VaultStore } from './vault-store';

const KEY = 'vault';
let db: UseStore | null = null;
// Created lazily so static rendering (which runs in Node) never touches IndexedDB.
const store = () => (db ??= createStore('budget-bill', 'vault'));

export const vaultStore: VaultStore = {
  load: async () => (await get(KEY, store())) ?? null,
  save: (envelope) => set(KEY, envelope, store()),
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
