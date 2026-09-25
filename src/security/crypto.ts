/**
 * Vault encryption using only the platform WebCrypto API (no third-party crypto).
 *
 *   passphrase --PBKDF2-SHA256(salt, iter)--> AES-GCM-256 key (non-extractable, memory only)
 *   vault JSON --AES-GCM(key, fresh 96-bit IV, AAD = header)--> ciphertext
 *
 * The KDF parameters are bound into the AAD, so tampering with the stored
 * header (e.g. lowering the iteration count) makes decryption fail.
 * No password hash is stored: a successful authenticated decrypt is the check.
 */
import { z } from 'zod';

export const KDF_ITERATIONS = 600_000; // OWASP 2023+ guidance for PBKDF2-HMAC-SHA256
export const MIN_ITERATIONS = 100_000; // refuse obviously weakened envelopes
export const MIN_PASSPHRASE_LENGTH = 4; // user choice; weaker ones get a warning (see passphrase.ts)

export const envelopeSchema = z.object({
  format: z.literal('budget-bill-vault'),
  v: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'),
  iter: z.number().int().min(MIN_ITERATIONS).max(10_000_000),
  salt: z.string().min(16).max(64),
  iv: z.string().min(16).max(32),
  ct: z.string().min(1).max(50_000_000),
});
export type Envelope = z.infer<typeof envelopeSchema>;

/** Everything needed to re-encrypt without asking for the passphrase again. */
export type VaultKey = { key: CryptoKey; salt: string; iter: number };

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

function aad(iter: number, salt: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`budget-bill-vault|v1|PBKDF2-SHA256|${iter}|${salt}`);
}

export async function deriveKey(
  passphrase: string,
  salt: string,
  iter: number = KDF_ITERATIONS,
): Promise<VaultKey> {
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
  return { key, salt, iter };
}

/** Derives a key with a brand-new random salt (new vault or passphrase change). */
export function newVaultKey(passphrase: string, iter: number = KDF_ITERATIONS): Promise<VaultKey> {
  return deriveKey(passphrase, toBase64(randomBytes(16)), iter);
}

export async function encryptJSON(vk: VaultKey, data: unknown): Promise<Envelope> {
  const iv = randomBytes(12); // fresh IV for every save; never reused with the same key
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(vk.iter, vk.salt) },
    vk.key,
    encoder.encode(JSON.stringify(data)),
  );
  return {
    format: 'budget-bill-vault',
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: vk.iter,
    salt: vk.salt,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptJSON(vk: VaultKey, env: Envelope): Promise<unknown> {
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(env.iv), additionalData: aad(env.iter, env.salt) },
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
  env: Envelope,
): Promise<{ vk: VaultKey; data: unknown }> {
  const vk = await deriveKey(passphrase, env.salt, env.iter);
  return { vk, data: await decryptJSON(vk, env) };
}

export function parseEnvelope(raw: unknown): Envelope | null {
  const r = envelopeSchema.safeParse(raw);
  return r.success ? r.data : null;
}
