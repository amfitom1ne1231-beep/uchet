const CACHE = 'shift-hours-v7';
const SHELL = ['./', './hours.css?v=7', './hours.js?v=7', './manifest.webmanifest',
  '../theme.css?v=1', '../core.js?v=2026-11-15.8'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('shift-hours-v') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const shell = new URL('./', self.registration.scope).href;
  const key = request.mode === 'navigate' && url.href.startsWith(shell) ? shell : url.href;
  if (request.method !== 'GET' || !SHELL.some(path => new URL(path, shell).href === key)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(key) || Response.error();
  }));
});
