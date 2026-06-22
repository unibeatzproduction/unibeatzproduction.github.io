import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4',
  authDomain: 'unibeatzproduction-7ae31.firebaseapp.com',
  projectId: 'unibeatzproduction-7ae31',
  storageBucket: 'unibeatzproduction-7ae31.firebasestorage.app',
  messagingSenderId: '70667820609',
  appId: '1:70667820609:web:57762df5510e6b4000b0c0'
};

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const deckA      = document.getElementById('deckA');
const deckB      = document.getElementById('deckB');
const deckALabel = document.getElementById('deckALabel');
const deckBLabel = document.getElementById('deckBLabel');
const qList      = document.getElementById('queueList');
const pads       = document.getElementById('triggerPads');
const notice     = document.getElementById('deckNotice');

let queue = [], assets = [], micOn = false, live = false;
let midiAccess = null, midiLearn = false, mappings = {};

function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function note(m, c='#40D0FF'){ notice.textContent = m; notice.style.color = c; }
function recNote(m, c='#40D0FF'){ const el=document.getElementById('recNotice'); if(el){el.textContent=m;el.style.color=c;} }
async function ensure(){ if(!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; }
function itemName(x){ return x.trackTitle||x.title||'Untitled'; }
function itemUrl(x){ return x.audioUrl||''; }

function setVolumes(){
  const v = Number(document.getElementById('crossfader').value);
  deckA.volume = (100-v)/100;
  deckB.volume = v/100;
  // Also update recorder mix if active
  if(_recGainA && _recGainB){
    _recGainA.gain.value = (100-v)/100;
    _recGainB.gain.value = v/100;
  }
}

function loadTo(deck, item){
  if(!itemUrl(item)){ note('This item has no audio URL.','#ff7474'); return; }
  if(deck==='A'){ deckA.src=itemUrl(item); deckALabel.textContent='A: '+itemName(item).slice(0,20); }
  else           { deckB.src=itemUrl(item); deckBLabel.textContent='B: '+itemName(item).slice(0,20); }
  note('Loaded '+itemName(item)+' to Deck '+deck,'#5dff9e');
}

async function loadQueue(){
  qList.innerHTML = '<div class="track">Loading queue...</div>';
  try{
    const [tracksSnap, assetsSnap] = await Promise.all([
      getDocs(collection(db,'radio_submissions')),
      getDocs(collection(db,'radio_assets')).catch(()=>({docs:[]}))
    ]);
    queue  = tracksSnap.docs.map(d=>({id:d.id,kind:'track',...d.data()})).filter(x=>x.status==='approved');
    assets = assetsSnap.docs.map(d=>({id:d.id,kind:'asset',...d.data()})).filter(x=>x.active!==false);
    queue  = [...queue,...assets].sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
    renderQueue(); renderPads();
  } catch(e){
    console.error(e);
    qList.innerHTML = '<div class="track">Queue failed. Check rules.</div>';
  }
}

function renderQueue(){
  if(!queue.length){ qList.innerHTML='<div class="track">No queue items yet.</div>'; return; }
  qList.innerHTML = queue.map((x,i)=>`
    <div class="track">
      <div class="name">${i+1}. ${esc(itemName(x))}</div>
      <div class="desc">${esc(x.artistName||x.genre||x.type||'Radio')}</div>
      <div class="actions">
        <button class="btn btn-blue" data-load="A" data-i="${i}">Load A</button>
        <button class="btn btn-blue" data-load="B" data-i="${i}">Load B</button>
        <button class="btn btn-gold" data-trigger="${i}">Trigger</button>
      </div>
    </div>`).join('');
}

function renderPads(){
  const triggers = assets.filter(a=>['station_drop','voiceover','podcast','dj_set'].includes(a.type));
  if(!triggers.length){ pads.innerHTML='<div class="track">Upload voiceovers, drops, podcasts, or DJ sets in admin.</div>'; return; }
  pads.innerHTML = triggers.map((x,i)=>`
    <button class="track" data-pad="${i}" type="button">
      <div class="name">${esc(x.title||'Drop')}</div>
      <div class="desc">${esc(x.type||'Asset')}</div>
    </button>`).join('');
}

function triggerNextDrop(){
  const triggers = assets.filter(a=>['station_drop','voiceover','podcast','dj_set'].includes(a.type));
  const x = triggers[0]||queue[0];
  if(x){ loadTo('B',x); deckB.play(); }
}

// ═══════════════════════════════════════════════
// MIX RECORDER — captures both decks, no broadcast
// ═══════════════════════════════════════════════
let _audioCtx    = null;
let _recDest     = null;
let _mediaRec    = null;
let _recChunks   = [];
let _recGainA    = null;
let _recGainB    = null;
let _recSrcA     = null;
let _recSrcB     = null;
let _recTimerInt = null;
let _recStart    = null;
let _savedMixes  = []; // { name, blob, url, duration, date }

function getAudioCtx(){
  if(!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  return _audioCtx;
}

function startRecording(){
  if(_mediaRec && _mediaRec.state==='recording'){ recNote('Already recording.','#F0C040'); return; }

  const ctx = getAudioCtx();
  if(ctx.state==='suspended') ctx.resume();

  // Create media element sources for both decks
  _recSrcA  = ctx.createMediaElementSource(deckA);
  _recSrcB  = ctx.createMediaElementSource(deckB);
  _recGainA = ctx.createGain();
  _recGainB = ctx.createGain();
  _recDest  = ctx.createMediaStreamDestination();

  const v = Number(document.getElementById('crossfader').value);
  _recGainA.gain.value = (100-v)/100;
  _recGainB.gain.value = v/100;

  // Route: deckA → gainA → destination + speakers
  _recSrcA.connect(_recGainA);
  _recGainA.connect(_recDest);
  _recGainA.connect(ctx.destination);

  _recSrcB.connect(_recGainB);
  _recGainB.connect(_recDest);
  _recGainB.connect(ctx.destination);

  _recChunks = [];
  _mediaRec  = new MediaRecorder(_recDest.stream, { mimeType: 'audio/webm' });
  _mediaRec.ondataavailable = e => { if(e.data.size>0) _recChunks.push(e.data); };
  _mediaRec.onstop = finishRecording;
  _mediaRec.start(1000);

  _recStart = Date.now();

  // Timer display
  const timerEl = document.getElementById('recTimer');
  if(timerEl) timerEl.style.display='block';
  _recTimerInt = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-_recStart)/1000);
    const m = Math.floor(elapsed/60), s = elapsed%60;
    if(timerEl) timerEl.textContent = m+':'+(s<10?'0':'')+s;
  }, 500);

  // Update buttons
  const startBtn = document.getElementById('recStart');
  const stopBtn  = document.getElementById('recStop');
  if(startBtn){ startBtn.textContent='⏺ Recording...'; startBtn.classList.add('recording'); startBtn.disabled=true; }
  if(stopBtn)  stopBtn.disabled = false;

  recNote('🔴 Recording mix — play your tracks on the decks.','#ff3c3c');
}

