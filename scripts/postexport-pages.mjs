// Prepares `dist/` (from `expo export -p web`) for GitHub Pages:
//  - injects a strict Content-Security-Policy <meta> into every HTML page,
//    allowing only this site's own scripts plus the hashes of the exact
//    inline scripts Expo emitted (no 'unsafe-inline' for scripts);
//  - makes the site an installable, offline-capable web app: manifest, icon,
//    and a generated service worker that precaches every exported file;
//  - adds 404.html so unknown paths render the app's not-found screen;
//  - adds .nojekyll so Pages serves the `_expo/` folder;
//  - removes the dev-only route sitemap.
// GitHub Pages cannot set HTTP headers, so the CSP must travel in the HTML.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const BASE = `${app.experiments?.baseUrl ?? ''}/`; // e.g. "/Budget-Bill/"

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `expo export -p web` first.');
  process.exit(1);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

function cspFor(html) {
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((body) => body.length > 0)
    .map((body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);

  return [
    "default-src 'none'",
    `script-src 'self' ${[...new Set(hashes)].join(' ')}`.trim(),
    // react-native-web injects its generated styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    // The app never talks to any server: all data stays on the device.
    "connect-src 'none'",
    // Only our own offline service worker (sw.js, same origin).
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

rmSync(join(DIST, '_sitemap.html'), { force: true });

// ---- installable web app: icon + manifest
mkdirSync(join(DIST, 'icons'), { recursive: true });
copyFileSync('assets/images/icon.png', join(DIST, 'icons', 'icon-1024.png'));
const manifest = {
  name: app.web?.name ?? app.name,
  short_name: app.web?.shortName ?? app.name,
  description: app.web?.description,
  id: BASE,
  start_url: BASE,
  scope: BASE,
  display: 'standalone',
  background_color: app.web?.backgroundColor ?? '#ffffff',
  theme_color: app.web?.themeColor ?? '#ffffff',
  icons: [{ src: `${BASE}icons/icon-1024.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
};
writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const headTags = [
  `<link rel="manifest" href="${BASE}manifest.webmanifest"/>`,
  `<link rel="apple-touch-icon" href="${BASE}icons/icon-1024.png"/>`,
  `<meta name="theme-color" content="${manifest.theme_color}"/>`,
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
].join('');

let count = 0;
for (const file of files(DIST).filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}"/>`;
  // The CSP must precede every script so it applies to all of them.
  html = html.replace(/<head>/i, `<head>${meta}${headTags}`);
  writeFileSync(file, html);
  count++;
}

copyFileSync(join(DIST, '+not-found.html'), join(DIST, '404.html'));
writeFileSync(join(DIST, '.nojekyll'), '');

// ---- offline service worker: precache every exported file, versioned by content
const precache = files(DIST)
  .map((f) => relative(DIST, f).split(sep).join('/'))
  .filter((p) => p !== 'sw.js' && p !== '.nojekyll')
  .sort();
const version = createHash('sha256');
for (const p of precache) version.update(p).update(readFileSync(join(DIST, p)));
const template = readFileSync('scripts/sw-template.js', 'utf8');
writeFileSync(
  join(DIST, 'sw.js'),
  template
    .replace('__VERSION__', JSON.stringify(`budget-bill-${version.digest('hex').slice(0, 16)}`))
    .replace('__BASE__', JSON.stringify(BASE))
    .replace('__FILES__', JSON.stringify(precache)),
);

console.log(
  `GitHub Pages post-export: CSP + manifest links added to ${count} pages; ` +
    `sw.js precaches ${precache.length} files; 404.html and .nojekyll written.`,
);
