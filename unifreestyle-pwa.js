// unifreestyle-pwa.js — PWA install prompt + service worker registration

// Register service worker
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/unifreestyle-sw.js')
      .then(reg => {
        console.log('[UniFreestyle SW] registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
              console.log('[UniFreestyle SW] update available');
            }
          });
        });
      })
      .catch(err => console.warn('[UniFreestyle SW] registration failed:', err));
  });
}

// Install prompt
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const dismissed = parseInt(localStorage.getItem('ub_install_dismissed') || '0');
  if(Date.now() - dismissed < 86400000) return;
  setTimeout(showInstallBanner, 3000);
});

function showInstallBanner(){
  if(document.getElementById('ubInstallBanner')) return;
  if(window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.createElement('div');
  banner.id = 'ubInstallBanner';
  banner.style.cssText = `
    position:fixed;bottom:90px;left:12px;right:12px;z-index:99999;
    background:linear-gradient(135deg,#0a0a14,#06060f);
    border:1px solid rgba(201,168,76,.5);border-radius:14px;
    padding:12px 14px;display:flex;align-items:center;gap:12px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;
  banner.innerHTML = `
    <span style="font-size:1.8rem;flex-shrink:0;">⚡</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:2px;color:#F0C040;line-height:1;">Install UniFreestyle</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:.4rem;letter-spacing:1.5px;color:#8d94a5;margin-top:2px;">Add to home screen · Battle anywhere</div>
    </div>
    <button id="ubInstallBtn" style="border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:'Orbitron',sans-serif;font-size:.44rem;letter-spacing:1.5px;font-weight:900;padding:8px 12px;cursor:pointer;flex-shrink:0;">INSTALL</button>
    <button id="ubInstallDismiss" style="border:0;background:transparent;color:#8d94a5;font-size:1.2rem;cursor:pointer;padding:4px;flex-shrink:0;">✕</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('ubInstallBtn').addEventListener('click', async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.remove();
  });

  document.getElementById('ubInstallDismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('ub_install_dismissed', Date.now());
  });
}

// Permanent Install Button in home action row
function injectInstallButton(){
  if(window.matchMedia('(display-mode: standalone)').matches) return;
  if(document.getElementById('ubPwaInstallBtn')) return;
  const actionRow = document.querySelector('.home-action-row');
  if(!actionRow) return;

  const btn = document.createElement('button');
  btn.id = 'ubPwaInstallBtn';
  btn.className = 'btn btn-blue';
  btn.textContent = '📲 Install';
  btn.style.cssText = 'font-size:.48rem;';
  btn.addEventListener('click', async () => {
    if(deferredPrompt){
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if(outcome === 'accepted') btn.remove();
    } else {
      alert('To install:\n\nChrome Android: Tap ⋮ menu → Add to Home Screen\nChrome Desktop: Look for ⊕ in address bar\nSafari iOS: Tap Share → Add to Home Screen');
    }
  });
  actionRow.appendChild(btn);
}

// Install option in Settings
function injectInstallInSettings(){
  if(window.matchMedia('(display-mode: standalone)').matches) return;
  if(document.getElementById('ubPwaInstallSettings')) return;
  const supportList = document.getElementById('supportSettingsList');
  if(!supportList) return;

  const item = document.createElement('div');
  item.id = 'ubPwaInstallSettings';
  item.className = 'settings-item';
  item.innerHTML = `
    <div class="settings-icon">📲</div>
    <div class="settings-info"><div class="settings-label">Install App</div><div class="settings-sub">Add UniFreestyle to your home screen</div></div>
    <div class="settings-arrow">›</div>
  `;
  item.addEventListener('click', async () => {
    if(deferredPrompt){
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
    } else {
      alert('To install:\n\nChrome Android: Tap ⋮ menu → Add to Home Screen\nChrome Desktop: Look for ⊕ in address bar\nSafari iOS: Tap Share → Add to Home Screen');
    }
  });
  supportList.insertBefore(item, supportList.firstChild);
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(injectInstallButton, 600);
  setTimeout(injectInstallInSettings, 600);
});

// Hook goToPage
setTimeout(() => {
  const _orig = window.goToPage;
  if(typeof _orig === 'function'){
    window.goToPage = function(name){
      _orig(name);
      if(name === 'home')     setTimeout(injectInstallButton, 400);
      if(name === 'settings') setTimeout(injectInstallInSettings, 400);
    };
  }
}, 500);

// Track install
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const banner = document.getElementById('ubInstallBanner');
  if(banner) banner.remove();
  const btn = document.getElementById('ubPwaInstallBtn');
  if(btn) btn.remove();
});
