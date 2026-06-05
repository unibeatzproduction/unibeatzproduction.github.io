// UB Disable Floating Account System
// Stops old floating account UI from displaying or interfering with Firebase account sync.
(function(){
  'use strict';

  var floatingSelectors = [
    '#floatingAccount',
    '#floating-account',
    '#ubFloatingAccount',
    '#ub-floating-account',
    '.floating-account',
    '.floatingAccount',
    '.ub-floating-account',
    '.ubFloatingAccount',
    '.account-float',
    '.float-account',
    '.floating-profile',
    '.floating-user',
    '.mini-account-float',
    '[data-floating-account]',
    '[data-ub-floating-account]'
  ];

  function addCss(){
    if(document.getElementById('ubDisableFloatingAccountCss')) return;
    var style=document.createElement('style');
    style.id='ubDisableFloatingAccountCss';
    style.textContent=floatingSelectors.join(',')+'{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
    document.head.appendChild(style);
  }

  function removeFloatingNodes(){
    floatingSelectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        try{ el.remove(); }catch(e){ el.style.display='none'; }
      });
    });
  }

  function neutralizeOldGlobals(){
    var noop=function(){ return false; };
    [
      'openFloatingAccount',
      'closeFloatingAccount',
      'toggleFloatingAccount',
      'renderFloatingAccount',
      'refreshFloatingAccount',
      'initFloatingAccount',
      'createFloatingAccount',
      'mountFloatingAccount'
    ].forEach(function(name){
      try{ window[name]=noop; }catch(e){}
    });
  }

  function boot(){
    window.UB_DISABLE_FLOATING_ACCOUNT = true;
    addCss();
    neutralizeOldGlobals();
    removeFloatingNodes();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  setTimeout(boot,300);
  setTimeout(boot,1000);
  setInterval(boot,2000);
})();