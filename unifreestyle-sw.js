// unifreestyle-sw.js — UniFreestyle Battle App Service Worker
const CACHE_NAME = 'unifreestyle-v3';

// Only cache true static assets that never change per session
const STATIC_ASSETS = [
  '/unifreestyle.css',
  '/unifreestyle-core.js',
  '/unifreestyle-profile.js',
  '/unifreestyle-battle.js',
  '/unifreestyle-cypher.js',
  '/unifreestyle-ui.js',
  '/unifreestyle-superchat.js',
  '/unifreestyle-manifest.json',
  '/logo.png',
];

// Never cache these — always go to network
const NETWORK_ONLY_HOSTS = [
  'livekit.cloud',
  'firebaseapp.com',
  'firestore.googleapis.com',
  'cloudfunctions.net',
  'firebasestorage.app',
  'googleapis.com',
  'jsdelivr.net',
  'gstatic.com',
  'stripe.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Never cache these paths — auth, HTML pages, dynamic data
const NETWORK_ONLY_PATHS = [
  '/index.html',
  '/unifreestyle.html',
  '/unibeatz-auth.js',
  '/unibeatz-notifications.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Always network-only for external services
  if (NETWORK_ONLY_HOSTS.some(d => url.hostname.includes(d))) return;

  // Always network-only for HTML pages and auth files
  // This is the key fix — HTML must always come fresh from network
  // so the correct user session loads, preventing duplicate profiles
  const path = url.pathname;
  if (
    path === '/' ||
    path.endsWith('.html') ||
    NETWORK_ONLY_PATHS.includes(path)
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for true static assets (CSS, JS modules, images)
  // Network updates the cache in the background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);

      // Return cache immediately if available, update in background
      // But for JS files that may have changed, prefer network
      return cached || networkFetch;
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'UniFreestyle Battle', {
      body: data.body || 'New activity in your battle!',
      icon: '/icons/unifreestyle-192.png',
      badge: '/icons/unifreestyle-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      tag: 'unifreestyle-notif'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
