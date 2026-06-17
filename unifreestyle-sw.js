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
  '/logo.png',
  '/unibeatz-auth.js',
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
    'livekit.cloud', 'firebaseapp.com', 'firestore.googleapis.com',
    'cloudfunctions.net', 'firebasestorage.app', 'googleapis.com',
    'jsdelivr.net', 'gstatic.com', 'stripe.com', 'fonts.googleapis.com'
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

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
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

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/unifreestyle.html'));
});
