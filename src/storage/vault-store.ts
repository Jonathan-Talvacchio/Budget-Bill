import type { Envelope } from '@/security/crypto';

/**
 * Persists the encrypted vault envelope. Implementations only ever see
 * ciphertext; plaintext data never touches storage.
 */
export interface VaultStore {
  load(): Promise<unknown | null>;
  save(envelope: Envelope): Promise<void>;
  /** Removes all app data from this device. */
  wipe(): Promise<void>;
}
