// unipack-sw.js — UniBeatz Pack Studio Service Worker
const CACHE_NAME = 'unipack-v1';
const STATIC_ASSETS = [
  '/unipack.html',
  '/unipack.css',
  '/unipack-manifest.json',
  '/logo.png',
  '/unipack-producer-profiles.js',
  '/unipack-swing.js',
  '/unipack-piano-roll.js',
  '/unipack-zoom.js',
  '/unipack-google-signin.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const networkOnly = [
    'firebaseapp.com', 'firestore.googleapis.com', 'cloudfunctions.net',
    'firebasestorage.app', 'googleapis.com', 'gstatic.com',
    'stripe.com', 'fonts.googleapis.com', 'cdnjs.cloudflare.com'
  ];
  if(networkOnly.some(d => url.hostname.includes(d))) return;
  if(e.request.method === 'GET'){
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if(res && res.status === 200 && res.type !== 'opaque'){
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
