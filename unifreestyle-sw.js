// unifreestyle-sw.js — UniFreestyle Battle App Service Worker
const CACHE_NAME = 'unifreestyle-v2';

const STATIC_ASSETS = [
  '/unifreestyle.html',
  '/unifreestyle.css',
  '/unifreestyle-core.js',
  '/unifreestyle-profile.js',
  '/unifreestyle-battle.js',
  '/unifreestyle-cypher.js',
  '/unifreestyle-ui.js',
  '/unifreestyle-superchat.js',
  '/unifreestyle-manifest.json',
  '/icons/unifreestyle-192.png',
  '/icons/unifreestyle-512.png',
  '/unibeatz-auth.js'
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — network-only for live services, cache fallback for static files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const networkOnlyDomains = [
    'livekit.cloud',
    'firebaseapp.com',
    'firestore.googleapis.com',
    'cloudfunctions.net',
    'firebasestorage.app',
    'googleapis.com',
    'gstatic.com',
    'stripe.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];

  if (networkOnlyDomains.some(domain => url.hostname.includes(domain))) {
    return;
  }

  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
  }
});

// Push notifications
self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'UniFreestyle Battle', {
      body: data.body || 'New activity in your battle!',
      icon: '/icons/unifreestyle-192.png',
      badge: '/icons/unifreestyle-192.png',
      data: { url: data.url || '/unifreestyle.html' },
      vibrate: [200, 100, 200],
      tag: 'unifreestyle-notif'
    })
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/unifreestyle.html')
  );
});
