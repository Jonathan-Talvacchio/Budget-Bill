/**
 * App state. The decrypted vault and its key live only in memory while the app
 * is unlocked; every change is re-encrypted and written to storage immediately.
 * Locking drops both, so nothing readable remains in the JS heap we control.
 *
 * A vault is protected either by a passphrase or, if the user chose not to set
 * one, by a device key stored in this browser (see security/crypto.ts). A
 * device-key vault opens without a lock screen and cannot be locked.
 */
import { create } from 'zustand';

import { paymentKey, todayISO } from '@/domain/billing';
import { withPriceChange } from '@/domain/insights';
import { updateReminderLog } from '@/domain/reminders';
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
  decryptJSON,
  encryptJSON,
  newDeviceKey,
  newVaultKey,
  openEnvelope,
  parseBackupEnvelope,
  parseEnvelope,
  type PassphraseEnvelope,
  type VaultKey,
} from '@/security/crypto';
import { vaultStore } from '@/storage';

export type Status = 'loading' | 'new' | 'locked' | 'unlocked';
export type Protection = 'passphrase' | 'device';

type State = {
  status: Status;
  /** How the stored vault is protected; null until known (or for a new vault). */
  protection: Protection | null;
  vault: Vault | null;
  /** Consecutive failed unlocks; drives an increasing delay. */
  failedAttempts: number;
};

