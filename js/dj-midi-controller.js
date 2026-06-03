// js/dj-midi-controller.js
// NEW FEATURE: DJ MIDI Controller Support
// Safe module: console-log first, no destructive DJ control actions wired yet.
// Default FLkey map:
// Pads: data1 0-8
// Pots: data1 20-28
// Faders: data1 71-79
// Fader 79 = Master Volume
// Adds MIDI Learn so every DJ can create a custom controller map.
// Patch: ignores MIDI clock / transport spam like status 248 from FLkey.

(function(){
  'use strict';

  var STORAGE_KEY = 'ub_dj_midi_custom_map_v1';
  var SILENT_STATUSES = { 248:true, 250:true, 251:true, 252:true, 254:true, 255:true };

  var DEFAULT_ACTIONS = [
    'AIRHORN','CROWD_CHEER','CROWD_BOO','EXPLOSION_FX',
    'START_ROUND','END_ROUND','NEXT_BEAT','REPLAY_BEAT',
    'MASTER_VOLUME','BEAT_VOLUME','DJ_MIC_VOLUME','ARTIST_MIC_VOLUME',
    'FILTER','ECHO','REVERB','CROWD_FX_LEVEL'
  ];

  var DJMIDI = {
    enabled:false,
    access:null,
    last:null,
    learning:null,
    customMap:{},
    ignoredClockCount:0,
    map:{ pads:{ min:0, max:8 }, pots:{ min:20, max:28 }, faders:{ min:71, max:79 }, masterFader:79 },
    defaultActions:{
      PAD_0:'AIRHORN', PAD_1:'CROWD_CHEER', PAD_2:'CROWD_BOO', PAD_3:'EXPLOSION_FX',
      PAD_4:'START_ROUND', PAD_5:'END_ROUND', PAD_6:'NEXT_BEAT', PAD_7:'REPLAY_BEAT',
      FADER_71:'BEAT_VOLUME', FADER_72:'DJ_MIC_VOLUME', FADER_73:'ARTIST_MIC_VOLUME',
      MASTER_VOLUME_FADER_79:'MASTER_VOLUME', POT_20:'FILTER', POT_21:'ECHO', POT_22:'REVERB', POT_23:'CROWD_FX_LEVEL'
    }
  };

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function isDjArea(){ var active=document.querySelector('.page.active'); var txt=active?(active.textContent||''):(document.body.textContent||''); return /DJ BATTLE|DJ CONTROL|MIDI SETUP|EQUIPMENT|JOIN AS DJ|DJ PANEL/i.test(txt); }
  function log(){ var args=Array.prototype.slice.call(arguments); args.unshift('[DJ MIDI]'); console.log.apply(console,args); }
  function toast(msg){ if(typeof window.showToast==='function') window.showToast(msg); else log(msg); }
  function loadCustomMap(){ try{ var raw=localStorage.getItem(STORAGE_KEY); DJMIDI.customMap=raw?JSON.parse(raw):{}; }catch(e){ DJMIDI.customMap={}; } }
  function saveCustomMap(){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(DJMIDI.customMap||{})); }catch(e){} }
  function midiKey(status,data1){ return String(status)+':'+String(data1); }
  function isSilentMidi(status,data1,data2){ return SILENT_STATUSES[status]===true || typeof data1==='undefined' || typeof data2==='undefined'; }

  function classify(status,data1,data2){
    var type='unknown', channel=status&0x0f, command=status&0xf0;
    if(data1>=DJMIDI.map.pads.min && data1<=DJMIDI.map.pads.max) type='pad';
    else if(data1>=DJMIDI.map.pots.min && data1<=DJMIDI.map.pots.max) type='pot';
    else if(data1>=DJMIDI.map.faders.min && data1<=DJMIDI.map.faders.max) type='fader';
    return { type:type, command:command, channel:channel, status:status, data1:data1, data2:data2, value:data2, isMasterVolume:data1===DJMIDI.map.masterFader };
  }

  function actionName(msg){
    var key=midiKey(msg.status,msg.data1);
    if(DJMIDI.customMap && DJMIDI.customMap[key]) return DJMIDI.customMap[key].action;
    if(msg.type==='pad') return 'PAD_'+msg.data1;
    if(msg.type==='pot') return 'POT_'+msg.data1;
    if(msg.type==='fader' && msg.isMasterVolume) return 'MASTER_VOLUME_FADER_79';
    if(msg.type==='fader') return 'FADER_'+msg.data1;
    return 'UNMAPPED_'+msg.data1;
  }

  function resolvedAction(msg){
    var key=midiKey(msg.status,msg.data1);
    if(DJMIDI.customMap && DJMIDI.customMap[key]) return DJMIDI.customMap[key].action;
    return DJMIDI.defaultActions[msg.action] || msg.action;
  }

  function handleMidiMessage(e){
    var data=e.data||[];
    var status=data[0], data1=data[1], data2=data[2];

    // FLkey sends MIDI clock/status 248 constantly. Ignore all timing/clock/active-sensing messages.
    if(isSilentMidi(status,data1,data2)){
      DJMIDI.ignoredClockCount++;
      return;
    }

    var msg=classify(status,data1,data2);
    msg.action=actionName(msg);
    msg.resolvedAction=resolvedAction(msg);
    msg.key=midiKey(status,data1);
    msg.device=e.currentTarget&&e.currentTarget.name?e.currentTarget.name:'MIDI Device';
    DJMIDI.last=msg;

    if(DJMIDI.learning){
      DJMIDI.customMap[msg.key]={ action:DJMIDI.learning, status:status, data1:data1, type:msg.type, device:msg.device, savedAt:Date.now() };
      saveCustomMap(); toast('🎛️ MIDI learned: '+DJMIDI.learning); log('LEARNED',DJMIDI.learning,'=>',msg.key,msg);
      DJMIDI.learning=null; renderMonitor(msg); renderLearnPanel(); return;
    }

    log('device=',msg.device,'status=',status,'data1=',data1,'data2=',data2,'type=',msg.type,'action=',msg.action,'resolved=',msg.resolvedAction);
    renderMonitor(msg); consoleAction(msg);
  }

  function consoleAction(msg){ if(msg.isMasterVolume || msg.resolvedAction==='MASTER_VOLUME') log('MASTER VOLUME:',msg.value); else log('ACTION:',msg.resolvedAction,'VALUE:',msg.value); }

  function ensureMonitor(){
    if(document.getElementById('ubDjMidiMonitor')) return document.getElementById('ubDjMidiMonitor');
    var panel=document.createElement('div'); panel.id='ubDjMidiMonitor';
    panel.style.cssText='position:fixed;left:12px;bottom:96px;z-index:99999;max-width:300px;padding:10px 12px;border-radius:12px;border:1px solid rgba(64,208,255,.55);background:rgba(3,3,5,.88);color:#fff;font-family:Orbitron,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);display:none;';
    panel.innerHTML='<div style="font-size:.48rem;letter-spacing:2px;color:#40D0FF;margin-bottom:5px;">DJ MIDI MONITOR</div><div style="font-size:.8rem;color:#F0C040;">Waiting for controller...</div>';
    document.body.appendChild(panel); return panel;
  }

  function renderMonitor(msg){
    var panel=ensureMonitor(); panel.style.display=isDjArea()?'block':'none';
    panel.innerHTML='<div style="font-size:.48rem;letter-spacing:2px;color:#40D0FF;margin-bottom:5px;">DJ MIDI MONITOR</div><div style="font-size:.72rem;line-height:1.55;color:rgba(240,237,232,.9);"><b style="color:#F0C040;">'+msg.resolvedAction+'</b><br>Raw: '+msg.action+'<br>Device: '+msg.device+'<br>Type: '+msg.type+'<br>Status: '+msg.status+'<br>Data1: '+msg.data1+'<br>Value: '+msg.data2+'<br>'+(DJMIDI.learning?'<span style="color:#F0C040;">Learning: '+DJMIDI.learning+'</span><br>':'')+(msg.isMasterVolume?'<span style="color:#40D0FF;">Master Volume Fader Locked</span>':'')+'</div>';
  }

  function ensureLearnPanel(){
    if(document.getElementById('ubDjMidiLearnPanel')) return document.getElementById('ubDjMidiLearnPanel');
    var panel=document.createElement('div'); panel.id='ubDjMidiLearnPanel';
    panel.style.cssText='position:fixed;right:12px;bottom:96px;z-index:99999;width:min(360px,calc(100vw - 24px));max-height:68vh;overflow:auto;padding:12px;border-radius:14px;border:1px solid rgba(201,168,76,.55);background:rgba(3,3,5,.93);color:#fff;font-family:Orbitron,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.55);display:none;';
    document.body.appendChild(panel); return panel;
  }

  function renderLearnPanel(){
    var panel=ensureLearnPanel();
    var mapped=Object.keys(DJMIDI.customMap||{}).map(function(k){ var m=DJMIDI.customMap[k]; return '<div style="border:1px solid rgba(64,208,255,.24);border-radius:10px;padding:8px;margin-top:6px;background:rgba(255,255,255,.035);"><b style="color:#F0C040;">'+m.action+'</b><br><span style="font-size:.68rem;color:rgba(240,237,232,.72);">'+k+' · '+(m.type||'control')+'</span></div>'; }).join('');
    var buttons=DEFAULT_ACTIONS.map(function(a){ return '<button style="padding:7px 8px;border-radius:9px;border:1px solid rgba(64,208,255,.35);background:rgba(64,208,255,.08);color:#fff;font-size:.62rem;letter-spacing:1px;" onclick="ubDjMidiController.learn(\''+a+'\')">'+a.replace(/_/g,' ')+'</button>'; }).join('');
    panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;"><div><div style="font-size:.48rem;letter-spacing:2px;color:#40D0FF;">MIDI LEARN</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.55rem;letter-spacing:2px;color:#F0C040;line-height:1;">CUSTOM MAP</div></div><button style="border:0;background:transparent;color:#F0C040;font-size:1.2rem;" onclick="ubDjMidiController.hideLearn()">×</button></div><div style="font-size:.75rem;color:rgba(240,237,232,.72);line-height:1.35;margin-bottom:9px;">Click an action, then move/press the controller control you want assigned. Saved on this device.</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;">'+buttons+'</div><button style="width:100%;margin-top:10px;padding:9px;border-radius:10px;border:1px solid rgba(201,168,76,.5);background:rgba(201,168,76,.12);color:#F0C040;font-weight:900;" onclick="ubDjMidiController.clearMap()">CLEAR CUSTOM MAP</button><div style="margin-top:10px;font-size:.48rem;letter-spacing:2px;color:#40D0FF;">SAVED MAPPINGS</div>'+(mapped||'<div style="margin-top:7px;color:rgba(240,237,232,.6);font-size:.75rem;">No custom mappings yet. FLkey default map still works.</div>')+(DJMIDI.learning?'<div style="margin-top:9px;color:#F0C040;font-size:.8rem;">Waiting for control: '+DJMIDI.learning+'</div>':'');
  }

  function showLearn(){ renderLearnPanel(); ensureLearnPanel().style.display='block'; }
  function hideLearn(){ ensureLearnPanel().style.display='none'; DJMIDI.learning=null; }
  function learn(action){ DJMIDI.learning=action; showLearn(); toast('Move/press control for '+action.replace(/_/g,' ')); renderLearnPanel(); }
  function clearMap(){ DJMIDI.customMap={}; saveCustomMap(); toast('Custom MIDI map cleared'); renderLearnPanel(); }

  async function start(){
    if(!ok()) return; loadCustomMap();
    if(!navigator.requestMIDIAccess){ log('Web MIDI not supported in this browser. Chrome/Edge desktop recommended.'); return; }
    try{
      DJMIDI.access=await navigator.requestMIDIAccess(); DJMIDI.enabled=true;
      DJMIDI.access.inputs.forEach(function(input){ input.onmidimessage=handleMidiMessage; log('Connected input:',input.name); });
      DJMIDI.access.onstatechange=function(ev){ log('State change:',ev.port.name,ev.port.state); if(ev.port.type==='input'&&ev.port.state==='connected') ev.port.onmidimessage=handleMidiMessage; };
      ensureMonitor(); toast('🎛️ DJ MIDI controller support ready');
      log('Default FLkey ranges: pads 0-8, pots 20-28, faders 71-79, master=79');
      log('MIDI clock/status 248 spam filter is active.');
      log('Custom map loaded:',DJMIDI.customMap);
    }catch(err){ log('MIDI start error:',err&&err.message?err.message:err); }
  }

  function show(){ ensureMonitor().style.display='block'; }
  function hide(){ ensureMonitor().style.display='none'; }

  window.ubDjMidiController={ start:start, show:show, hide:hide, showLearn:showLearn, hideLearn:hideLearn, learn:learn, clearMap:clearMap, state:DJMIDI, classify:classify };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
  setInterval(function(){ var monitor=document.getElementById('ubDjMidiMonitor'); if(monitor&&!isDjArea()) monitor.style.display='none'; var learnPanel=document.getElementById('ubDjMidiLearnPanel'); if(learnPanel&&!isDjArea()) learnPanel.style.display='none'; },1500);
})();