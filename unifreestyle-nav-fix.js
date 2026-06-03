// unifreestyle-nav-fix.js
// Fixes bottom navigation backing so it does not block profile content.
(function(){
  'use strict';

  function inject(){
    if(document.getElementById('ubBottomNavFix')) return;
    var css = document.createElement('style');
    css.id = 'ubBottomNavFix';
    css.textContent = [
      'html,body{height:100%!important;overflow:hidden!important;}',
      '.page{position:fixed!important;inset:0!important;height:100dvh!important;max-height:100dvh!important;overflow:hidden!important;}',
      '.page.active{display:flex!important;}',
      '.page-body{min-height:0!important;height:auto!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;}',
      '#page-profile .page-body{padding-bottom:96px!important;}',
      '.bottom-nav{height:54px!important;min-height:54px!important;max-height:54px!important;flex-shrink:0!important;background:rgba(8,8,15,.58)!important;backdrop-filter:blur(10px)!important;-webkit-backdrop-filter:blur(10px)!important;border-top:1px solid rgba(201,168,76,.28)!important;box-shadow:none!important;z-index:50!important;}',
      '.bottom-nav .nav-item{padding:5px 2px!important;min-height:0!important;}',
      '.bottom-nav .nav-icon{font-size:1rem!important;line-height:1!important;}',
      '.bottom-nav .nav-label{font-size:.32rem!important;line-height:1!important;}',
      '@media (min-width:900px){.bottom-nav{width:min(680px,70vw)!important;margin:0 auto 8px!important;border-radius:14px!important;border:1px solid rgba(201,168,76,.25)!important;}.page-body{padding-bottom:110px!important;}}'
    ].join('');
    document.head.appendChild(css);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
  setTimeout(inject, 500);
})();