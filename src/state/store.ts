/**
 * App state. The decrypted vault and its key live only in memory while the app
 * is unlocked; every change is re-encrypted and written to storage immediately.
 * Locking drops both, so nothing readable remains in the JS heap we control.
 */
import { create } from 'zustand';

import { paymentKey } from '@/domain/billing';
import {
  emptyVault,
  vaultSchema,
  type Bill,
  type Income,
  type Settings,
  type Vault,
} from '@/domain/schema';
import {
  DecryptError,
  encryptJSON,
  newVaultKey,
  openEnvelope,
  parseEnvelope,
  type VaultKey,
} from '@/security/crypto';
import { vaultStore } from '@/storage';

export type Status = 'loading' | 'new' | 'locked' | 'unlocked';

type State = {
  status: Status;
  vault: Vault | null;
  /** Consecutive failed unlocks; drives an increasing delay. */
  failedAttempts: number;
};

type Actions = {
  init(): Promise<void>;
  createVault(passphrase: string, settings: Partial<Settings>): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  changePassphrase(current: string, next: string): Promise<boolean>;
  exportBackup(): Promise<string>;
  importBackup(json: string, passphrase: string): Promise<void>;
  wipe(): Promise<void>;

  saveBill(bill: Bill): Promise<void>;
  deleteBill(id: string): Promise<void>;
  togglePaid(bill: Bill, dueDate: string): Promise<void>;
  saveIncome(income: Income): Promise<void>;
  deleteIncome(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
};

// Held outside React state so it is never serialized, logged or passed to components.
let vaultKey: VaultKey | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export class BackupError extends Error {}

function parseVault(data: unknown): Vault {
  const r = vaultSchema.safeParse(data);
  if (!r.success) throw new BackupError('This data is not a valid Budget Bill vault.');
  return r.data;
}

function persist(vault: Vault): Promise<void> {
  const vk = vaultKey;
  if (!vk) return Promise.reject(new Error('Vault is locked.'));
  // Serialize writes so an older snapshot can never overwrite a newer one.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => vaultStore.save(await encryptJSON(vk, vault)));
  return writeQueue;
}

const unlockDelayMs = (failures: number) => (failures < 3 ? 0 : Math.min(30_000, 1000 * 2 ** (failures - 3)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useStore = create<State & Actions>()((set, get) => {
  /** Applies a change to the unlocked vault and saves it encrypted. */
  async function update(change: (v: Vault) => Vault) {
    const current = get().vault;
    if (!current) throw new Error('Vault is locked.');
    const next = change(current);
    set({ vault: next });
    await persist(next);
  }

  return {
    status: 'loading',
    vault: null,
    failedAttempts: 0,

    async init() {
      const stored = await vaultStore.load();
      set({ status: stored ? 'locked' : 'new' });
    },

    async createVault(passphrase, settings) {
      vaultKey = await newVaultKey(passphrase);
      const vault = emptyVault(settings);
      await persist(vault);
      set({ vault, status: 'unlocked', failedAttempts: 0 });
    },

    async unlock(passphrase) {
      await sleep(unlockDelayMs(get().failedAttempts));
      const env = parseEnvelope(await vaultStore.load());
      if (!env) throw new BackupError('Stored data is damaged or from an unknown version.');
      try {
        const { vk, data } = await openEnvelope(passphrase, env);
        const vault = parseVault(data);
        vaultKey = vk;
        set({ vault, status: 'unlocked', failedAttempts: 0 });
        return true;
      } catch (e) {
        if (!(e instanceof DecryptError)) throw e;
        set({ failedAttempts: get().failedAttempts + 1 });
        return false;
      }
    },

    lock() {
      vaultKey = null;
      set({ vault: null, status: get().status === 'new' ? 'new' : 'locked' });
    },

    async changePassphrase(current, next) {
      const env = parseEnvelope(await vaultStore.load());
      const vault = get().vault;
      if (!env || !vault) return false;
      try {
        await openEnvelope(current, env);
      } catch {
        return false;
      }
      vaultKey = await newVaultKey(next); // new salt as well as new key
      await persist(vault);
      return true;
    },

    async exportBackup() {
      // The stored envelope is already encrypted with the user's passphrase.
      await writeQueue;
      const env = parseEnvelope(await vaultStore.load());
      if (!env) throw new Error('Nothing to back up yet.');
      return JSON.stringify(env);
    },

    async importBackup(json, passphrase) {
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch {
        throw new BackupError('That file is not a Budget Bill backup.');
      }
      const env = parseEnvelope(raw);
      if (!env) throw new BackupError('That file is not a Budget Bill backup.');
      let opened: { vk: VaultKey; data: unknown };
      try {
        opened = await openEnvelope(passphrase, env);
      } catch {
        throw new BackupError('Wrong passphrase for this backup, or the file is damaged.');
      }
      const vault = parseVault(opened.data);
      // Adopt the backup's passphrase: it becomes this device's vault passphrase.
      vaultKey = opened.vk;
      await persist(vault);
      set({ vault, status: 'unlocked', failedAttempts: 0 });
    },

    async wipe() {
      vaultKey = null;
      await writeQueue.catch(() => undefined);
      await vaultStore.wipe();
      set({ vault: null, status: 'new', failedAttempts: 0 });
    },

    saveBill: (bill) =>
      update((v) => {
        const exists = v.bills.some((b) => b.id === bill.id);
        return {
          ...v,
          bills: exists ? v.bills.map((b) => (b.id === bill.id ? bill : b)) : [...v.bills, bill],
        };
      }),

    deleteBill: (id) =>
      update((v) => ({
        ...v,
        bills: v.bills.filter((b) => b.id !== id),
        payments: v.payments.filter((p) => p.billId !== id),
      })),

    togglePaid: (bill, dueDate) =>
      update((v) => {
        const key = paymentKey(bill.id, dueDate);
        const has = v.payments.some((p) => paymentKey(p.billId, p.dueDate) === key);
        return {
          ...v,
          payments: has
            ? v.payments.filter((p) => paymentKey(p.billId, p.dueDate) !== key)
            : [
                ...v.payments,
                {
                  billId: bill.id,
                  dueDate,
                  amountCents: bill.amountCents,
                  paidAt: new Date().toISOString(),
                },
              ],
        };
      }),

    saveIncome: (income) =>
      update((v) => {
        const exists = v.incomes.some((i) => i.id === income.id);
        return {
          ...v,
          incomes: exists
            ? v.incomes.map((i) => (i.id === income.id ? income : i))
            : [...v.incomes, income],
        };
      }),

    deleteIncome: (id) => update((v) => ({ ...v, incomes: v.incomes.filter((i) => i.id !== id) })),

    updateSettings: (patch) => update((v) => ({ ...v, settings: { ...v.settings, ...patch } })),
  };
});

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
