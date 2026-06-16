// unifreestyle-pwa.js — PWA install prompt + service worker registration

// Register service worker
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/unifreestyle-sw.js')
      .then(reg => {
        console.log('[UniFreestyle SW] registered:', reg.scope);
        // Check for updates
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
  // Show install banner after 3 seconds if not already installed
  setTimeout(showInstallBanner, 3000);
});

function showInstallBanner(){
  if(document.getElementById('ubInstallBanner')) return;
  if(window.matchMedia('(display-mode: standalone)').matches) return; // already installed

  const banner = document.createElement('div');
  banner.id = 'ubInstallBanner';
  banner.style.cssText = `
    position:fixed;bottom:70px;left:12px;right:12px;z-index:99999;
    background:linear-gradient(135deg,#0a0a14,#06060f);
    border:1px solid rgba(201,168,76,.5);border-radius:14px;
    padding:12px 14px;display:flex;align-items:center;gap:12px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
    animation:slideUp .3s ease;
  `;
  banner.innerHTML = `
    <style>@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
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
    if(outcome === 'accepted') console.log('[PWA] installed');
  });

  document.getElementById('ubInstallDismiss').addEventListener('click', () => {
    banner.remove();
    // Don't show again for 24 hours
    localStorage.setItem('ub_install_dismissed', Date.now());
  });
}

// Don't show if dismissed recently
window.addEventListener('DOMContentLoaded', () => {
  const dismissed = parseInt(localStorage.getItem('ub_install_dismissed') || '0');
  if(Date.now() - dismissed < 86400000) return; // 24 hours
});

// ── Permanent Install Button ──
// Injects an "Install App" button into the home page action row
function injectInstallButton(){
  if(window.matchMedia('(display-mode: standalone)').matches) return; // already installed
  if(document.getElementById('ubPwaInstallBtn')) return;

  // Try to inject into home action row
  const actionRow = document.querySelector('.home-action-row');
  if(!actionRow) return;

  const btn = document.createElement('button');
  btn.id = 'ubPwaInstallBtn';
  btn.className = 'btn btn-blue';
  btn.innerHTML = '📲 Install App';
  btn.style.cssText = 'font-size:.48rem;';
  btn.addEventListener('click', async () => {
    if(deferredPrompt){
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if(outcome === 'accepted') btn.remove();
    } else {
      // Fallback — show manual instructions
      alert('To install:\n\nChrome Android: Tap ⋮ menu → Add to Home Screen\nChrome Desktop: Look for install icon in address bar\nSafari iOS: Tap Share → Add to Home Screen');
    }
  });
  actionRow.appendChild(btn);
}

// Also add to settings page
function injectInstallInSettings(){
  if(window.matchMedia('(display-mode: standalone)').matches) return;
  if(document.getElementById('ubPwaInstallSettings')) return;
  const supportList = document.querySelector('#page-settings .settings-list:last-of-type');
  if(!supportList) return;
  const item = document.createElement('div');
  item.id = 'ubPwaInstallSettings';
  item.className = 'settings-item';
  item.innerHTML = \`
    <div class="settings-icon">📲</div>
    <div class="settings-info"><div class="settings-label">Install App</div><div class="settings-sub">Add UniFreestyle to your home screen</div></div>
    <div class="settings-arrow">›</div>
  \`;
  item.addEventListener('click', async () => {
    if(deferredPrompt){
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
    } else {
      alert('To install:\n\nChrome Android: Tap ⋮ menu → Add to Home Screen\nChrome Desktop: Look for install icon in address bar\nSafari iOS: Tap Share → Add to Home Screen');
    }
  });
  supportList.insertBefore(item, supportList.firstChild);
}

// Inject buttons when DOM is ready and when navigating to home/settings
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(injectInstallButton, 500);
  setTimeout(injectInstallInSettings, 500);
});

// Watch for page navigation (goToPage calls)
const _origGoToPagePwa = window.goToPage;
window.goToPage = function(name){
  if(typeof _origGoToPagePwa === 'function') _origGoToPagePwa(name);
  if(name === 'home') setTimeout(injectInstallButton, 300);
  if(name === 'settings') setTimeout(injectInstallInSettings, 300);
};

// Track install
window.addEventListener('appinstalled', () => {
  console.log('[UniFreestyle PWA] installed to home screen');
  deferredPrompt = null;
  const banner = document.getElementById('ubInstallBanner');
  if(banner) banner.remove();
});
