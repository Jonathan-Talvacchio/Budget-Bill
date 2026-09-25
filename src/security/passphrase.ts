import { MIN_PASSPHRASE_LENGTH } from './crypto';

/** Returns a user-facing problem with the passphrase, or null if it is acceptable. */
export function passphraseProblem(passphrase: string, confirm?: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  if (confirm !== undefined && confirm !== passphrase) return 'Passphrases do not match.';
  return null;
}

export type StrengthLevel = 0 | 1 | 2 | 3;

export type Strength = {
  level: StrengthLevel;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  tip: string | null;
};

// A few of the most-guessed passwords; anything containing one is rated weak.
const COMMON = [
  'password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'iloveyou', 'admin', 'monkey',
  'dragon', 'abc123', '123456', '1234', '0000', '1111', 'budget', 'money',
];

/**
 * Rough strength estimate used only to encourage better passphrases; it never
 * blocks one. Estimates guessing entropy from length, character variety and
 * repetition, and treats common passwords as weak.
 */
export function passphraseStrength(passphrase: string): Strength {
  const lower = passphrase.toLowerCase();
  let pool = 0;
  if (/[a-z]/.test(passphrase)) pool += 26;
  if (/[A-Z]/.test(passphrase)) pool += 26;
  if (/\d/.test(passphrase)) pool += 10;
  if (/[^a-zA-Z\d]/.test(passphrase)) pool += 33;

  // Repeated characters add little: "aaaaaaaa" is not 8 characters of strength.
  const unique = new Set(passphrase).size;
  const effectiveLength = Math.min(passphrase.length, unique * 3);
  let bits = pool > 0 ? effectiveLength * Math.log2(pool) : 0;
  if (COMMON.some((c) => lower.includes(c))) bits = Math.min(bits, 20);

  if (bits < 28) {
    return {
      level: 0,
      label: 'Weak',
      tip: 'Anyone who gets a copy of your data could guess this quickly. Try a longer passphrase.',
    };
  }
  if (bits < 45) {
    return { level: 1, label: 'Fair', tip: 'Adding a few more words or characters makes it much harder to guess.' };
  }
  if (bits < 60) return { level: 2, label: 'Good', tip: 'Good. A little longer would make it strong.' };
  return { level: 3, label: 'Strong', tip: null };
}
