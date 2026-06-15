// radio-player.js — UniBeatz Radio
// Merged: radio-media-session.js + radio-background.js + radio-live-features.js
// Handles: Lock screen controls, background play persistence, live chat, listener count, queue display

// ════════════════════════════════════
// PART 1: MEDIA SESSION + BACKGROUND PLAY
// ════════════════════════════════════
const DEFAULT_ARTWORK = '/unibeatz-radio-cover-v2.svg';
let listenerStartedAudio = false;
let shouldResumeAudio    = false;
let userPausedAudio      = false;
let lastManualPauseAt    = 0;
let lastResumeAttempt    = 0;
let booted               = false;

function player(){ return document.getElementById('radioPlayer'); }

function updateMediaSession(){
  if(!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const audio  = player();
  const title  = cleanTitle(document.getElementById('nowPlayingTitle')?.textContent || '');
  const artist = cleanArtist(document.getElementById('nowPlayingMeta')?.textContent || '');
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist, album: 'UniBeatz Radio',
      artwork: [{ src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.playbackState = audio && !audio.paused ? 'playing' : 'paused';
    if('setPositionState' in navigator.mediaSession && audio && Number.isFinite(audio.duration)){
      navigator.mediaSession.setPositionState({ duration: audio.duration || 0, playbackRate: 1, position: audio.currentTime || 0 });
    }
  } catch(e){ console.warn('[media session]', e); }
}

function cleanTitle(v){ return String(v || 'UniBeatz Radio').replace(/^Now Playing:\s*/i, '').replace(/^Featured Station:\s*/i, '').trim() || 'UniBeatz Radio'; }
function cleanArtist(v){ return String(v || 'UniBeatzProduction').split('•')[0]?.trim() || 'UniBeatzProduction'; }

function markKeepPlaying(){ listenerStartedAudio = true; shouldResumeAudio = true; userPausedAudio = false; updateMediaSession(); }
function markManualPause(){ userPausedAudio = true; shouldResumeAudio = false; lastManualPauseAt = Date.now(); updateMediaSession(); }

async function tryResumeAudio(){
  const audio = player();
  if(!audio || !listenerStartedAudio || userPausedAudio || !shouldResumeAudio || !audio.src) return;
  const now = Date.now();
  if(now - lastResumeAttempt < 700) return;
  lastResumeAttempt = now;
  try{ await audio.play(); markKeepPlaying(); } catch(e){ console.warn('[bg resume]', e); }
}

function setupMediaControls(){
  if(!('mediaSession' in navigator)) return;
  try{
    navigator.mediaSession.setActionHandler('play',  async () => { markKeepPlaying(); try{ await player()?.play(); }catch(e){} updateMediaSession(); });
    // Do NOT kill station on notification pause — resume immediately
    navigator.mediaSession.setActionHandler('pause', () => { markKeepPlaying(); setTimeout(tryResumeAudio, 100); setTimeout(tryResumeAudio, 900); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { markKeepPlaying(); document.getElementById('prevTrack')?.click(); setTimeout(updateMediaSession, 300); });
    navigator.mediaSession.setActionHandler('nexttrack',     () => { markKeepPlaying(); document.getElementById('nextTrack')?.click(); setTimeout(updateMediaSession, 300); });
    try{
      navigator.mediaSession.setActionHandler('seekbackward', () => { const a = player(); if(a) a.currentTime = Math.max(0, a.currentTime - 10); });
      navigator.mediaSession.setActionHandler('seekforward',  () => { const a = player(); if(a && Number.isFinite(a.duration)) a.currentTime = Math.min(a.duration, a.currentTime + 10); });
    } catch(e){}
  } catch(e){ console.warn('[media controls]', e); }
}

function setupMobilePersistence(){
  const audio = player();
  if(!audio) return;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.setAttribute('x-webkit-airplay', 'allow');
  audio.preload = 'auto';

  // Track manual pause via play/pause button
  document.getElementById('playPause')?.addEventListener('click', () => {
    setTimeout(() => {
      const a = player();
      listenerStartedAudio = true;
      if(a?.paused) markManualPause(); else markKeepPlaying();
    }, 180);
  }, { passive: true });

  audio.addEventListener('play',  markKeepPlaying);
  audio.addEventListener('pause', () => {
    const justManual = Date.now() - lastManualPauseAt < 900;
    if(!justManual && listenerStartedAudio){
      shouldResumeAudio = true; userPausedAudio = false;
      setTimeout(tryResumeAudio, 160);
      setTimeout(tryResumeAudio, 1000);
      setTimeout(tryResumeAudio, 2400);
    }
    updateMediaSession();
  });
  audio.addEventListener('stalled', tryResumeAudio);
  audio.addEventListener('canplay', tryResumeAudio);

  document.addEventListener('visibilitychange', () => {
    updateMediaSession();
    if(listenerStartedAudio && !userPausedAudio) shouldResumeAudio = true;
    setTimeout(tryResumeAudio, 180);
    setTimeout(tryResumeAudio, 1100);
    setTimeout(tryResumeAudio, 2500);
  });

  window.addEventListener('focus',    () => tryResumeAudio());
  window.addEventListener('pageshow', () => tryResumeAudio());
  window.addEventListener('online',   () => tryResumeAudio());

  // iOS keep-alive: silent AudioContext keeps audio session open after screen lock
  document.addEventListener('click', function onFirstTap(){
    if(!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    try{
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // near-silent — iOS needs non-zero
      osc.connect(gain); gain.connect(ctx.destination); osc.start();
      console.log('[radio] iOS audio session locked in');
    } catch(e){}
    document.removeEventListener('click', onFirstTap);
  }, { once: true });
}

// ════════════════════════════════════
// PART 2: LIVE FEATURES (chat, listener count, queue)
// Merged from radio-live-features.js
// ════════════════════════════════════
let featuresBuilt = false;

async function buildLiveFeatures(){
  if(featuresBuilt) return;
  const fb = window.UB_FIREBASE;
  if(!fb?.db) return;
  featuresBuilt = true;

  const { collection, query, where, getDocs, addDoc, setDoc, doc, serverTimestamp, onSnapshot, orderBy, limit, getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js').catch(() => ({}));
  const { getAuth: _ga, signInAnonymously: _sia } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js').catch(() => ({}));

  const db   = fb.db;
  const auth = fb.auth;
  const listenerId = (function(){
    let id = localStorage.getItem('ub_radio_listener_id');
    if(!id){ id = 'listener_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); localStorage.setItem('ub_radio_listener_id', id); }
    return id;
  })();

  // Inject features panel
  const main = document.querySelector('main.wrap');
  if(!main || document.getElementById('radioLiveFeatureGrid')) return;
  main.insertAdjacentHTML('beforeend', `
    <section id="radioLiveFeatureGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px">
      <article class="panel">
        <div class="eyebrow">LIVE STATION</div>
        <h2 class="section-title" style="margin-top:2px;font-family:Bebas Neue,sans-serif;font-size:1.8rem;letter-spacing:2px;color:#F0C040;">Now Playing Queue</h2>
        <div id="radioListenerCount" class="badge" style="margin-top:10px;">🎧 0 listeners</div>
        <div id="radioQueueList" style="margin-top:12px;display:grid;gap:8px;"><div class="channel">Loading...</div></div>
      </article>
      <article class="panel">
        <div class="eyebrow">LISTENER TOOLS</div>
        <h2 class="section-title" style="margin-top:2px;font-family:Bebas Neue,sans-serif;font-size:1.8rem;letter-spacing:2px;color:#F0C040;">Live Chat</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;">
          <button id="favoriteTrackBtn" class="btn btn-gold" type="button">❤️ Favorite</button>
          <button id="requestReplayBtn" class="btn btn-blue" type="button">🔁 Replay</button>
        </div>
        <div id="radioChatBox" style="height:200px;overflow-y:auto;border:1px solid rgba(64,208,255,.15);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px;"><div class="channel">Loading chat...</div></div>
        <div style="margin-top:8px;display:grid;gap:6px;">
          <input id="radioChatName"  class="input" placeholder="Your name" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(201,168,76,.25);background:#090d18;color:#fff;"/>
          <input id="radioChatInput" class="input" placeholder="Say something..." style="padding:8px 10px;border-radius:8px;border:1px solid rgba(64,208,255,.25);background:#090d18;color:#fff;" maxlength="300"/>
          <button id="sendRadioChat" class="btn btn-gold" type="button">Send</button>
        </div>
      </article>
    </section>
  `);

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function ensureUser(){ if(!auth.currentUser) await signInAnonymously(auth); return auth.currentUser; }

  // Favorite
  document.getElementById('favoriteTrackBtn')?.addEventListener('click', async () => {
    const title = (document.getElementById('nowPlayingTitle')?.textContent || '').replace(/^Now Playing:\s*/i, '').trim();
    try{
      const user = await ensureUser();
      await setDoc(doc(db, 'radio_favorites', (listenerId + '_' + title).replace(/[^a-zA-Z0-9_-]/g, '_')),
        { listenerId, uid: user.uid || '', trackTitle: title, createdAt: serverTimestamp() }, { merge: true });
      document.getElementById('favoriteTrackBtn').textContent = '❤️ Saved!';
      setTimeout(() => document.getElementById('favoriteTrackBtn').textContent = '❤️ Favorite', 2000);
    } catch(e){ console.warn('Favorite:', e); }
  });

  // Replay request
  document.getElementById('requestReplayBtn')?.addEventListener('click', async () => {
    const title = (document.getElementById('nowPlayingTitle')?.textContent || '').replace(/^Now Playing:\s*/i, '').trim();
    try{
      const user = await ensureUser();
      await addDoc(collection(db, 'radio_replay_requests'),
        { listenerId, uid: user.uid || '', trackTitle: title, status: 'requested', createdAt: serverTimestamp() });
      document.getElementById('requestReplayBtn').textContent = '🔁 Requested!';
      setTimeout(() => document.getElementById('requestReplayBtn').textContent = '🔁 Replay', 2000);
    } catch(e){ console.warn('Replay:', e); }
  });

  // Chat send
  document.getElementById('sendRadioChat')?.addEventListener('click', async () => {
    const input   = document.getElementById('radioChatInput');
    const nameEl  = document.getElementById('radioChatName');
    const message = (input?.value || '').trim();
    const name    = (nameEl?.value || 'Listener').trim().slice(0, 40);
    if(!message) return;
    try{
      const user = await ensureUser();
      await addDoc(collection(db, 'radio_chat'), { listenerId, uid: user.uid || '', displayName: name, message: message.slice(0, 300), createdAt: serverTimestamp() });
      input.value = '';
    } catch(e){ console.warn('Chat send:', e); }
  });
  document.getElementById('radioChatInput')?.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('sendRadioChat')?.click(); });

  // Live chat listener
  try{
    const chatQ = query(collection(db, 'radio_chat'), orderBy('createdAt', 'desc'), limit(30));
    onSnapshot(chatQ, snap => {
      const box = document.getElementById('radioChatBox'); if(!box) return;
      const rows = [];
      snap.forEach(d => rows.push(d.data()));
      if(!rows.length){ box.innerHTML = '<div class="channel">No chat yet. Be first.</div>'; return; }
      box.innerHTML = rows.reverse().map(m =>
        `<div style="font-size:.85rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05);"><b style="color:#40D0FF;">${esc(m.displayName || 'Listener')}:</b> ${esc(m.message || '')}</div>`
      ).join('');
      box.scrollTop = box.scrollHeight;
    });
  } catch(e){ console.warn('Chat listener:', e); }

  // Listener count
  async function updatePresence(){
    try{
      const user = await ensureUser();
      await setDoc(doc(db, 'radio_listeners', listenerId), { listenerId, uid: user.uid || '', active: true, lastSeen: serverTimestamp(), page: 'radio' }, { merge: true });
    } catch(e){}
  }
  updatePresence();
  setInterval(updatePresence, 30000);
  window.addEventListener('beforeunload', () => setDoc(doc(db, 'radio_listeners', listenerId), { active: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {}));

  try{
    onSnapshot(collection(db, 'radio_listeners'), snap => {
      const label = document.getElementById('radioListenerCount'); if(!label) return;
      let count = 0; const now = Date.now();
      snap.forEach(d => { const data = d.data(); if(data.active && (now - (data.lastSeen?.toMillis?.() || 0)) < 120000) count++; });
      label.textContent = '🎧 ' + count + ' listener' + (count === 1 ? '' : 's') + ' live';
    });
  } catch(e){}

  // Queue display
  async function loadQueue(){
    const box = document.getElementById('radioQueueList'); if(!box) return;
    try{
      const [tracksSnap, assetsSnap] = await Promise.all([
        getDocs(query(collection(db, 'radio_submissions'), where('status', '==', 'approved'))),
        getDocs(query(collection(db, 'radio_assets'), where('active', '==', true))).catch(() => ({ docs: [] }))
      ]);
      const items = [
        ...tracksSnap.docs.map(d => ({ type: 'Track', ...d.data() })),
        ...assetsSnap.docs.map(d => ({ type: d.data().type || 'Asset', ...d.data() }))
      ].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      if(!items.length){ box.innerHTML = '<div class="channel">No queue items yet.</div>'; return; }
      box.innerHTML = items.slice(0, 30).map((item, i) =>
        `<div class="channel" style="padding:8px 10px;"><div style="font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:1px;color:#F0C040;">${i+1}. ${esc(item.trackTitle || item.title || 'Untitled')}</div><div style="font-size:.8rem;color:#8d94a5;">${esc(item.artistName || item.genre || item.type || 'Radio')}</div></div>`
      ).join('');
    } catch(e){ box.innerHTML = '<div class="channel">Queue needs Firebase rules.</div>'; }
  }
  loadQueue();
}

// ════════════════════════════════════
// BOOT
// ════════════════════════════════════
function boot(){
  if(booted) return;
  booted = true;
  setupMediaControls();
  setupMobilePersistence();
  updateMediaSession();

  const audio = player();
  audio?.addEventListener('play',            updateMediaSession);
  audio?.addEventListener('pause',           updateMediaSession);
  audio?.addEventListener('loadedmetadata',  updateMediaSession);
  audio?.addEventListener('ended',           updateMediaSession);
  audio?.addEventListener('timeupdate', () => { if(Math.floor(audio.currentTime) % 15 === 0) updateMediaSession(); });

  // Watch now-playing DOM for changes
  const obs = new MutationObserver(updateMediaSession);
  const title = document.getElementById('nowPlayingTitle');
  const meta  = document.getElementById('nowPlayingMeta');
  if(title) obs.observe(title, { childList: true, subtree: true, characterData: true });
  if(meta)  obs.observe(meta,  { childList: true, subtree: true, characterData: true });

  // Build live features after Firebase is ready
  if(window.UB_FIREBASE?.db) buildLiveFeatures();
  else window.addEventListener('ub-firebase-ready', buildLiveFeatures, { once: true });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
window.addEventListener('ub-firebase-ready', boot);
