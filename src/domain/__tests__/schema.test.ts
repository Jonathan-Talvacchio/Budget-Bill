/**
 * @jest-environment node
 */
import { CATALOG } from '../catalog';
import { emptyVault, vaultSchema } from '../schema';

describe('vault schema', () => {
  it('accepts an empty vault', () => {
    expect(vaultSchema.safeParse(emptyVault()).success).toBe(true);
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
