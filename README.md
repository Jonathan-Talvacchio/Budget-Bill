# Budget Bill

A private, offline-first tracker for recurring bills and subscriptions. See what's due this month or this year, what you've already paid, and **how much is left to spend** after bills.

- 🔒 **Encrypted on your device.** AES-256-GCM with a key derived from your passphrase (PBKDF2-SHA256, 600k iterations).
- 🚫 **No accounts, servers, analytics or trackers.** The page's Content-Security-Policy blocks all network requests.
- 📋 **60+ common bills and services** to pick from, or add your own.
- 💾 **Encrypted backup files** for moving between browsers and devices.

Web first (GitHub Pages). Android and iOS come from the same Expo codebase later. Read the full [design document](docs/DESIGN.md) and the [security policy](SECURITY.md).

## Development

```bash
npm install
npm run web            # dev server
npm run check          # typecheck + lint + unit tests
npm run build:web      # production static export to dist/ (with CSP)
npm run preview:web    # serve dist/ like GitHub Pages at http://localhost:4173/Budget-Bill/
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes to GitHub Pages. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

If the repository is renamed, update `experiments.baseUrl` in `app.json` and `BASE` in `scripts/serve-pages.mjs` to match.
