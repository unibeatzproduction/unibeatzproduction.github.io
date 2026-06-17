// unifreestyle-pwa.js — UniFreestyle Battle App PWA install + service worker
(function(){
  'use strict';

  let deferredPrompt = null;

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isMobile(){
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function dismissedRecently(){
    try{
      const dismissed = Number(localStorage.getItem('ub_install_dismissed') || '0');
      return Date.now() - dismissed < 86400000;
    }catch(e){ return false; }
  }

  function installInstructions(){
    if(/android/i.test(navigator.userAgent)){
      alert('Install UniFreestyle:\n\n1. Tap the ⋮ menu in Chrome\n2. Tap Install app or Add to Home screen\n3. Confirm Install');
    }else if(/iphone|ipad|ipod/i.test(navigator.userAgent)){
      alert('Install UniFreestyle:\n\n1. Tap Share ⬆\n2. Tap Add to Home Screen\n3. Tap Add');
    }else{
      alert('Install UniFreestyle:\n\nLook for the install icon in your browser address bar, or use the browser menu → Install app.');
    }
  }

  function showInstallBanner(force=false){
    if(isStandalone()) return;
    if(!force && dismissedRecently()) return;
    if(document.getElementById('ubInstallBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'ubInstallBanner';
    banner.style.cssText = 'position:fixed;bottom:88px;left:12px;right:12px;z-index:999999;background:linear-gradient(135deg,#0a0a14,#06060f);border:1px solid rgba(201,168,76,.65);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.65);';
    banner.innerHTML = '<img src="/icons/unifreestyle-192.png" alt="" style="width:42px;height:42px;border-radius:10px;flex-shrink:0;">' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.05rem;letter-spacing:2px;color:#F0C040;line-height:1;">Install UniFreestyle</div>' +
      '<div style="font-family:Orbitron,Arial,sans-serif;font-size:.43rem;letter-spacing:1.3px;color:#40D0FF;margin-top:4px;">Battle app on your phone screen</div>' +
      '</div>' +
      '<button id="ubInstallBtn" style="border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,Arial,sans-serif;font-size:.46rem;letter-spacing:1.4px;font-weight:900;padding:9px 12px;cursor:pointer;flex-shrink:0;">INSTALL</button>' +
      '<button id="ubInstallDismiss" style="border:0;background:transparent;color:#8d94a5;font-size:1.2rem;cursor:pointer;padding:4px;flex-shrink:0;">✕</button>';
    document.body.appendChild(banner);

    document.getElementById('ubInstallBtn').onclick = async function(){
      if(deferredPrompt){
        deferredPrompt.prompt();
        try{ await deferredPrompt.userChoice; }catch(e){}
        deferredPrompt = null;
        banner.remove();
      }else{
        installInstructions();
      }
    };

    document.getElementById('ubInstallDismiss').onclick = function(){
      banner.remove();
      try{ localStorage.setItem('ub_install_dismissed', String(Date.now())); }catch(e){}
    };
  }

  function injectInstallButton(){
    if(isStandalone()) return;
    if(document.getElementById('ubPwaInstallBtn')) return;

    let target = document.querySelector('.home-action-row') || document.querySelector('.page.active .page-body') || document.body;
    const btn = document.createElement('button');
    btn.id = 'ubPwaInstallBtn';
    btn.className = 'btn btn-blue';
    btn.type = 'button';
    btn.textContent = '📲 Install App';
    btn.style.cssText = 'position:fixed;right:14px;bottom:18px;z-index:999998;border-radius:999px;font-size:.52rem;padding:11px 14px;box-shadow:0 8px 26px rgba(0,0,0,.45);';
    btn.onclick = async function(){
      if(deferredPrompt){
        deferredPrompt.prompt();
        try{ await deferredPrompt.userChoice; }catch(e){}
        deferredPrompt = null;
        btn.remove();
      }else{
        installInstructions();
      }
    };
    target.appendChild(btn);
  }

  // Service worker registration
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/unifreestyle-sw.js', { scope: '/' })
        .then(function(reg){ console.log('[UniFreestyle PWA] SW registered:', reg.scope); })
        .catch(function(err){ console.warn('[UniFreestyle PWA] SW failed:', err); });
    });
  }

  // Real Chrome/Android install event
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner(true);
    injectInstallButton();
  });

  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    document.getElementById('ubInstallBanner')?.remove();
    document.getElementById('ubPwaInstallBtn')?.remove();
  });

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      injectInstallButton();
      if(isMobile()) showInstallBanner(false);
    }, 1200);
  });

  setTimeout(function(){
    injectInstallButton();
    if(isMobile()) showInstallBanner(false);
  }, 3000);
})();