// Служебный воркер: держит оболочку приложения в кэше,
// чтобы оно открывалось без интернета. Данные кэширует само приложение.
const CACHE = 'uchet-v16';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // запросы к базе и к боту не кэшируем никогда
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('telegram.org')) return;

  // страница: сначала сеть, при её отсутствии — кэш
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // остальное (иконки, шрифты, библиотека): сначала кэш, затем сеть
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((r) => {
        if (r && r.status === 200 && (r.type === 'basic' || r.type === 'cors')) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      }).catch(() => hit);
    })
  );
});
