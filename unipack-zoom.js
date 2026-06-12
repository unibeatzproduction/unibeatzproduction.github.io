// unipack-zoom.js
// Waveform zoom in/out for UniBeatz Pack Studio
// Adds + / - zoom buttons next to Trim button on both waveform sections

(function(){
  'use strict';

  // Zoom state per section
  var zoom = { A: 1, B: 1 };
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 16;
  var scrollPos = { A: 0, B: 0 };

  function injectZoomCss(){
    if(document.getElementById('ubZoomCss')) return;
    var s=document.createElement('style'); s.id='ubZoomCss';
    s.textContent=[
      '.ub-zoom-btn{border:1px solid rgba(64,208,255,.4);background:rgba(64,208,255,.08);color:#40D0FF;border-radius:6px;padding:5px 11px;font-family:Orbitron,sans-serif;font-size:.65rem;font-weight:900;cursor:pointer;line-height:1;transition:all .15s;}',
      '.ub-zoom-btn:hover{background:rgba(64,208,255,.2);}',
      '.ub-zoom-btn:active{transform:scale(.95);}',
      '.ub-zoom-label{font-family:Orbitron,sans-serif;font-size:.42rem;color:rgba(64,208,255,.6);letter-spacing:1px;align-self:center;min-width:32px;text-align:center;}',
      '.waveform-canvas-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch;}',
      '.waveform-canvas-wrap canvas{display:block;}'
    ].join('');
    document.head.appendChild(s);
  }

  function injectZoomButtons(sec){
    var ctrlRow=document.querySelector('#waveCanvasWrap'+sec+' ~ .waveform-controls, .waveform-controls');
    // Find the controls row inside the section
    var section=document.getElementById('waveformSection'+sec);
    if(!section) return;
    var controls=section.querySelector('.waveform-controls');
    if(!controls) return;
    if(controls.querySelector('.ub-zoom-btn')) return; // already injected

    // Find trim button to insert next to it
    var trimBtn=document.getElementById('trimSelBtn'+sec);
    var insertAfter=trimBtn||section.querySelector('.tool-btn');

    var zoomOut=document.createElement('button');
    zoomOut.className='ub-zoom-btn';
    zoomOut.textContent='−';
    zoomOut.title='Zoom out';
    zoomOut.onclick=function(){ zoomWave(sec,-1); };

    var zoomLabel=document.createElement('span');
    zoomLabel.className='ub-zoom-label';
    zoomLabel.id='zoomLabel'+sec;
    zoomLabel.textContent='1x';

    var zoomIn=document.createElement('button');
    zoomIn.className='ub-zoom-btn';
    zoomIn.textContent='+';
    zoomIn.title='Zoom in';
    zoomIn.onclick=function(){ zoomWave(sec,1); };

    // Insert after trim button or at end of controls
    if(insertAfter && insertAfter.parentNode===controls){
      insertAfter.insertAdjacentElement('afterend', zoomIn);
      insertAfter.insertAdjacentElement('afterend', zoomLabel);
      insertAfter.insertAdjacentElement('afterend', zoomOut);
    } else {
      controls.appendChild(zoomOut);
      controls.appendChild(zoomLabel);
      controls.appendChild(zoomIn);
    }
  }

  function zoomWave(sec, dir){
    var newZoom=zoom[sec] * (dir>0 ? 2 : 0.5);
    newZoom=Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    zoom[sec]=newZoom;

    var label=document.getElementById('zoomLabel'+sec);
    if(label) label.textContent=newZoom+'x';

    redrawZoomed(sec);
  }

  function redrawZoomed(sec){
    var wrap=document.getElementById('waveCanvasWrap'+sec);
    var canvas=document.getElementById('waveCanvas'+sec);
    if(!wrap||!canvas) return;

    // Get SEC state from parent page
    var SEC=window.SEC;
    if(!SEC||!SEC[sec]||!SEC[sec].audioBuffer) return;

    var z=zoom[sec];
    var naturalWidth=wrap.parentElement.offsetWidth||wrap.offsetWidth;
    var zoomed=naturalWidth*z;

    // Resize canvas to zoomed width
    var dpr=window.devicePixelRatio||1;
    var h=wrap.offsetHeight||80;
    canvas.style.width=zoomed+'px';
    canvas.width=zoomed*dpr;
    canvas.height=h*dpr;

    var ctx=canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    var buf=SEC[sec].audioBuffer;
    var data=buf.getChannelData(0);
    var step=Math.ceil(data.length/zoomed);
    var amp=h/2;

    ctx.clearRect(0,0,zoomed,h);
    ctx.fillStyle='rgba(0,0,0,.4)';
    ctx.fillRect(0,0,zoomed,h);

    var grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'rgba(64,208,255,.6)');
    grad.addColorStop(0.5,'rgba(201,168,76,.7)');
    grad.addColorStop(1,'rgba(64,208,255,.6)');
    ctx.fillStyle=grad;

    for(var i=0;i<zoomed;i++){
      var min=1.0, max=-1.0;
      for(var j=0;j<step;j++){
        var datum=data[(i*step)+j]||0;
        if(datum<min) min=datum;
        if(datum>max) max=datum;
      }
      ctx.fillRect(i,(1+min)*amp,1,Math.max(1,(max-min)*amp));
    }

    ctx.strokeStyle='rgba(255,255,255,.1)';
    ctx.beginPath();
    ctx.moveTo(0,h/2);
    ctx.lineTo(zoomed,h/2);
    ctx.stroke();

    // Re-render slice markers scaled to new width
    if(typeof window.renderSliceMarkers==='function') window.renderSliceMarkers(sec);
  }

  // Override renderSliceMarkers to account for zoom
  var _origRenderMarkers=null;
  function hookRenderMarkers(){
    if(_origRenderMarkers) return;
    var attempts=0;
    var t=setInterval(function(){
      attempts++;
      if(typeof window.renderSliceMarkers==='function'){
        clearInterval(t);
        _origRenderMarkers=window.renderSliceMarkers;
        window.renderSliceMarkers=function(sec){
          var SEC=window.SEC;
          var wrap=document.getElementById('waveCanvasWrap'+sec);
          if(!wrap||!SEC||!SEC[sec]) return _origRenderMarkers(sec);
          var z=zoom[sec]||1;
          var naturalWidth=(wrap.parentElement.offsetWidth||wrap.offsetWidth)/z;
          var markers=document.getElementById('sliceMarkers'+sec);
          var regions=document.getElementById('sliceRegions'+sec);
          if(!markers||!regions) return _origRenderMarkers(sec);
          var zoomed=naturalWidth*z;
          var totalW=zoomed;
          markers.innerHTML='';
          regions.innerHTML='';
          var dur=SEC[sec].trackDuration;
          if(!dur) return;
          (SEC[sec].slices||[]).forEach(function(sl,i){
            var startPx=(sl.start/dur)*totalW;
            var endPx=(sl.end/dur)*totalW;
            var region=document.createElement('div');
            region.className='slice-region'+(sl.id===SEC[sec].selectedSliceId?' selected':'');
            region.style.left=startPx+'px';
            region.style.width=(endPx-startPx)+'px';
            region.innerHTML='<div class="slice-region-label">'+(i+1)+'</div>'+
              '<div class="slice-region-delete" data-id="'+sl.id+'" data-sec="'+sec+'" title="Delete slice">×</div>'+
              '<div class="slice-handle slice-handle-left" data-id="'+sl.id+'" data-edge="left" data-sec="'+sec+'"></div>'+
              '<div class="slice-handle slice-handle-right" data-id="'+sl.id+'" data-edge="right" data-sec="'+sec+'"></div>';
            region.onclick=function(e){
              if(e.target.classList.contains('slice-region-delete')){ e.stopPropagation(); if(typeof window.deleteSlice==='function') window.deleteSlice(sl.id,sec); return; }
              if(!e.target.closest('.slice-handle')){ e.stopPropagation(); if(typeof window.selectSlice==='function') window.selectSlice(sl.id,sec); }
            };
            region.oncontextmenu=function(e){ e.preventDefault(); e.stopPropagation(); if(typeof window.deleteSlice==='function') window.deleteSlice(sl.id,sec); return false; };
            regions.appendChild(region);
          });
        };
      }
      if(attempts>40) clearInterval(t);
    },300);
  }

  // Watch for waveform sections becoming visible and inject buttons
  function watchSections(){
    ['A','B'].forEach(function(sec){
      var section=document.getElementById('waveformSection'+sec);
      if(!section) return;
      // Use MutationObserver to detect when section becomes visible
      var obs=new MutationObserver(function(){
        if(section.style.display!=='none'){
          injectZoomButtons(sec);
        }
      });
      obs.observe(section,{attributes:true,attributeFilter:['style']});
      // Also check right now
      if(section.style.display!=='none') injectZoomButtons(sec);
    });
  }

  function boot(){
    injectZoomCss();
    hookRenderMarkers();
    watchSections();
    // Retry injection every second for first 10s
    var attempts=0;
    var t=setInterval(function(){
      attempts++;
      ['A','B'].forEach(function(sec){
        var section=document.getElementById('waveformSection'+sec);
        if(section&&section.style.display!=='none') injectZoomButtons(sec);
      });
      if(attempts>10) clearInterval(t);
    },1000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

})();
