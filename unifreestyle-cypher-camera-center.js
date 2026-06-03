// unifreestyle-cypher-camera-center.js
// Cypher-only camera bubble centering for mobile + desktop.

(function(){
  function isFreestyle(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }

  function injectStyle(){
    if(!isFreestyle() || document.getElementById('ub-cypher-camera-center-style')) return;
    var style = document.createElement('style');
    style.id = 'ub-cypher-camera-center-style';
    style.textContent = `
      #page-cypher .cy-stage{
        width:100% !important;
        display:flex !important;
        justify-content:center !important;
        align-items:center !important;
        overflow:visible !important;
      }

      #page-cypher .cy-circle-wrap{
        position:relative !important;
        margin-left:auto !important;
        margin-right:auto !important;
        left:auto !important;
        right:auto !important;
        transform:none !important;
        overflow:visible !important;
      }

      /* The bubble itself stays round and centered; label can still sit outside */
      #page-cypher .cy-tile{
        position:absolute !important;
        display:block !important;
        overflow:visible !important;
        border-radius:50% !important;
        box-sizing:border-box !important;
        background:rgba(0,0,0,.72) !important;
      }

      /* The camera/image is clipped into the circular frame */
      #page-cypher .cy-tile video,
      #page-cypher .cy-tile img,
      #page-cypher .cy-tile canvas,
      #page-cypher .cy-tile .cy-tile-inner video,
      #page-cypher .cy-tile .cy-tile-inner img{
        position:absolute !important;
        top:50% !important;
        left:50% !important;
        width:100% !important;
        height:100% !important;
        min-width:100% !important;
        min-height:100% !important;
        object-fit:cover !important;
        object-position:center center !important;
        border-radius:50% !important;
        clip-path:circle(50% at 50% 50%) !important;
        transform:translate(-50%,-50%) scaleX(-1) !important;
        z-index:1 !important;
      }

      #page-cypher .cy-tile img,
      #page-cypher .cy-tile .cy-tile-inner img{
        transform:translate(-50%,-50%) !important;
      }

      #page-cypher .cy-tile-silhouette,
      #page-cypher .cy-tile-ph{
        position:absolute !important;
        inset:0 !important;
        width:100% !important;
        height:100% !important;
        border-radius:50% !important;
        overflow:hidden !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        text-align:center !important;
        z-index:0 !important;
      }

      #page-cypher .cy-tile-label{
        position:absolute !important;
        bottom:-22px !important;
        left:50% !important;
        right:auto !important;
        transform:translateX(-50%) !important;
        text-align:center !important;
        z-index:5 !important;
      }

      @media (max-width: 759px){
        #page-cypher .cy-stage{padding-left:0 !important;padding-right:0 !important;}
        #page-cypher .cy-circle-wrap{width:min(92vw,430px) !important;max-width:430px !important;}
        #page-cypher .cy-tile{width:17% !important;}
        #page-cypher .cy-tile.cy-active,
        #page-cypher .cy-tile.active{width:20% !important;}
      }

      @media (min-width: 760px){
        #page-cypher .cy-circle-wrap{width:min(70vh,680px) !important;max-width:680px !important;}
        #page-cypher .cy-tile{width:15% !important;}
        #page-cypher .cy-tile.cy-active,
        #page-cypher .cy-tile.active{width:18% !important;}
      }
    `;
    document.head.appendChild(style);
  }

  function fixExistingMedia(){
    if(!isFreestyle()) return;
    document.querySelectorAll('#page-cypher .cy-tile video, #page-cypher .cy-tile img, #page-cypher .cy-tile canvas').forEach(function(el){
      el.style.position = 'absolute';
      el.style.top = '50%';
      el.style.left = '50%';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.objectFit = 'cover';
      el.style.objectPosition = 'center center';
      el.style.borderRadius = '50%';
      el.style.clipPath = 'circle(50% at 50% 50%)';
      if(el.tagName.toLowerCase() === 'video') el.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      else el.style.transform = 'translate(-50%, -50%)';
    });
  }

  function boot(){ injectStyle(); fixExistingMedia(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1400);
  setTimeout(boot, 2600);
  setInterval(fixExistingMedia, 1200);
})();
