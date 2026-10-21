import type { Envelope } from '@/security/crypto';

/**
 * Persists the encrypted vault envelope. Implementations only ever see
 * ciphertext; plaintext data never touches storage.
 */
export interface VaultStore {
  load(): Promise<unknown | null>;
  save(envelope: Envelope): Promise<void>;
  /** The non-extractable key of a vault without a passphrase, if any. */
  loadDeviceKey(): Promise<CryptoKey | null>;
  saveDeviceKey(key: CryptoKey): Promise<void>;
  deleteDeviceKey(): Promise<void>;
  /** Removes all app data from this device, including any device key. */
  wipe(): Promise<void>;
}
