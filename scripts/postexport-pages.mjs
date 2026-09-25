// Prepares `dist/` (from `expo export -p web`) for GitHub Pages:
//  - injects a strict Content-Security-Policy <meta> into every HTML page,
//    allowing only this site's own scripts plus the hashes of the exact
//    inline scripts Expo emitted (no 'unsafe-inline' for scripts);
//  - adds 404.html so unknown paths render the app's not-found screen;
//  - adds .nojekyll so Pages serves the `_expo/` folder;
//  - removes the dev-only route sitemap.
// GitHub Pages cannot set HTTP headers, so the CSP must travel in the HTML.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `expo export -p web` first.');
  process.exit(1);
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return name.endsWith('.html') ? [p] : [];
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
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

rmSync(join(DIST, '_sitemap.html'), { force: true });

let count = 0;
for (const file of htmlFiles(DIST)) {
  let html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}"/>`;
  // Must precede every script so it applies to all of them.
  html = html.replace(/<head>/i, `<head>${meta}`);
  writeFileSync(file, html);
  count++;
}

copyFileSync(join(DIST, '+not-found.html'), join(DIST, '404.html'));
writeFileSync(join(DIST, '.nojekyll'), '');

console.log(`GitHub Pages post-export: CSP added to ${count} pages, 404.html and .nojekyll written.`);
