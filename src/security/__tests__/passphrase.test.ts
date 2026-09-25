/**
 * @jest-environment node
 */
import { passphraseProblem, passphraseStrength } from '../passphrase';

describe('passphraseProblem', () => {
  it('allows passphrases as short as 4 characters', () => {
    expect(passphraseProblem('abc')).toMatch(/at least 4/);
    expect(passphraseProblem('abcd')).toBeNull();
    expect(passphraseProblem('1111')).toBeNull();
  });

  it('checks the confirmation', () => {
    expect(passphraseProblem('abcd', 'abce')).toMatch(/do not match/);
    expect(passphraseProblem('abcd', 'abcd')).toBeNull();
  });
});

describe('passphraseStrength', () => {
  it.each([
    ['1234', 'Weak'],
    ['4821', 'Weak'],
    ['aaaaaaaaaaaaaaaa', 'Weak'],
    ['password123!', 'Weak'],
    ['kx7#Qm', 'Fair'],
    ['sunflower7', 'Good'],
    ['maple rocket velvet harbor', 'Strong'],
    ['Tr0ub4dor&3xyzQ', 'Strong'],
  ])('rates %p as %s', (passphrase, label) => {
    expect(passphraseStrength(passphrase).label).toBe(label);
  });

  it('only gives a tip when not strong', () => {
    expect(passphraseStrength('1234').tip).toBeTruthy();
    expect(passphraseStrength('maple rocket velvet harbor').tip).toBeNull();
  });
});
