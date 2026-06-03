// unifreestyle-cypher-mobile-camera-fix.js
// Mobile-only Cypher camera cleanup.
(function(){
  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function mobile(){ return window.matchMedia && window.matchMedia('(max-width: 759px)').matches; }
  function apply(){
    if(!ok() || !mobile()) return;
    document.querySelectorAll('#page-cypher .cy-tile').forEach(function(tile){
      var vids = tile.querySelectorAll('video,img,canvas');
      if(vids.length){
        tile.querySelectorAll('.cy-tile-silhouette,.cy-tile-ph').forEach(function(ph){
          ph.style.display = 'none';
          ph.style.opacity = '0';
        });
      }
      vids.forEach(function(el){
        el.style.position = 'absolute';
        el.style.top = '50%';
        el.style.left = '50%';
        el.style.width = '150%';
        el.style.height = '150%';
        el.style.minWidth = '150%';
        el.style.minHeight = '150%';
        el.style.objectFit = 'cover';
        el.style.objectPosition = 'center center';
        el.style.borderRadius = '50%';
        el.style.clipPath = 'circle(50% at 50% 50%)';
        el.style.zIndex = '3';
        if(el.tagName && el.tagName.toLowerCase() === 'video') el.style.transform = 'translate(-50%, -50%) scaleX(-1)';
        else el.style.transform = 'translate(-50%, -50%)';
      });
    });
  }
  var style = document.createElement('style');
  style.textContent = '@media(max-width:759px){#page-cypher .cy-tile video,#page-cypher .cy-tile img,#page-cypher .cy-tile canvas{top:50%!important;left:50%!important;width:150%!important;height:150%!important;object-fit:cover!important;object-position:center center!important;border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important;z-index:3!important;}#page-cypher .cy-tile:has(video) .cy-tile-silhouette,#page-cypher .cy-tile:has(video) .cy-tile-ph{display:none!important;opacity:0!important;}}';
  document.head.appendChild(style);
  setTimeout(apply,300);
  setTimeout(apply,900);
  setTimeout(apply,1800);
  setInterval(apply,350);
})();