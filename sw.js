const VERSION = '1.2';
const CACHE_NAME = 'goonies-v' + VERSION;
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  './sounds/fail.mp3',
  './sounds/success.mp3',
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
  './icons/web-app-manifest-192x192.png',
  './icons/web-app-manifest-512x512.png',
  './icons/favicon-96x96.png',
  './icons/favicon.svg',
  './icons/favicon.ico',
  './icons/apple-touch-icon.png',
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
