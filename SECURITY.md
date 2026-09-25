# Security Policy

Budget Bill handles personal financial information, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue.** Report it privately through GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository ("Report a vulnerability" on the Security tab).

Include what you found, steps to reproduce, and the impact you expect. You should get an acknowledgement within 7 days.

## Scope

In scope:
- Anything that exposes vault contents or the passphrase.
- Weaknesses in the encryption envelope (`src/security/crypto.ts`).
- Ways to bypass the Content-Security-Policy.
- XSS.
- Backup-import parsing issues.
- Supply-chain problems in this repository's build and deploy pipeline.

Out of scope:
- Attacks that require an already-compromised device or browser (malware, malicious extensions).
- Lack of HTTP security headers that GitHub Pages cannot set (documented in `docs/DESIGN.md` §7.5).

## Design summary

- **Encryption:** the vault is encrypted with AES-256-GCM, using a non-extractable key derived with PBKDF2-SHA256 (600,000 iterations, random 128-bit salt).
- **Tamper protection:** the KDF parameters are authenticated as associated data.
- **Network:** no data leaves the device, and the CSP sets `connect-src 'none'`.
- **Passphrase:** there is no server-side recovery; the passphrase is never stored.

See [docs/DESIGN.md](docs/DESIGN.md) §7 for the full threat model.
