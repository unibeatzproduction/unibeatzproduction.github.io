// js/dj-midi-controller.js
// NEW FEATURE: DJ MIDI Controller Support
// Safe module: console-log first, no real DJ control actions wired yet.
// FLkey/Controller ranges locked from testing:
// Pads: data1 0-8
// Pots: data1 20-28
// Faders: data1 71-79
// Fader 79 = Master Volume

(function(){
  'use strict';

  var DJMIDI = {
    enabled:false,
    access:null,
    last:null,
    map:{
      pads:{ min:0, max:8 },
      pots:{ min:20, max:28 },
      faders:{ min:71, max:79 },
      masterFader:79
    }
  };

  function ok(){
    return location.pathname.toLowerCase().includes('unifreestyle.html');
  }

  function isDjArea(){
    var active = document.querySelector('.page.active');
    var txt = active ? (active.textContent || '') : (document.body.textContent || '');
    return /DJ BATTLE|DJ CONTROL|MIDI SETUP|EQUIPMENT|JOIN AS DJ|DJ PANEL/i.test(txt);
  }

  function log(){
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[DJ MIDI]');
    console.log.apply(console,args);
  }

  function toast(msg){
    if(typeof window.showToast === 'function') window.showToast(msg);
    else log(msg);
  }

  function classify(status,data1,data2){
    var type = 'unknown';
    var channel = status & 0x0f;
    var command = status & 0xf0;

    if(data1 >= DJMIDI.map.pads.min && data1 <= DJMIDI.map.pads.max){
      type = 'pad';
    } else if(data1 >= DJMIDI.map.pots.min && data1 <= DJMIDI.map.pots.max){
      type = 'pot';
    } else if(data1 >= DJMIDI.map.faders.min && data1 <= DJMIDI.map.faders.max){
      type = 'fader';
    }

    return {
      type:type,
      command:command,
      channel:channel,
      data1:data1,
      data2:data2,
      value:data2,
      isMasterVolume:data1 === DJMIDI.map.masterFader
    };
  }

  function actionName(msg){
    if(msg.type === 'pad') return 'PAD_' + msg.data1;
    if(msg.type === 'pot') return 'POT_' + msg.data1;
    if(msg.type === 'fader' && msg.isMasterVolume) return 'MASTER_VOLUME_FADER_79';
    if(msg.type === 'fader') return 'FADER_' + msg.data1;
    return 'UNMAPPED_' + msg.data1;
  }

  function handleMidiMessage(e){
    var data = e.data || [];
    var status = data[0];
    var data1 = data[1];
    var data2 = data[2];
    var msg = classify(status,data1,data2);
    msg.action = actionName(msg);
    msg.device = e.currentTarget && e.currentTarget.name ? e.currentTarget.name : 'MIDI Device';
    DJMIDI.last = msg;

    log('device=',msg.device,'status=',status,'data1=',data1,'data2=',data2,'type=',msg.type,'action=',msg.action);

    renderMonitor(msg);

    // Console-log only for now. Real control wiring comes after testing.
    if(msg.isMasterVolume){
      log('MASTER VOLUME LOCKED TO FADER 79:', msg.value);
    }
  }

  function ensureMonitor(){
    if(document.getElementById('ubDjMidiMonitor')) return document.getElementById('ubDjMidiMonitor');
    var panel = document.createElement('div');
    panel.id = 'ubDjMidiMonitor';
    panel.style.cssText = 'position:fixed;left:12px;bottom:96px;z-index:99999;max-width:270px;padding:10px 12px;border-radius:12px;border:1px solid rgba(64,208,255,.55);background:rgba(3,3,5,.88);color:#fff;font-family:Orbitron,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);display:none;';
    panel.innerHTML = '<div style="font-size:.48rem;letter-spacing:2px;color:#40D0FF;margin-bottom:5px;">DJ MIDI MONITOR</div><div style="font-size:.8rem;color:#F0C040;">Waiting for controller...</div>';
    document.body.appendChild(panel);
    return panel;
  }

  function renderMonitor(msg){
    var panel = ensureMonitor();
    panel.style.display = isDjArea() ? 'block' : 'none';
    panel.innerHTML = '<div style="font-size:.48rem;letter-spacing:2px;color:#40D0FF;margin-bottom:5px;">DJ MIDI MONITOR</div>'+
      '<div style="font-size:.72rem;line-height:1.55;color:rgba(240,237,232,.9);">'+
      '<b style="color:#F0C040;">'+msg.action+'</b><br>'+ 
      'Device: '+msg.device+'<br>'+ 
      'Type: '+msg.type+'<br>'+ 
      'Data1: '+msg.data1+'<br>'+ 
      'Value: '+msg.data2+'<br>'+ 
      (msg.isMasterVolume ? '<span style="color:#40D0FF;">Master Volume Fader Locked</span>' : '')+
      '</div>';
  }

  async function start(){
    if(!ok()) return;
    if(!navigator.requestMIDIAccess){
      log('Web MIDI not supported in this browser. Chrome/Edge desktop recommended.');
      return;
    }
    try{
      DJMIDI.access = await navigator.requestMIDIAccess();
      DJMIDI.enabled = true;
      DJMIDI.access.inputs.forEach(function(input){
        input.onmidimessage = handleMidiMessage;
        log('Connected input:', input.name);
      });
      DJMIDI.access.onstatechange = function(ev){
        log('State change:', ev.port.name, ev.port.state);
        if(ev.port.type === 'input' && ev.port.state === 'connected'){
          ev.port.onmidimessage = handleMidiMessage;
        }
      };
      ensureMonitor();
      toast('🎛️ DJ MIDI controller support ready');
      log('Ranges locked: pads 0-8, pots 20-28, faders 71-79, master=79');
    }catch(err){
      log('MIDI start error:', err && err.message ? err.message : err);
    }
  }

  function show(){
    var panel = ensureMonitor();
    panel.style.display = 'block';
  }

  function hide(){
    var panel = ensureMonitor();
    panel.style.display = 'none';
  }

  window.ubDjMidiController = {
    start:start,
    show:show,
    hide:hide,
    state:DJMIDI,
    classify:classify
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  setInterval(function(){
    var panel = document.getElementById('ubDjMidiMonitor');
    if(panel && !isDjArea()) panel.style.display = 'none';
  },1500);
})();