function stopRecording(){
  if(!_mediaRec||_mediaRec.state!=='recording'){ recNote('No recording in progress.','#F0C040'); return; }
  _mediaRec.stop();
  clearInterval(_recTimerInt);

  const startBtn = document.getElementById('recStart');
  const stopBtn  = document.getElementById('recStop');
  if(startBtn){ startBtn.textContent='⏺ Start Recording'; startBtn.classList.remove('recording'); startBtn.disabled=false; }
  if(stopBtn)  stopBtn.disabled = true;

  const timerEl = document.getElementById('recTimer');
  if(timerEl) timerEl.style.display='none';
}

function finishRecording(){
  const blob = new Blob(_recChunks, { type:'audio/webm' });
  const url  = URL.createObjectURL(blob);
  const duration = Math.floor((Date.now()-_recStart)/1000);
  const m = Math.floor(duration/60), s = duration%60;
  const name = 'UniBeatz_Mix_'+new Date().toISOString().slice(0,16).replace('T','_').replace(/:/g,'-');

  _savedMixes.unshift({ name, blob, url, duration, date: new Date().toLocaleString() });

  // Disconnect sources so normal audio playback resumes
  try{ _recSrcA.disconnect(); }catch(e){}
  try{ _recSrcB.disconnect(); }catch(e){}
  // Re-connect decks directly to speakers
  try{ _recSrcA.connect(_audioCtx.destination); }catch(e){}
  try{ _recSrcB.connect(_audioCtx.destination); }catch(e){}

  _recGainA = null; _recGainB = null;

  renderSavedMixes();
  recNote('✅ Mix saved! '+m+'m '+s+'s — tap Download to save as WAV for Live365.','#5dff9e');
}

