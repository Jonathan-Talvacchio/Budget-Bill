/**
 * @jest-environment node
 */
import { CATALOG } from '../catalog';
import { emptyVault, vaultSchema } from '../schema';

describe('vault schema', () => {
  it('accepts an empty vault', () => {
    expect(vaultSchema.safeParse(emptyVault()).success).toBe(true);
  });

  it('loads vaults saved before the income mode setting existed', () => {
    const old = { ...emptyVault(), settings: { currency: 'USD', autoLockMinutes: 5 } };
    const parsed = vaultSchema.safeParse(old);
    expect(parsed.success && parsed.data.settings.incomeMode).toBe('spread');
    expect(vaultSchema.safeParse({ ...old, settings: { ...old.settings, incomeMode: 'weekly' } }).success).toBe(false);
  });

  it('rejects fractional or negative amounts and bad dates', () => {
    const base = {
      id: 'x',
      name: 'X',
      category: 'other',
      frequency: 'monthly',
      anchorDate: '2026-01-01',
      createdAt: '',
      updatedAt: '',
    };
    const withBill = (b: object) => vaultSchema.safeParse({ ...emptyVault(), bills: [{ ...base, ...b }] });
    expect(withBill({ amountCents: 100 }).success).toBe(true);
    expect(withBill({ amountCents: 1.5 }).success).toBe(false);
    expect(withBill({ amountCents: -1 }).success).toBe(false);
    expect(withBill({ amountCents: 100, anchorDate: '2026-13-01' }).success).toBe(false);
    expect(withBill({ amountCents: 100, category: '<script>' }).success).toBe(false);
  });
});

describe('catalog', () => {
  it('has unique ids', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
