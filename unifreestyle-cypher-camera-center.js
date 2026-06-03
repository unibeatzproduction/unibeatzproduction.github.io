// unifreestyle-cypher-camera-center.js
// Cypher-only camera bubble centering for mobile + desktop.
// PC crop is good; mobile receives its own crop correction.

(function(){
  function isFreestyle(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 759px)').matches; }

  function injectStyle(){
    if(!isFreestyle() || document.getElementById('ub-cypher-camera-center-style')) return;
    var style = document.createElement('style');
    style.id = 'ub-cypher-camera-center-style';
    style.textContent = `
      #page-cypher .cy-stage{width:100%!important;display:flex!important;justify-content:center!important;align-items:center!important;overflow:visible!important;}
      #page-cypher .cy-circle-wrap{position:relative!important;margin-left:auto!important;margin-right:auto!important;left:auto!important;right:auto!important;transform:none!important;overflow:visible!important;}
      #page-cypher .cy-tile{position:absolute!important;display:block!important;overflow:visible!important;border-radius:50%!important;box-sizing:border-box!important;background:rgba(0,0,0,.72)!important;}
      #page-cypher .cy-media-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:50%!important;overflow:hidden!important;clip-path:circle(50% at 50% 50%)!important;z-index:1!important;background:rgba(0,0,0,.55)!important;}
      #page-cypher .cy-media-frame video,#page-cypher .cy-media-frame img,#page-cypher .cy-media-frame canvas{position:absolute!important;top:50%!important;left:50%!important;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center center!important;border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important;transform:translate(-50%,-50%) scaleX(-1)!important;}
      #page-cypher .cy-media-frame img,#page-cypher .cy-media-frame canvas{transform:translate(-50%,-50%)!important;}
      #page-cypher .cy-tile > video,#page-cypher .cy-tile > img,#page-cypher .cy-tile > canvas{position:absolute!important;top:50%!important;left:50%!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center center!important;border-radius:50%!important;clip-path:circle(50% at 50% 50%)!important;transform:translate(-50%,-50%) scaleX(-1)!important;z-index:1!important;}
      #page-cypher .cy-tile-silhouette,#page-cypher .cy-tile-ph{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:50%!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;z-index:0!important;}
      #page-cypher .cy-tile-label{position:absolute!important;bottom:-22px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;text-align:center!important;z-index:5!important;pointer-events:none!important;}
      @media (max-width: 759px){
        #page-cypher .cy-stage{padding-left:0!important;padding-right:0!important;}
        #page-cypher .cy-circle-wrap{width:min(92vw,430px)!important;max-width:430px!important;}
        #page-cypher .cy-tile{width:17%!important;}
        #page-cypher .cy-tile.cy-active,#page-cypher .cy-tile.active{width:20%!important;}
        #page-cypher .cy-media-frame video,#page-cypher .cy-tile > video{
          top:54%!important;
          left:50%!important;
          width:132%!important;
          height:132%!important;
          min-width:132%!important;
          min-height:132%!important;
          object-fit:cover!important;
          object-position:center center!important;
          transform:translate(-50%,-50%) scaleX(-1)!important;
        }
      }
      @media (min-width: 760px){
        #page-cypher .cy-circle-wrap{width:min(70vh,680px)!important;max-width:680px!important;}
        #page-cypher .cy-tile{width:15%!important;}
        #page-cypher .cy-tile.cy-active,#page-cypher .cy-tile.active{width:18%!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureFrame(tile){
    if(!tile) return null;
    var frame = tile.querySelector(':scope > .cy-media-frame');
    if(!frame){
      frame = document.createElement('div');
      frame.className = 'cy-media-frame';
      tile.insertBefore(frame, tile.firstChild);
    }
    var silhouette = tile.querySelector(':scope > .cy-tile-silhouette, :scope > .cy-tile-ph');
    if(silhouette && silhouette.parentNode !== frame) frame.appendChild(silhouette);
    return frame;
  }

  function centerMedia(el){
    if(!el) return;
    var mobile = isMobile();
    el.style.position = 'absolute';
    el.style.top = mobile ? '54%' : '50%';
    el.style.left = '50%';
    el.style.width = mobile ? '132%' : '100%';
    el.style.height = mobile ? '132%' : '100%';
    el.style.minWidth = mobile ? '132%' : '100%';
    el.style.minHeight = mobile ? '132%' : '100%';
    el.style.objectFit = 'cover';
    el.style.objectPosition = 'center center';
    el.style.borderRadius = '50%';
    el.style.clipPath = 'circle(50% at 50% 50%)';
    if(el.tagName && el.tagName.toLowerCase() === 'video') el.style.transform = 'translate(-50%, -50%) scaleX(-1)';
    else el.style.transform = 'translate(-50%, -50%)';
  }

  function normalizeTiles(){
    if(!isFreestyle()) return;
    document.querySelectorAll('#page-cypher .cy-tile').forEach(function(tile){
      var frame = ensureFrame(tile);
      if(!frame) return;
      Array.from(tile.childNodes).forEach(function(node){
        if(!node || node === frame) return;
        if(node.classList && node.classList.contains('cy-tile-label')) return;
        if(node.tagName && ['VIDEO','IMG','CANVAS'].indexOf(node.tagName) !== -1){ frame.appendChild(node); }
      });
      frame.querySelectorAll('video,img,canvas').forEach(centerMedia);
    });
  }

  function boot(){ injectStyle(); normalizeTiles(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 300);
  setTimeout(boot, 900);
  setTimeout(boot, 1800);
  window.addEventListener('resize', normalizeTiles);
  setInterval(normalizeTiles, 500);
})();