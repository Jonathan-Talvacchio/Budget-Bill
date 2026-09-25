// Serves dist/ the way GitHub Pages does (under /Budget-Bill/, extensionless
// .html lookup, 404.html fallback) for local testing of the production build.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const BASE = '/Budget-Bill';
const ROOT = 'dist';
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
};

function resolve(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  if (rel.startsWith('..')) return null;
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const p = join(ROOT, candidate);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/' || pathname === BASE) {
    res.writeHead(302, { Location: `${BASE}/` });
    return res.end();
  }
  const file = pathname.startsWith(`${BASE}/`) ? resolve(pathname.slice(BASE.length)) : null;
  const status = file ? 200 : 404;
  const path = file ?? join(ROOT, '404.html');
  res.writeHead(status, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}).listen(PORT, () => console.log(`Serving ${ROOT}/ at http://localhost:${PORT}${BASE}/`));
