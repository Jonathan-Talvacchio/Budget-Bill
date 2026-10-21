/**
 * @jest-environment node
 */
import { emptyVault } from '@/domain/schema';

import {
  decryptJSON,
  DecryptError,
  encryptJSON,
  fromBase64,
  newDeviceKey,
  newVaultKey,
  openEnvelope,
  parseBackupEnvelope,
  parseEnvelope,
  toBase64,
} from '../crypto';

// Low iteration count keeps tests fast; production uses KDF_ITERATIONS.
const ITER = 100_000;
const PASS = 'correct horse battery staple';

describe('vault crypto', () => {
  it('round-trips data with the right passphrase', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const vault = emptyVault({ currency: 'EUR' });
    const env = await encryptJSON(vk, vault);
    expect(parseEnvelope(env)).toEqual(env);
    const { data } = await openEnvelope(PASS, env);
    expect(data).toEqual(vault);
  });

  it('never stores plaintext', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const env = await encryptJSON(vk, { secret: 'Netflix 15.99' });
    expect(JSON.stringify(env)).not.toContain('Netflix');
    expect(JSON.stringify(env)).not.toContain(PASS);
  });

  it('uses a fresh IV for every save', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const a = await encryptJSON(vk, { x: 1 });
    const b = await encryptJSON(vk, { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects a wrong passphrase', async () => {
    const env = await encryptJSON(await newVaultKey(PASS, ITER), { x: 1 });
    await expect(openEnvelope('wrong passphrase!!', env)).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects tampered ciphertext', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const env = await encryptJSON(vk, { x: 1 });
    const ct = fromBase64(env.ct);
    ct[0] ^= 1;
    await expect(decryptJSON(vk, { ...env, ct: toBase64(ct) })).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects tampered KDF parameters (bound as associated data)', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const env = await encryptJSON(vk, { x: 1 });
    await expect(decryptJSON(vk, { ...env, iter: ITER + 1 })).rejects.toBeInstanceOf(DecryptError);
  });

  it('refuses envelopes with weakened or unknown parameters', async () => {
    const env = await encryptJSON(await newVaultKey(PASS, ITER), { x: 1 });
    expect(parseEnvelope({ ...env, iter: 1000 })).toBeNull();
    expect(parseEnvelope({ ...env, kdf: 'MD5' })).toBeNull();
    expect(parseEnvelope({ ...env, v: 2 })).toBeNull();
    expect(parseEnvelope('not an object')).toBeNull();
  });

  it('encrypts with a device key when there is no passphrase', async () => {
    const dk = await newDeviceKey();
    expect(dk.key.extractable).toBe(false);
    const env = await encryptJSON(dk, { secret: 'Netflix' });
    expect(env.kdf).toBe('DEVICE-KEY');
    expect(JSON.stringify(env)).not.toContain('Netflix');
    expect(parseEnvelope(env)).toEqual(env);
    expect(await decryptJSON(dk, env)).toEqual({ secret: 'Netflix' });
    // Another device's key can't open it.
    await expect(decryptJSON(await newDeviceKey(), env)).rejects.toBeInstanceOf(DecryptError);
  });

  it('never accepts a device-key envelope as a backup file', async () => {
    const env = await encryptJSON(await newDeviceKey(), { x: 1 });
    expect(parseBackupEnvelope(env)).toBeNull();
    const pass = await encryptJSON(await newVaultKey(PASS, ITER), { x: 1 });
    expect(parseBackupEnvelope(pass)).toEqual(pass);
  });

  it('rejects a header swapped between key kinds', async () => {
    const vk = await newVaultKey(PASS, ITER);
    const env = await encryptJSON(vk, { x: 1 });
    const { iter: _i, salt: _s, ...rest } = env;
    await expect(decryptJSON(vk, { ...rest, kdf: 'DEVICE-KEY' })).rejects.toBeInstanceOf(DecryptError);
  });

  it('derives a non-extractable key', async () => {
    const { key } = await newVaultKey(PASS, ITER);
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy();
  });
});
