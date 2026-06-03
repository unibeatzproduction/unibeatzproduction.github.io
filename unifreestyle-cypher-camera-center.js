// unifreestyle-cypher-camera-center.js
// Cypher-only camera bubble centering for mobile + desktop.

(function(){
  function isFreestyle(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }

  function injectStyle(){
    if(!isFreestyle() || document.getElementById('ub-cypher-camera-center-style')) return;
    var style = document.createElement('style');
    style.id = 'ub-cypher-camera-center-style';
    style.textContent = `
      /* Keep the Cypher stage centered and stable */
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

      /* Camera/avatar bubbles around the circle */
      #page-cypher .cy-tile{
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        overflow:hidden !important;
        border-radius:50% !important;
        box-sizing:border-box !important;
      }

      #page-cypher .cy-tile-inner{
        position:absolute !important;
        inset:0 !important;
        width:100% !important;
        height:100% !important;
        border-radius:50% !important;
        overflow:hidden !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }

      #page-cypher .cy-tile video,
      #page-cypher .cy-tile img,
      #page-cypher .cy-tile-inner video,
      #page-cypher .cy-tile-inner img{
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
        transform:translate(-50%,-50%) scaleX(-1) !important;
      }

      #page-cypher .cy-tile img,
      #page-cypher .cy-tile-inner img{
        transform:translate(-50%,-50%) !important;
      }

      #page-cypher .cy-tile-ph{
        width:100% !important;
        height:100% !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        text-align:center !important;
      }

      /* Keep labels centered under each bubble */
      #page-cypher .cy-tile-label{
        left:50% !important;
        right:auto !important;
        transform:translateX(-50%) !important;
        text-align:center !important;
      }

      @media (max-width: 759px){
        #page-cypher .cy-stage{padding-left:0 !important;padding-right:0 !important;}
        #page-cypher .cy-circle-wrap{width:min(92vw,430px) !important;max-width:430px !important;}
        #page-cypher .cy-tile{width:17% !important;}
        #page-cypher .cy-tile.active{width:20% !important;}
      }

      @media (min-width: 760px){
        #page-cypher .cy-circle-wrap{width:min(62vh,560px) !important;max-width:560px !important;}
        #page-cypher .cy-tile{width:15% !important;}
        #page-cypher .cy-tile.active{width:18% !important;}
      }
    `;
    document.head.appendChild(style);
  }

  function fixExistingMedia(){
    if(!isFreestyle()) return;
    document.querySelectorAll('#page-cypher .cy-tile video, #page-cypher .cy-tile img').forEach(function(el){
      el.style.objectFit = 'cover';
      el.style.objectPosition = 'center center';
      el.style.borderRadius = '50%';
    });
  }

  function boot(){ injectStyle(); fixExistingMedia(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1400);
  setInterval(fixExistingMedia, 2000);
})();
