// unifreestyle-pwa.js — UniFreestyle Battle App PWA

if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/unifreestyle-sw.js', { scope: '/unifreestyle.html' })
      .then(function(reg){
        console.log('[UniFreestyle SW] registered:', reg.scope);
        reg.addEventListener('updatefound', function(){
          var newWorker = reg.installing;
          newWorker.addEventListener('statechange', function(){
            if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
              console.log('[UniFreestyle SW] update available');
            }
          });
        });
      })
      .catch(function(err){ console.warn('[UniFreestyle SW] registration failed:', err); });
  });
}

var deferredPrompt = null;

window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  deferredPrompt = e;
  var dismissed = parseInt(localStorage.getItem('ub_install_dismissed') || '0');
  if(Date.now() - dismissed < 86400000) return;
  setTimeout(showInstallBanner, 3000);
});

function showInstallBanner(){
  if(document.getElementById('ubInstallBanner')) return;
  if(window.matchMedia('(display-mode: standalone)').matches) return;

  var banner = document.createElement('div');
  banner.id = 'ubInstallBanner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:12px;right:12px;z-index:99999;background:linear-gradient(135deg,#0a0a14,#06060f);border:1px solid rgba(201,168,76,.5);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);';

  var icon = document.createElement('span');
  icon.style.cssText = 'font-size:1.8rem;flex-shrink:0;';
  icon.textContent = '⚡';

  var info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';
  info.innerHTML = '<div style="font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:2px;color:#F0C040;line-height:1;">Install UniFreestyle</div><div style="font-family:Orbitron,sans-serif;font-size:.4rem;letter-spacing:1.5px;color:#8d94a5;margin-top:2px;">Add to home screen · Battle anywhere</div>';

  var installBtn = document.createElement('button');
  installBtn.id = 'ubInstallBtn';
  installBtn.style.cssText = 'border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:1.5px;font-weight:900;padding:8px 12px;cursor:pointer;flex-shrink:0;';
  installBtn.textContent = 'INSTALL';
  installBtn.addEventListener('click', function(){
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(result){
      deferredPrompt = null;
      banner.remove();
    });
  });

  var dismissBtn = document.createElement('button');
  dismissBtn.style.cssText = 'border:0;background:transparent;color:#8d94a5;font-size:1.2rem;cursor:pointer;padding:4px;flex-shrink:0;';
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', function(){
    banner.remove();
    localStorage.setItem('ub_install_dismissed', Date.now());
  });

  banner.appendChild(icon);
  banner.appendChild(info);
  banner.appendChild(installBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
}

function injectInstallButton(){
  if(window.matchMedia('(display-mode: standalone)').matches) return;
  if(document.getElementById('ubPwaInstallBtn')) return;
  var actionRow = document.querySelector('.home-action-row');
  if(!actionRow) return;

  var btn = document.createElement('button');
  btn.id = 'ubPwaInstallBtn';
  btn.className = 'btn btn-blue';
  btn.textContent = '📲 Install';
  btn.style.cssText = 'font-size:.48rem;';
  btn.addEventListener('click', function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result){
        deferredPrompt = null;
        if(result.outcome === 'accepted') btn.remove();
      });
    } else {
      alert('To install:\n\nChrome Android: Tap ⋮ menu → Add to Home Screen\nChrome Desktop: Look for ⊕ in address bar\nSafari iOS: Tap Share → Add to Home Screen\nEdge: Tap ... menu → Apps → Install this site');
    }
  });
  actionRow.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', function(){
  setTimeout(injectInstallButton, 600);
});

setTimeout(function(){
  var _orig = window.goToPage;
  if(typeof _orig === 'function'){
    window.goToPage = function(name){
      _orig(name);
      if(name === 'home') setTimeout(injectInstallButton, 400);
    };
  }
}, 500);

window.addEventListener('appinstalled', function(){
  deferredPrompt = null;
  var banner = document.getElementById('ubInstallBanner');
  if(banner) banner.remove();
  var btn = document.getElementById('ubPwaInstallBtn');
  if(btn) btn.remove();
});