type Actions = {
  init(): Promise<void>;
  /** Pass null for a vault without a passphrase. */
  createVault(passphrase: string | null, settings: Partial<Settings>): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  changePassphrase(current: string, next: string): Promise<boolean>;
  /** Adds a passphrase to a vault that has none. */
  setPassphrase(next: string): Promise<void>;
  /** Removes the passphrase; the vault then opens without one on this device. */
  removePassphrase(current: string): Promise<boolean>;
  /** Without a vault passphrase, `backupPassphrase` encrypts the backup file. */
  exportBackup(backupPassphrase?: string): Promise<string>;
  importBackup(json: string, passphrase: string): Promise<void>;
  wipe(): Promise<void>;

  saveBill(bill: Bill): Promise<void>;
  /** Adds several new bills at once (CSV import). */
  importBills(bills: Bill[]): Promise<void>;
  /** Records bill occurrences that have been reminded about. */
  markReminded(keys: string[]): Promise<void>;
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

/** The stored vault envelope, if it is passphrase-protected. */
async function storedPassphraseEnvelope(): Promise<PassphraseEnvelope | null> {
  const env = parseEnvelope(await vaultStore.load());
  return env?.kdf === 'PBKDF2-SHA256' ? env : null;
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
    protection: null,
    vault: null,
    failedAttempts: 0,

    async init() {
      const stored = await vaultStore.load();
      if (!stored) return set({ status: 'new', protection: null });
      const env = parseEnvelope(stored);
      if (env?.kdf !== 'DEVICE-KEY') return set({ status: 'locked', protection: 'passphrase' });

      // No passphrase: open straight away with the key stored on this device.
      // A missing or wrong key leaves the vault locked (never 'new', which would overwrite it).
      const key = await vaultStore.loadDeviceKey();
      if (!key) return set({ status: 'locked', protection: 'device' });
      const vk: VaultKey = { kind: 'device', key };
      let vault: Vault;
      try {
        vault = parseVault(await decryptJSON(vk, env));
      } catch {
        return set({ status: 'locked', protection: 'device' });
      }
      vaultKey = vk;
      set({ vault, status: 'unlocked', protection: 'device', failedAttempts: 0 });
    },

    async createVault(passphrase, settings) {
      if (passphrase === null) {
        const vk = await newDeviceKey();
        await vaultStore.saveDeviceKey(vk.key);
        vaultKey = vk;
      } else {
        vaultKey = await newVaultKey(passphrase);
      }
      const vault = emptyVault(settings);
      await persist(vault);
      set({
        vault,
        status: 'unlocked',
        protection: passphrase === null ? 'device' : 'passphrase',
        failedAttempts: 0,
      });
    },

    async unlock(passphrase) {
      await sleep(unlockDelayMs(get().failedAttempts));
      const env = await storedPassphraseEnvelope();
      if (!env) throw new BackupError('Stored data is damaged or from an unknown version.');
      try {
        const { vk, data } = await openEnvelope(passphrase, env);
        const vault = parseVault(data);
        vaultKey = vk;
        set({ vault, status: 'unlocked', protection: 'passphrase', failedAttempts: 0 });
        return true;
      } catch (e) {
        if (!(e instanceof DecryptError)) throw e;
        set({ failedAttempts: get().failedAttempts + 1 });
        return false;
      }
    },

    lock() {
      if (get().protection === 'device') return; // nothing to lock without a passphrase
      vaultKey = null;
      set({ vault: null, status: get().status === 'new' ? 'new' : 'locked' });
    },

    async changePassphrase(current, next) {
      const env = await storedPassphraseEnvelope();
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

    async setPassphrase(next) {
      const vault = get().vault;
      if (!vault || get().protection !== 'device') throw new Error('A passphrase is already set.');
      vaultKey = await newVaultKey(next);
      await persist(vault);
      // Only drop the device key once the passphrase-protected copy is saved.
      await vaultStore.deleteDeviceKey();
      set({ protection: 'passphrase', failedAttempts: 0 });
    },

    async removePassphrase(current) {
      const env = await storedPassphraseEnvelope();
      const vault = get().vault;
      if (!env || !vault) return false;
      try {
        await openEnvelope(current, env);
      } catch {
        return false;
      }
      const vk = await newDeviceKey();
      // Store the key before the vault that needs it, so a failure never strands data.
      await vaultStore.saveDeviceKey(vk.key);
      vaultKey = vk;
      await persist(vault);
      set({ protection: 'device', failedAttempts: 0 });
      return true;
    },

    async exportBackup(backupPassphrase) {
      await writeQueue;
      // A passphrase vault is stored already encrypted with the user's passphrase.
      const env = await storedPassphraseEnvelope();
      if (env) return JSON.stringify(env);
      // A device key can't leave this device, so encrypt the file with its own passphrase.
      const vault = get().vault;
      if (!vault) throw new Error('Nothing to back up yet.');
      if (!backupPassphrase) throw new BackupError('Choose a passphrase for the backup file.');
      return JSON.stringify(await encryptJSON(await newVaultKey(backupPassphrase), vault));
    },

    async importBackup(json, passphrase) {
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch {
        throw new BackupError('That file is not a Budget Bill backup.');
      }
      const env = parseBackupEnvelope(raw);
      if (!env) throw new BackupError('That file is not a Budget Bill backup.');
      let opened: { vk: VaultKey; data: unknown };
      try {
        opened = await openEnvelope(passphrase, env);
      } catch {
        throw new BackupError('Wrong passphrase for this backup, or the file is damaged.');
      }
      const vault = parseVault(opened.data);
      // Restoring into a vault without a passphrase keeps it that way; otherwise
      // the backup's passphrase becomes this device's vault passphrase.
      const keepDevice = get().status === 'unlocked' && get().protection === 'device';
      if (!keepDevice) vaultKey = opened.vk;
      await persist(vault);
      if (!keepDevice) await vaultStore.deleteDeviceKey();
      set({
        vault,
        status: 'unlocked',
        protection: keepDevice ? 'device' : 'passphrase',
        failedAttempts: 0,
      });
    },

    async wipe() {
      vaultKey = null;
      await writeQueue.catch(() => undefined);
      await vaultStore.wipe();
      set({ vault: null, status: 'new', protection: null, failedAttempts: 0 });
    },

    saveBill: (bill) =>
      update((v) => {
        const prev = v.bills.find((b) => b.id === bill.id);
        const next = withPriceChange(prev, bill, todayISO());
        return {
          ...v,
          bills: prev ? v.bills.map((b) => (b.id === bill.id ? next : b)) : [...v.bills, next],
        };
      }),

    importBills: (bills) => update((v) => ({ ...v, bills: [...v.bills, ...bills].slice(0, 2000) })),

    markReminded: (keys) =>
      update((v) => ({ ...v, reminderLog: updateReminderLog(v.reminderLog, keys, todayISO()) })),

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
