// unifreestyle-cypher.js
// UniBeatz Production — Phase 2 Stage 1 Cypher Room
// FINAL CLEAN BUILD — replaces all prior cypher scripts.
//
// Fixes baked in:
//   • Race-proof participant adds via Firestore arrayUnion
//   • Reads username from BOTH ub_current_user AND ub_user (Google sign-in stores in ub_user)
//   • Mobile-safe: getDoc() fallback when onSnapshot is slow on mobile networks
//   • Visible debug overlay (toggleable via window.ubCypherDebug = true)
//   • Single source of truth: cypher_rooms/cypher-main
//   • Beat shown from battle_rooms/battle-room (matches Instant Battle)
//   • LiveKit pattern mirrors joinLiveBattleAs() (proven to work)

(function(){
  'use strict';

  // ──────────────────────────────────────────────────────────
  // CONFIG
  // ──────────────────────────────────────────────────────────
  var CYPHER_ROOM_NAME = 'cypher-main';
  var TURN_DURATION_SEC = 60;
  var TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';
  // Set to true via console (window.ubCypherDebug = true) to see the red on-screen log
  var DEBUG = false;

  // ──────────────────────────────────────────────────────────
  // STATE
  // ──────────────────────────────────────────────────────────
  var st = {
    role: null,
    username: null,
    livekitRoom: null,
    livekitConnected: false,
    micOn: true,
    camOn: true,
    cypherDoc: null,
    currentBeat: null,
    docUnsub: null,
    beatUnsub: null,
    timerInterval: null,
    fbMods: null,
    beatAudioEl: null
  };

  // ──────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────
  function isFreestylePage(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function $(id){ return document.getElementById(id); }
  function toast(msg){ if(typeof window.showToast === 'function') return window.showToast(msg); console.log('[cypher]', msg); }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function fmtTime(sec){ if(sec < 0) sec = 0; var m = Math.floor(sec / 60); var s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // Debug overlay — only shows when window.ubCypherDebug = true
  function dbg(label, info){
    if(!DEBUG && !window.ubCypherDebug) return;
    var box = document.getElementById('cyDebugBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'cyDebugBox';
      box.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;z-index:99999;padding:14px;background:#900;color:#fff;border:2px solid #fff;border-radius:8px;font-family:monospace;font-size:12px;line-height:1.4;max-height:60vh;overflow-y:auto;white-space:pre-wrap;word-break:break-all;';
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ CLOSE';
      closeBtn.style.cssText = 'position:sticky;top:0;float:right;padding:6px 12px;background:#fff;color:#900;border:none;border-radius:4px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px;';
      closeBtn.onclick = function(e){ e.stopPropagation(); box.remove(); };
      box.appendChild(closeBtn);
      document.body.appendChild(box);
    }
    var msg = '[' + label + '] ' + (info && info.message ? info.message : (typeof info === 'string' ? info : JSON.stringify(info || '')));
    if(info && info.stack) msg += '\n' + info.stack;
    var line = document.createElement('div');
    line.style.borderBottom = '1px dashed #fff';
    line.style.padding = '4px 0';
    line.textContent = msg;
    box.appendChild(line);
  }

  // FIX 1: Username resolution reads BOTH localStorage keys
  function getCurrentUser(){
    try {
      var raw = localStorage.getItem('ub_current_user') || localStorage.getItem('ub_user');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function resolveUsername(){
    var u = getCurrentUser();
    if(u && (u.username || u.name)) return (u.username || u.name);
    return 'guest_' + Math.floor(Math.random() * 9999);
  }

  // ──────────────────────────────────────────────────────────
  // FIRESTORE — lazy load, cached
  // ──────────────────────────────────────────────────────────
  async function getFb(){
    if(st.fbMods) return st.fbMods;
    var fb = window.UB_FIREBASE;
    if(!fb || !fb.app) throw new Error('Firebase not ready');
    var mod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    var db = mod.getFirestore(fb.app);
    st.fbMods = { mod: mod, db: db };
    return st.fbMods;
  }

  async function ensureCypherDoc(){
    var f = await getFb();
    var ref = f.mod.doc(f.db, 'cypher_rooms', CYPHER_ROOM_NAME);
    var snap = await f.mod.getDoc(ref);
    if(!snap.exists()){
      await f.mod.setDoc(ref, {
        status: 'waiting',
        participants: [],
        currentTurnIndex: -1,
        turnStartTime: null,
        turnDuration: TURN_DURATION_SEC,
        djUsername: '',
        sessionName: 'Open Cypher Session',
        autoRotate: true,
        updatedAt: f.mod.serverTimestamp()
      });
    }
    return ref;
  }

  async function startCypherListener(){
    if(st.docUnsub) return;
    var f = await getFb();
    var ref = await ensureCypherDoc();
    st.docUnsub = f.mod.onSnapshot(ref, function(snap){
      if(!snap.exists()) return;
      st.cypherDoc = snap.data();
      dbg('listener:fired', 'count=' + (st.cypherDoc.participants || []).length);
      render();
    }, function(err){ dbg('listener:ERROR', err); });
  }

  async function startBeatListener(){
    if(st.beatUnsub) return;
    try {
      var f = await getFb();
      var ref = f.mod.doc(f.db, 'battle_rooms', 'battle-room');
      st.beatUnsub = f.mod.onSnapshot(ref, function(snap){
        if(!snap.exists()) return;
        st.currentBeat = snap.data().selectedBeat || null;
        renderBeatUI();
      });
    } catch(e){ dbg('beatListener:ERROR', e); }
  }

  // FIX 2: Race-proof participant add via arrayUnion + mobile-safe getDoc fallback
  async function addMeToParticipants(role){
    var f = await getFb();
    var ref = f.mod.doc(f.db, 'cypher_rooms', CYPHER_ROOM_NAME);

    // Step 1: Read current doc (works even if onSnapshot hasn't fired yet — mobile-safe)
    var snap = await f.mod.getDoc(ref);
    var existing = [];
    if(snap.exists()){
      existing = (snap.data().participants || []).filter(function(p){
        return p.username !== st.username;
      });
    }

    // Step 2: Write filtered list back (removes any stale entry for same user)
    if(snap.exists()){
      await f.mod.setDoc(ref, { participants: existing }, { merge: true });
    }

    // Step 3: Add self atomically via arrayUnion — race-proof across simultaneous clients
    var me = {
      username: st.username,
      role: role,
      joinedAt: Date.now()
    };
    var updates = {
      participants: f.mod.arrayUnion(me),
      updatedAt: f.mod.serverTimestamp()
    };
    if(role === 'dj') updates.djUsername = st.username;
    var statusNow = snap.exists() ? (snap.data().status || 'waiting') : 'waiting';
    if(statusNow === 'ended') updates.status = 'waiting';
    await f.mod.setDoc(ref, updates, { merge: true });

    // Step 4: Verify (mobile-safe — confirm write landed)
    var verify = await f.mod.getDoc(ref);
    var verifyParts = verify.exists() ? (verify.data().participants || []) : [];
    dbg('addMe:verified', 'count=' + verifyParts.length);

    // Step 5: Update local cache immediately so render() can run without waiting for listener
    if(verify.exists()) st.cypherDoc = verify.data();
  }

  async function removeMeFromParticipants(){
    try {
      var f = await getFb();
      var ref = f.mod.doc(f.db, 'cypher_rooms', CYPHER_ROOM_NAME);
      var snap = await f.mod.getDoc(ref);
      if(!snap.exists()) return;
      var data = snap.data();
      var oldList = data.participants || [];
      var participants = oldList.filter(function(p){ return p.username !== st.username; });
      var updates = { participants: participants, updatedAt: f.mod.serverTimestamp() };
      var curIdx = data.currentTurnIndex;
      if(curIdx >= 0 && oldList[curIdx] && oldList[curIdx].username === st.username){
        updates.currentTurnIndex = -1;
        updates.turnStartTime = null;
      }
      if(data.djUsername === st.username){
        updates.djUsername = '';
      }
      await f.mod.setDoc(ref, updates, { merge: true });
    } catch(e){ dbg('removeMe:ERROR', e); }
  }

  async function updateCypherDoc(updates){
    try {
      var f = await getFb();
      var ref = f.mod.doc(f.db, 'cypher_rooms', CYPHER_ROOM_NAME);
      updates.updatedAt = f.mod.serverTimestamp();
      await f.mod.setDoc(ref, updates, { merge: true });
    } catch(e){ dbg('update:ERROR', e); toast('⚠️ Sync failed: ' + e.message); }
  }

  function isMeDj(){
    return st.role === 'dj' || (st.cypherDoc && st.cypherDoc.djUsername === st.username);
  }

  function myIndex(){
    if(!st.cypherDoc || !st.cypherDoc.participants) return -1;
    return st.cypherDoc.participants.findIndex(function(p){ return p.username === st.username; });
  }

  function isMyTurn(){
    if(!st.cypherDoc || st.cypherDoc.status !== 'live') return false;
    return myIndex() === st.cypherDoc.currentTurnIndex;
  }

  // ──────────────────────────────────────────────────────────
  // LIVEKIT — mirrors joinLiveBattleAs pattern
  // ──────────────────────────────────────────────────────────
  async function waitForLiveKit(maxMs){
    if(window.LivekitClient) return window.LivekitClient;
    var start = Date.now();
    while(Date.now() - start < (maxMs || 5000)){
      await new Promise(function(r){ setTimeout(r, 100); });
      if(window.LivekitClient) return window.LivekitClient;
    }
    throw new Error('LiveKit SDK did not load');
  }

  async function connectLiveKit(role){
    var LK = await waitForLiveKit();
    var url = TOKEN_FN + '?room=' + encodeURIComponent(CYPHER_ROOM_NAME) + '&username=' + encodeURIComponent(st.username);
    var resp = await fetch(url);
    var data = await resp.json();
    if(!resp.ok || !data.token || !data.url) throw new Error(data.error || 'Token fetch failed');

    var room = new LK.Room({ adaptiveStream: true, dynacast: true });
    st.livekitRoom = room;

    room.on('trackSubscribed', function(track, publication, participant){
      attachRemoteTrack(track, participant);
    });
    room.on('trackUnsubscribed', function(track, publication, participant){
      detachRemoteTrack(track, participant);
    });
    room.on('participantDisconnected', function(p){ removeRemoteTile(p.identity); });
    room.on('disconnected', function(){ st.livekitConnected = false; });

    await room.connect(data.url, data.token);
    st.livekitConnected = true;

    // DJ publishes immediately; artists wait for their turn (controlled by syncMyMediaToTurn)
    if(role === 'dj'){
      await room.localParticipant.enableCameraAndMicrophone();
      attachLocalTracks();
    }
  }

  function attachLocalTracks(){
    if(!st.livekitRoom) return;
    st.livekitRoom.localParticipant.trackPublications.forEach(function(pub){
      if(pub.track) attachLocalTrack(pub.track);
    });
  }

  function attachLocalTrack(track){
  if(!track || track.kind !== 'video') return;
  var tile = ensureTile(st.username, true);
  if(!tile) return;
  var existing = tile.querySelector('video');
  if(existing) existing.remove();
  var vid = document.createElement('video');
  vid.autoplay = true; vid.muted = true; vid.playsInline = true;
  vid.style.cssText = 'position:absolute;top:-10%;left:-10%;width:120%;height:120%;object-fit:cover;';
  tile.appendChild(vid);
  track.attach(vid);
}

 function attachRemoteTrack(track, participant){
    var identity = participant.identity;
    if(track.kind === 'audio'){
      var aud = track.attach();
      aud.id = 'cy-aud-' + identity;
      aud.autoplay = true;
      aud.playsInline = true;
      document.body.appendChild(aud);
      return;
    }
    if(track.kind === 'video'){
      var tile = ensureTile(identity, false);
      if(!tile) return;
      var existing = tile.querySelector('video');
      if(existing) existing.remove();
      var vid = document.createElement('video');
      vid.autoplay = true; vid.playsInline = true;
      vid.style.cssText = 'position:absolute;top:-10%;left:-10%;width:120%;height:120%;object-fit:cover;';
      tile.appendChild(vid);
      track.attach(vid);
    }
  }

  function detachRemoteTrack(track, participant){
    if(track.kind === 'audio'){
      var aud = document.getElementById('cy-aud-' + participant.identity);
      if(aud) aud.remove();
    } else if(track.kind === 'video'){
      var tile = document.getElementById('cy-tile-' + participant.identity);
      if(tile){ var v = tile.querySelector('video'); if(v) v.remove(); }
    }
  }

  function removeRemoteTile(identity){
    var tile = document.getElementById('cy-tile-' + identity);
    if(tile) tile.remove();
    var aud = document.getElementById('cy-aud-' + identity);
    if(aud) aud.remove();
  }

  async function syncMyMediaToTurn(){
    if(!st.livekitConnected || st.role !== 'artist') return;
    var room = st.livekitRoom;
    if(!room) return;
    var myTurn = isMyTurn();
    try {
      if(myTurn){
        await room.localParticipant.setCameraEnabled(st.camOn);
        await room.localParticipant.setMicrophoneEnabled(st.micOn);
        attachLocalTracks();
      } else {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);
        var tile = document.getElementById('cy-tile-' + st.username);
        if(tile){ var v = tile.querySelector('video'); if(v) v.remove(); }
      }
    } catch(e){ dbg('syncMedia:ERROR', e); }
  }

  // ──────────────────────────────────────────────────────────
  // BEAT (local DJ play)
  // ──────────────────────────────────────────────────────────
  function ensureBeatAudio(){
    if(st.beatAudioEl) return st.beatAudioEl;
    var el = document.createElement('audio');
    el.id = 'cyBeatAudio';
    el.controls = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.style.cssText = 'width:100%;margin-top:10px;display:none;';
    var panel = $('cyDjPanel');
    if(panel) panel.appendChild(el);
    st.beatAudioEl = el;
    return el;
  }

  function playBeatLocally(){
    if(!st.currentBeat || !st.currentBeat.audioUrl){ toast('No beat. Pick one in Instant Battle first.'); return; }
    var el = ensureBeatAudio();
    el.style.display = 'block';
    el.src = st.currentBeat.audioUrl;
    el.load();
    el.play().catch(function(){ toast('🎧 Beat loaded. Tap the audio bar to play.'); });
  }

  function stopBeatLocally(){
    if(st.beatAudioEl){ try { st.beatAudioEl.pause(); st.beatAudioEl.currentTime = 0; } catch(e){} }
  }

  // ──────────────────────────────────────────────────────────
  // TILES + CIRCLE LAYOUT
  // ──────────────────────────────────────────────────────────
  function ensureTile(identity, isMe){
    var wrap = $('cyCircleWrap');
    if(!wrap) return null;
    var tile = document.getElementById('cy-tile-' + identity);
    if(tile) return tile;

    tile = document.createElement('div');
    tile.id = 'cy-tile-' + identity;
    tile.className = 'cy-tile' + (isMe ? ' cy-tile-me' : '');
    tile.style.cssText = 'position:absolute;width:14%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(64,208,255,.4);background:rgba(0,0,0,.55);overflow:hidden;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1px;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.4);';

    var label = document.createElement('div');
    label.className = 'cy-tile-label';
    label.style.cssText = 'position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);padding:3px 8px;background:rgba(0,0,0,.7);border-radius:10px;font-size:.46rem;letter-spacing:1.5px;white-space:nowrap;color:#F0C040;font-family:Orbitron,sans-serif;';
    label.textContent = identity;
    tile.appendChild(label);

    var ph = document.createElement('div');
    ph.className = 'cy-tile-silhouette';
    ph.style.cssText = 'font-size:2rem;opacity:.5;';
    ph.textContent = '🎤';
    tile.appendChild(ph);

    wrap.appendChild(tile);
    return tile;
  }

  function layoutTiles(){
    if(!st.cypherDoc) return;
    var participants = st.cypherDoc.participants || [];
    var wrap = $('cyCircleWrap');
    if(!wrap) return;

    var existing = wrap.querySelectorAll('.cy-tile');
    var valid = participants.map(function(p){ return p.username; });
    existing.forEach(function(t){
      var id = t.id.replace('cy-tile-', '');
      if(valid.indexOf(id) === -1) t.remove();
    });

    var count = participants.length;
    if(count === 0) return;
    var radius = 38;

    participants.forEach(function(p, idx){
      var tile = ensureTile(p.username, p.username === st.username);
      if(!tile) return;
      var angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
      var x = 50 + radius * Math.cos(angle);
      var y = 50 + radius * Math.sin(angle);
      tile.style.left = 'calc(' + x + '% - 7%)';
      tile.style.top  = 'calc(' + y + '% - 7%)';
      tile.classList.remove('cy-active', 'cy-up-next', 'cy-dj');
      tile.style.borderColor = 'rgba(64,208,255,.4)';
      tile.style.boxShadow = '0 6px 18px rgba(0,0,0,.4)';
      if(p.role === 'dj'){
        tile.classList.add('cy-dj');
        tile.style.borderColor = '#C9A84C';
      }
    });

    var curIdx = (typeof st.cypherDoc.currentTurnIndex === 'number') ? st.cypherDoc.currentTurnIndex : -1;
    if(curIdx >= 0 && participants[curIdx]){
      var activeTile = document.getElementById('cy-tile-' + participants[curIdx].username);
      if(activeTile){
        activeTile.classList.add('cy-active');
        activeTile.style.borderColor = '#F0C040';
        activeTile.style.boxShadow = '0 0 24px rgba(240,192,64,.7),0 6px 18px rgba(0,0,0,.4)';
      }
      for(var i = 1; i <= participants.length; i++){
        var nIdx = (curIdx + i) % participants.length;
        if(participants[nIdx] && participants[nIdx].role === 'artist' && nIdx !== curIdx){
          var nTile = document.getElementById('cy-tile-' + participants[nIdx].username);
          if(nTile){
            nTile.classList.add('cy-up-next');
            nTile.style.borderColor = '#40D0FF';
          }
          break;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  function renderCenter(){
    var s = st.cypherDoc; if(!s) return;
    var label = $('cyCenterLabel'), name = $('cyCenterName'), time = $('cyCenterTime');
    var participants = s.participants || [];
    var curIdx = s.currentTurnIndex;
    if(s.status === 'waiting'){
      if(label) label.textContent = 'WAITING';
      if(name)  name.textContent  = participants.length + ' joined';
      if(time){ time.textContent  = '--'; time.classList.remove('urgent'); }
    } else if(s.status === 'live' && curIdx >= 0 && participants[curIdx]){
      if(label) label.textContent = 'ON THE MIC';
      if(name)  name.textContent  = participants[curIdx].username;
    } else if(s.status === 'ended'){
      if(label) label.textContent = 'ENDED';
      if(name)  name.textContent  = '—';
      if(time){ time.textContent  = '--'; time.classList.remove('urgent'); }
    }
  }

  function renderQueue(){
    var list = $('cyQueueList'); if(!list) return;
    var s = st.cypherDoc; if(!s){ list.innerHTML = '<span class="cy-queue-empty">Waiting…</span>'; return; }
    var participants = s.participants || [];
    var artists = participants.filter(function(p){ return p.role === 'artist'; });
    if(!artists.length){ list.innerHTML = '<span class="cy-queue-empty">Waiting for artists to join…</span>'; return; }
    var curIdx = s.currentTurnIndex;
    list.innerHTML = '';
    artists.forEach(function(p){
      var span = document.createElement('span');
      span.className = 'cy-q-item';
      var gIdx = participants.indexOf(p);
      if(gIdx === curIdx) span.classList.add('current');
      span.textContent = p.username;
      list.appendChild(span);
    });
  }

  function renderMeta(){
    var meta = $('cyMeta'); if(!meta) return;
    var s = st.cypherDoc;
    var count = (s && s.participants) ? s.participants.length : 0;
    meta.textContent = count + ' participant' + (count === 1 ? '' : 's');
    var sessionName = $('cySessionName');
    if(sessionName && s && s.sessionName) sessionName.textContent = s.sessionName;
  }

  function renderDjPanel(){
    var panel = $('cyDjPanel'); if(!panel) return;
    panel.style.display = isMeDj() ? 'block' : 'none';
    var autoBtn = $('cyAutoBtn');
    if(autoBtn && st.cypherDoc) autoBtn.textContent = '🔁 Auto-Rotate: ' + (st.cypherDoc.autoRotate !== false ? 'ON' : 'OFF');
  }

  function renderBeatUI(){
    var panel = $('cyDjPanel'); if(!panel) return;
    if(!isMeDj()) return;
    var info = $('cyBeatInfo');
    if(!info){
      info = document.createElement('div');
      info.id = 'cyBeatInfo';
      info.style.cssText = 'margin-top:10px;padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.35);background:rgba(0,0,0,.35);color:#fff;font-family:Rajdhani,sans-serif;line-height:1.4;';
      panel.appendChild(info);
    }
    if(st.currentBeat && st.currentBeat.name){
      var meta = [st.currentBeat.genre, st.currentBeat.bpm ? st.currentBeat.bpm + ' BPM' : '', st.currentBeat.key].filter(Boolean).join(' · ');
      info.innerHTML =
        '<div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:#40D0FF;margin-bottom:4px;">CURRENT BATTLE BEAT</div>' +
        '<div style="font-family:Bebas Neue,sans-serif;font-size:1.2rem;letter-spacing:2px;color:#F0C040;">' + esc(st.currentBeat.name) + '</div>' +
        '<div style="font-size:.78rem;color:rgba(240,237,232,.65);margin:2px 0 8px;">' + esc(meta) + '</div>' +
        '<button id="cyBeatPlay" style="width:100%;padding:9px;border-radius:7px;border:1px solid #40D0FF;background:rgba(64,208,255,.14);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;cursor:pointer;">▶ PLAY BEAT</button>';
      var playBtn = $('cyBeatPlay');
      if(playBtn) playBtn.onclick = function(e){ e.preventDefault(); playBeatLocally(); };
      ensureBeatAudio();
    } else {
      info.innerHTML = '<div style="color:rgba(240,237,232,.7);font-size:.86rem;">No beat selected yet. Pick one from Instant Battle → DJ Beat Selector.</div>';
    }
  }

  function render(){
  if(!st.cypherDoc) return;
  layoutTiles();
  renderCenter();
  renderQueue();
  renderMeta();
  renderDjPanel();
  renderBeatUI();
  syncMyMediaToTurn();
  // After tiles are laid out, re-attach local cam to its tile (handles DJ + artist alike)
  reattachMyCamIfNeeded();
}

function reattachMyCamIfNeeded(){
  if(!st.livekitRoom || !st.username) return;
  var myTile = document.getElementById('cy-tile-' + st.username);
  if(!myTile) return;
  // If tile already has a video, do nothing
  if(myTile.querySelector('video')) return;
  // Find published cam track and attach
  st.livekitRoom.localParticipant.trackPublications.forEach(function(pub){
    if(pub.track && pub.track.kind === 'video') attachLocalTrack(pub.track);
  });
}

  // ──────────────────────────────────────────────────────────
  // TIMER
  // ──────────────────────────────────────────────────────────
  function startTimer(){
    if(st.timerInterval) return;
    st.timerInterval = setInterval(function(){
      var s = st.cypherDoc;
      var time = $('cyCenterTime');
      if(!time || !s) return;
      if(s.status !== 'live' || !s.turnStartTime){
        time.textContent = '--';
        time.classList.remove('urgent');
        return;
      }
      var elapsed = Math.floor((Date.now() - s.turnStartTime) / 1000);
      var remaining = (s.turnDuration || TURN_DURATION_SEC) - elapsed;
      time.textContent = fmtTime(Math.max(0, remaining));
      time.classList.toggle('urgent', remaining <= 10);
      if(remaining <= 0 && isMeDj() && s.autoRotate !== false) cyAdvanceTurn();
    }, 500);
  }
  function stopTimer(){ if(st.timerInterval){ clearInterval(st.timerInterval); st.timerInterval = null; } }

  // ──────────────────────────────────────────────────────────
  // PUBLIC ACTIONS
  // ──────────────────────────────────────────────────────────
  async function joinCypher(role){
    try {
      var clean = String(role || 'artist').toLowerCase();
      if(clean === 'watch') clean = 'viewer';
      if(['artist','dj','viewer'].indexOf(clean) === -1) clean = 'artist';

      st.role = clean;
      st.username = resolveUsername();
      dbg('join:start', 'role=' + clean + ' user=' + st.username);

      document.body.setAttribute('data-cypher-role', clean);
      var joinRow = $('cyJoinRow');
      if(joinRow) joinRow.style.display = 'none';

      await startCypherListener();
      await startBeatListener();
      startTimer();

      if(clean === 'artist' || clean === 'dj'){
        try {
          await connectLiveKit(clean);
        } catch(e){
          dbg('LiveKit:FAILED', e);
          toast('⚠️ Camera connect failed: ' + (e.message || e));
        }
      }

      // Add to participants — mobile-safe (does its own getDoc, doesn't wait for onSnapshot)
      await addMeToParticipants(clean);

      // Render once with the verified data
      render();

      toast(clean === 'dj' ? '🎧 Joined as DJ' :
            clean === 'artist' ? '🎤 Joined as Artist — wait your turn' :
            '👁️ Watching');
    } catch(e){
      dbg('join:CRASHED', e);
      toast('⚠️ Join failed: ' + (e.message || e));
    }
  }

  async function cyStartSession(){
    if(!isMeDj()){ toast('Only the DJ can start the cypher'); return; }
    // Re-fetch fresh participants before start (mobile-safe)
    var f = await getFb();
    var snap = await f.mod.getDoc(f.mod.doc(f.db, 'cypher_rooms', CYPHER_ROOM_NAME));
    var participants = snap.exists() ? (snap.data().participants || []) : [];
    var firstArtist = participants.findIndex(function(p){ return p.role === 'artist'; });
    if(firstArtist === -1){ toast('Need at least one artist'); return; }
    await updateCypherDoc({ status: 'live', currentTurnIndex: firstArtist, turnStartTime: Date.now() });
    toast('🎤 Cypher started!');
  }

  async function cyAdvanceTurn(){
    if(!isMeDj()){ toast('Only the DJ can rotate turns'); return; }
    var participants = (st.cypherDoc && st.cypherDoc.participants) || [];
    if(!participants.length) return;
    var curIdx = (st.cypherDoc && typeof st.cypherDoc.currentTurnIndex === 'number') ? st.cypherDoc.currentTurnIndex : -1;
    var nextIdx = -1;
    for(var i = 1; i <= participants.length; i++){
      var cand = ((curIdx === -1 ? 0 : curIdx) + i) % participants.length;
      if(participants[cand] && participants[cand].role === 'artist'){ nextIdx = cand; break; }
    }
    if(nextIdx === -1){ toast('No artists to rotate to'); return; }
    await updateCypherDoc({ currentTurnIndex: nextIdx, turnStartTime: Date.now() });
  }

  async function cyEndSession(){
    if(!isMeDj()){ toast('Only the DJ can end the cypher'); return; }
    if(!confirm('End this cypher session?')) return;
    await updateCypherDoc({ status: 'ended', currentTurnIndex: -1, turnStartTime: null });
    stopBeatLocally();
    toast('⏹ Cypher ended');
  }

  async function cyToggleAutoRotate(){
    if(!isMeDj()){ toast('Only the DJ controls auto-rotate'); return; }
    var newVal = !(st.cypherDoc && st.cypherDoc.autoRotate !== false);
    await updateCypherDoc({ autoRotate: newVal });
  }

  function cyStartRename(){
    var inp = $('cyRenameInput'); var name = $('cySessionName'); var btn = $('cyRenameBtn');
    if(!inp || !name) return;
    inp.value = name.textContent;
    inp.style.display = 'inline-block';
    name.style.display = 'none';
    if(btn) btn.style.display = 'none';
    inp.focus(); inp.select();
  }
  async function cyCommitRename(){
    var inp = $('cyRenameInput'); var name = $('cySessionName'); var btn = $('cyRenameBtn');
    if(!inp) return;
    var val = (inp.value || '').trim();
    if(val){
      if(isMeDj()) await updateCypherDoc({ sessionName: val });
      else { if(name) name.textContent = val; toast('Only DJ can rename for everyone'); }
    }
    inp.style.display = 'none';
    if(name) name.style.display = '';
    if(btn) btn.style.display = '';
  }
  function cyCancelRename(){
    var inp = $('cyRenameInput'); var name = $('cySessionName'); var btn = $('cyRenameBtn');
    if(inp) inp.style.display = 'none';
    if(name) name.style.display = '';
    if(btn) btn.style.display = '';
  }

  async function toggleCypherMic(){
    if(!st.livekitRoom){ toast('Not connected'); return; }
    st.micOn = !st.micOn;
    try { await st.livekitRoom.localParticipant.setMicrophoneEnabled(st.micOn); } catch(e){}
    var btn = $('cyMicBtn'); if(btn) btn.textContent = st.micOn ? '🎤' : '🔇';
    toast(st.micOn ? '🎤 Mic on' : '🔇 Mic off');
  }

  async function leaveCypher(){
    stopTimer();
    stopBeatLocally();
    try { await removeMeFromParticipants(); } catch(e){}
    if(st.livekitRoom){
      try { st.livekitRoom.disconnect(); } catch(e){}
      st.livekitRoom = null;
      st.livekitConnected = false;
    }
    if(st.docUnsub){ try { st.docUnsub(); } catch(e){} st.docUnsub = null; }
    if(st.beatUnsub){ try { st.beatUnsub(); } catch(e){} st.beatUnsub = null; }
    st.role = null;
    st.cypherDoc = null;
    document.body.removeAttribute('data-cypher-role');
    var joinRow = $('cyJoinRow'); if(joinRow) joinRow.style.display = '';
  }

  // ──────────────────────────────────────────────────────────
  // HOME PAGE LAUNCHER
  // ──────────────────────────────────────────────────────────
  function injectHomeCypherCard(){
    var homeBody = document.querySelector('#page-home .page-body');
    if(!homeBody || document.getElementById('ub-cypher-launch')) return;
    var card = document.createElement('div');
    card.id = 'ub-cypher-launch';
    card.setAttribute('role', 'button');
    card.onclick = function(){ if(typeof window.goToPage === 'function') window.goToPage('cypher'); };
    card.style.cssText = 'display:block;margin:16px 0 18px;padding:16px;border-radius:14px;border:1px solid rgba(201,168,76,.65);background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(0,170,255,.13));box-shadow:0 18px 40px rgba(0,0,0,.38),0 0 18px rgba(0,170,255,.14);cursor:pointer;color:#fff;';
    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;">' +
        '<div style="font-size:2.4rem;line-height:1;">🌀</div>' +
        '<div style="flex:1;">' +
          '<div style="display:inline-block;margin-bottom:7px;padding:4px 9px;border-radius:999px;border:1px solid #40D0FF;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;font-weight:900;">NEW MODE · LIVE</div>' +
          '<div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:1.65rem;letter-spacing:2px;line-height:1.05;">CYPHER ROOM</div>' +
          '<div style="color:rgba(240,237,232,.78);font-size:.86rem;margin-top:5px;">Multi-artist freestyle circle · 60-sec turns · DJ controls rotation</div>' +
        '</div>' +
        '<div style="font-size:1.55rem;color:#C9A84C;">→</div>' +
      '</div>';
    var actionRow = homeBody.querySelector('.home-action-row');
    if(actionRow) actionRow.insertAdjacentElement('afterend', card);
    else homeBody.insertBefore(card, homeBody.firstChild);
  }

  // ──────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────
  function boot(){
    if(!isFreestylePage()) return;

    window.joinCypher        = joinCypher;
    window.cyStartSession    = cyStartSession;
    window.cyAdvanceTurn     = cyAdvanceTurn;
    window.cyEndSession      = cyEndSession;
    window.cyToggleAutoRotate= cyToggleAutoRotate;
    window.cyStartRename     = cyStartRename;
    window.cyCommitRename    = cyCommitRename;
    window.cyCancelRename    = cyCancelRename;
    window.toggleCypherMic   = toggleCypherMic;
    window.leaveCypher       = leaveCypher;

    injectHomeCypherCard();

    var lastHomeBody = null;
    setInterval(function(){
      var hb = document.querySelector('#page-home .page-body');
      if(hb && hb !== lastHomeBody){
        lastHomeBody = hb;
        injectHomeCypherCard();
      }
    }, 2000);

    setTimeout(function(){
      var backBtn = document.querySelector('#page-cypher .top-bar .icon-btn');
      if(backBtn){
        backBtn.onclick = async function(){
          await leaveCypher();
          if(typeof window.goToPage === 'function') window.goToPage('home');
        };
      }
    }, 800);

    window.ubCypher = {
      state: st,
      join: joinCypher,
      leave: leaveCypher,
      start: cyStartSession,
      next: cyAdvanceTurn,
      end: cyEndSession
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
