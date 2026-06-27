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

const UB_LIVEKIT_TOKEN_FUNCTION = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';
const RADIO_LIVE_ROOM = 'unibeatz-radio-live';

const deckA      = document.getElementById('deckA');
const deckB      = document.getElementById('deckB');
const deckALabel = document.getElementById('deckALabel');
const deckBLabel = document.getElementById('deckBLabel');
const qList      = document.getElementById('queueList');
const pads       = document.getElementById('triggerPads');
const notice     = document.getElementById('deckNotice');

let queue = [], assets = [], micOn = false, live = false;
let midiAccess = null, midiLearn = false, mappings = {};

// ═══════════════════════════════════════════════
// LIVEKIT BROADCAST STATE
// ═══════════════════════════════════════════════
let _lkRoom        = null;
let _lkMicTrack    = null;
let _lkMixTrack    = null;
let _broadcastCtx  = null;
let _broadcastDest = null;

function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function note(m, c='#40D0FF'){ notice.textContent = m; notice.style.color = c; }
function recNote(m, c='#40D0FF'){ const el=document.getElementById('recNotice'); if(el){el.textContent=m;el.style.color=c;} }
function broadcastStatus(m){ const el=document.getElementById('broadcastStatus'); if(el) el.textContent=m; }
async function ensure(){ if(!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; }
function itemName(x){ return x.trackTitle||x.title||'Untitled'; }
function itemUrl(x){ return x.audioUrl||''; }

function setVolumes(){
  const v = Number(document.getElementById('crossfader').value);
  deckA.volume = (100-v)/100;
  deckB.volume = v/100;
  if(_recGainA && _recGainB){
    _recGainA.gain.value = (100-v)/100;
    _recGainB.gain.value = v/100;
  }
  if(_broadcastGainA && _broadcastGainB){
    _broadcastGainA.gain.value = (100-v)/100;
    _broadcastGainB.gain.value = v/100;
  }
}

function loadTo(deck, item){
  if(!itemUrl(item)){ note('This item has no audio URL.','#ff7474'); return; }
  if(deck==='A'){ deckA.src=itemUrl(item); deckALabel.textContent='A: '+itemName(item).slice(0,20); }
  else           { deckB.src=itemUrl(item); deckBLabel.textContent='B: '+itemName(item).slice(0,20); }
  note('Loaded '+itemName(item)+' to Deck '+deck,'#5dff9e');
}

async function loadQueue(){
  if(qList) qList.innerHTML = '<div class="track"><div class="name" style="color:var(--gray);">Loading tracks...</div></div>';
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
    if(qList) qList.innerHTML = '<div class="track"><div class="name" style="color:#ff7474;">Queue failed. Check Firestore rules.</div></div>';
  }
}

function renderQueue(){
  // Full track browser in bottom queue section
  if(!qList) return;
  if(!queue.length){ qList.innerHTML='<div class="track"><div class="name" style="color:var(--gray);">No approved tracks yet.</div></div>'; return; }
  qList.innerHTML = queue.map((x,i)=>`
    <div class="track">
      <div class="name">${i+1}. ${esc(itemName(x))}</div>
      <div class="desc">${esc(x.artistName||x.genre||x.type||'Radio')}</div>
      <div class="actions" style="margin-top:6px;">
        <button class="btn btn-blue" data-stage="A" data-i="${i}">+ Stage to A</button>
        <button class="btn btn-blue" data-stage="B" data-i="${i}">+ Stage to B</button>
        <button class="btn btn-gold" data-load="A" data-i="${i}">▶ Load A</button>
        <button class="btn btn-gold" data-load="B" data-i="${i}">▶ Load B</button>
      </div>
    </div>`).join('');
}

// Staged track lists per deck (separate from queue)
let stageA = [], stageB = [];

