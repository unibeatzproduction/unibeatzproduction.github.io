// firebase-messaging-sw.js
// MUST BE IN GITHUB REPO ROOT (same level as index.html)
// Handles background notifications for UniBeatz Production

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
});

const messaging = firebase.messaging();

// Background message handler - fires when app is not in focus
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const data = payload.data || {};
  const title = data.title || 'UniBeatz Production';

  const topText = data.topText || '';
  const bottomText = data.bottomText || '';
  const combinedBody = bottomText
    ? `${topText}\n\n${bottomText}`
    : topText;

  const options = {
    body: combinedBody,
    icon: '/logo.png',
    badge: '/logo.png',
    image: data.image || undefined,
    tag: data.id || 'unibeatz-notif',
    requireInteraction: true,
    data: {
      url: data.url || '/',
      notifId: data.id || null
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(title, options);
});

// Click handler - open the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('unibeatzproduction') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
