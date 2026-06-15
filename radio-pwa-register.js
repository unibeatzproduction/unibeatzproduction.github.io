// radio-pwa-register.js
// Registers service worker + PWA install prompt for UniBeatz Radio

(function(){
  'use strict';

  // ── Service Worker ──
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/radio-sw.js', { scope: '/' })
        .then(function(reg){
          console.log('[radio PWA] SW registered, scope:', reg.scope);
          // Keep SW alive — ping every 20s while audio is playing
          setInterval(function(){
            var player = document.getElementById('radioPlayer');
            if(player && !player.paused && reg.active){
              var ch = new MessageChannel();
              reg.active.postMessage({ type: 'KEEP_ALIVE' }, [ch.port2]);
            }
          }, 20000);
        })
        .catch(function(e){ console.warn('[radio PWA] SW registration failed:', e); });
    });
  }

  // ── Install Prompt ──
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner(){
    if(document.getElementById('ubRadioInstallBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'ubRadioInstallBanner';
    banner.style.cssText = [
      'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);',
      'z-index:99999;background:linear-gradient(135deg,#0d0d18,#070710);',
      'border:1px solid rgba(201,168,76,.6);border-radius:14px;',
      'padding:12px 16px;display:flex;align-items:center;gap:12px;',
      'box-shadow:0 8px 32px rgba(0,0,0,.6);max-width:90vw;'
    ].join('');
    banner.innerHTML = [
      '<span style="font-size:1.4rem;">📻</span>',
      '<div style="flex:1;min-width:0;">',
        '<div style="font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:2px;color:#F0C040;">Add To Home Screen</div>',
        '<div style="font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.5px;color:#40D0FF;">Listen with background play</div>',
      '</div>',
      '<button id="ubRadioInstallBtn" style="border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.5px;font-weight:900;padding:8px 12px;cursor:pointer;white-space:nowrap;">INSTALL</button>',
      '<button id="ubRadioInstallDismiss" style="border:0;background:transparent;color:rgba(240,237,232,.4);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>'
    ].join('');
    document.body.appendChild(banner);

    document.getElementById('ubRadioInstallBtn').onclick = function(){
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result){
        if(result.outcome === 'accepted') console.log('[radio PWA] installed');
        deferredPrompt = null;
        banner.remove();
      });
    };
    document.getElementById('ubRadioInstallDismiss').onclick = function(){
      banner.remove();
      // Don't show again for 7 days
      try{ localStorage.setItem('ub_radio_install_dismissed', Date.now() + 604800000); }catch(e){}
    };
  }

  // ── iOS "Add to Home Screen" hint ──
  // iOS doesn't support beforeinstallprompt — show manual instructions
  function isIos(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }
  function isStandalone(){
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }
  function iosDismissed(){
    try{ return Number(localStorage.getItem('ub_radio_ios_hint_dismissed') || 0) > Date.now(); }catch(e){ return false; }
  }

  if(isIos() && !isStandalone() && !iosDismissed()){
    setTimeout(function(){
      var hint = document.createElement('div');
      hint.id = 'ubRadioIosHint';
      hint.style.cssText = [
        'position:fixed;bottom:0;left:0;right:0;z-index:99999;',
        'background:linear-gradient(135deg,#0d0d18,#070710);',
        'border-top:1px solid rgba(201,168,76,.5);',
        'padding:14px 16px 24px;text-align:center;',
        'box-shadow:0 -8px 24px rgba(0,0,0,.6);'
      ].join('');
      hint.innerHTML = [
        '<button onclick="document.getElementById(\'ubRadioIosHint\').remove();try{localStorage.setItem(\'ub_radio_ios_hint_dismissed\',Date.now()+604800000);}catch(e){}" style="position:absolute;top:8px;right:12px;border:0;background:transparent;color:rgba(240,237,232,.4);font-size:1.2rem;cursor:pointer;">✕</button>',
        '<div style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:2px;color:#F0C040;margin-bottom:4px;">📻 Install UniBeatz Radio</div>',
        '<div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:1.5px;color:#40D0FF;">',
          'Tap <b style="color:#F0C040;">Share ⬆</b> then <b style="color:#F0C040;">Add to Home Screen</b> for background play',
        '</div>'
      ].join('');
      document.body.appendChild(hint);
    }, 8000);
  }

  // ── Standalone mode — hide browser chrome nav ──
  if(isStandalone()){
    document.body.classList.add('pwa-standalone');
  }

})();
