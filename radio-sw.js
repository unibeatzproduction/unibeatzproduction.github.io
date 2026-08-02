// radio-sw.js — UniBeatz Radio PWA Service Worker v3
const CACHE = 'unibeatz-radio-v3';

const SHELL = [
  '/radio.css',
  '/radio.js',
  '/radio-premium-popup.js',
  '/unibeatz-radio-cover-v2.svg',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;700&family=Orbitron:wght@400;700;900&display=swap'
];

// Never cache or intercept these
const PASSTHROUGH = [
  'streaming.live365.com',
  'live365.com',
  'firestore.googleapis.com',
  'firebase',
  'googleapis.com',
  'firebasestorage',
  'livekit.cloud',
  'cloudfunctions.net',
  'stripe.com',
  'gstatic.com'
];

// Never cache these paths — always fresh from network
const NETWORK_ONLY_PATHS = [
  '/radio.html',
  '/index.html',
  '/radio-dj-deck.html',
  '/admin-radio.html',
  '/radio-talk-studio.html',
  '/radio-talk-host.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const { pathname } = new URL(url);

  // Always pass through to network — no interception
  if (PASSTHROUGH.some(d => url.includes(d))) return;

  // HTML pages — ALWAYS network first, never cache
  // This is critical for back button to work correctly
  if (
    e.request.mode === 'navigate' ||
    NETWORK_ONLY_PATHS.some(p => pathname === p) ||
    pathname === '/' ||
    pathname.endsWith('.html')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => {
        // Only fall back to cache if truly offline — don't serve stale on navigation
        return caches.match('/radio.html');
      })
    );
    return;
  }

  // Static assets — network first, update cache in background
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r && r.status === 200 && r.type !== 'opaque') {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data?.type === 'KEEP_ALIVE') {
    e.ports[0]?.postMessage({ type: 'ALIVE' });
  }
});
