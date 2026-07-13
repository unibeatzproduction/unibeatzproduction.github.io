// unibeatz-dj-os-v3.js
// UniBeatz DJ OS V3 — bundled single-file production build
// Includes core, profiles, MIDI, HID, cloud sync, Radio, Battle, LED hooks, and UI.

/* ===== dj-core.js ===== */
// UniBeatz DJ OS V3 — Core
(function(){
  'use strict';

  const OS = window.UniBeatzDJOS = window.UniBeatzDJOS || {};
  OS.version = '3.0.0';
  OS.state = OS.state || {
    platform: detectPlatform(),
    profiles: {},
    devices: { midiInputs:new Map(), midiOutputs:new Map(), hid:new Map() },
    activeProfileKey: null,
    learnAction: null,
    lastSignal: null,
    started: false
  };

  function detectPlatform(){
    const meta = document.querySelector('meta[name="ub-platform"]')?.content;
    if(meta) return String(meta).toLowerCase();
    if(location.hostname.includes('radio')) return 'radio';
    if(location.hostname.includes('battle')) return 'battle';
    return 'generic';
  }

  OS.util = {
    esc(v){
      return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      })[c]);
    },
    slug(v){
      return String(v || '').toLowerCase()
        .replace(/[^a-z0-9_-]+/g,'_')
        .replace(/^_+|_+$/g,'') || 'controller';
    },
    clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,Number(v)||0)); },
    notify(message,color='#40D0FF'){
      const ids = ['ubDjOSNotice','ubDjControllerNotice','deckNotice','midiStatus','liveError'];
      let shown = false;
      ids.forEach(id=>{
        const el = document.getElementById(id);
        if(el){ el.textContent = message; el.style.color = color; shown = true; }
      });
      if(!shown && typeof window.showToast === 'function') window.showToast(message);
      console.log('[UniBeatz DJ OS]', message);
    },
    dispatch(name,detail={}){
      window.dispatchEvent(new CustomEvent(name,{detail}));
    },
    getAudio(deck){
      if(OS.state.platform === 'radio'){
        return document.getElementById(deck === 'A' ? 'deckA' : 'deckB');
      }
      return document.getElementById('battleBeatAudio');
    },
    setRange(id,normalized){
      const el = document.getElementById(id);
      if(!el) return false;
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      el.value = min + ((max-min) * OS.util.clamp(normalized));
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }
  };

  OS.actions = OS.actions || new Map();

  OS.registerAction = function(name, handler, label=name){
    OS.actions.set(name,{handler,label});
  };

  OS.runAction = function(name, signal={}){
    const entry = OS.actions.get(name);
    if(!entry) {
      OS.util.dispatch('ub-dj-os-unhandled-action',{name,signal});
      return false;
    }
    try{
      entry.handler(signal);
      OS.util.dispatch('ub-dj-os-action',{name,signal,platform:OS.state.platform});
      return true;
    }catch(error){
      console.error('[UniBeatz DJ OS] action failed', name, error);
      OS.util.notify(`Controller action failed: ${name}`,'#ff7474');
      return false;
    }
  };

  OS.startLearn = function(action){
    OS.state.learnAction = action;
    OS.util.notify(`Learn Mode: move or press the control for ${action}`,'#F0C040');
  };

  OS.cancelLearn = function(){
    OS.state.learnAction = null;
    OS.util.notify('Learn Mode cancelled.');
  };

  OS.ready = function(){
    if(OS.state.started) return;
    OS.state.started = true;
    OS.util.dispatch('ub-dj-os-ready',{version:OS.version,platform:OS.state.platform});
    console.log(`[UniBeatz DJ OS] V${OS.version} ready for ${OS.state.platform}`);
  };
})();
/* ===== dj-profiles.js ===== */
// UniBeatz DJ OS V3 — Profiles + local persistence
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  const KEY = 'ub_dj_os_profiles_v3';

  OS.profiles = {
    load(){
      try{
        const data = JSON.parse(localStorage.getItem(KEY) || '{}');
        OS.state.profiles = data.profiles || {};
      }catch(_){ OS.state.profiles = {}; }
      return OS.state.profiles;
    },
    save(){
      localStorage.setItem(KEY,JSON.stringify({
        version:OS.version,
        profiles:OS.state.profiles,
        savedAt:Date.now()
      }));
      OS.util.dispatch('ub-dj-os-profiles-saved',{profiles:OS.state.profiles});
    },
    ensure(key,label,type){
      if(!OS.state.profiles[key]){
        OS.state.profiles[key] = {
          key,label:label || key,type:type || 'unknown',
          mappings:{},createdAt:Date.now(),updatedAt:Date.now()
        };
      }
      return OS.state.profiles[key];
    },
    map(profileKey,signalKey,action){
      const p = OS.profiles.ensure(profileKey,profileKey,'unknown');
      p.mappings[signalKey] = action;
      p.updatedAt = Date.now();
      OS.profiles.save();
    },
    unmap(profileKey,signalKey){
      if(OS.state.profiles[profileKey]){
        delete OS.state.profiles[profileKey].mappings[signalKey];
        OS.profiles.save();
      }
    },
    merge(remote){
      const merged = {...(remote || {})};
      for(const [k,local] of Object.entries(OS.state.profiles || {})){
        const cloud = merged[k] || {};
        merged[k] = {
          ...cloud,...local,
          mappings:{...(cloud.mappings || {}),...(local.mappings || {})},
          updatedAt:Math.max(Number(cloud.updatedAt || 0),Number(local.updatedAt || 0))
        };
      }
      OS.state.profiles = merged;
      OS.profiles.save();
    },
    export(){
      const blob = new Blob([JSON.stringify({
        version:OS.version,profiles:OS.state.profiles
      },null,2)],{type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unibeatz-dj-os-mappings.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    },
    async import(file){
      const parsed = JSON.parse(await file.text());
      if(!parsed.profiles) throw new Error('Invalid controller mapping file');
      OS.profiles.merge(parsed.profiles);
    }
  };

  OS.profiles.load();
})();
/* ===== dj-midi.js ===== */
// UniBeatz DJ OS V3 — Web MIDI
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  function keyFor(port){
    return 'midi::' + [
      OS.util.slug(port.manufacturer || 'unknown'),
      OS.util.slug(port.name || 'controller')
    ].join('::');
  }

  function normalize(data){
    const b = Array.from(data || []);
    const status = b[0] || 0;
    const type = status & 0xF0;
    const channel = status & 0x0F;
    const number = b[1] || 0;
    const value = b[2] || 0;
    const pitch14 = type === 0xE0 ? ((value << 7) | number) : null;
    return {
      source:'midi',raw:b,status,type,channel,number,value,pitch14,
      noteOn:type===0x90 && value>0,
      noteOff:type===0x80 || (type===0x90 && value===0),
      cc:type===0xB0,
      pitch:type===0xE0,
      normalized:type===0xE0 ? pitch14/16383 : value/127
    };
  }

  function signalKey(sig){
    return sig.pitch ? `pitch:${sig.channel}` : `${sig.type}:${sig.channel}:${sig.number}`;
  }

  function relativeDelta(v){
    if(v===0 || v===64) return 0;
    return v<64 ? v : v-128;
  }

  function knownDefault(port,sig){
    const name = `${port.manufacturer || ''} ${port.name || ''}`.toLowerCase();
    const deck = sig.channel % 2 === 0 ? 'A' : 'B';

    if(name.includes('hercules') || name.includes('djcontrol') || name.includes('inpulse')){
      if(sig.type===0x90 && sig.number===11) return `deck${deck}.play`;
      if(sig.type===0x90 && sig.number===12) return `deck${deck}.cue`;
      if(sig.type===0xB0 && sig.number===7) return 'mixer.crossfader';
      if(sig.type===0xB0 && sig.number===8) return `deck${deck}.volume`;
      if(sig.type===0xB0 && sig.number===96) return `deck${deck}.jog`;
    }

    if(sig.type===0x90 && sig.number===0) return `deck${deck}.play`;
    if(sig.type===0x90 && sig.number===1) return `deck${deck}.cue`;
    if(sig.type===0xB0 && sig.number===7) return 'mixer.crossfader';
    return null;
  }

  function onMessage(event){
    const port = event.currentTarget || event.target;
    const sig = normalize(event.data);
    sig.relativeDelta = sig.cc ? relativeDelta(sig.value) : 0;

    const profileKey = keyFor(port);
    const sk = signalKey(sig);
    const profile = OS.profiles.ensure(profileKey,port.name,'midi');
    OS.state.activeProfileKey = profileKey;
    OS.state.lastSignal = {profileKey,signalKey:sk,signal:sig};

    if(OS.state.learnAction){
      OS.profiles.map(profileKey,sk,OS.state.learnAction);
      OS.util.notify(`Mapped ${port.name}: ${OS.state.learnAction}`,'#5dff9e');
      OS.state.learnAction = null;
      OS.ui?.render();
      return;
    }

    const action = profile.mappings[sk] || knownDefault(port,sig);
    if(action) OS.runAction(action,sig);
    OS.util.dispatch('ub-dj-os-midi',{port,profileKey,signalKey:sk,signal:sig,action});
    OS.ui?.renderLastSignal();
  }

  function attach(){
    const access = OS.midi.access;
    if(!access) return;

    OS.state.devices.midiInputs.clear();
    OS.state.devices.midiOutputs.clear();

    for(const input of access.inputs.values()){
      OS.state.devices.midiInputs.set(input.id,input);
      input.onmidimessage = onMessage;
    }
    for(const output of access.outputs.values()){
      OS.state.devices.midiOutputs.set(output.id,output);
    }

    OS.ui?.render();
    const names = [...OS.state.devices.midiInputs.values()].map(x=>x.name).join(', ');
    OS.util.notify(
      names ? `MIDI connected: ${names}` : 'MIDI permission granted, but no controller input is exposed.',
      names ? '#5dff9e' : '#F0C040'
    );
  }

  OS.midi = {
    access:null,
    async connect(){
      if(!navigator.requestMIDIAccess){
        OS.util.notify('Web MIDI requires current Chrome or Edge desktop over HTTPS.','#ff7474');
        return false;
      }
      try{
        OS.midi.access = await navigator.requestMIDIAccess({sysex:true})
          .catch(()=>navigator.requestMIDIAccess({sysex:false}));
        OS.midi.access.onstatechange = attach;
        attach();
        return true;
      }catch(error){
        OS.util.notify(`MIDI connection failed: ${error.message || error}`,'#ff7474');
        return false;
      }
    },
    rescan:attach,
    send(bytes,outputId){
      const out = outputId
        ? OS.state.devices.midiOutputs.get(outputId)
        : [...OS.state.devices.midiOutputs.values()][0];
      if(!out) return false;
      try{ out.send(bytes); return true; }
      catch(error){ console.warn('[DJ OS MIDI output]',error); return false; }
    }
  };
})();
/* ===== dj-hid.js ===== */
// UniBeatz DJ OS V3 — WebHID
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  function keyFor(device){
    return `hid::${device.vendorId || 0}::${device.productId || 0}::${OS.util.slug(device.productName || 'controller')}`;
  }

  function onReport(event){
    const device = event.device;
    const bytes = new Uint8Array(event.data.buffer);
    const signal = {
      source:'hid',
      reportId:event.reportId,
      bytes:Array.from(bytes),
      value:bytes.length ? bytes[bytes.length-1] : 0,
      normalized:bytes.length ? bytes[bytes.length-1]/255 : 1,
      noteOn:true
    };
    const profileKey = keyFor(device);
    const signalKey = `report:${signal.reportId}:${signal.bytes.join('.')}`;
    const profile = OS.profiles.ensure(profileKey,device.productName,'hid');

    OS.state.activeProfileKey = profileKey;
    OS.state.lastSignal = {profileKey,signalKey,signal};

    if(OS.state.learnAction){
      OS.profiles.map(profileKey,signalKey,OS.state.learnAction);
      OS.util.notify(`Mapped ${device.productName}: ${OS.state.learnAction}`,'#5dff9e');
      OS.state.learnAction = null;
      OS.ui?.render();
      return;
    }

    const action = profile.mappings[signalKey];
    if(action) OS.runAction(action,signal);
    OS.util.dispatch('ub-dj-os-hid',{device,profileKey,signalKey,signal,action});
    OS.ui?.renderLastSignal();
  }

  async function open(device){
    if(!device.opened) await device.open();
    device.oninputreport = onReport;
    OS.state.devices.hid.set(keyFor(device),device);
  }

  OS.hid = {
    async connect(){
      if(!navigator.hid){
        OS.util.notify('WebHID requires current Chrome or Edge desktop over HTTPS.','#ff7474');
        return false;
      }
      try{
        const devices = await navigator.hid.requestDevice({filters:[]});
        for(const d of devices) await open(d);
        OS.ui?.render();
        OS.util.notify(
          devices.length ? `HID connected: ${devices.map(d=>d.productName).join(', ')}` : 'No HID controller selected.',
          devices.length ? '#5dff9e' : '#F0C040'
        );
        return devices.length>0;
      }catch(error){
        if(error.name!=='NotFoundError'){
          OS.util.notify(`HID connection failed: ${error.message || error}`,'#ff7474');
        }
        return false;
      }
    },
    async openGranted(){
      if(!navigator.hid) return;
      const devices = await navigator.hid.getDevices();
      for(const d of devices){
        try{ await open(d); }catch(error){ console.warn('[DJ OS HID]',error); }
      }
      OS.ui?.render();
    },
    keyFor
  };

  if(navigator.hid){
    navigator.hid.addEventListener('connect',()=>OS.hid.openGranted());
    navigator.hid.addEventListener('disconnect',event=>{
      OS.state.devices.hid.delete(keyFor(event.device));
      OS.ui?.render();
    });
  }
})();
/* ===== dj-cloud.js ===== */
// UniBeatz DJ OS V3 — Firebase cloud sync
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  const COLLECTION = 'dj_controller_profiles';

  function fb(){
    const f = window.UB_FIREBASE || {};
    if(!f.db || !f.doc || !f.setDoc) return null;
    return f;
  }

  function uid(){
    return fb()?.auth?.currentUser?.uid || null;
  }

  OS.cloud = {
    async pull(){
      const f = fb(), userId = uid();
      if(!f || !userId || !f.getDoc){
        OS.util.notify('Sign in before syncing controller mappings.','#F0C040');
        return false;
      }
      try{
        const snap = await f.getDoc(f.doc(f.db,COLLECTION,userId));
        if(snap.exists()){
          const data = snap.data() || {};
          if(data.profiles) OS.profiles.merge(data.profiles);
        }
        OS.ui?.render();
        OS.util.notify('Controller mappings synced from your UniBeatz account.','#5dff9e');
        return true;
      }catch(error){
        OS.util.notify(`Cloud sync failed: ${error.message || error}`,'#ff7474');
        return false;
      }
    },
    async push(){
      const f = fb(), userId = uid();
      if(!f || !userId){
        OS.util.notify('Sign in before saving controller mappings.','#F0C040');
        return false;
      }
      try{
        await f.setDoc(
          f.doc(f.db,COLLECTION,userId),
          {
            uid:userId,
            version:OS.version,
            profiles:OS.state.profiles,
            updatedAt:f.serverTimestamp ? f.serverTimestamp() : Date.now()
          },
          {merge:true}
        );
        OS.util.notify('Controller mappings saved to your UniBeatz account.','#5dff9e');
        return true;
      }catch(error){
        OS.util.notify(`Cloud save failed: ${error.message || error}`,'#ff7474');
        return false;
      }
    }
  };

  window.addEventListener('ub-firebase-ready',()=>setTimeout(()=>OS.cloud.pull(),500),{once:true});
})();
/* ===== dj-radio.js ===== */
// UniBeatz DJ OS V3 — Radio actions
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  function deck(deck){ return OS.util.getAudio(deck); }
  function pressed(sig){ return sig.noteOn !== false; }

  ['A','B'].forEach(d=>{
    OS.registerAction(`deck${d}.play`,sig=>{
      if(!pressed(sig)) return;
      const a=deck(d); if(!a) return;
      if(a.paused) a.play().catch(()=>{}); else a.pause();
    },`Deck ${d} Play/Pause`);

    OS.registerAction(`deck${d}.cue`,sig=>{
      if(!pressed(sig)) return;
      const a=deck(d); if(!a) return;
      a.currentTime=0; a.play().catch(()=>{});
    },`Deck ${d} Cue`);

    OS.registerAction(`deck${d}.stop`,sig=>{
      if(!pressed(sig)) return;
      const a=deck(d); if(!a) return;
      a.pause(); a.currentTime=0;
    },`Deck ${d} Stop`);

    OS.registerAction(`deck${d}.jog`,sig=>{
      const a=deck(d); if(!a) return;
      const delta = sig.relativeDelta ?? ((sig.normalized-.5)*12);
      a.currentTime = Math.max(0,Math.min(a.duration || Infinity,a.currentTime + delta*.03));
    },`Deck ${d} Jog`);

    OS.registerAction(`deck${d}.pitch`,sig=>{
      const a=deck(d); if(!a) return;
      const pct=(OS.util.clamp(sig.normalized)*16)-8;
      a.playbackRate=1+(pct/100);
      const el=document.getElementById(d==='A'?'pitchA':'pitchB');
      if(el){ el.value=pct; el.dispatchEvent(new Event('input',{bubbles:true})); }
    },`Deck ${d} Pitch`);

    OS.registerAction(`deck${d}.volume`,sig=>{
      const a=deck(d); if(a) a.volume=OS.util.clamp(sig.normalized);
      OS.util.setRange(d==='A'?'gainA':'gainB',sig.normalized);
    },`Deck ${d} Volume`);

    ['eqLow','eqMid','eqHigh','filter'].forEach(control=>{
      OS.registerAction(`deck${d}.${control}`,sig=>{
        const id = `${control}${d}`;
        OS.util.setRange(id,sig.normalized);
        OS.util.dispatch('ub-dj-os-eq',{deck:d,control,value:sig.normalized});
      },`Deck ${d} ${control}`);
    });
  });

  OS.registerAction('mixer.crossfader',sig=>OS.util.setRange('crossfader',sig.normalized),'Crossfader');
  OS.registerAction('mixer.master',sig=>OS.util.setRange('masterVolume',sig.normalized),'Master Volume');

  OS.registerAction('radio.mic',sig=>{
    if(!pressed(sig)) return;
    const btn=document.getElementById('micToggle');
    if(btn) btn.click(); else if(typeof window.toggleMic==='function') window.toggleMic();
  },'Radio Mic');

  OS.registerAction('radio.broadcast',sig=>{
    if(!pressed(sig)) return;
    const start=document.getElementById('startBroadcast');
    const end=document.getElementById('endBroadcast');
    if(start && !start.disabled) start.click();
    else if(end && !end.disabled) end.click();
  },'Start/Stop Broadcast');

  OS.registerAction('radio.drop',sig=>{
    if(!pressed(sig)) return;
    if(typeof window.triggerNextDrop==='function') window.triggerNextDrop();
    else document.querySelector('[data-pad]')?.click();
  },'Trigger Station Drop');
})();
/* ===== dj-battle.js ===== */
// UniBeatz DJ OS V3 — Battle actions
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');
  const pressed=sig=>sig.noteOn!==false;

  OS.registerAction('battle.mic',sig=>{
    if(!pressed(sig)) return;
    if(typeof window.toggleLiveMic==='function') window.toggleLiveMic();
    else if(window.ubBattle?.toggleMic) window.ubBattle.toggleMic();
  },'Battle Mic');

  OS.registerAction('battle.camera',sig=>{
    if(!pressed(sig)) return;
    if(typeof window.toggleLiveCamera==='function') window.toggleLiveCamera();
    else if(window.ubBattle?.toggleCam) window.ubBattle.toggleCam();
  },'Battle Camera');

  OS.registerAction('battle.joinArtist',sig=>{
    if(pressed(sig) && typeof window.joinLiveBattleAs==='function') window.joinLiveBattleAs('artist');
  },'Join Battle as Artist');

  OS.registerAction('battle.joinDJ',sig=>{
    if(pressed(sig) && typeof window.joinLiveBattleAs==='function') window.joinLiveBattleAs('dj');
  },'Join Battle as DJ');

  OS.registerAction('battle.playBeat',sig=>{
    if(!pressed(sig)) return;
    const a=document.getElementById('battleBeatAudio');
    if(!a) return;
    if(a.paused) a.play().catch(()=>{}); else a.pause();
  },'Play/Pause Battle Beat');

  OS.registerAction('battle.nextBeat',sig=>{
    if(!pressed(sig)) return;
    document.querySelector('#djBeatList button')?.click();
  },'Next Battle Beat');
})();
/* ===== dj-led.js ===== */
// UniBeatz DJ OS V3 — LED/output hooks
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  OS.led = {
    sendMidi(bytes,outputId){ return OS.midi?.send(bytes,outputId) || false; },
    set(action,on=true){
      OS.util.dispatch('ub-dj-os-led-request',{
        action,on,sendMidi:OS.led.sendMidi
      });
    }
  };

  window.addEventListener('ub-dj-os-action',event=>{
    const {name}=event.detail || {};
    if(name) OS.led.set(name,true);
  });
})();
/* ===== dj-ui.js ===== */
// UniBeatz DJ OS V3 — UI
(function(){
  'use strict';
  const OS = window.UniBeatzDJOS;
  if(!OS) throw new Error('dj-core.js must load first');

  function actionOptions(){
    return [...OS.actions.entries()]
      .sort((a,b)=>a[1].label.localeCompare(b[1].label))
      .map(([value,entry])=>`<option value="${OS.util.esc(value)}">${OS.util.esc(entry.label)}</option>`)
      .join('');
  }

  function build(){
    if(document.getElementById('ubDjOSPanel')) return;
    const host =
      document.getElementById('midiPanel') ||
      document.getElementById('djBeatSelectorCard') ||
      document.querySelector('.djapp') ||
      document.getElementById('page-livebattle') ||
      document.body;

    const panel=document.createElement('section');
    panel.id='ubDjOSPanel';
    panel.innerHTML=`
      <style>
        #ubDjOSPanel{margin:14px;padding:14px;border:1px solid rgba(64,208,255,.4);border-radius:14px;background:linear-gradient(135deg,#0a0a14,#050508);color:#f0ede8;font-family:Rajdhani,sans-serif}
        #ubDjOSPanel .title{font-family:Bebas Neue,sans-serif;font-size:1.55rem;letter-spacing:2px;color:#F0C040}
        #ubDjOSPanel .sub{font-size:.8rem;color:#9aa3b8;margin:3px 0 10px}
        #ubDjOSPanel .row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
        #ubDjOSPanel button,#ubDjOSPanel select{padding:9px 11px;border-radius:8px;border:1px solid rgba(64,208,255,.4);background:#111118;color:#f0ede8;font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:1px}
        #ubDjOSPanel button{cursor:pointer}
        #ubDjOSPanel .gold{border-color:rgba(240,192,64,.6);color:#F0C040}
        #ubDjOSPanel .green{border-color:rgba(0,230,118,.45);color:#5dff9e}
        #ubDjOSPanel .info{font-size:.72rem;line-height:1.5;color:#40D0FF}
        #ubDjOSPanel .sig{font-family:monospace;font-size:.66rem;color:#9aa3b8;overflow-wrap:anywhere}
        #ubDjOSPanel .map{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid rgba(255,255,255,.06)}
      </style>
      <div class="title">UniBeatz DJ OS V3</div>
      <div class="sub">MIDI + HID · Learn Mode · Radio + Battle · cloud mappings · LED hooks</div>
      <div class="row">
        <button id="ubDjOSMidi" class="gold">CONNECT MIDI</button>
        <button id="ubDjOSHid">CONNECT HID</button>
        <button id="ubDjOSRescan">RESCAN</button>
        <button id="ubDjOSPull" class="green">SYNC ACCOUNT</button>
        <button id="ubDjOSPush" class="green">SAVE ACCOUNT</button>
      </div>
      <div id="ubDjOSDevices" class="info">No controller connected.</div>
      <div class="row">
        <select id="ubDjOSAction">${actionOptions()}</select>
        <button id="ubDjOSLearn" class="gold">LEARN NEXT CONTROL</button>
        <button id="ubDjOSCancel">CANCEL</button>
      </div>
      <div class="row">
        <button id="ubDjOSExport">EXPORT MAPS</button>
        <button id="ubDjOSImportBtn">IMPORT MAPS</button>
        <input id="ubDjOSImport" type="file" accept="application/json" hidden>
        <button id="ubDjOSClear">CLEAR ALL</button>
      </div>
      <div id="ubDjOSNotice" class="info"></div>
      <div class="sig">Last signal: <span id="ubDjOSLastSignal">None</span></div>
      <div id="ubDjOSMappings"></div>
    `;
    host.appendChild(panel);

    panel.querySelector('#ubDjOSMidi').onclick=()=>OS.midi.connect();
    panel.querySelector('#ubDjOSHid').onclick=()=>OS.hid.connect();
    panel.querySelector('#ubDjOSRescan').onclick=async()=>{
      OS.midi.rescan();
      await OS.hid.openGranted();
      render();
    };
    panel.querySelector('#ubDjOSPull').onclick=()=>OS.cloud.pull();
    panel.querySelector('#ubDjOSPush').onclick=()=>OS.cloud.push();
    panel.querySelector('#ubDjOSLearn').onclick=()=>OS.startLearn(panel.querySelector('#ubDjOSAction').value);
    panel.querySelector('#ubDjOSCancel').onclick=()=>OS.cancelLearn();
    panel.querySelector('#ubDjOSExport').onclick=()=>OS.profiles.export();
    panel.querySelector('#ubDjOSImportBtn').onclick=()=>panel.querySelector('#ubDjOSImport').click();
    panel.querySelector('#ubDjOSImport').onchange=async e=>{
      try{ if(e.target.files[0]) await OS.profiles.import(e.target.files[0]); }
      catch(error){ OS.util.notify(`Import failed: ${error.message}`,'#ff7474'); }
    };
    panel.querySelector('#ubDjOSClear').onclick=()=>{
      if(confirm('Clear every saved DJ controller mapping on this device?')){
        OS.state.profiles={};
        OS.profiles.save();
        render();
      }
    };
    panel.querySelector('#ubDjOSMappings').onclick=e=>{
      const btn=e.target.closest('[data-unmap]');
      if(!btn) return;
      const [profileKey,signalKey]=JSON.parse(decodeURIComponent(btn.dataset.unmap));
      OS.profiles.unmap(profileKey,signalKey);
      render();
    };
  }

  function renderLastSignal(){
    const el=document.getElementById('ubDjOSLastSignal');
    if(!el) return;
    const last=OS.state.lastSignal;
    el.textContent=last ? `${last.profileKey} · ${last.signalKey}` : 'None';
  }

  function render(){
    build();
    const devices=document.getElementById('ubDjOSDevices');
    const maps=document.getElementById('ubDjOSMappings');
    if(!devices || !maps) return;

    const list=[];
    for(const input of OS.state.devices.midiInputs.values()){
      list.push(`MIDI: ${OS.util.esc(`${input.manufacturer || ''} ${input.name || ''}`.trim())}`);
    }
    for(const d of OS.state.devices.hid.values()){
      list.push(`HID: ${OS.util.esc(d.productName || 'Controller')} (${d.vendorId}:${d.productId})`);
    }
    devices.innerHTML=list.length?list.join('<br>'):'No controller connected. Try MIDI first, then HID.';

    const rows=[];
    for(const [pk,p] of Object.entries(OS.state.profiles)){
      for(const [sk,action] of Object.entries(p.mappings || {})){
        rows.push(`
          <div class="map">
            <div><strong>${OS.util.esc(p.label)}</strong><br><span class="sig">${OS.util.esc(sk)} → ${OS.util.esc(action)}</span></div>
            <button data-unmap="${encodeURIComponent(JSON.stringify([pk,sk]))}">CLEAR</button>
          </div>
        `);
      }
    }
    maps.innerHTML=rows.length?rows.join(''):'<div class="sig">No learned mappings yet.</div>';
    renderLastSignal();
  }

  OS.ui={build,render,renderLastSignal};

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      build(); render(); OS.hid.openGranted(); OS.ready();
    });
  }else{
    build(); render(); OS.hid.openGranted(); OS.ready();
  }
})();