function renderDeckQueue(deck){
  const el = document.getElementById('deck' + deck + 'Queue');
  if(!el) return;
  const stage = deck === 'A' ? stageA : stageB;
  if(!stage.length){
    el.innerHTML = '<div class="dq-item"><div class="dq-info"><div class="dq-name" style="color:var(--gray);">Stage tracks from queue below</div></div></div>';
    return;
  }
  el.innerHTML = stage.map((x,i)=>`
    <div class="dq-item ${x._loaded?'loaded':''}">
      <div class="dq-num">${i+1}</div>
      <div class="dq-info">
        <div class="dq-name">${esc(itemName(x))}</div>
        <div class="dq-meta">${esc(x.artistName||x.genre||x.type||'Radio')}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-sm btn-gold" data-load-staged="${deck}" data-si="${i}">▶</button>
        <button class="btn btn-sm btn-red" data-remove-staged="${deck}" data-si="${i}">✕</button>
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
// LIVEKIT BROADCAST — streams mic + deck mix live
// ═══════════════════════════════════════════════
let _broadcastGainA = null;
let _broadcastGainB = null;
let _broadcastSrcA  = null;
let _broadcastSrcB  = null;

async function startBroadcast(){
  if(live){ note('Already live.','#F0C040'); return; }
  if(!window.LivekitClient){
    note('Loading LiveKit...','#F0C040');
    // Load LiveKit UMD if not already loaded
    await new Promise((res,rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.7/dist/livekit-client.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  try{
    note('Connecting to broadcast room...','#F0C040');
    await ensure();
    const djName = 'dj_' + (auth.currentUser?.uid||'guest').slice(0,8);

    // Get LiveKit token
    const res = await fetch(`${UB_LIVEKIT_TOKEN_FUNCTION}?room=${RADIO_LIVE_ROOM}&username=${djName}`);
    const { token, url } = await res.json();
    if(!token || !url) throw new Error('Could not get broadcast token');

    // Connect to LiveKit room
    _lkRoom = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
    await _lkRoom.connect(url, token);

    // Build Web Audio mix: deckA + deckB → single stream → LiveKit
    _broadcastCtx  = new (window.AudioContext || window.webkitAudioContext)();
    if(_broadcastCtx.state === 'suspended') await _broadcastCtx.resume();

    _broadcastDest  = _broadcastCtx.createMediaStreamDestination();
    _broadcastSrcA  = _broadcastCtx.createMediaElementSource(deckA);
    _broadcastSrcB  = _broadcastCtx.createMediaElementSource(deckB);
    _broadcastGainA = _broadcastCtx.createGain();
    _broadcastGainB = _broadcastCtx.createGain();

    const v = Number(document.getElementById('crossfader').value);
    _broadcastGainA.gain.value = (100-v)/100;
    _broadcastGainB.gain.value = v/100;

    // Route decks to mix destination AND speakers
    _broadcastSrcA.connect(_broadcastGainA);
    _broadcastGainA.connect(_broadcastDest);
    _broadcastGainA.connect(_broadcastCtx.destination);

    _broadcastSrcB.connect(_broadcastGainB);
    _broadcastGainB.connect(_broadcastDest);
    _broadcastGainB.connect(_broadcastCtx.destination);

    // Publish the deck mix as a custom audio track
    const mixTrack = _broadcastDest.stream.getAudioTracks()[0];
    if(mixTrack){
      _lkMixTrack = await LivekitClient.createLocalAudioTrack({ mediaStreamTrack: mixTrack });
      await _lkRoom.localParticipant.publishTrack(_lkMixTrack);
    }

    live = true;
    broadcastStatus('🔴 LIVE — Streaming to UniBeatz Radio · Room: ' + RADIO_LIVE_ROOM);
    note('🔴 Live broadcast started! Listeners can tune in on the radio page.','#5dff9e');

    // Update Firestore so radio page knows DJ is live
    await setDoc(doc(db,'radio_broadcast','main'),{
      live: true, djRoom: RADIO_LIVE_ROOM, micOn,
      updatedAt: serverTimestamp(),
      hostUid: auth.currentUser?.uid || ''
    },{ merge: true });

    // Update button states
    document.getElementById('startBroadcast').disabled = true;
    document.getElementById('endBroadcast').disabled   = false;

  } catch(e){
    console.error('[broadcast]', e);
    note('Broadcast failed: ' + (e.message||e),'#ff7474');
    await endBroadcast();
  }
}

async function endBroadcast(){
  live = false;
  try{
    if(_lkMicTrack)  { await _lkRoom?.localParticipant?.unpublishTrack(_lkMicTrack); _lkMicTrack = null; }
    if(_lkMixTrack)  { await _lkRoom?.localParticipant?.unpublishTrack(_lkMixTrack); _lkMixTrack = null; }
    if(_lkRoom)      { _lkRoom.disconnect(); _lkRoom = null; }
    if(_broadcastSrcA){ try{ _broadcastSrcA.disconnect(); } catch(e){} _broadcastSrcA = null; }
    if(_broadcastSrcB){ try{ _broadcastSrcB.disconnect(); } catch(e){} _broadcastSrcB = null; }
    if(_broadcastCtx) { _broadcastCtx.close(); _broadcastCtx = null; }
    _broadcastDest = null; _broadcastGainA = null; _broadcastGainB = null;
  } catch(e){ console.warn('[broadcast end]', e); }

  broadcastStatus('Offline. Start live mode when ready.');
  note('Broadcast ended.','#ff7474');

  await ensure();
  await setDoc(doc(db,'radio_broadcast','main'),{
    live: false, micOn: false, updatedAt: serverTimestamp()
  },{ merge: true });

  document.getElementById('startBroadcast').disabled = false;
  document.getElementById('endBroadcast').disabled   = true;
}

async function toggleMic(){
  micOn = !micOn;
  const btn = document.getElementById('micToggle');
  btn.textContent = micOn ? '🎙 Mic On' : '🎙 Mic Off';

  if(!live){ note(micOn ? 'Mic armed. Start broadcast to go live.' : 'Mic off.'); return; }

  if(micOn){
    try{
      // Get mic and publish to LiveKit
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      _lkMicTrack = await LivekitClient.createLocalAudioTrack({ mediaStreamTrack: micStream.getAudioTracks()[0] });
      await _lkRoom.localParticipant.publishTrack(_lkMicTrack);
      note('🎙 Mic live — you are broadcasting voice.','#5dff9e');
    } catch(e){
      micOn = false; btn.textContent = '🎙 Mic Off';
      note('Mic failed: ' + (e.message||e),'#ff7474');
    }
  } else {
    if(_lkMicTrack){
      await _lkRoom?.localParticipant?.unpublishTrack(_lkMicTrack);
      _lkMicTrack = null;
    }
    note('Mic muted.');
  }
}

// ═══════════════════════════════════════════════
// MIX RECORDER
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
let _savedMixes  = [];

function getAudioCtx(){
  if(!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  return _audioCtx;
}

function startRecording(){
  // If broadcast is active, reuse that audio context
  if(live && _broadcastCtx && _broadcastDest){
    note('Recording from live broadcast mix.','#F0C040');
    _recChunks = [];
    _mediaRec  = new MediaRecorder(_broadcastDest.stream, { mimeType: 'audio/webm' });
    _mediaRec.ondataavailable = e => { if(e.data.size>0) _recChunks.push(e.data); };
    _mediaRec.onstop = finishRecording;
    _mediaRec.start(1000);
    _recStart = Date.now();
    startRecTimer();
    updateRecButtons(true);
    recNote('🔴 Recording live broadcast mix.','#ff3c3c');
    return;
  }

  if(_mediaRec && _mediaRec.state==='recording'){ recNote('Already recording.','#F0C040'); return; }

  const ctx = getAudioCtx();
  if(ctx.state==='suspended') ctx.resume();

  _recSrcA  = ctx.createMediaElementSource(deckA);
  _recSrcB  = ctx.createMediaElementSource(deckB);
  _recGainA = ctx.createGain();
  _recGainB = ctx.createGain();
  _recDest  = ctx.createMediaStreamDestination();

  const v = Number(document.getElementById('crossfader').value);
  _recGainA.gain.value = (100-v)/100;
  _recGainB.gain.value = v/100;

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
  startRecTimer();
  updateRecButtons(true);
  recNote('🔴 Recording mix — play your tracks on the decks.','#ff3c3c');
}

function startRecTimer(){
  const timerEl = document.getElementById('recTimer');
  if(timerEl) timerEl.style.display='block';
  _recTimerInt = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-_recStart)/1000);
    const m = Math.floor(elapsed/60), s = elapsed%60;
    if(timerEl) timerEl.textContent = m+':'+(s<10?'0':'')+s;
  }, 500);
}

function updateRecButtons(recording){
  const startBtn = document.getElementById('recStart');
  const stopBtn  = document.getElementById('recStop');
  if(startBtn){ startBtn.textContent = recording ? '⏺ Recording...' : '⏺ Start Recording'; startBtn.classList.toggle('recording', recording); startBtn.disabled = recording; }
  if(stopBtn)  stopBtn.disabled = !recording;
}

function stopRecording(){
  if(!_mediaRec||_mediaRec.state!=='recording'){ recNote('No recording in progress.','#F0C040'); return; }
  _mediaRec.stop();
  clearInterval(_recTimerInt);
  const timerEl = document.getElementById('recTimer');
  if(timerEl) timerEl.style.display='none';
  updateRecButtons(false);
}

function finishRecording(){
  const blob = new Blob(_recChunks, { type:'audio/webm' });
  const url  = URL.createObjectURL(blob);
  const duration = Math.floor((Date.now()-_recStart)/1000);
  const m = Math.floor(duration/60), s = duration%60;
  const name = 'UniBeatz_Mix_'+new Date().toISOString().slice(0,16).replace('T','_').replace(/:/g,'-');

  _savedMixes.unshift({ name, blob, url, duration, date: new Date().toLocaleString() });

  // Only disconnect if not using broadcast context
  if(!live){
    try{ _recSrcA.disconnect(); }catch(e){}
    try{ _recSrcB.disconnect(); }catch(e){}
    try{ _recSrcA.connect(_audioCtx.destination); }catch(e){}
    try{ _recSrcB.connect(_audioCtx.destination); }catch(e){}
    _recGainA = null; _recGainB = null;
  }

  renderSavedMixes();
  recNote('✅ Mix saved! '+m+'m '+s+'s — download to upload to Live365.','#5dff9e');
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
  if(action==='playA')          deckA.play();
  if(action==='playB')          deckB.play();
  if(action==='stopA')         { deckA.pause(); deckA.currentTime=0; }
  if(action==='stopB')         { deckB.pause(); deckB.currentTime=0; }
  if(action==='micToggle')      toggleMic();
  if(action==='startBroadcast') startBroadcast();
  if(action==='endBroadcast')   endBroadcast();
  if(action==='nextTrigger')    triggerNextDrop();
  if(action==='startRecording') startRecording();
  if(action==='stopRecording')  stopRecording();
  if(action==='crossfader' && value!==null){
    document.getElementById('crossfader').value = Math.round((value/127)*100);
    setVolumes();
  }
}

// Bottom queue — stage to deck or load directly
qList?.addEventListener('click', e => {
  const stageBtn = e.target.closest('[data-stage]');
  if(stageBtn){
    const deck = stageBtn.dataset.stage;
    const item = queue[Number(stageBtn.dataset.i)];
    if(!item) return;
    if(deck === 'A'){ stageA.push({...item}); renderDeckQueue('A'); }
    else             { stageB.push({...item}); renderDeckQueue('B'); }
    note('Staged "' + itemName(item) + '" to Deck ' + deck,'#5dff9e');
    return;
  }
  const loadBtn = e.target.closest('[data-load]');
  if(loadBtn){
    const deck = loadBtn.dataset.load;
    const item = queue[Number(loadBtn.dataset.i)];
    if(item) loadTo(deck, item);
  }
});

// Deck queue — play staged track or remove it
['A','B'].forEach(deck => {
  document.getElementById('deck' + deck + 'Queue')?.addEventListener('click', e => {
    const playBtn = e.target.closest('[data-load-staged]');
    if(playBtn){
      const stage = deck === 'A' ? stageA : stageB;
      const si = Number(playBtn.dataset.si);
      const item = stage[si];
      if(!item) return;
      // Mark loaded
      stage.forEach(x => x._loaded = false);
      item._loaded = true;
      loadTo(deck, item);
      renderDeckQueue(deck);
      return;
    }
    const removeBtn = e.target.closest('[data-remove-staged]');
    if(removeBtn){
      const si = Number(removeBtn.dataset.si);
      if(deck === 'A') stageA.splice(si, 1);
      else             stageB.splice(si, 1);
      renderDeckQueue(deck);
    }
  });
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
document.getElementById('micToggle').onclick    = toggleMic;
document.getElementById('startBroadcast').onclick = startBroadcast;
document.getElementById('endBroadcast').onclick   = endBroadcast;
document.getElementById('endBroadcast').disabled  = true;

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
setVolumes(); renderMappings(); renderDeckQueue('A'); renderDeckQueue('B'); loadQueue();
