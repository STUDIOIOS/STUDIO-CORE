// Studio IOS — service worker
// Caches the app shell and data for offline use.

const CACHE = 'studio-ios-v3';
const SHELL = [
  './',
  './index.html',
  './lead.html',
  './all.html',
  './settings.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './data/config.json',
  './data/leads.json',
  './data/sequences.json',
  './data/schedule.json',
  './data/activity.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for our own origin assets;
// network-first for /data/ JSON to keep activity fresh;
// network-only for github.com (mark-sent dispatches must not be cached).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.host !== self.location.host) return;

  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
