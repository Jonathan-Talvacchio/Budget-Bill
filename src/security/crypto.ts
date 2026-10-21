/**
 * Vault encryption using only the platform WebCrypto API (no third-party crypto).
 *
 * Two kinds of key protect the vault:
 *
 *   'passphrase': passphrase --PBKDF2-SHA256(salt, iter)--> AES-GCM-256 key (memory only)
 *   'device':     random AES-GCM-256 key kept in this browser's storage (no passphrase)
 *
 *   vault JSON --AES-GCM(key, fresh 96-bit IV, AAD = header)--> ciphertext
 *
 * Keys are always non-extractable. The header (including KDF parameters) is
 * bound into the AAD, so tampering with it makes decryption fail. No password
 * hash is stored: a successful authenticated decrypt is the check.
 *
 * A device key keeps plaintext out of storage, but anyone who can use this
 * browser profile can open the vault; only a passphrase protects against that.
 */
import { z } from 'zod';

export const KDF_ITERATIONS = 600_000; // OWASP 2023+ guidance for PBKDF2-HMAC-SHA256
export const MIN_ITERATIONS = 100_000; // refuse obviously weakened envelopes
export const MIN_PASSPHRASE_LENGTH = 4; // user choice; weaker ones get a warning (see passphrase.ts)

const header = {
  format: z.literal('budget-bill-vault'),
  v: z.literal(1),
  iv: z.string().min(16).max(32),
  ct: z.string().min(1).max(50_000_000),
};

export const passphraseEnvelopeSchema = z.object({
  ...header,
  kdf: z.literal('PBKDF2-SHA256'),
  iter: z.number().int().min(MIN_ITERATIONS).max(10_000_000),
  salt: z.string().min(16).max(64),
});
export type PassphraseEnvelope = z.infer<typeof passphraseEnvelopeSchema>;

export const deviceEnvelopeSchema = z.object({ ...header, kdf: z.literal('DEVICE-KEY') });
export type DeviceEnvelope = z.infer<typeof deviceEnvelopeSchema>;

export const envelopeSchema = z.discriminatedUnion('kdf', [passphraseEnvelopeSchema, deviceEnvelopeSchema]);
export type Envelope = z.infer<typeof envelopeSchema>;

/** Everything needed to re-encrypt without asking for the passphrase again. */
export type VaultKey =
  | { kind: 'passphrase'; key: CryptoKey; salt: string; iter: number }
  | { kind: 'device'; key: CryptoKey };

export class DecryptError extends Error {
  constructor() {
    super('Incorrect passphrase or damaged data.');
    this.name = 'DecryptError';
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Secure crypto is unavailable. Use a modern browser over HTTPS.');
  return s;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type KeyParams = { kdf: 'PBKDF2-SHA256'; iter: number; salt: string } | { kdf: 'DEVICE-KEY' };

function aad(p: KeyParams): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    p.kdf === 'DEVICE-KEY'
      ? 'budget-bill-vault|v1|DEVICE-KEY'
      : `budget-bill-vault|v1|PBKDF2-SHA256|${p.iter}|${p.salt}`,
  );
}

function paramsOf(vk: VaultKey): KeyParams {
  return vk.kind === 'device'
    ? { kdf: 'DEVICE-KEY' }
    : { kdf: 'PBKDF2-SHA256', iter: vk.iter, salt: vk.salt };
}

export async function deriveKey(
  passphrase: string,
  salt: string,
  iter: number = KDF_ITERATIONS,
): Promise<VaultKey & { kind: 'passphrase' }> {
  const base = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the raw key can never be read back out
    ['encrypt', 'decrypt'],
  );
  return { kind: 'passphrase', key, salt, iter };
}

/** Derives a key with a brand-new random salt (new vault or passphrase change). */
export function newVaultKey(
  passphrase: string,
  iter: number = KDF_ITERATIONS,
): Promise<VaultKey & { kind: 'passphrase' }> {
  return deriveKey(passphrase, toBase64(randomBytes(16)), iter);
}

/** A random key for a vault without a passphrase; it is stored on this device. */
export async function newDeviceKey(): Promise<VaultKey & { kind: 'device' }> {
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return { kind: 'device', key };
}

export async function encryptJSON(
  vk: VaultKey & { kind: 'passphrase' },
  data: unknown,
): Promise<PassphraseEnvelope>;
export async function encryptJSON(vk: VaultKey, data: unknown): Promise<Envelope>;
export async function encryptJSON(vk: VaultKey, data: unknown): Promise<Envelope> {
  const params = paramsOf(vk);
  const iv = randomBytes(12); // fresh IV for every save; never reused with the same key
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(params) },
    vk.key,
    encoder.encode(JSON.stringify(data)),
  );
  return {
    format: 'budget-bill-vault',
    v: 1,
    ...params,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptJSON(vk: VaultKey, env: Envelope): Promise<unknown> {
  try {
    if (paramsOf(vk).kdf !== env.kdf) throw new Error('Key does not match envelope');
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(env.iv), additionalData: aad(env) },
      vk.key,
      fromBase64(env.ct),
    );
    return JSON.parse(decoder.decode(pt));
  } catch {
    throw new DecryptError();
  }
}

/** Derives the key from the envelope's own parameters and decrypts it. */
export async function openEnvelope(
  passphrase: string,
  env: PassphraseEnvelope,
): Promise<{ vk: VaultKey; data: unknown }> {
  const vk = await deriveKey(passphrase, env.salt, env.iter);
  return { vk, data: await decryptJSON(vk, env) };
}

export function parseEnvelope(raw: unknown): Envelope | null {
  const r = envelopeSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Backup files are always passphrase-protected: a device key cannot leave the device. */
export function parseBackupEnvelope(raw: unknown): PassphraseEnvelope | null {
  const r = passphraseEnvelopeSchema.safeParse(raw);
  return r.success ? r.data : null;
}
