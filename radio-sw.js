// radio-sw.js — UniBeatz Radio PWA Service Worker
// Caches shell for offline, keeps audio streaming live

const CACHE = 'unibeatz-radio-v1';
const SHELL = [
  '/radio.html',
  '/radio.css',
  '/radio.js',
  '/radio-live365.js',
  '/radio-media-session.js',
  '/radio-live-features.js',
  '/radio-premium-popup.js',
  '/radio-background.js',
  '/unibeatz-radio-cover-v2.svg',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;700&family=Orbitron:wght@400;700;900&display=swap'
];

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for streams, cache first for shell
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept Live365 streams or Firebase — always hit network
  if(
    url.includes('streaming.live365.com') ||
    url.includes('live365.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('googleapis.com') ||
    url.includes('firebasestorage')
  ){
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // For font/cdn resources — cache first
  if(url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')){
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }))
    );
    return;
  }

  // Shell files — network first, fall back to cache
  if(e.request.method === 'GET'){
    e.respondWith(
      fetch(e.request).then(r => {
        if(r && r.status === 200 && r.type !== 'opaque'){
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/radio.html')))
    );
  }
});

// Background sync — keep audio alive hint
self.addEventListener('message', e => {
  if(e.data?.type === 'KEEP_ALIVE'){
    // Acknowledge — client uses this to detect SW is still running
    e.ports[0]?.postMessage({ type: 'ALIVE' });
  }
});
