import { MIN_PASSPHRASE_LENGTH } from './crypto';

/** Returns a user-facing problem with the passphrase, or null if it is acceptable. */
export function passphraseProblem(passphrase: string, confirm?: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words works well.`;
  }
  if (new Set(passphrase).size < 5) return 'That passphrase is too repetitive.';
  if (confirm !== undefined && confirm !== passphrase) return 'Passphrases do not match.';
  return null;
}
