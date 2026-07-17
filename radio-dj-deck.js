import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

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
// Legacy MIDI state removed. DJ OS V4 is the only controller owner.

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
function broadcastStatus(m){
  const el=document.getElementById('broadcastStatus'); if(el) el.textContent=m.length>30?m.slice(0,30)+'...':m;
  const el2=document.getElementById('broadcastStatusFull'); if(el2) el2.textContent=m;
  const badge=document.getElementById('broadcastLiveBadge'); if(badge) badge.style.display=m.includes('LIVE')?'flex':'none';
}
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
  const url = itemUrl(item);
  if(!url){ note('This item has no audio URL.','#ff7474'); return; }
  const name = itemName(item);
  if(deck==='A'){
    deckA.src = url;
    deckALabel.textContent = 'A: ' + name.slice(0,20);
    // Update platter label
    const pl = document.getElementById('platterALabel');
    if(pl) pl.textContent = name.slice(0,12);
    // Mark loaded in deck queue
    stageA.forEach(x => x._loaded = false);
    const staged = stageA.find(x => itemName(x) === name);
    if(staged) staged._loaded = true;
    renderDeckQueue('A');
  } else {
    deckB.src = url;
    deckBLabel.textContent = 'B: ' + name.slice(0,20);
    const pl = document.getElementById('platterBLabel');
    if(pl) pl.textContent = name.slice(0,12);
    stageB.forEach(x => x._loaded = false);
    const staged = stageB.find(x => itemName(x) === name);
    if(staged) staged._loaded = true;
    renderDeckQueue('B');
  }
  note('Loaded ' + name + ' to Deck ' + deck, '#5dff9e');
  // Try scratch buffer in background — won't block playback if it fails
  try { loadScratchBuffer(deck, url); } catch(e) {}
}

async function loadQueue(){
  if(qList){
    qList.innerHTML = '<div class="track"><div class="name" style="color:var(--gray);">Loading approved tracks...</div></div>';
  }

  try{
    await ensure();

    const approvedTracksQuery = query(
      collection(db, 'radio_submissions'),
      where('status', '==', 'approved')
    );

    const [tracksSnap, assetsSnap] = await Promise.all([
      getDocs(approvedTracksQuery),
      getDocs(collection(db, 'radio_assets')).catch(error => {
        console.warn('[radio deck] radio_assets unavailable:', error);
        return { docs: [] };
      })
    ]);

    const approvedTracks = tracksSnap.docs
      .map(d => ({ id: d.id, kind: 'track', ...d.data() }))
      .filter(track => track.audioUrl);

    assets = assetsSnap.docs
      .map(d => ({ id: d.id, kind: 'asset', ...d.data() }))
      .filter(asset => asset.active !== false && asset.audioUrl);

    queue = [...approvedTracks, ...assets].sort(
      (a, b) => Number(a.sortOrder || a.autoOrder || 0) - Number(b.sortOrder || b.autoOrder || 0)
    );

    console.log('[radio deck] approved tracks:', approvedTracks.length);
    console.log('[radio deck] active assets:', assets.length);

    renderQueue();
    renderPads();

    if(!approvedTracks.length){
      note('No approved tracks with audio URLs were returned from Firestore.', '#F0C040');
    }else{
      note(`Loaded ${approvedTracks.length} approved track${approvedTracks.length === 1 ? '' : 's'}.`, '#5dff9e');
    }
  }catch(e){
    console.error('[radio deck] queue load failed:', e);

    if(qList){
      qList.innerHTML =
        '<div class="track"><div class="name" style="color:#ff7474;">' +
        'Approved tracks failed to load: ' + esc(e.message || e) +
        '</div></div>';
    }

    note('Approved tracks failed to load: ' + (e.message || e), '#ff7474');
  }
}