function renderSavedMixes(){
  const list = document.getElementById('recSavedList');
  if(!list) return;
  if(!_savedMixes.length){ list.innerHTML=''; return; }
  list.innerHTML = _savedMixes.map((mix,i)=>`
    <div class="rec-item">
      <div>
        <div class="name">${esc(mix.name)}</div>
        <div class="desc">${mix.date} · ${Math.floor(mix.duration/60)}m ${mix.duration%60}s</div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <a href="${mix.url}" download="${mix.name}.webm" class="btn btn-gold" style="text-decoration:none;white-space:nowrap;">⬇ Download</a>
        <button class="btn btn-red" data-delete-mix="${i}">✕</button>
      </div>
    </div>`).join('');
}

document.getElementById('recSavedList')?.addEventListener('click', e=>{
  const btn = e.target.closest('[data-delete-mix]');
  if(!btn) return;
  const i = Number(btn.dataset.deleteMix);
  URL.revokeObjectURL(_savedMixes[i]?.url);
  _savedMixes.splice(i,1);
  renderSavedMixes();
});

document.getElementById('recStart')?.addEventListener('click', startRecording);
document.getElementById('recStop')?.addEventListener('click',  stopRecording);

// ═══════════════════════════════════════════════
// DECK CONTROLS
// ═══════════════════════════════════════════════
function runDeckAction(action, value=null){
  if(action==='playA')         deckA.play();
  if(action==='playB')         deckB.play();
  if(action==='stopA')        { deckA.pause(); deckA.currentTime=0; }
  if(action==='stopB')        { deckB.pause(); deckB.currentTime=0; }
  if(action==='micToggle')     document.getElementById('micToggle').click();
  if(action==='startBroadcast') document.getElementById('startBroadcast').click();
  if(action==='endBroadcast')   document.getElementById('endBroadcast').click();
  if(action==='nextTrigger')   triggerNextDrop();
  if(action==='startRecording') startRecording();
  if(action==='stopRecording')  stopRecording();
  if(action==='crossfader' && value!==null){
    document.getElementById('crossfader').value = Math.round((value/127)*100);
    setVolumes();
  }
}

qList.addEventListener('click', e=>{
  const load = e.target.closest('[data-load]');
  if(load){ loadTo(load.dataset.load, queue[Number(load.dataset.i)]); return; }
  const trig = e.target.closest('[data-trigger]');
  if(trig){ const x=queue[Number(trig.dataset.trigger)]; loadTo('B',x); deckB.play(); }
});

pads.addEventListener('click', e=>{
  const p = e.target.closest('[data-pad]');
  if(!p) return;
  const triggers = assets.filter(a=>['station_drop','voiceover','podcast','dj_set'].includes(a.type));
  const x = triggers[Number(p.dataset.pad)];
  loadTo('B',x); deckB.play();
});

document.getElementById('crossfader').addEventListener('input', setVolumes);
document.getElementById('playA').onclick  = ()=>deckA.play();
document.getElementById('playB').onclick  = ()=>deckB.play();
document.getElementById('stopA').onclick  = ()=>{ deckA.pause(); deckA.currentTime=0; };
document.getElementById('stopB').onclick  = ()=>{ deckB.pause(); deckB.currentTime=0; };
document.getElementById('cueA').onclick   = ()=>{ deckA.currentTime=0; deckA.play(); };
document.getElementById('cueB').onclick   = ()=>{ deckB.currentTime=0; deckB.play(); };
document.getElementById('micToggle').onclick = ()=>{
  micOn = !micOn;
  document.getElementById('micToggle').textContent = micOn?'🎙 Mic On':'🎙 Mic Off';
  note(micOn?'Mic armed locally. Live mic streaming connects next.':'Mic off.');
};
document.getElementById('startBroadcast').onclick = async()=>{
  await ensure(); live=true;
  document.getElementById('broadcastStatus').textContent = 'Live Broadcast Mode ON';
  await setDoc(doc(db,'radio_broadcast','main'),{ live:true, micOn, updatedAt:serverTimestamp(), hostUid:auth.currentUser?.uid||'' },{merge:true});
  note('Live Broadcast Mode started.','#5dff9e');
};
document.getElementById('endBroadcast').onclick = async()=>{
  await ensure(); live=false;
  document.getElementById('broadcastStatus').textContent = 'Offline. Start live mode when ready.';
  await setDoc(doc(db,'radio_broadcast','main'),{ live:false, micOn:false, updatedAt:serverTimestamp() },{merge:true});
  note('Broadcast ended.','#ff7474');
};
document.getElementById('reloadQueue').onclick = loadQueue;
document.getElementById('saveQueue').onclick = async()=>{
  await ensure();
  await setDoc(doc(db,'radio_dj_queues','main'),{
    items: queue.map((x,i)=>({id:x.id,kind:x.kind||'item',title:itemName(x),audioUrl:itemUrl(x),order:i})),
    updatedAt: serverTimestamp()
  },{merge:true});
  note('Broadcast queue saved.','#5dff9e');
};

