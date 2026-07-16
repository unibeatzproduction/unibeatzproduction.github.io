// unibeatz-radio-v5-patch.js
// UniBeatz Radio V5 integration patch.
// Keeps the existing Track Browser and saved DJ OS mappings.
// Adds one controller owner, audio-output selection, real platter scrubbing,
// mouse/touch EQ knobs, and the missing mapping actions.

(function(){
  'use strict';

  const OS = window.UniBeatzDJOS;
  const A = document.getElementById('deckA');
  const B = document.getElementById('deckB');
  if(!A || !B){
    console.error('[UniBeatz V5] Deck audio elements were not found.');
    return;
  }

  const state = {
    browserIndex: 0,
    shift: {A:false,B:false},
    hotCues: {A:[null,null,null,null],B:[null,null,null,null]},
    loops: {A:null,B:null},
    headphoneVolume: .75,
    enabled: false
  };

  const cue = {A:new Audio(),B:new Audio()};
  cue.A.crossOrigin = 'anonymous';
  cue.B.crossOrigin = 'anonymous';

  function audio(deck){ return deck === 'A' ? A : B; }
  function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,Number(v)||0)); }
  function notice(msg,color='#40D0FF'){
    const el=document.getElementById('deckNotice');
    if(el){el.textContent=msg;el.style.color=color;}
    console.log('[UniBeatz V5]',msg);
  }
  function pressed(sig){ return sig?.noteOn !== false; }
  function delta(sig){
    if(Number.isFinite(sig?.relativeDelta)) return sig.relativeDelta;
    const v=Number(sig?.value);
    if(Number.isFinite(v)){
      if(v===0 || v===64) return 0;
      return v<64?v:v-128;
    }
    return (Number(sig?.normalized||.5)-.5)*8;
  }

  async function enableAudio(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      window.__ubV5AudioCtx=window.__ubV5AudioCtx||new Ctx();
      if(window.__ubV5AudioCtx.state==='suspended') await window.__ubV5AudioCtx.resume();
      A.muted=false;B.muted=false;
      state.enabled=true;
      const btn=document.getElementById('enableDeckAudio');
      if(btn){btn.textContent='AUDIO ENABLED';btn.disabled=true;}
      const s=document.getElementById('audioRouteStatus');
      if(s)s.textContent='Enabled';
      notice('Deck audio enabled.','#5dff9e');
    }catch(e){notice('Audio enable failed: '+(e.message||e),'#ff7474');}
  }

  async function setSink(media,id){
    if(typeof media.setSinkId!=='function'){
      notice('Selectable outputs require Chrome or Edge desktop.','#F0C040');
      return;
    }
    try{await media.setSinkId(id||'');}
    catch(e){notice('Output change failed: '+(e.message||e),'#ff7474');}
  }

  async function listOutputs(){
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      const outputs=devices.filter(d=>d.kind==='audiooutput');
      for(const id of ['masterOutputSelect','headphoneOutputSelect']){
        const select=document.getElementById(id);
        if(!select)continue;
        const current=select.value;
        select.innerHTML='<option value="">System Default</option>'+
          outputs.map(d=>`<option value="${d.deviceId}">${d.label||'Audio Output'}</option>`).join('');
        select.value=current;
      }
    }catch(e){console.warn('[UniBeatz V5 outputs]',e);}
  }

  async function play(deck){
    const el=audio(deck);
    if(!el.src){notice('Load a track to Deck '+deck+' first.','#F0C040');return;}
    if(!state.enabled) await enableAudio();
    try{await el.play();notice('Deck '+deck+' playing.','#5dff9e');}
    catch(e){notice('Deck '+deck+' play failed: '+(e.message||e),'#ff7474');}
  }
  function stop(deck){const el=audio(deck);el.pause();el.currentTime=0;}
  function cueStart(deck){const el=audio(deck);el.currentTime=0;play(deck);}
  function jog(deck,amount,search=false){
    const el=audio(deck);
    if(!el.src)return;
    const scale=search?.35:.025;
    el.currentTime=Math.max(0,Math.min(el.duration||Infinity,el.currentTime+amount*scale));
  }

  function setHotCue(deck,index){
    const el=audio(deck);
    if(!el.src)return;
    if(state.shift[deck]){
      state.hotCues[deck][index]=null;
      notice(`Deck ${deck} Hot Cue ${index+1} cleared.`);
    }else if(state.hotCues[deck][index]===null){
      state.hotCues[deck][index]=el.currentTime;
      notice(`Deck ${deck} Hot Cue ${index+1} set.`,'#5dff9e');
    }else{
      el.currentTime=state.hotCues[deck][index];
      play(deck);
    }
  }

  function setLoop(deck,beats){
    const el=audio(deck);
    if(!el.src)return;
    const bpm=120;
    const len=(60/bpm)*beats;
    state.loops[deck]={start:el.currentTime,end:Math.min(el.duration||Infinity,el.currentTime+len)};
    notice(`Deck ${deck} ${beats}-beat loop active.`,'#5dff9e');
  }

  function browserMove(step){
    const rows=[...document.querySelectorAll('#queueList .tb-row')];
    if(!rows.length){notice('Track Browser has no tracks.','#F0C040');return;}
    state.browserIndex=(state.browserIndex+step+rows.length)%rows.length;
    rows.forEach((row,i)=>{
      row.style.outline=i===state.browserIndex?'2px solid #40D0FF':'none';
      if(i===state.browserIndex)row.scrollIntoView({block:'nearest'});
    });
  }

  function browserLoad(deck){
    const rows=[...document.querySelectorAll('#queueList .tb-row')];
    const row=rows[state.browserIndex];
    if(!row)return;
    const btn=row.querySelector(`[data-load="${deck}"]`);
    if(btn)btn.click();
  }

  function headphoneCue(deck){
    const main=audio(deck),out=cue[deck];
    if(!main.src)return;
    out.src=main.src;
    out.currentTime=main.currentTime;
    out.playbackRate=main.playbackRate;
    out.volume=state.headphoneVolume;
    out.play().catch(e=>notice('Headphone cue failed: '+e.message,'#ff7474'));
  }

  function bindPlatter(deck){
    const el=document.getElementById('platter'+deck);
    if(!el)return;
    let dragging=false,last=0;
    const angle=e=>{
      const r=el.getBoundingClientRect();
      return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)*180/Math.PI;
    };
    el.addEventListener('pointerdown',e=>{
      dragging=true;last=angle(e);el.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    el.addEventListener('pointermove',e=>{
      if(!dragging)return;
      let now=angle(e),d=now-last;
      if(d>180)d-=360;if(d<-180)d+=360;
      jog(deck,d,state.shift[deck]);
      last=now;e.preventDefault();
    });
    const end=e=>{dragging=false;el.releasePointerCapture?.(e.pointerId);};
    el.addEventListener('pointerup',end);
    el.addEventListener('pointercancel',end);
  }

  const knobValues={};
  function bindKnob(id,deck,control){
    const el=document.getElementById(id);
    if(!el)return;
    let dragging=false,startY=0,start=.5;
    knobValues[id]=.5;
    const paint=()=>el.style.setProperty('--knob-angle',`${-135+knobValues[id]*270}deg`);
    paint();
    el.addEventListener('pointerdown',e=>{
      dragging=true;startY=e.clientY;start=knobValues[id];
      el.classList.add('dragging');el.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    el.addEventListener('pointermove',e=>{
      if(!dragging)return;
      knobValues[id]=clamp(start+(startY-e.clientY)/120);
      paint();
      window.dispatchEvent(new CustomEvent('ub-v5-eq',{detail:{deck,control,value:knobValues[id]}}));
      e.preventDefault();
    });
    const end=e=>{dragging=false;el.classList.remove('dragging');el.releasePointerCapture?.(e.pointerId);};
    el.addEventListener('pointerup',end);
    el.addEventListener('pointercancel',end);
  }

  // Keep visible mixer controls synchronized.
  window.addEventListener('ub-v5-eq',e=>{
    const {deck,control,value}=e.detail||{};
    const idMap={
      eqHighA:'eqHighA',eqMidA:'eqMidA',eqLowA:'eqLowA',
      eqHighB:'eqHighB',eqMidB:'eqMidB',eqLowB:'eqLowB'
    };
    const id=idMap[control+deck]||control+deck;
    if(knobValues[id]!==undefined){
      knobValues[id]=clamp(value);
      document.getElementById(id)?.style.setProperty('--knob-angle',`${-135+knobValues[id]*270}deg`);
    }
    window.dispatchEvent(new CustomEvent('ub-dj-os-eq',{detail:{deck,control,value}}));
  });

  function registerActions(){
    if(!OS?.registerAction)return;

    ['A','B'].forEach(deck=>{
      OS.registerAction(`deck${deck}.play`,sig=>{if(pressed(sig))play(deck);},`Deck ${deck} Play / Pause`);
      OS.registerAction(`deck${deck}.cue`,sig=>{if(pressed(sig))cueStart(deck);},`Deck ${deck} Cue`);
      OS.registerAction(`deck${deck}.stop`,sig=>{if(pressed(sig))stop(deck);},`Deck ${deck} Stop`);
      OS.registerAction(`deck${deck}.jog`,sig=>jog(deck,delta(sig),false),`Deck ${deck} Jog / Scratch`);
      OS.registerAction(`deck${deck}.search`,sig=>jog(deck,delta(sig),true),`Deck ${deck} Shift Search`);
      OS.registerAction(`deck${deck}.shift`,sig=>state.shift[deck]=!!sig.noteOn&&!sig.noteOff,`Deck ${deck} Shift`);
      OS.registerAction(`deck${deck}.headphoneCue`,sig=>{if(pressed(sig))headphoneCue(deck);},`Deck ${deck} Headphone Cue`);
      for(let i=0;i<4;i++){
        OS.registerAction(`deck${deck}.hotCue${i+1}`,sig=>{if(pressed(sig))setHotCue(deck,i);},`Deck ${deck} Hot Cue ${i+1}`);
      }
      [1,2,4,8].forEach(beats=>{
        OS.registerAction(`deck${deck}.loop${beats}`,sig=>{if(pressed(sig))setLoop(deck,beats);},`Deck ${deck} Loop ${beats}`);
      });
      OS.registerAction(`deck${deck}.loopOff`,sig=>{if(pressed(sig))state.loops[deck]=null;},`Deck ${deck} Loop Off`);
      ['eqHigh','eqMid','eqLow','filter'].forEach(control=>{
        OS.registerAction(`deck${deck}.${control}`,sig=>{
          window.dispatchEvent(new CustomEvent('ub-v5-eq',{detail:{deck,control,value:sig.normalized}}));
        },`Deck ${deck} ${control}`);
      });
      OS.registerAction(`deck${deck}.fxEcho`,sig=>OS.util.dispatch('ub-v5-fx',{deck,name:'echo',value:sig.normalized}),`Deck ${deck} FX Echo`);
      OS.registerAction(`deck${deck}.fxReverb`,sig=>OS.util.dispatch('ub-v5-fx',{deck,name:'reverb',value:sig.normalized}),`Deck ${deck} FX Reverb`);
      OS.registerAction(`deck${deck}.stemVocals`,sig=>OS.util.dispatch('ub-v5-stem',{deck,mode:'vocals'}),`Deck ${deck} Stem Vocals`);
      OS.registerAction(`deck${deck}.stemInstrumental`,sig=>OS.util.dispatch('ub-v5-stem',{deck,mode:'instrumental'}),`Deck ${deck} Stem Instrumental`);
    });

    OS.registerAction('browser.encoder',sig=>browserMove(delta(sig)>0?1:-1),'Track Browser Encoder');
    OS.registerAction('browser.loadA',sig=>{if(pressed(sig))browserLoad('A');},'Load Selected to Deck A');
    OS.registerAction('browser.loadB',sig=>{if(pressed(sig))browserLoad('B');},'Load Selected to Deck B');
    OS.registerAction('browser.prep',sig=>{if(pressed(sig))notice('Selected track prepared.','#5dff9e');},'Assist / Prep Selected Track');
    OS.registerAction('headphones.volume',sig=>{
      state.headphoneVolume=clamp(sig.normalized);
      cue.A.volume=state.headphoneVolume;cue.B.volume=state.headphoneVolume;
    },'Headphone Volume');

    // Rebuild the dropdown/list without erasing the saved localStorage profiles.
    if(OS.ui?.render){
      const old=document.getElementById('ubDjOSPanel');
      if(old)old.remove();
      OS.ui.build();
      OS.ui.render();
      const mount=document.getElementById('djControllerPanelMount');
      const panel=document.getElementById('ubDjOSPanel');
      if(mount&&panel)mount.appendChild(panel);
    }
  }

  function installRoutingUI(){
    const host=document.getElementById('djControllerPanelMount')||document.querySelector('.midi-panel');
    if(!host)return;
    if(document.getElementById('audioRoutingCard'))return;

    const box=document.createElement('div');
    box.id='audioRoutingCard';
    box.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:10px;">
        <select id="masterOutputSelect" class="midi-select"><option value="">System Default Master</option></select>
        <select id="headphoneOutputSelect" class="midi-select"><option value="">System Default Headphones</option></select>
        <button id="enableDeckAudio" type="button" class="m-btn gold">ENABLE AUDIO</button>
      </div>
      <div id="audioRouteStatus" style="font-family:var(--font-mono);font-size:.65rem;color:var(--gray2);">Audio not enabled</div>`;
    host.prepend(box);

    document.getElementById('enableDeckAudio').onclick=enableAudio;
    document.getElementById('masterOutputSelect').onchange=e=>{
      setSink(A,e.target.value);setSink(B,e.target.value);
    };
    document.getElementById('headphoneOutputSelect').onchange=e=>{
      setSink(cue.A,e.target.value);setSink(cue.B,e.target.value);
    };
  }

  function tick(){
    for(const deck of ['A','B']){
      const loop=state.loops[deck],el=audio(deck);
      if(loop&&el.currentTime>=loop.end)el.currentTime=loop.start;
    }
    requestAnimationFrame(tick);
  }

  bindPlatter('A');bindPlatter('B');
  bindKnob('eqHighA','A','eqHigh');bindKnob('eqMidA','A','eqMid');bindKnob('eqLowA','A','eqLow');
  bindKnob('eqHighB','B','eqHigh');bindKnob('eqMidB','B','eqMid');bindKnob('eqLowB','B','eqLow');
  installRoutingUI();
  registerActions();

  navigator.mediaDevices?.getUserMedia({audio:true}).then(s=>{
    s.getTracks().forEach(t=>t.stop());listOutputs();
  }).catch(()=>listOutputs());
  navigator.mediaDevices?.addEventListener?.('devicechange',listOutputs);

  requestAnimationFrame(tick);
  console.log('[UniBeatz Radio V5] controller, platter, mapping and output patch ready');
})();