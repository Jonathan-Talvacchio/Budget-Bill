# Budget Bill — Design Document

| | |
|---|---|
| **Status** | v0.1: web MVP implemented |
| **Last updated** | 2026-09-24 |
| **Platforms** | Web (GitHub Pages) now; Android and iOS next |

## 1. Summary

Budget Bill is a privacy-first budgeting app for **recurring bills and services**, such as rent, utilities, streaming, insurance and memberships. It answers three questions:

1. **How much will I spend on bills this month / this year?**
2. **How much have I paid, and what is still due?**
3. **How much money is left to spend after bills?**

Users add bills from a **catalog of common services** or as **custom** entries. Financial data never leaves the device unencrypted. In the MVP it never leaves the device at all.

## 2. Goals and non-goals

### Goals
- Track monthly, yearly, quarterly and weekly bills, and see which ones are due next.
- Show period totals: bills due, paid, still due, income, and left to spend. Available for month and year views, with navigation to past and future periods.
- Add bills quickly from a catalog of 60+ common bills, or enter a custom bill.
- **Security and privacy come first.** All data is encrypted at rest. There are no accounts, no servers, no third-party network calls, and no analytics.
- One TypeScript codebase that targets web, Android and iOS.
- Host for free on GitHub Pages, with a documented path to a more capable host.

### Non-goals (for now)
- Linking bank accounts or importing transactions.
- Tracking every purchase (this is a *bill* tracker, not a full expense ledger).
- Cloud sync or sharing between people (see the roadmap: only with end-to-end encryption).
- Currency conversion, and currencies without 2 decimal places (such as JPY).

## 3. User stories

| # | As a user I want to… | MVP |
|---|---|---|
| U1 | create a private vault protected by a passphrase | ✅ |
| U2 | enter my income (one or more sources: weekly, monthly or yearly) | ✅ |
| U2b | choose whether income is spread evenly across months or counted on actual paydays | ✅ |
| U2c | edit an income source (name, amount, frequency, payday) | ✅ |
| U3 | add a bill by picking a common service (Netflix, rent, electric…) | ✅ |
| U4 | add a custom bill with any name, amount, frequency, due date and end date | ✅ |
| U5 | see this month's bills sorted by due date, including which are overdue | ✅ |
| U6 | mark a bill as paid for a specific due date | ✅ |
| U7 | see how much is left to spend this month and this year | ✅ |
| U8 | see a month-by-month breakdown of the year | ✅ |
| U9 | see what each bill costs per month on average (e.g. $139/yr ≈ $11.58/mo) | ✅ |
| U10 | have the app lock itself when I walk away | ✅ |
| U11 | back up my data and move it to another device | ✅ (encrypted file) |
| U12 | erase everything on this device | ✅ |
| U13 | get reminders before bills are due | Roadmap (mobile) |

## 4. Screens

| Route | Purpose |
|---|---|
| *(gate)* Onboarding | Create a passphrase (with an explicit warning that it cannot be recovered), choose a currency, and enter optional income. Or restore from a backup file. |
| *(gate)* Unlock | Enter the passphrase. Failed attempts add a growing delay. There is also an "erase and start over" option. |
| `/` Overview | Month/Year toggle and ‹ › period navigation. **Left to spend** hero card. Cards for Total bills, Paid, Still due and Income. Month view: a list of occurrences with a paid checkbox and an overdue flag. Year view: month-by-month totals. |
| `/bills` | Every bill sorted by next due date, category filter chips, and average-per-month and per-year totals. |
| `/bill/new` | Searchable catalog grouped by category, plus **Custom bill**, which leads to the bill form. |
| `/bill/edit?id=` | Edit or delete a bill. Uses a query parameter, not a dynamic `[id]` segment, so the static export needs a single HTML page. |
| `/settings` | Income sources (add, edit, remove), currency, auto-lock timeout, change passphrase, export/import backup, privacy statement, erase all data. |

The onboarding and unlock screens are rendered **by the root layout instead of the router**. No route and no data can render until the vault is decrypted, and a deep link such as `/settings` still opens after unlocking.

## 5. Data model

All data lives in one **vault** object. It is validated with zod (`src/domain/schema.ts`) every time it is loaded or imported.

```ts
Vault    { version: 1, bills: Bill[], payments: Payment[], incomes: Income[], settings: Settings }
Bill     { id, name, catalogId?, category, amountCents, frequency, anchorDate, endDate?, notes?, createdAt, updatedAt }
Payment  { billId, dueDate, paidAt, amountCents }     // settles one occurrence
Income   { id, label, amountCents, frequency, anchorDate? }   // anchorDate = a payday
Settings { currency, autoLockMinutes, incomeMode: 'spread' | 'paydays' }
frequency ∈ weekly | monthly | quarterly | yearly
```

