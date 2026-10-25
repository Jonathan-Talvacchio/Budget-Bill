/**
 * @jest-environment node
 */
import { todayISO } from '@/domain/billing';
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

  it('handles auto pay: start date, failed payments and undo', async () => {
    const today = todayISO();
    await s().createVault(null, {});
    // A new bill with auto pay covers it from its first due date.
    await s().saveBill({ ...netflix, autoPay: true });
    expect(s().vault!.bills[0].autoPaySince).toBe(netflix.anchorDate);

    // Turning it off and on again for an existing bill only covers it from today.
    await s().saveBill({ ...netflix, autoPay: false });
    expect(s().vault!.bills[0]).not.toHaveProperty('autoPaySince', expect.anything());
    await s().saveBill({ ...netflix, autoPay: true });
    expect(s().vault!.bills[0].autoPaySince).toBe(today);

    // Editing other fields keeps the start date.
    await s().saveBill({ ...netflix, autoPay: true, name: 'Netflix 4K' });
    expect(s().vault!.bills[0].autoPaySince).toBe(today);

    // Toggling an auto-paid occurrence marks it not paid, and back.
    const b = { ...s().vault!.bills[0], autoPaySince: '2026-01-01' };
    await s().saveBill(b);
    useStore.setState({ vault: { ...s().vault!, bills: [b] } });
    await s().togglePaid(b, '2026-02-20');
    expect(s().vault!.autoPaySkips).toEqual(['nf|2026-02-20']);
    expect(s().vault!.payments).toEqual([]);
    await s().togglePaid(b, '2026-02-20');
    expect(s().vault!.autoPaySkips).toEqual([]);

    // Deleting the bill clears its skips.
    await s().togglePaid(b, '2026-02-20');
    await s().deleteBill('nf');
    expect(s().vault!.autoPaySkips).toEqual([]);
  });

  it('works without a passphrase', async () => {
    await s().createVault(null, {});
    expect(s().status).toBe('unlocked');
    expect(s().protection).toBe('device');
    await s().saveBill(netflix);

    const stored = await vaultStore.load();
    expect(JSON.stringify(stored)).not.toContain('Netflix');
    expect((stored as { kdf: string }).kdf).toBe('DEVICE-KEY');

    // There is nothing to lock.
    s().lock();
    expect(s().status).toBe('unlocked');

    // A reload opens straight to the data, with no lock screen.
    useStore.setState({ status: 'loading', vault: null, protection: null });
    await s().init();
    expect(s().status).toBe('unlocked');
    expect(s().vault?.bills).toEqual([netflix]);
  });

  it('needs a passphrase for backups of a vault without one', async () => {
    await s().createVault(null, {});
    await s().saveBill(netflix);
    await expect(s().exportBackup()).rejects.toThrow(/passphrase for the backup/);
    const backup = await s().exportBackup('backup pass');
    expect(backup).not.toContain('Netflix');

    // Restoring on a fresh device adopts the backup's passphrase.
    await s().wipe();
    await s().importBackup(backup, 'backup pass');
    expect(s().protection).toBe('passphrase');
    expect(s().vault?.bills).toEqual([netflix]);

    // Restoring into a vault without a passphrase keeps it without one.
    await s().wipe();
    await s().createVault(null, {});
    await s().importBackup(backup, 'backup pass');
    expect(s().protection).toBe('device');
    expect(s().vault?.bills).toEqual([netflix]);
  });

  it('adds and removes a passphrase', async () => {
    await s().createVault(null, {});
    await s().saveBill(netflix);

    await s().setPassphrase(PASS);
    expect(s().protection).toBe('passphrase');
    expect(await vaultStore.loadDeviceKey()).toBeNull();
    s().lock();
    expect(s().status).toBe('locked');
    expect(await s().unlock(PASS)).toBe(true);

    expect(await s().removePassphrase('wrong passphrase')).toBe(false);
    expect(s().protection).toBe('passphrase');
    expect(await s().removePassphrase(PASS)).toBe(true);
    expect(s().protection).toBe('device');

    useStore.setState({ status: 'loading', vault: null, protection: null });
    await s().init();
    expect(s().status).toBe('unlocked');
    expect(s().vault?.bills).toEqual([netflix]);
  });

  it('wipes the device key', async () => {
    await s().createVault(null, {});
    await s().wipe();
    expect(await vaultStore.loadDeviceKey()).toBeNull();
    expect(s().status).toBe('new');
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
