// unifreestyle-cypher-engine.js
// PHASE 2 STAGE 1 — Real cypher mechanics layered on top of cypher-fix.js
// Adds: LiveKit cam/mic publishing + Firestore turn sync + 60-sec timer + cam rotation.
// Does NOT touch beat selection (cypher-fix.js handles that).
// Single shared room: 'cypher-main'. Unlimited artists. Join order rotation.
(function(){
  // ──────────────────────────────────────────────────────────
  // CONFIG
  // ──────────────────────────────────────────────────────────
  var ROOM_NAME = 'cypher-main';
  var TURN_DURATION_SEC = 60;
  var TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';
  var FIRESTORE_DOC_PATH = ['cypher_rooms', ROOM_NAME];

  // STATE
  var state = {
    livekitRoom: null,
    livekitConnected: false,
    role: null,
    myUsername: null,
    camTrack: null,
    micTrack: null,
    docUnsubscribe: null,
    cypherState: null,
    turnTimerInterval: null,
    isFirestoreReady: false
  };

  // HELPERS
  function isFreestylePage(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function getCurrentUser(){ try { var raw = localStorage.getItem('ub_current_user'); return raw ? JSON.parse(raw) : null; } catch(e) { return null; } }
  function getMyUsername(){ var u = getCurrentUser(); if(u && (u.username || u.name)) return u.username || u.name; return 'guest_' + Math.floor(Math.random() * 9999); }
  function toast(msg){ if(typeof window.showToast === 'function') return window.showToast(msg); console.log('[cypher]', msg); }
  function fmtTime(sec){ if(sec < 0) sec = 0; var m = Math.floor(sec / 60); var s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  function waitForLiveKit(maxMs){
    return new Promise(function(resolve, reject){
      var start = Date.now();
      function check(){
        if(typeof window.LivekitClient !== 'undefined' || typeof window.LiveKit !== 'undefined') return resolve(window.LivekitClient || window.LiveKit);
        if(Date.now() - start > (maxMs || 8000)) return reject(new Error('LiveKit SDK timeout'));
        setTimeout(check, 100);
      }
      check();
    });
  }
  function waitForFirebase(maxMs){
    return new Promise(function(resolve, reject){
      var start = Date.now();
      function check(){
        if(window.UB_FIREBASE && window.UB_FIREBASE.ready) return resolve(window.UB_FIREBASE);
        if(Date.now() - start > (maxMs || 8000)) return reject(new Error('Firebase not ready'));
        setTimeout(check, 100);
      }
      check();
    });
  }

  // FIRESTORE
  async function getFirestoreRef(){ var fb = await waitForFirebase(); return fb.doc(fb.db, FIRESTORE_DOC_PATH[0], FIRESTORE_DOC_PATH[1]); }
  async function ensureCypherDoc(){
    var fb = window.UB_FIREBASE;
    var ref = await getFirestoreRef();
    var snap = await fb.getDoc(ref);
    if(!snap.exists()){
      await fb.setDoc(ref, { status: 'waiting', participants: [], currentTurnIndex: -1, turnStartTime: null, turnDuration: TURN_DURATION_SEC, djUsername: '', sessionName: 'Open Cypher Session', updatedAt: fb.serverTimestamp() });
    }
    return ref;
  }
  function startFirestoreListener(){
    if(state.docUnsubscribe) return;
    waitForFirebase().then(async function(fb){
      var ref = await ensureCypherDoc();
      state.docUnsubscribe = fb.onSnapshot(ref, function(snap){
        if(!snap.exists()) return;
        state.cypherState = snap.data();
        state.isFirestoreReady = true;
        renderCypherFromState();
      }, function(err){ console.warn('[cypher] Firestore listener error', err); });
    }).catch(function(e){ console.warn('[cypher] Cannot start Firestore listener', e); });
  }
  function stopFirestoreListener(){ if(state.docUnsubscribe){ try { state.docUnsubscribe(); } catch(e) {} state.docUnsubscribe = null; } }
  async function updateCypherDoc(updates){
    try {
      var fb = window.UB_FIREBASE;
      var ref = await getFirestoreRef();
      updates.updatedAt = fb.serverTimestamp();
      await fb.setDoc(ref, updates, { merge: true });
    } catch(e){ console.warn('[cypher] Firestore update failed', e); toast('⚠️ Sync failed: ' + e.message); }
  }

  // PARTICIPANTS
  async function addMeToParticipants(role){
    var u = getCurrentUser();
    var participants = (state.cypherState && state.cypherState.participants) || [];
    participants = participants.filter(function(p){ return p.username !== state.myUsername; });
    participants.push({ uid: (u && u.uid) || state.myUsername, username: state.myUsername, role: role, joinedAt: Date.now() });
    var updates = { participants: participants };
    if(role === 'dj') updates.djUsername = state.myUsername;
    await updateCypherDoc(updates);
  }
  async function removeMeFromParticipants(){
    if(!state.cypherState) return;
    var participants = (state.cypherState.participants || []).filter(function(p){ return p.username !== state.myUsername; });
    var updates = { participants: participants };
    var curIdx = state.cypherState.currentTurnIndex;
    var oldList = state.cypherState.participants || [];
    if(curIdx >= 0 && oldList[curIdx] && oldList[curIdx].username === state.myUsername){
      updates.currentTurnIndex = -1; updates.turnStartTime = null;
    }
    await updateCypherDoc(updates);
  }

  // DJ CONTROLS
  function isMeDj(){ return state.role === 'dj' || (state.cypherState && state.cypherState.djUsername === state.myUsername); }
  async function djStartCypher(){
    if(!isMeDj()){ toast('Only the DJ can start the cypher'); return; }
    var participants = (state.cypherState && state.cypherState.participants) || [];
    var firstArtistIdx = participants.findIndex(function(p){ return p.role === 'artist'; });
    if(firstArtistIdx === -1){ toast('No artists in the room yet'); return; }
    await updateCypherDoc({ status: 'live', currentTurnIndex: firstArtistIdx, turnStartTime: Date.now() });
    toast('🎤 Cypher started!');
  }
  async function djAdvanceTurn(){ if(!isMeDj()){ toast('Only the DJ can advance turns'); return; } advanceToNextArtist(); }
  async function advanceToNextArtist(){
    var participants = (state.cypherState && state.cypherState.participants) || [];
    if(!participants.length) return;
    var curIdx = (state.cypherState && state.cypherState.currentTurnIndex) || 0;
    var nextIdx = -1;
    for(var i = 1; i <= participants.length; i++){
      var candidate = (curIdx + i) % participants.length;
      if(participants[candidate] && participants[candidate].role === 'artist'){ nextIdx = candidate; break; }
    }
    if(nextIdx === -1){ toast('No artists to rotate to'); return; }
    await updateCypherDoc({ currentTurnIndex: nextIdx, turnStartTime: Date.now() });
  }
  async function djEndCypher(){
    if(!isMeDj()){ toast('Only the DJ can end the cypher'); return; }
    await updateCypherDoc({ status: 'ended', currentTurnIndex: -1, turnStartTime: null });
    toast('⏹️ Cypher ended');
  }

  // LIVEKIT
  async function connectToLiveKit(role){
    try {
      var LK = await waitForLiveKit();
      var url = TOKEN_FN + '?room=' + encodeURIComponent(ROOM_NAME) + '&username=' + encodeURIComponent(state.myUsername);
      var resp = await fetch(url);
      if(!resp.ok) throw new Error('Token fetch failed: ' + resp.status);
      var data = await resp.json();
      if(!data.token || !data.url) throw new Error('Bad token response');
      var room = new LK.Room({ adaptiveStream: true, dynacast: true });
      state.livekitRoom = room;
      room.on(LK.RoomEvent.TrackSubscribed, function(track, publication, participant){ attachRemoteTrack(track, participant); });
      room.on(LK.RoomEvent.TrackUnsubscribed, function(track, publication, participant){ detachRemoteTrack(track, participant); });
      room.on(LK.RoomEvent.ParticipantDisconnected, function(participant){ removeParticipantTiles(participant.identity); });
      room.on(LK.RoomEvent.Disconnected, function(){ state.livekitConnected = false; });
      await room.connect(data.url, data.token);
      state.livekitConnected = true;
      if(role === 'dj'){ await publishMyCam(); await publishMyMic(); }
      else if(role === 'artist'){ await publishMyMic(true); }
      return true;
    } catch(e){ console.error('[cypher] LiveKit connect failed', e); toast('⚠️ Camera connect failed: ' + e.message); return false; }
  }
  async function publishMyCam(){
    if(!state.livekitRoom || state.camTrack) return;
    try {
      var LK = window.LivekitClient || window.LiveKit;
      var track = await LK.createLocalVideoTrack({ resolution: LK.VideoPresets.h360.resolution });
      state.camTrack = track;
      await state.livekitRoom.localParticipant.publishTrack(track);
      attachLocalCam(track);
    } catch(e){ console.warn('[cypher] Cam publish failed', e); toast('⚠️ Could not enable camera: ' + e.message); }
  }
  async function unpublishMyCam(){
    if(!state.camTrack || !state.livekitRoom) return;
    try { await state.livekitRoom.localParticipant.unpublishTrack(state.camTrack); state.camTrack.stop(); state.camTrack = null; detachLocalCam(); }
    catch(e){ console.warn('[cypher] Cam unpublish failed', e); }
  }
  async function publishMyMic(muted){
    if(!state.livekitRoom || state.micTrack) return;
    try {
      var LK = window.LivekitClient || window.LiveKit;
      var track = await LK.createLocalAudioTrack();
      state.micTrack = track;
      await state.livekitRoom.localParticipant.publishTrack(track);
      if(muted) await state.livekitRoom.localParticipant.setMicrophoneEnabled(false);
    } catch(e){ console.warn('[cypher] Mic publish failed', e); }
  }
  async function setMicMuted(muted){ if(!state.livekitRoom) return; try { await state.livekitRoom.localParticipant.setMicrophoneEnabled(!muted); } catch(e){} }

  function attachLocalCam(track){
    var box = ensureMyTile(); if(!box) return;
    var vid = box.querySelector('video') || document.createElement('video');
    vid.autoplay = true; vid.muted = true; vid.playsInline = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);border-radius:50%;';
    track.attach(vid);
    if(!box.contains(vid)) box.appendChild(vid);
  }
  function detachLocalCam(){ var box = document.getElementById('cy-tile-' + state.myUsername); if(box){ var v = box.querySelector('video'); if(v) v.remove(); } }
  function attachRemoteTrack(track, participant){
    if(track.kind !== 'video' && track.kind !== 'audio') return;
    var tile = ensureRemoteTile(participant.identity); if(!tile) return;
    if(track.kind === 'video'){
      var vid = tile.querySelector('video.cy-remote-vid') || document.createElement('video');
      vid.className = 'cy-remote-vid'; vid.autoplay = true; vid.playsInline = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      track.attach(vid);
      if(!tile.contains(vid)) tile.appendChild(vid);
    } else {
      var aud = document.createElement('audio'); aud.autoplay = true; aud.id = 'cy-audio-' + participant.identity;
      track.attach(aud); document.body.appendChild(aud);
    }
  }
  function detachRemoteTrack(track, participant){
    var tile = document.getElementById('cy-tile-' + participant.identity);
    if(tile){ var v = tile.querySelector('video.cy-remote-vid'); if(v) v.remove(); }
    var aud = document.getElementById('cy-audio-' + participant.identity); if(aud) aud.remove();
  }
  function removeParticipantTiles(identity){
    var tile = document.getElementById('cy-tile-' + identity); if(tile) tile.remove();
    var aud = document.getElementById('cy-audio-' + identity); if(aud) aud.remove();
  }

  // TILES
  function getCircleWrap(){ return document.getElementById('cyCircleWrap'); }
  function ensureMyTile(){ return ensureRemoteTile(state.myUsername); }
  function ensureRemoteTile(identity){
    var wrap = getCircleWrap(); if(!wrap) return null;
    var tile = document.getElementById('cy-tile-' + identity);
    if(tile) return tile.querySelector('.cy-tile-inner');
    tile = document.createElement('div'); tile.id = 'cy-tile-' + identity; tile.className = 'cy-tile';
    var inner = document.createElement('div'); inner.className = 'cy-tile-inner'; tile.appendChild(inner);
    var label = document.createElement('div'); label.className = 'cy-tile-label'; label.textContent = identity; tile.appendChild(label);
    wrap.appendChild(tile);
    return inner;
  }
  function layoutTiles(participants){
    var wrap = getCircleWrap(); if(!wrap) return;
    var existing = wrap.querySelectorAll('.cy-tile');
    var validUsernames = participants.map(function(p){ return p.username; });
    existing.forEach(function(t){ var id = t.id.replace('cy-tile-', ''); if(validUsernames.indexOf(id) === -1) t.remove(); });
    var count = participants.length; if(count === 0) return;
    var radius = 41;
    participants.forEach(function(p, idx){
      ensureRemoteTile(p.username);
      var tile = document.getElementById('cy-tile-' + p.username); if(!tile) return;
      var angleRad = (idx / count) * 2 * Math.PI - Math.PI / 2;
      var x = 50 + radius * Math.cos(angleRad);
      var y = 50 + radius * Math.sin(angleRad);
      tile.style.left = 'calc(' + x + '% - 7%)';
      tile.style.top  = 'calc(' + y + '% - 7%)';
      tile.classList.remove('active', 'up-next', 'dj-host');
      if(p.role === 'dj') tile.classList.add('dj-host');
    });
  }

  // RENDER
  function renderCypherFromState(){
    var s = state.cypherState; if(!s) return;
    var participants = s.participants || [];
    layoutTiles(participants);
    var curIdx = (typeof s.currentTurnIndex === 'number') ? s.currentTurnIndex : -1;
    if(curIdx >= 0 && participants[curIdx]){
      var active = participants[curIdx];
      var activeTile = document.getElementById('cy-tile-' + active.username);
      if(activeTile) activeTile.classList.add('active');
      for(var i = 1; i <= participants.length; i++){
        var nextIdx = (curIdx + i) % participants.length;
        if(participants[nextIdx] && participants[nextIdx].role === 'artist' && nextIdx !== curIdx){
          var nextTile = document.getElementById('cy-tile-' + participants[nextIdx].username);
          if(nextTile) nextTile.classList.add('up-next');
          break;
        }
      }
    }
    var centerLabel = document.getElementById('cyCenterLabel');
    var centerName = document.getElementById('cyCenterName');
    var centerTime = document.getElementById('cyCenterTime');
    if(s.status === 'waiting'){
      if(centerLabel) centerLabel.textContent = 'WAITING';
      if(centerName) centerName.textContent = participants.length + ' joined';
      if(centerTime){ centerTime.textContent = '--'; centerTime.classList.remove('urgent'); }
    } else if(s.status === 'live' && curIdx >= 0 && participants[curIdx]){
      if(centerLabel) centerLabel.textContent = 'ON THE MIC';
      if(centerName) centerName.textContent = participants[curIdx].username;
    } else if(s.status === 'ended'){
      if(centerLabel) centerLabel.textContent = 'ENDED';
      if(centerName) centerName.textContent = '—';
      if(centerTime){ centerTime.textContent = '--'; centerTime.classList.remove('urgent'); }
    }
    renderQueue(participants, curIdx);
    var meta = document.getElementById('cyMeta');
    if(meta) meta.textContent = participants.length + ' participant' + (participants.length === 1 ? '' : 's');
    var sessionName = document.getElementById('cySessionName');
    if(sessionName && s.sessionName) sessionName.textContent = s.sessionName;
    handleMyCamForTurn();
  }
  function renderQueue(participants, curIdx){
    var list = document.getElementById('cyQueueList'); if(!list) return;
    var artists = participants.filter(function(p){ return p.role === 'artist'; });
    if(!artists.length){ list.innerHTML = '<span class="cy-queue-empty">Waiting for artists to join…</span>'; return; }
    list.innerHTML = '';
    artists.forEach(function(p){
      var item = document.createElement('span'); item.className = 'cy-q-item';
      var globalIdx = participants.indexOf(p);
      if(globalIdx === curIdx) item.classList.add('current');
      item.textContent = p.username;
      list.appendChild(item);
    });
  }
  async function handleMyCamForTurn(){
    if(state.role !== 'artist' || !state.livekitConnected) return;
    var s = state.cypherState; if(!s) return;
    var participants = s.participants || [];
    var myIdx = participants.findIndex(function(p){ return p.username === state.myUsername; });
    var isMyTurn = (s.status === 'live' && myIdx === s.currentTurnIndex);
    if(isMyTurn && !state.camTrack){ await publishMyCam(); await setMicMuted(false); }
    else if(!isMyTurn && state.camTrack){ await unpublishMyCam(); await setMicMuted(true); }
  }

  // TIMER
  function startTurnTimer(){
    if(state.turnTimerInterval) return;
    state.turnTimerInterval = setInterval(function(){
      var s = state.cypherState; var centerTime = document.getElementById('cyCenterTime');
      if(!centerTime || !s) return;
      if(s.status !== 'live' || !s.turnStartTime){ centerTime.textContent = '--'; centerTime.classList.remove('urgent'); return; }
      var elapsed = Math.floor((Date.now() - s.turnStartTime) / 1000);
      var remaining = (s.turnDuration || TURN_DURATION_SEC) - elapsed;
      centerTime.textContent = fmtTime(Math.max(0, remaining));
      centerTime.classList.toggle('urgent', remaining <= 10);
      if(remaining <= 0 && isMeDj()) advanceToNextArtist();
    }, 500);
  }
  function stopTurnTimer(){ if(state.turnTimerInterval){ clearInterval(state.turnTimerInterval); state.turnTimerInterval = null; } }

  // JOIN / LEAVE
  async function cypherJoin(role){
    var clean = String(role || 'artist').toLowerCase();
    if(clean === 'watch') clean = 'viewer';
    state.role = clean;
    state.myUsername = getMyUsername();
    document.body.setAttribute('data-cypher-role', clean);
    startFirestoreListener();
    var tries = 0;
    while(!state.isFirestoreReady && tries < 30){ await new Promise(function(r){ setTimeout(r, 100); }); tries++; }
    if(clean === 'dj' || clean === 'artist') await connectToLiveKit(clean);
    await addMeToParticipants(clean);
    startTurnTimer();
    toast(clean === 'dj' ? '🎧 Joined as DJ' : (clean === 'artist' ? '🎤 Joined as Artist — waiting for turn' : '👁️ Watching'));
  }
  async function cypherLeave(){
    stopTurnTimer();
    await removeMeFromParticipants();
    if(state.livekitRoom){ try { await state.livekitRoom.disconnect(); } catch(e){} state.livekitRoom = null; state.livekitConnected = false; }
    if(state.camTrack){ try { state.camTrack.stop(); } catch(e){} state.camTrack = null; }
    if(state.micTrack){ try { state.micTrack.stop(); } catch(e){} state.micTrack = null; }
    stopFirestoreListener();
    state.role = null;
    document.body.removeAttribute('data-cypher-role');
  }

  // WIRE BUTTONS
  function installButtonOverrides(){
    if(!isFreestylePage()) return;
    var originalJoin = window.joinCypher;
    window.joinCypher = function(role){
      if(typeof originalJoin === 'function'){ try { originalJoin(role); } catch(e){} }
      cypherJoin(role);
    };
    var startBtn = document.querySelector('[onclick*="cyStartSession"]');
    if(startBtn) startBtn.onclick = function(e){ e.preventDefault(); djStartCypher(); };
    var nextBtn = document.querySelector('[onclick*="cyAdvanceTurn"]');
    if(nextBtn) nextBtn.onclick = function(e){ e.preventDefault(); djAdvanceTurn(); };
    var endBtn = document.querySelector('[onclick*="cyEndSession"]');
    if(endBtn) endBtn.onclick = function(e){ e.preventDefault(); djEndCypher(); };
    var topBackBtn = document.querySelector('#page-cypher .top-bar .icon-btn');
    if(topBackBtn){
      var origHandler = topBackBtn.onclick;
      topBackBtn.onclick = async function(e){
        await cypherLeave();
        if(typeof window.goToPage === 'function') window.goToPage('home');
        else if(origHandler) origHandler.call(this, e);
      };
    }
  }
  function watchForCypherOpen(){
    var lastActive = '';
    setInterval(function(){
      var active = document.querySelector('.page.active');
      var newId = active ? active.id : '';
      if(newId === 'page-cypher' && lastActive !== 'page-cypher') setTimeout(installButtonOverrides, 200);
      lastActive = newId;
    }, 500);
  }

  // BOOT
  function boot(){
    if(!isFreestylePage()) return;
    state.myUsername = getMyUsername();
    setTimeout(installButtonOverrides, 1000);
    watchForCypherOpen();
    window.ubCypherEngine = { state: state, join: cypherJoin, leave: cypherLeave, djStart: djStartCypher, djAdvance: djAdvanceTurn, djEnd: djEndCypher };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