- **Money is always stored as integer cents.** Floating-point numbers are never used for money. Formatting uses `Intl.NumberFormat`.
- **Dates are `YYYY-MM-DD` strings**, compared as strings and calculated on calendar fields. Results never depend on the time zone or daylight saving time.
- A payment records the amount actually paid. If a bill's price changes later, past periods still show what was paid.
- The schema caps array lengths and string sizes, so a malicious backup file cannot exhaust memory.

## 6. Calculation rules (`src/domain/billing.ts`)

- **Occurrences:** a bill repeats from `anchorDate` every 1, 3 or 12 months (or every 7 days for weekly bills) until `endDate`.
- **Month-end handling:** if the due day doesn't exist in a month, the bill falls on that month's last day (the 31st becomes Apr 30 or Feb 28/29). Later months return to the original day. A yearly bill anchored on Feb 29 falls on Feb 28 in non-leap years.
- **Period totals:**
  - `totalDue` = every occurrence in the period.
  - `paid` = occurrences that have a payment.
  - `remaining = totalDue − paid`.
- **Income counting** is the user's choice (`settings.incomeMode`). It can be switched from the overview, Settings, or onboarding:
  - **Spread evenly** (the default): all income is converted to a yearly amount (weekly ×52, monthly ×12, quarterly ×4, yearly ×1), and a month gets 1/12 of it. Months are easy to compare.
  - **On paydays:** each paycheck counts in the period it lands in, using the income's `anchorDate` and the same recurrence rules as bills. A month with five weekly paydays shows five paychecks, and a year can contain 53 weekly paydays. The stored payday only fixes the schedule, so paychecks are counted in earlier months too, not just from the entered date onward. Internally the anchor is moved back 400 years, a full Gregorian cycle, so weekdays and leap days line up exactly. Income without a payday (entries saved before this option existed) is still spread evenly.
  - `incomeMode` defaults to `'spread'` in the schema, so older vaults and backups load unchanged.
- **Left to spend** = `income − totalDue` for the period. A negative value is shown as a shortfall.
- **Monthly equivalent** of a bill = yearly cost ÷ 12, used on the Bills screen.

This code has no dependencies and is covered by unit tests: leap years, month-end handling, quarterly bills across years, weekly bills across DST changes, end dates, and totals.

## 7. Security and privacy architecture

### 7.1 Threat model

| Threat | Mitigation |
|---|---|
| Someone gets the device's browser storage (stolen laptop, shared computer, malware reading files) | The vault is encrypted with AES-256-GCM using a key derived from the passphrase. Only ciphertext is stored. |
| Offline passphrase guessing on stolen ciphertext | PBKDF2-SHA256 with 600,000 iterations (OWASP guidance), a random 128-bit salt per vault. A live strength meter encourages long passphrases (see §7.3). |
| Tampering with stored data or backups | AES-GCM authenticates the data. The KDF parameters are bound as associated data (AAD), so lowering the iteration count makes decryption fail. Envelopes below 100k iterations are refused. After decryption the data is validated with zod. |
| Leaving the app open and unattended | Auto-lock after 1, 5, 15 or 30 minutes of inactivity, measured by wall-clock time so a sleeping or backgrounded tab locks as soon as it returns. A manual **Lock** button. Locking drops the key and the decrypted vault from memory. |
| Data leaving the device | No backend, analytics, telemetry, remote fonts, CDNs or remote logos. The CSP sets `connect-src 'none'`, so the page *cannot* make network requests even if a bug tried to. |
| XSS / script injection | A strict CSP: `script-src 'self'` plus the SHA-256 hash of the single inline hydration script, and `default-src 'none'`. React escapes all text, and ESLint forbids `dangerouslySetInnerHTML`, `eval` and `new Function`. |
| Supply-chain compromise | Few dependencies (template extras removed), lockfile committed, `npm ci` in CI, Dependabot, CodeQL, `npm audit` gate for production dependencies, and GitHub Actions granted the least permissions they need. |
| Leaking which services a user has | The catalog is bundled in the app. Logos are never fetched. `Referrer-Policy: no-referrer`. |
| Password managers or autofill storing secrets | Passphrase fields use `autocomplete="off"`. Amount fields turn autocomplete off. The notes field warns against storing account numbers. |

