// admin-radio-mobile-fix.js
// Stops mobile flicker by hiding the wrong admin screen before Firebase/auth finishes.
(function(){
  'use strict';

  function unlocked(){
    try { return localStorage.getItem('ub_radio_admin_unlocked') === 'yes'; }
    catch(e){ return false; }
  }

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function stabilize(){
    var lock = document.getElementById('lockScreen');
    var app = document.getElementById('adminApp');
    if(!lock || !app) return;

    if(unlocked()){
      lock.classList.add('hidden');
      app.classList.remove('hidden');
    } else {
      app.classList.add('hidden');
      lock.classList.remove('hidden');
    }

    document.documentElement.classList.add('radio-admin-stable');
    document.body.classList.add('radio-admin-stable');
  }

  var css = document.createElement('style');
  css.id = 'radioAdminMobileFixCss';
  css.textContent = [
    'body:not(.radio-admin-stable) #lockScreen,body:not(.radio-admin-stable) #adminApp{visibility:hidden!important;}',
    '#adminApp.hidden,#lockScreen.hidden{display:none!important;}',
    '#adminApp:not(.hidden),#lockScreen:not(.hidden){visibility:visible!important;}',
    '@media(max-width:700px){.nav{position:sticky!important}.wrap{padding-top:14px!important}.locked{margin:28px 12px!important}.track{transform:none!important}.player{min-height:44px!important}}'
  ].join('');
  document.head.appendChild(css);

  ready(stabilize);
  setTimeout(stabilize, 50);
  setTimeout(stabilize, 250);
  setTimeout(stabilize, 900);
})();