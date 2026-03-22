const VERSION = '1.0';
const CACHE_NAME = 'goonies-v' + VERSION;
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './db/codes.csv',
  './db/heros.csv',
  './db/dictionary.csv',
  './images/mikey.png',
  './images/brand.png',
  './images/mouth.png',
  './images/andy.png',
  './images/stef.png',
  './images/chunk.png',
  './images/sloth.png',
  './images/data.png',
  './images/4999.png',
  './images/4999big.png',
  './images/6000.png',
  './images/6000big.png',
  './images/8385.png',
  './images/setup.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