function renderQueue(){
  if(!qList) return;
  if(!queue.length){ qList.innerHTML='<div style="padding:10px;color:var(--gray);font-size:.7rem;">No approved tracks yet.</div>'; return; }
  qList.innerHTML = queue.map((x,i)=>`
    <div class="tb-row">
      <div class="tb-num">${i+1}</div>
      <div class="tb-info">
        <div class="tb-name">${esc(itemName(x))}</div>
        <div class="tb-artist">${esc(x.artistName||x.genre||x.type||'Radio')}</div>
      </div>
      <div class="tb-actions">
        <button class="tb-btn a" data-stage="A" data-i="${i}">A+</button>
        <button class="tb-btn b" data-stage="B" data-i="${i}">B+</button>
        <button class="tb-btn a" data-load="A" data-i="${i}">▶A</button>
        <button class="tb-btn b" data-load="B" data-i="${i}">▶B</button>
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
  if(!triggers.length){ pads.innerHTML='<div class="pad-btn" style="grid-column:1/-1;color:var(--gray);font-size:.6rem;">Upload drops in admin</div>'; return; }
  pads.innerHTML = triggers.map((x,i)=>`
    <button class="pad-btn" data-pad="${i}" type="button">
      <span class="pad-name">${esc((x.title||'Drop').slice(0,10))}</span>
      <span style="font-size:.28rem;color:var(--gray);">${esc(x.type||'')}</span>
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
    _broadcastSrcA  = deckA._eqSrc || _broadcastCtx.createMediaElementSource(deckA);
    _broadcastSrcB  = deckB._eqSrc || _broadcastCtx.createMediaElementSource(deckB);
    if(!deckA._eqSrc) deckA._eqSrc = _broadcastSrcA;
    if(!deckB._eqSrc) deckB._eqSrc = _broadcastSrcB;
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

  // Reuse existing MediaElementSource if EQ already claimed it
  _recSrcA  = deckA._eqSrc || ctx.createMediaElementSource(deckA);
  _recSrcB  = deckB._eqSrc || ctx.createMediaElementSource(deckB);
  if(!deckA._eqSrc) deckA._eqSrc = _recSrcA;
  if(!deckB._eqSrc) deckB._eqSrc = _recSrcB;
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
  const v = value !== null ? value : 0;
  // Play / Pause
  if(action==='playA')  { deckA.paused ? deckA.play() : deckA.pause(); }
  if(action==='playB')  { deckB.paused ? deckB.play() : deckB.pause(); }
  // Stop
  if(action==='stopA')  { deckA.pause(); deckA.currentTime=0; }
  if(action==='stopB')  { deckB.pause(); deckB.currentTime=0; }
  // Cue — jump to 0 and play
  if(action==='cueA')   { deckA.currentTime=0; deckA.play(); }
  if(action==='cueB')   { deckB.currentTime=0; deckB.play(); }
  // Sync — match playback rate to other deck
  if(action==='syncA')  { if(!deckB.paused) deckA.playbackRate=deckB.playbackRate; }
  if(action==='syncB')  { if(!deckA.paused) deckB.playbackRate=deckA.playbackRate; }
  // Pitch fader — center=64, range -8% to +8%
  if(action==='pitchA') {
    const pct = ((v-64)/64)*8;
    deckA.playbackRate = 1.0+(pct/100);
    const el=document.getElementById('pitchAVal'); if(el) el.textContent=(pct>0?'+':'')+pct.toFixed(1)+'%';
    const sl=document.getElementById('pitchA'); if(sl) sl.value=pct;
  }
  if(action==='pitchB') {
    const pct = ((v-64)/64)*8;
    deckB.playbackRate = 1.0+(pct/100);
    const el=document.getElementById('pitchBVal'); if(el) el.textContent=(pct>0?'+':'')+pct.toFixed(1)+'%';
    const sl=document.getElementById('pitchB'); if(sl) sl.value=pct;
  }
  // Volume faders
  if(action==='volumeA') { deckA.volume=v/127; const g=document.getElementById('gainA'); if(g) g.value=Math.round((v/127)*100); }
  if(action==='volumeB') { deckB.volume=v/127; const g=document.getElementById('gainB'); if(g) g.value=Math.round((v/127)*100); }
  // Crossfader
  if(action==='crossfader') {
    const cf=document.getElementById('crossfader'); if(cf) cf.value=Math.round((v/127)*100);
    setVolumes();
  }
  // Jog wheel (relative: 1-63=fwd, 65-127=back)
  if(action==='jogA' || action==='jogB'){
    const audio = action==='jogA' ? deckA : deckB;
    const speed = v < 64 ? v : v-128;
    audio.playbackRate = 1.0+(speed*0.06);
    clearTimeout(runDeckAction._jogTimer);
    runDeckAction._jogTimer = setTimeout(()=>{ audio.playbackRate=1.0; }, 120);
  }
  // EQ
  if(action==='eqHighA') hercEQ('A','high',v);
  if(action==='eqMidA')  hercEQ('A','mid',v);
  if(action==='eqLowA')  hercEQ('A','low',v);
  if(action==='eqHighB') hercEQ('B','high',v);
  if(action==='eqMidB')  hercEQ('B','mid',v);
  if(action==='eqLowB')  hercEQ('B','low',v);
  // Filter
  if(action==='filterA') hercFilter('A',v);
  if(action==='filterB') hercFilter('B',v);
  // Loops
  if(action==='loop4A')    startLoop('A',4);
  if(action==='loop2A')    startLoop('A',2);
  if(action==='loop1A')    startLoop('A',1);
  if(action==='loopHA')    startLoop('A',0.5);
  if(action==='loop4B')    startLoop('B',4);
  if(action==='loop2B')    startLoop('B',2);
  if(action==='loop1B')    startLoop('B',1);
  if(action==='loopHB')    startLoop('B',0.5);
  if(action==='loopOffA')  stopLoop('A');
  if(action==='loopOffB')  stopLoop('B');
  // Hercules Loop IN button → 4 bar loop
  if(action==='loop4A' || action==='loopInA') startLoop('A',4);
  if(action==='loop4B' || action==='loopInB') startLoop('B',4);
  // Pads (with shift state tracked in hercules handler)
  if(action==='pad0A') { startLoop('A',4); }
  if(action==='pad1A') { startLoop('A',2); }
  if(action==='pad2A') { startLoop('A',1); }
  if(action==='pad3A') { startLoop('A',0.5); }
  if(action==='pad0B') { startLoop('B',4); }
  if(action==='pad1B') { startLoop('B',2); }
  if(action==='pad2B') { startLoop('B',1); }
  if(action==='pad3B') { startLoop('B',0.5); }
  // Filter actions from controller
  if(action==='filterA') hercFilter('A', v);
  if(action==='filterB') hercFilter('B', v);
  // FX
  if(action==='fxBassA')    toggleFX('A','bass');
  if(action==='fxFilterA')  toggleFX('A','filter');
  if(action==='fxReverbA')  toggleFX('A','reverb');
  if(action==='fxStutterA') toggleFX('A','stutter');
  if(action==='fxBassB')    toggleFX('B','bass');
  if(action==='fxFilterB')  toggleFX('B','filter');
  if(action==='fxReverbB')  toggleFX('B','reverb');
  if(action==='fxStutterB') toggleFX('B','stutter');
  // Broadcast / record
  if(action==='micToggle')      toggleMic();
  if(action==='startBroadcast') startBroadcast();
  if(action==='endBroadcast')   endBroadcast();
  if(action==='nextTrigger')    triggerNextDrop();
  if(action==='startRecording') startRecording();
  if(action==='stopRecording')  stopRecording();
}
runDeckAction._jogTimer = null;

// Bridge: dj-midi-controller.js dispatches 'ub-dj-action' custom events
window.ubDeckAction = runDeckAction;
window.addEventListener('ub-dj-action', function(e){
  const { action, signal } = e.detail || {};
  if(!action) return;
  const val = signal ? (signal.value !== undefined ? signal.value : 0) : 0;
  runDeckAction(action, val);
});

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
// DJ CONTROLLER INPUT
// ═══════════════════════════════════════════════
// All controller detection, MIDI/HID input, Learn Mode, and mappings
// are handled only by unibeatz-dj-os-v4.js.

// ═══════════════════════════════════════════════
// WEB AUDIO EQ + FX + LOOP ENGINE
// ═══════════════════════════════════════════════

let _eqCtx = null;
const _eq = { A: {}, B: {} };
const _fx = { A: {}, B: {} };
const _loop = { A: { active:false, start:0, length:0, timer:null }, B: { active:false, start:0, length:0, timer:null } };

function getEqCtx(){
  if(!_eqCtx) _eqCtx = new (window.AudioContext||window.webkitAudioContext)();
  return _eqCtx;
}

function buildEQ(deck){
  // EQ routing disabled — prevents audio kill
  // Will be re-enabled once routing is confirmed
  return;
  const ctx = getEqCtx();
  const audio = deck === 'A' ? deckA : deckB;
  if(_eq[deck].built) return;

  try{
    // Use existing MediaElementSource if already created (e.g. by recorder or broadcast)
    let src;
    if(audio._eqSrc){
      src = audio._eqSrc;
    } else {
      src = ctx.createMediaElementSource(audio);
      audio._eqSrc = src;
    }

    const low       = ctx.createBiquadFilter(); low.type='lowshelf';  low.frequency.value=250;  low.gain.value=0;
    const midLo     = ctx.createBiquadFilter(); midLo.type='peaking'; midLo.frequency.value=500;  midLo.Q.value=1; midLo.gain.value=0;
    const midHi     = ctx.createBiquadFilter(); midHi.type='peaking'; midHi.frequency.value=2000; midHi.Q.value=1; midHi.gain.value=0;
    const high      = ctx.createBiquadFilter(); high.type='highshelf'; high.frequency.value=8000; high.gain.value=0;
    const bassBoost = ctx.createBiquadFilter(); bassBoost.type='lowshelf'; bassBoost.frequency.value=200; bassBoost.gain.value=0;
    const filter    = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=20000;
    const reverbGain  = ctx.createGain(); reverbGain.gain.value=0;
    const reverbDelay = ctx.createDelay(2.0); reverbDelay.delayTime.value=0.3;
    const reverbFeed  = ctx.createGain(); reverbFeed.gain.value=0.35;
    const stutterGain = ctx.createGain(); stutterGain.gain.value=1;

    // Chain: src → EQ bands → bassBoost → filter → stutter → destination
    src.connect(low);
    low.connect(midLo);
    midLo.connect(midHi);
    midHi.connect(high);
    high.connect(bassBoost);
    bassBoost.connect(filter);
    filter.connect(stutterGain);
    stutterGain.connect(ctx.destination); // dry signal to speakers

    // Reverb send: stutter → reverbDelay → reverbFeed loop → reverbGain → destination
    stutterGain.connect(reverbDelay);
    reverbDelay.connect(reverbFeed);
    reverbFeed.connect(reverbDelay); // feedback loop
    reverbDelay.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    _eq[deck] = { built:true, src, low, midLo, midHi, high, bassBoost, filter, reverbGain, reverbDelay, reverbFeed, stutterGain };
    console.log('[EQ] Built for Deck', deck);
  } catch(e){
    console.error('[EQ] Build failed for deck', deck, e);
    // Mark as built anyway to prevent infinite retry loops
    if(!_eq[deck].built) _eq[deck] = { built:false };
  }
}

// Build EQ chains early — call after DOM ready so audio elements exist
function initEQ(){
  buildEQ('A');
  buildEQ('B');
}

// ── EQ Knob control ──
// Gain range: -15 to +15 dB, knob val 0-127
function setEQBand(deck, band, val){
  buildEQ(deck);
  const db = ((val / 127) * 30) - 15; // -15 to +15 dB
  const eq = _eq[deck];
  if(!eq.built) return;
  if(band==='low')   eq.low.gain.value   = db;
  if(band==='midLo') eq.midLo.gain.value = db;
  if(band==='midHi') eq.midHi.gain.value = db;
  if(band==='high')  eq.high.gain.value  = db;
  note(`Deck ${deck} ${band} EQ: ${db>0?'+':''}${db.toFixed(1)}dB`);
}

// ── Loop engine ──
const LOOP_LENGTHS = [4, 2, 1, 0.5]; // bars in beats (assuming ~120bpm = 2s/bar)
const BPM = 120;
const BAR_SECS = (60 / BPM) * 4;

function startLoop(deck, bars){
  const audio = deck === 'A' ? deckA : deckB;
  const lp = _loop[deck];
  if(lp.active && lp.bars === bars){ stopLoop(deck); return; } // toggle off
  stopLoop(deck);
  lp.active = true;
  lp.bars = bars;
  lp.start = audio.currentTime;
  lp.length = bars * BAR_SECS;
  clearInterval(lp.timer);
  lp.timer = setInterval(()=>{
    if(!lp.active){ clearInterval(lp.timer); return; }
    if(audio.currentTime >= lp.start + lp.length){
      audio.currentTime = lp.start;
    }
  }, 10);
  note(`🔁 Deck ${deck} Loop ${bars} bar${bars!==1?'s':''} ON`,'#F0C040');
}

function stopLoop(deck){
  const lp = _loop[deck];
  lp.active = false;
  clearInterval(lp.timer);
}

// ── FX toggles ──
let _stutterTimers = { A: null, B: null };
let _fxState = { A: { bass:false, filter:false, reverb:false, stutter:false }, B: { bass:false, filter:false, reverb:false, stutter:false } };

function toggleFX(deck, fx){
  buildEQ(deck);
  const eq = _eq[deck];
  if(!eq.built) return;
  const state = _fxState[deck];

  if(fx === 'bass'){
    state.bass = !state.bass;
    eq.bassBoost.gain.value = state.bass ? 12 : 0;
    note(`Deck ${deck} Bass Boost ${state.bass?'ON':'OFF'}`, state.bass?'#5dff9e':'#ff7474');
  }
  if(fx === 'filter'){
    state.filter = !state.filter;
    // Sweep filter down when on
    if(state.filter){
      eq.filter.frequency.value = 800;
      note(`Deck ${deck} Filter ON`,'#5dff9e');
    } else {
      eq.filter.frequency.value = 20000;
      note(`Deck ${deck} Filter OFF`,'#ff7474');
    }
  }
  if(fx === 'reverb'){
    state.reverb = !state.reverb;
    eq.reverbGain.gain.value = state.reverb ? 0.5 : 0;
    note(`Deck ${deck} Reverb ${state.reverb?'ON':'OFF'}`, state.reverb?'#5dff9e':'#ff7474');
  }
  if(fx === 'stutter'){
    state.stutter = !state.stutter;
    if(state.stutter){
      let tog = true;
      _stutterTimers[deck] = setInterval(()=>{
        if(!state.stutter){ eq.stutterGain.gain.value=1; clearInterval(_stutterTimers[deck]); return; }
        eq.stutterGain.gain.value = tog ? 1 : 0;
        tog = !tog;
      }, 80);
      note(`Deck ${deck} Stutter ON`,'#5dff9e');
    } else {
      clearInterval(_stutterTimers[deck]);
      eq.stutterGain.gain.value = 1;
      note(`Deck ${deck} Stutter OFF`,'#ff7474');
    }
  }
}

// ── Akai MPK Mini 4 Pad + Knob MIDI map ──
// Bank A pads: note 36-43, Bank B pads: note 44-51 (MPK Mini 4 default)
// Knobs: CC 70-77

const AKAI_PAD_MAP = {
  // Bank A → Deck A
  36: ()=>startLoop('A', 4),
  37: ()=>startLoop('A', 2),
  38: ()=>startLoop('A', 1),
  39: ()=>startLoop('A', 0.5),
  40: ()=>toggleFX('A','bass'),
  41: ()=>toggleFX('A','filter'),
  42: ()=>toggleFX('A','reverb'),
  43: ()=>toggleFX('A','stutter'),
  // Bank B → Deck B
  44: ()=>startLoop('B', 4),
  45: ()=>startLoop('B', 2),
  46: ()=>startLoop('B', 1),
  47: ()=>startLoop('B', 0.5),
  48: ()=>toggleFX('B','bass'),
  49: ()=>toggleFX('B','filter'),
  50: ()=>toggleFX('B','reverb'),
  51: ()=>toggleFX('B','stutter'),
};

const AKAI_KNOB_MAP = {
  // Knobs 1-4 → Deck A EQ (CC 24-27)
  24: v=>setEQBand('A','low',v),
  25: v=>setEQBand('A','midLo',v),
  26: v=>setEQBand('A','midHi',v),
  27: v=>setEQBand('A','high',v),
  // Knobs 5-8 → Deck B EQ (CC 28-31)
  28: v=>setEQBand('B','low',v),
  29: v=>setEQBand('B','midLo',v),
  30: v=>setEQBand('B','midHi',v),
  31: v=>setEQBand('B','high',v),
};

// ═══════════════════════════════════════════════
// TRUE SCRATCH ENGINE — AudioBufferSourceNode
// Loads track into buffer for real scratch control
// ═══════════════════════════════════════════════

const _scratch = {
  A: { buffer:null, src:null, playing:false, startTime:0, startOffset:0, rate:1, url:null, loading:false },
  B: { buffer:null, src:null, playing:false, startTime:0, startOffset:0, rate:1, url:null, loading:false }
};

async function loadScratchBuffer(deck, url){
  const s = _scratch[deck];
  if(s.url === url && s.buffer) return; // already loaded
  s.loading = true;
  s.buffer = null;
  s.url = url;
  note('⏳ Loading scratch buffer for Deck ' + deck + '...', '#F0C040');
  try{
    const ctx = getEqCtx();
    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    s.buffer = await ctx.decodeAudioData(arrayBuf);
    s.loading = false;
    note('✅ Deck ' + deck + ' scratch ready — use pitch wheel', '#5dff9e');
  } catch(e){
    s.loading = false;
    s.url = null;
    console.warn('[scratch] Buffer load failed', e);
    note('⚠️ Scratch buffer failed — normal playback only', '#ff7474');
  }
}

function scratchPlay(deck, offset){
  const s = _scratch[deck];
  const ctx = getEqCtx();
  if(!s.buffer) return;
  if(s.src){ try{ s.src.stop(); }catch(e){} s.src = null; }

  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  src.playbackRate.value = s.rate;
  src.loop = false;

  // Route directly to destination (EQ disabled)
  src.connect(ctx.destination);

  const startAt = offset !== undefined ? offset : s.startOffset;
  src.start(0, Math.max(0, Math.min(startAt, s.buffer.duration - 0.01)));
  s.src = src;
  s.startTime = ctx.currentTime;
  s.startOffset = startAt;
  s.playing = true;

  src.onended = () => { if(s.src === src) s.playing = false; };
}

function scratchStop(deck){
  const s = _scratch[deck];
  if(s.src){
    const ctx = getEqCtx();
    // Save current position
    s.startOffset = s.startOffset + (ctx.currentTime - s.startTime) * s.rate;
    try{ s.src.stop(); }catch(e){}
    s.src = null;
  }
  s.playing = false;
}

function getCurrentScratchPos(deck){
  const s = _scratch[deck];
  const ctx = getEqCtx();
  if(!s.playing || !s.src) return s.startOffset;
  return s.startOffset + (ctx.currentTime - s.startTime) * s.rate;
}

// ── Updated pitch wheel scratch using buffer ──
function handlePitchWheel(lsb, msb){
  const raw = ((msb & 0x7F) << 7) | (lsb & 0x7F);
  const centered = raw - 8192;
  const normalized = centered / 8192; // -1.0 to +1.0

  // Target whichever deck has a loaded scratch buffer and is playing
  let deck = null;
  if(_scratch.A.buffer && !_scratch.A.loading) deck = 'A';
  else if(_scratch.B.buffer && !_scratch.B.loading) deck = 'B';

  const sig = document.getElementById('lastMidiSignal');

  if(!deck){
    // No buffer loaded — fall back to playbackRate on HTML element
    const audio = (!deckA.paused) ? deckA : (!deckB.paused) ? deckB : deckA;
    if(Math.abs(normalized) < 0.04){
      audio.playbackRate = 1.0;
    } else {
      audio.playbackRate = Math.max(0.05, 1.0 + normalized * 1.5);
    }
    if(sig) sig.textContent = 'Scratch (speed): ' + audio.playbackRate.toFixed(2) + 'x';
    clearTimeout(_scratchResetTimer);
    if(Math.abs(normalized) > 0.04){
      _scratchResetTimer = setTimeout(()=>{ audio.playbackRate=1.0; }, 200);
    }
    return;
  }

  const s = _scratch[deck];

  if(Math.abs(normalized) < 0.04){
    // Wheel center — resume normal forward play
    if(s.playing){
      scratchStop(deck);
      s.rate = 1.0;
      scratchPlay(deck);
    }
    if(sig) sig.textContent = 'Scratch: center — normal play';
    return;
  }

  // Scratch: negative normalized = backward, positive = forward fast
  // Map: -1.0 = -2.0x (reverse), +1.0 = +3.0x (fast forward scratch)
  const newRate = normalized * 2.5;  // -2.5 to +2.5
  s.rate = newRate;

  // Get current position and restart with new rate
  const pos = getCurrentScratchPos(deck);
  scratchStop(deck);
  s.startOffset = Math.max(0, pos);
  s.rate = newRate;

  if(newRate !== 0){
    scratchPlay(deck, s.startOffset);
  }

  if(sig) sig.textContent = 'Scratch: ' + (newRate > 0 ? '+' : '') + newRate.toFixed(2) + 'x';

  // Auto-restore to normal when wheel released
  clearTimeout(_scratchResetTimer);
  _scratchResetTimer = setTimeout(()=>{
    if(s.playing){
      scratchStop(deck);
      s.rate = 1.0;
      scratchPlay(deck);
    }
  }, 200);
}

// Hook loadTo to also load scratch buffer without redeclaring the function.
// Scratch buffer loading handled inside loadTo directly

// ── Boot ──
try{ mappings=JSON.parse(localStorage.getItem('ub_radio_dj_midi_mappings')||'{}')||{}; }catch(e){ mappings={}; }
setVolumes(); renderMappings(); renderDeckQueue('A'); renderDeckQueue('B'); loadQueue();

// ── Audio Output Device Routing ──
// When a MIDI controller is plugged in, route audio to it via setSinkId
async function routeAudioToController(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOuts = devices.filter(d => d.kind === 'audiooutput');
    // Look for Hercules or any external audio device
    const controller = audioOuts.find(d =>
      d.label.toLowerCase().includes('hercules') ||
      d.label.toLowerCase().includes('inpulse') ||
      d.label.toLowerCase().includes('djcontrol')
    );
    if(controller && deckA.setSinkId && deckB.setSinkId){
      await deckA.setSinkId(controller.deviceId);
      await deckB.setSinkId(controller.deviceId);
      note('Audio routed to: ' + controller.label, '#5dff9e');
      console.log('[audio] routed to', controller.label);
    } else {
      // Use default device
      if(deckA.setSinkId) await deckA.setSinkId('default');
      if(deckB.setSinkId) await deckB.setSinkId('default');
    }
  } catch(e){ console.warn('[audio] setSinkId failed:', e.message); }
}

// Re-route audio when MIDI connects (controller may bring its own audio)
window._origConnectMidi = window._connectMidi;
const _origMidiConnect = connectMidi;
// MIDI UI managed by unibeatz-dj-os-v3.js

// Wire MIDI buttons to DJ OS
setTimeout(function(){
  const connectBtn = document.getElementById('connectMidi');
  if(connectBtn) connectBtn.onclick = function(){
    if(window.UniBeatzDJOS && window.UniBeatzDJOS.midi){
      window.UniBeatzDJOS.midi.connect().then(function(ok){
        if(ok) routeAudioToController();
      });
    }
  };
  const learnOnBtn = document.getElementById('startMidiLearn');
  if(learnOnBtn) learnOnBtn.onclick = function(){
    midiLearn = true;
    const s = document.getElementById('midiStatus');
    if(s) s.textContent = 'MIDI Learn ON — touch a control then pick action';
  };
  const learnOffBtn = document.getElementById('stopMidiLearn');
  if(learnOffBtn) learnOffBtn.onclick = function(){
    midiLearn = false;
    const s = document.getElementById('midiStatus');
    if(s) s.textContent = 'MIDI Learn OFF';
  };
}, 800);