**Out of scope for the MVP:** a fully compromised device or browser (a keylogger or a malicious extension can read anything the user types), and a malicious GitHub Pages or CDN operator serving modified JavaScript. See the roadmap for Subresource Integrity (SRI) and a signed release mirror.

### 7.2 Cryptography (`src/security/crypto.ts`)
Only the browser/platform **WebCrypto** API is used. There are no third-party crypto libraries.

```
salt  = random 16 bytes (new per vault and on every passphrase change)
key   = PBKDF2-SHA256(passphrase, salt, 600k) → AES-GCM-256, non-extractable
iv    = random 12 bytes, fresh for every save
AAD   = "budget-bill-vault|v1|PBKDF2-SHA256|<iter>|<salt>"
store = { format, v:1, kdf, iter, salt, iv, ct }   (base64)
```

- No password hash or verifier is stored. A successful authenticated decryption proves the passphrase is correct.
- The `CryptoKey` is **non-extractable**. It lives in a module variable, never in React state, and is dropped on lock.
- **Backups** are the same encrypted envelope, saved as a `.bbvault` file. They are never uploaded anywhere. Restoring a backup requires the passphrase that was in use when it was exported.
- **Future hardening:** move to Argon2id (memory-hard) through an audited WASM build once one ships well with Expo. The envelope already has a `kdf` field and a version for this migration.

### 7.3 Passphrase policy
Users may choose a passphrase as short as **4 characters**, so a PIN-style code is allowed. This is a deliberate trade-off in favour of usability.

**How users are encouraged toward stronger passphrases:**
- `passphraseStrength()` in `src/security/passphrase.ts` estimates guessing entropy from length, character variety and repetition. Well-known passwords are capped at Weak.
- A live meter shows **Weak / Fair / Good / Strong** with a tip, on onboarding and on change-passphrase. The empty-field hint suggests a few random words.
- The meter never blocks a weak passphrase.

**Why a weak passphrase matters:**
- Anyone who obtains a copy of the encrypted data can try guesses offline, where the unlock delay doesn't apply.
- Their only obstacle is the KDF cost: 600k PBKDF2 iterations, about 0.3–1 s per guess on a normal CPU, and far less per guess on GPUs.
- A 4-digit PIN (10,000 possibilities) can be found within hours on one CPU, or minutes with specialised hardware.
- A four-random-word passphrase is out of reach.

**Why the trade-off is acceptable for this threat model:**
- Short passphrases still protect against casual access.
- The data never leaves the device unless the user exports a backup.

**Planned:**
- On mobile, a device-bound key (Keychain/Keystore, §9) will let a short PIN or biometric unlock without being the only thing protecting the data.
- Moving the KDF to Argon2id raises the cost of every guess.

### 7.4 Unlock throttling
After 3 wrong attempts, each new attempt waits 1s, 2s, 4s… up to 30s. The counter is kept in memory only, since an attacker who has the ciphertext can bypass any client-side counter. The real protection is the KDF cost. The delay just discourages casual guessing on an unlocked device.

### 7.5 Content-Security-Policy on GitHub Pages
Pages cannot set HTTP headers, so `scripts/postexport-pages.mjs` adds a `<meta http-equiv="Content-Security-Policy">` tag to every exported page. The tag contains the computed hashes of that page's inline scripts:

```
default-src 'none'; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; manifest-src 'self'; connect-src 'none';
worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

`style-src 'unsafe-inline'` is needed because react-native-web injects its styles at runtime. Inline styles cannot run code.

**Limits of a meta-tag CSP:** these protections need real HTTP headers and arrive with the hosting migration (§9):
- `frame-ancestors` (clickjacking protection)
- `Strict-Transport-Security`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`

github.io is already on the HSTS preload list, so HTTPS is enforced today.

### 7.6 Privacy commitments (shown in the app)
- There is no account, email or phone number, and nothing identifies the user.
- There are no analytics, crash reporting or trackers of any kind.
- Data is stored only on the device and encrypted. **Erase all data** clears IndexedDB and local/session storage.
- The source code is public so anyone can audit these claims.

## 8. Architecture

```
src/
  app/            Expo Router routes (screens); _layout.tsx holds the lock gate
  components/     UI kit (ui.tsx), bill form, onboarding, unlock, date field (.web.tsx variant)
  domain/         schema (zod), billing math, money, catalog, formatting — no dependencies on React
  security/       WebCrypto vault, passphrase rules, auto-lock hook
  storage/        VaultStore interface; index.web.ts = IndexedDB (idb-keyval); index.ts = native placeholder
  state/          zustand store: status (loading/new/locked/unlocked), vault, actions
  platform/       dialogs, file save/pick, navigation helpers (web and native variants)
scripts/          postexport-pages.mjs (CSP, 404, .nojekyll), serve-pages.mjs (local Pages preview)
```

