/**
 * @jest-environment node
 */
import { vaultStore } from '@/storage';

import { useStore } from '../store';

const PASS = 'orange tiger lamp river';
const s = () => useStore.getState();

const netflix = {
  id: 'nf',
  name: 'Netflix',
  category: 'streaming' as const,
  amountCents: 1599,
  frequency: 'monthly' as const,
  anchorDate: '2026-01-20',
  createdAt: '',
  updatedAt: '',
};

describe('vault lifecycle', () => {
  beforeEach(async () => {
    await s().wipe();
  });

  it('creates, locks and unlocks', async () => {
    await s().init();
    expect(s().status).toBe('new');
    await s().createVault(PASS, { currency: 'EUR' });
    await s().saveBill(netflix);
    s().lock();
    expect(s().status).toBe('locked');
    expect(s().vault).toBeNull();

    const stored = JSON.stringify(await vaultStore.load());
    expect(stored).not.toContain('Netflix');

    expect(await s().unlock('not the passphrase')).toBe(false);
    expect(s().failedAttempts).toBe(1);
    expect(await s().unlock(PASS)).toBe(true);
    expect(s().vault?.bills).toEqual([netflix]);
    expect(s().vault?.settings.currency).toBe('EUR');
  });

  it('toggles payments and removes them with the bill', async () => {
    await s().createVault(PASS, {});
    await s().saveBill(netflix);
    await s().togglePaid(netflix, '2026-02-20');
    expect(s().vault?.payments).toHaveLength(1);
    await s().togglePaid(netflix, '2026-02-20');
    expect(s().vault?.payments).toHaveLength(0);
    await s().togglePaid(netflix, '2026-02-20');
    await s().deleteBill('nf');
    expect(s().vault?.payments).toHaveLength(0);
  });

  it('exports and restores an encrypted backup', async () => {
    await s().createVault(PASS, {});
    await s().saveBill(netflix);
    const backup = await s().exportBackup();
    expect(backup).not.toContain('Netflix');

    await s().wipe();
    expect(s().status).toBe('new');
    await expect(s().importBackup(backup, 'wrong passphrase!!')).rejects.toThrow(/Wrong passphrase/);
    await expect(s().importBackup('{"hello":1}', PASS)).rejects.toThrow(/not a Budget Bill backup/);
    await s().importBackup(backup, PASS);
    expect(s().status).toBe('unlocked');
    expect(s().vault?.bills).toEqual([netflix]);
  });

  it('changes the passphrase', async () => {
    await s().createVault(PASS, {});
    expect(await s().changePassphrase('wrong', 'a brand new passphrase')).toBe(false);
    expect(await s().changePassphrase(PASS, 'a brand new passphrase')).toBe(true);
    s().lock();
    expect(await s().unlock(PASS)).toBe(false);
    expect(await s().unlock('a brand new passphrase')).toBe(true);
  });
});
