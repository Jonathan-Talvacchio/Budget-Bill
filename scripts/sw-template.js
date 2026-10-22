// Budget Bill offline service worker. Generated into dist/sw.js by
// scripts/postexport-pages.mjs, which fills in the placeholders below.
//
// It only caches the app's own static files (never user data: that lives
// encrypted in IndexedDB) and never contacts any other origin.
/* eslint-disable no-restricted-globals */
const VERSION = __VERSION__;
const BASE = __BASE__;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => BASE + f)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('budget-bill-') && k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Finds the cached page for a pretty URL like /Budget-Bill/bills or /Budget-Bill/bill/edit?id=… */
async function cachedPage(url) {
  const cache = await caches.open(VERSION);
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index';
  for (const candidate of [path, `${path}.html`, `${path}/index.html`, `${BASE}index.html`]) {
    const hit = await cache.match(candidate);
    if (hit) return hit;
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    // Pages: network first so updates show up, cached copy when offline.
    event.respondWith(fetch(req).catch(() => cachedPage(url)));
    return;
  }
  // Static files have content-hashed names, so the cache is always correct.
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

// Tapping a bill reminder opens (or focuses) the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin + BASE));
      return open ? open.focus() : self.clients.openWindow(BASE);
    }),
  );
});
