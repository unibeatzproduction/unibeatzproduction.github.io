// unipack-pwa.js — UniBeatz Pack Studio PWA

if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/unipack-sw.js')
      .then(function(reg){
        console.log('[UniPack SW] registered:', reg.scope);
      })
      .catch(function(err){ console.warn('[UniPack SW] failed:', err); });
  });
}

var deferredPrompt = null;

window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  deferredPrompt = e;
  var dismissed = parseInt(localStorage.getItem('unipack_install_dismissed') || '0');
  if(Date.now() - dismissed < 86400000) return;
  setTimeout(showPackInstallBanner, 3000);
});

function showPackInstallBanner(){
  if(document.getElementById('unipackInstallBanner')) return;
  if(window.matchMedia('(display-mode: standalone)').matches) return;

  var banner = document.createElement('div');
  banner.id = 'unipackInstallBanner';
  banner.style.cssText = 'position:fixed;bottom:20px;left:12px;right:12px;z-index:99999;background:linear-gradient(135deg,#0a0a14,#06060f);border:1px solid rgba(201,168,76,.5);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);';

  var icon = document.createElement('span');
  icon.style.cssText = 'font-size:1.8rem;flex-shrink:0;';
  icon.textContent = '🎛️';

  var info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';
  info.innerHTML = '<div style="font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:2px;color:#F0C040;line-height:1;">Install Pack Studio</div><div style="font-family:Orbitron,sans-serif;font-size:.4rem;letter-spacing:1.5px;color:#8d94a5;margin-top:2px;">Work offline · No browser needed</div>';

  var installBtn = document.createElement('button');
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
    localStorage.setItem('unipack_install_dismissed', Date.now());
  });

  banner.appendChild(icon);
  banner.appendChild(info);
  banner.appendChild(installBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
}

window.addEventListener('appinstalled', function(){
  deferredPrompt = null;
  var banner = document.getElementById('unipackInstallBanner');
  if(banner) banner.remove();
});
