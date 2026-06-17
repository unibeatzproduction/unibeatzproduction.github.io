// unifreestyle-pwa.js
(function(){
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/unifreestyle-sw.js', { scope: '/' })
        .then(function (reg) {
          console.log('[UniFreestyle PWA] Service worker registered:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[UniFreestyle PWA] Service worker failed:', err);
        });
    });
  }

  window.addEventListener('beforeinstallprompt', function () {
    console.log('[UniFreestyle PWA] Native install prompt is available');
  });
})();