- **Data flow:**
  - UI calls a store action, which applies an immutable update to the vault in memory.
  - The vault is then re-encrypted with a fresh IV and written to `VaultStore`.
  - Writes are serialized, so an older snapshot can never overwrite a newer one.
- **Platform-specific code** uses Metro file extensions (`.web.ts` vs `.ts`), so domain and UI code stay shared.
- **Stack:** Expo SDK 57, Expo Router (static web output), React 19 with the React Compiler, TypeScript (strict), zustand, zod, idb-keyval.

## 9. Platform strategy and hosting

### Phase 1 — Web on GitHub Pages (current)
- `expo export -p web` builds a static site under the `/Budget-Bill` base URL. `postexport-pages.mjs` then adds the CSP, `404.html` and `.nojekyll`.
- GitHub Actions deploys on every push to `main`.
- **Free Pages requires a public repository.** That's acceptable: the repository contains no user data, and open source supports the privacy claims.

### Phase 2 — Android and iOS
- **Storage:** implement `src/storage/index.ts` with `expo-file-system` for the envelope. Optionally keep a device-bound wrapping key in `expo-secure-store` (Keychain/Keystore) so users can unlock with biometrics (`expo-local-authentication`) instead of typing the passphrase every time.
- **Crypto:** WebCrypto `subtle` is not available in Hermes, so use `expo-crypto` or a vetted native AES-GCM/PBKDF2 module behind the same `crypto.ts` interface. The envelope format stays the same, so backups move between platforms.
- **Reminders:** local notifications (`expo-notifications`) N days before each due date. They are scheduled on the device, with no push server.
- **Backups:** export and import through the share sheet and document picker.
- **Builds:** EAS Build/Submit. Ship with a privacy nutrition label of "Data Not Collected".

### Phase 3 — Leaving GitHub Pages (when needed)
Move to Cloudflare Pages or Netlify (both static and free) to get real security headers:
- CSP with `frame-ancestors 'none'`
- HSTS
- `Permissions-Policy`
- COOP/CORP
- `X-Content-Type-Options`

Custom domains and preview deploys also come with the move. Optional **end-to-end-encrypted sync** would need a small backend that stores only opaque envelopes. The server never sees keys or plaintext, and `connect-src` would be opened to that single origin only.

## 10. Testing and CI

- **Unit tests** (Jest via `jest-expo`) cover:
  - billing math edge cases and money parsing
  - schema rejection of bad data
  - crypto: round trip, wrong passphrase, tampered ciphertext, tampered KDF parameters, weakened envelopes, key non-extractability
  - the store lifecycle: create, lock, unlock, payments, backup, wipe, restore, passphrase change
- **Static checks:** `tsc --noEmit` (strict) and ESLint (Expo config plus security rules).
- **CI** (`.github/workflows/ci.yml`) runs on PRs and on `main`: typecheck, lint, tests, `npm audit --omit=dev --audit-level=high`, and a production web build. CodeQL scans JavaScript/TypeScript.
- **Deploy** (`.github/workflows/deploy.yml`) runs the same checks, then builds and publishes to Pages.
- **Manual smoke test** (`npm run build:web && npm run preview:web`):
  1. Onboard, add a catalog bill and a custom bill, and check the totals.
  2. Reload and confirm the app is locked.
  3. Confirm IndexedDB holds only ciphertext.
  4. Confirm there are no requests to other domains and no CSP violations in the console.

## 11. Roadmap

| Milestone | Items |
|---|---|
| **v0.2 web polish** | PWA manifest and offline service worker (with a matching `worker-src`), CSV export (a plaintext export with a clear warning), bill search, "upcoming in the next 7 days" list, per-category totals chart |
| **v0.3 mobile** | Native storage and crypto adapters, biometric unlock, local reminders, EAS builds for Android and iOS |
| **v0.4 hardening** | Argon2id KDF migration, SRI hashes for bundles, reproducible builds with published hashes, external security review |
| **Later** | Optional E2EE sync and household sharing, more currencies (including ones without 2 decimal places), price-change history |

## 12. Open questions

*Resolved:* income counting. Users choose between spread evenly and actual paydays (see §6).


1. **Licence:** the repository is public. Choose a licence (MIT, or AGPL-3.0 to keep forks open), or none, which means all rights reserved.
2. **Custom domain** when migrating away from `*.github.io`?
3. Should overdue unpaid bills from past months **carry forward** into the current month's "still due"?