// ═══════════════════════════════════════════════
// MIDI
// ═══════════════════════════════════════════════
function renderMappings(){
  const box = document.getElementById('midiMappings');
  if(!box) return;
  const rows = Object.entries(mappings);
  if(!rows.length){ box.innerHTML='<div class="track">No MIDI mappings yet. Click Start MIDI Learn, choose a target, then move a control.</div>'; return; }
  box.innerHTML = rows.map(([key,action])=>`
    <div class="track mapping-row">
      <div><div class="name">${esc(action)}</div><div class="desc">MIDI ${esc(key)}</div></div>
      <button class="btn btn-red" data-clear-map="${esc(key)}">Clear</button>
    </div>`).join('');
}
function midiKey(data){ return `${data[0]}-${data[1]}`; }
function onMidiMessage(e){
  const data=[...e.data], key=midiKey(data), val=data[2]??0;
  const sig=document.getElementById('lastMidiSignal');
  if(sig) sig.textContent=`${key} value ${val}`;
  if(midiLearn){
    const target=document.getElementById('midiTarget').value;
    mappings[key]=target;
    localStorage.setItem('ub_radio_dj_midi_mappings',JSON.stringify(mappings));
    renderMappings();
    note(`Mapped MIDI ${key} to ${target}`,'#5dff9e');
    return;
  }
  const action=mappings[key];
  if(action) runDeckAction(action,val);
}
async function connectMidi(){
  const status=document.getElementById('midiStatus');
  try{
    if(!navigator.requestMIDIAccess){ status.textContent='Web MIDI not supported. Use Chrome/Edge desktop.'; status.style.color='#ff7474'; return; }
    midiAccess=await navigator.requestMIDIAccess({sysex:false});
    const inputs=[...midiAccess.inputs.values()];
    inputs.forEach(input=>input.onmidimessage=onMidiMessage);
    document.getElementById('midiDevices').textContent=inputs.length?inputs.map(i=>i.name).join(', '):'No MIDI inputs detected.';
    status.textContent=inputs.length?'MIDI equipment connected.':'MIDI ready, but no inputs detected.';
    status.style.color=inputs.length?'#5dff9e':'#F0C040';
  } catch(e){ console.error(e); status.textContent='MIDI connect failed: '+(e.message||e); status.style.color='#ff7474'; }
}
document.getElementById('connectMidi')?.addEventListener('click',connectMidi);
document.getElementById('startMidiLearn')?.addEventListener('click',()=>{ midiLearn=true; note('MIDI Learn ON. Move a hardware control now.','#F0C040'); });
document.getElementById('stopMidiLearn')?.addEventListener('click',()=>{ midiLearn=false; note('MIDI Learn OFF.'); });
document.getElementById('midiMappings')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-clear-map]');
  if(!b) return;
  delete mappings[b.dataset.clearMap];
  localStorage.setItem('ub_radio_dj_midi_mappings',JSON.stringify(mappings));
  renderMappings();
});
document.querySelectorAll('[data-stream-action]').forEach(btn=>btn.addEventListener('click',()=>runDeckAction(btn.dataset.streamAction)));

// ── Boot ──
try{ mappings=JSON.parse(localStorage.getItem('ub_radio_dj_midi_mappings')||'{}')||{}; }catch(e){ mappings={}; }
setVolumes(); renderMappings(); loadQueue();
