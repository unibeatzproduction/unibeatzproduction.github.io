// unifreestyle-cypher.js
// UniBeatz Production — Phase 2 Stage 1 Cypher Room
// Clean single file — replaces: unifreestyle-cypher.js, unifreestyle-cypher-engine.js,
// unifreestyle-cypher-fix.js, unifreestyle-cypher-camera-center.js,
// unifreestyle-cypher-mobile-camera-fix.js, unifreestyle-cypher-audio-url-fix.js

(function(){
  'use strict';

  var CYPHER_ROOM = 'cypher-main';
  var TURN_DURATION = 60;
  var TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';

  // ═══════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════
  var st = {
    role: null, username: null,
    livekitRoom: null, livekitConnected: false,
    micOn: true, camOn: true,
    cypherDoc: null, currentBeat: null,
    docUnsub: null, beatUnsub: null,
    timerInterval: null
  };

  // ═══════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════
  function isPage(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function $(id){ return document.getElementById(id); }
  function toast(msg){ if(typeof window.showToast==='function') window.showToast(msg); else console.log('[cypher]',msg); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmtTime(sec){ if(sec<0)sec=0; var m=Math.floor(sec/60),s=sec%60; return m+':'+(s<10?'0':'')+s; }

  function resolveUsername(){
    try{
      var raw=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user');
      var u=raw?JSON.parse(raw):null;
      return (u&&(u.username||u.name))||'guest_'+Math.floor(Math.random()*9999);
    }catch(e){ return 'guest_'+Math.floor(Math.random()*9999); }
  }

  function getFb(){
    var fb=window.UB_FIREBASE||{};
    return (fb.db&&fb.setDoc&&fb.getDocs)?fb:null;
  }

  async function waitForFb(){
    var fb=getFb(); if(fb) return fb;
    return new Promise(function(resolve){
      window.addEventListener('ub-firebase-ready',function(){ resolve(getFb()); },{once:true});
    });
  }

  async function waitForLiveKit(maxMs){
    if(window.LivekitClient) return window.LivekitClient;
    var start=Date.now();
    while(Date.now()-start<(maxMs||6000)){
      await new Promise(function(r){ setTimeout(r,100); });
      if(window.LivekitClient) return window.LivekitClient;
    }
    throw new Error('LiveKit SDK did not load');
  }

  // ═══════════════════════════════════════════════════
  // FIRESTORE
  // ═══════════════════════════════════════════════════
  async function ensureCypherDoc(){
    var fb=await waitForFb(); if(!fb) throw new Error('Firebase not ready');
    var ref=fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM);
    var snap=await fb.getDoc(ref);
    if(!snap.exists()){
      await fb.setDoc(ref,{
        status:'waiting', participants:[], currentTurnIndex:-1,
        turnStartTime:null, turnDuration:TURN_DURATION,
        djUsername:'', sessionName:'Open Cypher Session', autoRotate:true,
        updatedAt:fb.serverTimestamp()
      });
    }
    return ref;
  }

  async function startCypherListener(){
    if(st.docUnsub) return;
    var fb=await waitForFb(); if(!fb) return;
    var ref=await ensureCypherDoc();
    st.docUnsub=fb.onSnapshot(ref,function(snap){
      if(!snap.exists()) return;
      st.cypherDoc=snap.data();
      render();
    },function(err){ console.warn('[cypher] listener failed',err); });
  }

  async function startBeatListener(){
    if(st.beatUnsub) return;
    var fb=getFb(); if(!fb) return;
    try{
      var ref=fb.doc(fb.db,'battle_rooms','battle-room');
      st.beatUnsub=fb.onSnapshot(ref,function(snap){
        if(!snap.exists()) return;
        st.currentBeat=(snap.data()||{}).selectedBeat||null;
        renderBeatUI();
      });
    }catch(e){ console.warn('[cypher] beat listener failed',e); }
  }

  async function updateCypherDoc(updates){
    var fb=getFb(); if(!fb) return;
    var ref=fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM);
    updates.updatedAt=fb.serverTimestamp();
    await fb.setDoc(ref,updates,{merge:true});
  }

  async function addMeToParticipants(role){
    var fb=getFb(); if(!fb) return;
    var ref=fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM);
    // Remove old entry for this username, then add fresh
    var snap=await fb.getDoc(ref);
    var existing=(snap.exists()?(snap.data().participants||[]):[]).filter(function(p){ return p.username!==st.username; });
    var me={ username:st.username, role:role, joinedAt:Date.now() };
    var updates={ participants:fb.arrayUnion(me), updatedAt:fb.serverTimestamp() };
    if(role==='dj') updates.djUsername=st.username;
    // First clean out old entry
    if(snap.exists()) await fb.setDoc(ref,{participants:existing},{merge:true});
    await fb.setDoc(ref,updates,{merge:true});
    // Verify
    var verify=await fb.getDoc(ref);
    if(verify.exists()) st.cypherDoc=verify.data();
  }

  async function removeMeFromParticipants(){
    var fb=getFb(); if(!fb) return;
    try{
      var ref=fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM);
      var snap=await fb.getDoc(ref); if(!snap.exists()) return;
      var data=snap.data();
      var participants=(data.participants||[]).filter(function(p){ return p.username!==st.username; });
      var updates={participants:participants,updatedAt:fb.serverTimestamp()};
      var curIdx=data.currentTurnIndex;
      if(curIdx>=0&&(data.participants||[])[curIdx]&&data.participants[curIdx].username===st.username){
        updates.currentTurnIndex=-1; updates.turnStartTime=null;
      }
      if(data.djUsername===st.username) updates.djUsername='';
      await fb.setDoc(ref,updates,{merge:true});
    }catch(e){ console.warn('[cypher] removeMe failed',e); }
  }

  function isMeDj(){ return st.role==='dj'||(st.cypherDoc&&st.cypherDoc.djUsername===st.username); }
  function myIndex(){ if(!st.cypherDoc||!st.cypherDoc.participants) return -1; return st.cypherDoc.participants.findIndex(function(p){ return p.username===st.username; }); }
  function isMyTurn(){ if(!st.cypherDoc||st.cypherDoc.status!=='live') return false; return myIndex()===st.cypherDoc.currentTurnIndex; }

  // ═══════════════════════════════════════════════════
  // LIVEKIT
  // ═══════════════════════════════════════════════════
  async function connectLiveKit(role){
    var LK=await waitForLiveKit();
    var url=TOKEN_FN+'?room='+encodeURIComponent(CYPHER_ROOM)+'&username='+encodeURIComponent(st.username);
    var resp=await fetch(url); var data=await resp.json();
    if(!resp.ok||!data.token||!data.url) throw new Error(data.error||'Token failed');
    var room=new LK.Room({adaptiveStream:true,dynacast:true});
    st.livekitRoom=room;
    room.on('trackSubscribed',function(track,pub,participant){ attachRemoteTrack(track,participant); });
    room.on('trackUnsubscribed',function(track,pub,participant){ detachRemoteTrack(track,participant); });
    room.on('participantDisconnected',function(p){ removeRemoteTile(p.identity); });
    room.on('disconnected',function(){ st.livekitConnected=false; });
    await room.connect(data.url,data.token);
    st.livekitConnected=true;
    if(role==='dj'){
      await room.localParticipant.enableCameraAndMicrophone();
      attachLocalTracks();
    }
  }

  // Camera CSS
  function injectCypherCss(){
    if($('ubCypherCss')) return;
    var s=document.createElement('style'); s.id='ubCypherCss';
    s.textContent=[
      '#page-cypher .cy-tile{position:absolute!important;border-radius:50%!important;overflow:visible!important;background:rgba(0,0,0,.72)!important;}',
      '#page-cypher .cy-media-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border-radius:50%!important;overflow:hidden!important;clip-path:circle(50% at 50% 50%)!important;background:rgba(0,0,0,.55)!important;}',
      '#page-cypher .cy-media-frame video{position:absolute!important;top:50%!important;left:50%!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;border-radius:50%!important;transform:translate(-50%,-50%) scaleX(-1)!important;z-index:3!important;}',
      '#page-cypher .cy-tile-label{position:absolute!important;bottom:-22px!important;left:50%!important;transform:translateX(-50%)!important;text-align:center!important;z-index:5!important;padding:3px 8px!important;background:rgba(0,0,0,.7)!important;border-radius:10px!important;font-size:.46rem!important;white-space:nowrap!important;color:#F0C040!important;font-family:Orbitron,sans-serif!important;}',
      '@media(max-width:759px){#page-cypher .cy-media-frame video{width:130%!important;height:130%!important;}}',
      '#page-cypher .cy-tile.has-video .cy-tile-silhouette,#page-cypher .cy-tile.has-video .cy-tile-ph{display:none!important;opacity:0!important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function getTileFrame(tile){
    if(!tile) return null;
    var frame=tile.querySelector('.cy-media-frame');
    if(!frame){
      frame=document.createElement('div'); frame.className='cy-media-frame';
      tile.insertBefore(frame,tile.firstChild);
    }
    return frame;
  }

  function styleCypherVideo(vid){
    vid.autoplay=true; vid.playsInline=true; vid.setAttribute('playsinline','true');
    vid.style.cssText='position:absolute;top:50%;left:50%;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:50%;transform:translate(-50%,-50%) scaleX(-1);z-index:3;';
  }

  function ensureTile(identity, isMe){
    var wrap=$('cyCircleWrap'); if(!wrap) return null;
    var tile=document.getElementById('cy-tile-'+identity);
    if(tile) return tile;
    tile=document.createElement('div');
    tile.id='cy-tile-'+identity;
    tile.className='cy-tile'+(isMe?' cy-tile-me':'');
    tile.style.cssText='position:absolute;width:14%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(64,208,255,.4);background:rgba(0,0,0,.55);overflow:visible;';
    var frame=document.createElement('div'); frame.className='cy-media-frame';
    frame.style.cssText='position:absolute;inset:0;border-radius:50%;overflow:hidden;clip-path:circle(50% at 50% 50%);background:rgba(0,0,0,.55);';
    var ph=document.createElement('div'); ph.className='cy-tile-silhouette';
    ph.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2rem;opacity:.5;';
    ph.textContent='🎤'; frame.appendChild(ph); tile.appendChild(frame);
    var label=document.createElement('div'); label.className='cy-tile-label';
    label.textContent=identity; tile.appendChild(label);
    wrap.appendChild(tile);
    return tile;
  }

  function attachLocalTracks(){
    if(!st.livekitRoom) return;
    st.livekitRoom.localParticipant.trackPublications.forEach(function(pub){
      if(pub.track&&pub.track.kind==='video') attachLocalVideo(pub.track);
    });
  }

  function attachLocalVideo(track){
    var tile=ensureTile(st.username,true); if(!tile) return;
    var frame=getTileFrame(tile); if(!frame) return;
    var old=frame.querySelector('video'); if(old) old.remove();
    var vid=document.createElement('video'); vid.muted=true;
    styleCypherVideo(vid); frame.appendChild(vid);
    track.attach(vid); tile.classList.add('has-video');
  }

  function attachRemoteTrack(track,participant){
    if(track.kind==='audio'){
      var a=track.attach(); a.id='cy-aud-'+participant.identity; a.autoplay=true;
      document.body.appendChild(a); return;
    }
    if(track.kind==='video'){
      var tile=ensureTile(participant.identity,false); if(!tile) return;
      var frame=getTileFrame(tile); if(!frame) return;
      var old=frame.querySelector('video'); if(old) old.remove();
      var vid=document.createElement('video');
      styleCypherVideo(vid); frame.appendChild(vid);
      track.attach(vid); tile.classList.add('has-video');
    }
  }

  function detachRemoteTrack(track,participant){
    if(track.kind==='audio'){ var a=$('cy-aud-'+participant.identity); if(a) a.remove(); }
    else{ var tile=document.getElementById('cy-tile-'+participant.identity); if(tile){ var v=tile.querySelector('video'); if(v) v.remove(); tile.classList.remove('has-video'); } }
  }

  function removeRemoteTile(identity){
    var tile=document.getElementById('cy-tile-'+identity); if(tile) tile.remove();
    var a=$('cy-aud-'+identity); if(a) a.remove();
  }

  async function syncMyMediaToTurn(){
    if(!st.livekitConnected||st.role!=='artist') return;
    var room=st.livekitRoom; if(!room) return;
    var myTurn=isMyTurn();
    try{
      if(myTurn){
        await room.localParticipant.setCameraEnabled(st.camOn);
        await room.localParticipant.setMicrophoneEnabled(st.micOn);
        attachLocalTracks();
      } else {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);
        var tile=document.getElementById('cy-tile-'+st.username);
        if(tile){ var v=tile.querySelector('video'); if(v) v.remove(); tile.classList.remove('has-video'); }
      }
    }catch(e){ console.warn('[cypher] syncMedia failed',e); }
  }

  function reattachMyCamIfNeeded(){
    if(!st.livekitRoom||!st.username) return;
    var tile=document.getElementById('cy-tile-'+st.username); if(!tile) return;
    if(tile.querySelector('video')) return;
    st.livekitRoom.localParticipant.trackPublications.forEach(function(pub){
      if(pub.track&&pub.track.kind==='video') attachLocalVideo(pub.track);
    });
  }

  // ═══════════════════════════════════════════════════
  // BEAT UI (DJ only)
  // ═══════════════════════════════════════════════════
  function renderBeatUI(){
    var panel=$('cyDjPanel'); if(!panel||!isMeDj()) return;
    var info=$('cyBeatInfo');
    if(!info){
      info=document.createElement('div'); info.id='cyBeatInfo';
      info.style.cssText='margin-top:10px;padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.35);background:rgba(0,0,0,.35);color:#fff;';
      panel.appendChild(info);
    }
    if(st.currentBeat&&st.currentBeat.name){
      var meta=[st.currentBeat.genre,st.currentBeat.bpm?st.currentBeat.bpm+' BPM':'',st.currentBeat.key].filter(Boolean).join(' · ');
      info.innerHTML='<div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:#40D0FF;margin-bottom:4px;">CURRENT BATTLE BEAT</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.2rem;letter-spacing:2px;color:#F0C040;">'+esc(st.currentBeat.name)+'</div><div style="font-size:.78rem;color:rgba(240,237,232,.65);margin:2px 0 8px;">'+esc(meta)+'</div><button id="cyBeatPlayBtn" style="width:100%;padding:9px;border-radius:7px;border:1px solid #40D0FF;background:rgba(64,208,255,.14);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;cursor:pointer;">▶ PLAY BEAT</button>';
      var btn=$('cyBeatPlayBtn');
      if(btn) btn.onclick=function(e){ e.preventDefault(); playBeat(); };
    } else {
      info.innerHTML='<div style="color:rgba(240,237,232,.7);font-size:.86rem;">No beat selected yet. Pick one from Instant Battle → DJ Beat Selector.</div>';
    }
  }

  async function playBeat(){
    if(!st.currentBeat||!st.currentBeat.audioUrl){ toast('No beat. Select one from Instant Battle first.'); return; }
    var el=$('cyBeatAudio')||document.createElement('audio');
    el.id='cyBeatAudio'; el.controls=true; el.style.cssText='width:100%;margin-top:8px;';
    el.crossOrigin='anonymous';
    var panel=$('cyDjPanel'); if(panel&&!$('cyBeatAudio')) panel.appendChild(el);
    el.src=st.currentBeat.audioUrl; el.load();
    try{
      await el.play();
      toast('🎧 Beat playing');
    }catch(e){ toast('🎧 Beat loaded — tap play bar'); }

    // FIX: Route beat audio into LiveKit so the room hears it
    if(st.livekitRoom && el.captureStream){
      try{
        var beatStream = el.captureStream();
        var audioTrack = beatStream.getAudioTracks()[0];
        if(audioTrack){
          var LK = window.LivekitClient;
          if(LK){
            var localTrack = await LK.createLocalAudioTrack({ mediaStreamTrack: audioTrack });
            await st.livekitRoom.localParticipant.publishTrack(localTrack, {
              name: 'beat-audio',
              source: LK.Track.Source.Microphone
            });
            toast('🔊 Beat audio live in room');
          }
        }
      } catch(e){
        console.warn('[cypher] beat captureStream failed:', e);
        toast('🎧 Beat playing locally — room hears via mic');
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // TILE LAYOUT + RENDER
  // ═══════════════════════════════════════════════════
  function layoutTiles(){
    if(!st.cypherDoc) return;
    var participants=st.cypherDoc.participants||[];
    var wrap=$('cyCircleWrap'); if(!wrap) return;
    // Remove tiles not in participants
    wrap.querySelectorAll('.cy-tile').forEach(function(t){
      var id=t.id.replace('cy-tile-','');
      if(!participants.some(function(p){ return p.username===id; })) t.remove();
    });
    var count=participants.length; if(!count) return;
    var radius=38;
    participants.forEach(function(p,idx){
      var tile=ensureTile(p.username,p.username===st.username); if(!tile) return;
      var angle=(idx/count)*2*Math.PI-Math.PI/2;
      tile.style.left=(50+radius*Math.cos(angle))+'%';
      tile.style.top=(50+radius*Math.sin(angle))+'%';
      tile.style.transform='translate(-50%,-50%)';
      tile.style.borderColor=p.role==='dj'?'#C9A84C':'rgba(64,208,255,.4)';
      tile.style.boxShadow='';
    });
    var curIdx=typeof st.cypherDoc.currentTurnIndex==='number'?st.cypherDoc.currentTurnIndex:-1;
    if(curIdx>=0&&participants[curIdx]){
      var at=document.getElementById('cy-tile-'+participants[curIdx].username);
      if(at){ at.style.borderColor='#F0C040'; at.style.boxShadow='0 0 24px rgba(240,192,64,.7)'; }
    }
  }

  function renderCenter(){
    var s=st.cypherDoc; if(!s) return;
    var participants=s.participants||[];
    var curIdx=s.currentTurnIndex;
    var label=$('cyCenterLabel'), name=$('cyCenterName'), time=$('cyCenterTime');
    if(s.status==='waiting'){
      if(label) label.textContent='WAITING'; if(name) name.textContent=participants.length+' joined';
      if(time){ time.textContent='--'; time.classList.remove('urgent'); }
    } else if(s.status==='live'&&curIdx>=0&&participants[curIdx]){
      if(label) label.textContent='ON THE MIC'; if(name) name.textContent=participants[curIdx].username;
    } else if(s.status==='ended'){
      if(label) label.textContent='ENDED'; if(name) name.textContent='—';
      if(time){ time.textContent='--'; time.classList.remove('urgent'); }
    }
  }

  function renderQueue(){
    var list=$('cyQueueList'); if(!list) return;
    var s=st.cypherDoc; if(!s){ list.innerHTML='<span class="cy-queue-empty">Waiting…</span>'; return; }
    var participants=s.participants||[];
    var artists=participants.filter(function(p){ return p.role==='artist'; });
    if(!artists.length){ list.innerHTML='<span class="cy-queue-empty">Waiting for artists…</span>'; return; }
    list.innerHTML='';
    artists.forEach(function(p){
      var span=document.createElement('span'); span.className='cy-q-item';
      if(participants.indexOf(p)===s.currentTurnIndex) span.classList.add('current');
      span.textContent=p.username; list.appendChild(span);
    });
  }

  function renderMeta(){
    var meta=$('cyMeta'); if(!meta) return;
    var count=(st.cypherDoc&&st.cypherDoc.participants)?st.cypherDoc.participants.length:0;
    meta.textContent=count+' participant'+(count===1?'':'s');
    var sn=$('cySessionName'); if(sn&&st.cypherDoc&&st.cypherDoc.sessionName) sn.textContent=st.cypherDoc.sessionName;
  }

  function renderDjPanel(){
    var panel=$('cyDjPanel'); if(!panel) return;
    panel.style.display=isMeDj()?'block':'none';
    var autoBtn=$('cyAutoBtn');
    if(autoBtn&&st.cypherDoc) autoBtn.textContent='🔁 Auto-Rotate: '+(st.cypherDoc.autoRotate!==false?'ON':'OFF');
  }

  function renderJoinButtons(){
    // Disable DJ button if DJ slot is taken by someone else
    // Find DJ button by text content or data attribute
    var djBtn=null;
    document.querySelectorAll('button').forEach(function(b){
      var t=(b.textContent||'').toLowerCase();
      if(t.indexOf('join as dj')>-1||t.indexOf('dj')>-1&&t.indexOf('join')>-1) djBtn=b;
    });
    if(!djBtn) return;
    var existingDj=(st.cypherDoc&&st.cypherDoc.djUsername)||'';
    var me=resolveUsername();
    var djTaken=!!(existingDj&&existingDj!==me);
    djBtn.disabled=djTaken;
    djBtn.style.opacity=djTaken?'0.4':'1';
    djBtn.style.cursor=djTaken?'not-allowed':'pointer';
    djBtn.title=djTaken?'DJ slot taken by @'+existingDj:'Join as DJ';
    if(djTaken){
      djBtn.textContent='\uD83C\uDFA7 DJ: @'+existingDj;
    } else {
      djBtn.textContent='\uD83C\uDFA7 JOIN AS DJ';
    }
  }

  function render(){
    if(!st.cypherDoc) return;
    layoutTiles(); renderCenter(); renderQueue(); renderMeta(); renderDjPanel(); renderBeatUI();
    renderJoinButtons();
    syncMyMediaToTurn(); reattachMyCamIfNeeded();
  }

  // ═══════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════
  function startTimer(){
    if(st.timerInterval) return;
    st.timerInterval=setInterval(function(){
      var s=st.cypherDoc, time=$('cyCenterTime');
      if(!time||!s) return;
      if(s.status!=='live'||!s.turnStartTime){ time.textContent='--'; time.classList.remove('urgent'); return; }
      var elapsed=Math.floor((Date.now()-s.turnStartTime)/1000);
      var remaining=(s.turnDuration||TURN_DURATION)-elapsed;
      time.textContent=fmtTime(Math.max(0,remaining));
      time.classList.toggle('urgent',remaining<=10);
      if(remaining<=0&&isMeDj()&&s.autoRotate!==false) cyAdvanceTurn();
    },500);
  }

  function stopTimer(){ if(st.timerInterval){ clearInterval(st.timerInterval); st.timerInterval=null; } }

  // ═══════════════════════════════════════════════════
  // PUBLIC ACTIONS
  // ═══════════════════════════════════════════════════
  async function joinCypher(role){
    var clean=String(role||'artist').toLowerCase();
    if(clean==='watch') clean='viewer';
    if(['artist','dj','viewer'].indexOf(clean)===-1) clean='artist';

    // FIX: Block DJ join if DJ slot already taken by someone else
    if(clean==='dj'){
      var fb=getFb();
      if(fb){
        try{
          var snap=await fb.getDoc(fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM));
          if(snap.exists()){
            var data=snap.data();
            var existingDj=data.djUsername||'';
            var me=resolveUsername();
            if(existingDj && existingDj!==me){
              toast('🎧 DJ slot is taken by @'+existingDj);
              return;
            }
          }
        }catch(e){ console.warn('[cypher] DJ check failed',e); }
      }
    }

    st.role=clean; st.username=resolveUsername();
    document.body.setAttribute('data-cypher-role',clean);
    var joinRow=$('cyJoinRow'); if(joinRow) joinRow.style.display='none';
    await startCypherListener();
    await startBeatListener();
    startTimer();
    if(clean==='artist'||clean==='dj'){
      try{ await connectLiveKit(clean); }
      catch(e){ toast('⚠️ Camera connect failed: '+(e.message||e)); console.warn('[cypher] LiveKit failed',e); }
    }
    await addMeToParticipants(clean);
    render();
    toast(clean==='dj'?'🎧 Joined as DJ':clean==='artist'?'🎤 Joined as Artist':'👁️ Watching');

    // FIX: inject viewer chat panel for ALL roles in cypher
    injectCypherChatPanel();

    // Auto-start AI DJ after 1 minute if no human DJ joins
    if(clean!=='dj'){
      var _cypherAiCountdown=60;
      var _cypherAiInterval=setInterval(function(){
        _cypherAiCountdown--;
        // Cancel if a human DJ has joined
        if(st.cypherDoc&&st.cypherDoc.djUsername){
          clearInterval(_cypherAiInterval); return;
        }
        if(_cypherAiCountdown===30) toast('🤖 AI DJ joining cypher in 30 seconds...');
        if(_cypherAiCountdown===10) toast('🤖 AI DJ joining cypher in 10 seconds...');
        if(_cypherAiCountdown<=0){
          clearInterval(_cypherAiInterval);
          // Still no human DJ?
          if(!st.cypherDoc||!st.cypherDoc.djUsername){
            if(window.ubBattle&&window.ubBattle.aiDj&&!window.ubBattle.aiDj.active()){
              window.ubBattle.aiDj.start(CYPHER_ROOM);
              toast('🤖 AI DJ is running the cypher!');
            }
          }
        }
      },1000);
    }
  }

  async function cyStartSession(){
    if(!isMeDj()){ toast('Only the DJ can start the cypher'); return; }
    var fb=getFb(); if(!fb) return;
    var snap=await fb.getDoc(fb.doc(fb.db,'cypher_rooms',CYPHER_ROOM));
    var participants=snap.exists()?(snap.data().participants||[]):[];
    var firstArtist=participants.findIndex(function(p){ return p.role==='artist'; });
    if(firstArtist===-1){ toast('Need at least one artist'); return; }
    await updateCypherDoc({ status:'live', currentTurnIndex:firstArtist, turnStartTime:Date.now() });
    toast('🎤 Cypher started!');
  }

  async function cyAdvanceTurn(){
    if(!isMeDj()){ toast('Only the DJ can rotate turns'); return; }
    var participants=(st.cypherDoc&&st.cypherDoc.participants)||[];
    if(!participants.length) return;
    var curIdx=(st.cypherDoc&&typeof st.cypherDoc.currentTurnIndex==='number')?st.cypherDoc.currentTurnIndex:-1;
    var nextIdx=-1;
    for(var i=1;i<=participants.length;i++){
      var cand=((curIdx===-1?0:curIdx)+i)%participants.length;
      if(participants[cand]&&participants[cand].role==='artist'){ nextIdx=cand; break; }
    }
    if(nextIdx===-1){ toast('No artists to rotate to'); return; }
    await updateCypherDoc({ currentTurnIndex:nextIdx, turnStartTime:Date.now() });
  }

  async function cyEndSession(){
    if(!isMeDj()){ toast('Only the DJ can end the cypher'); return; }
    if(!confirm('End this cypher session?')) return;
    await updateCypherDoc({ status:'ended', currentTurnIndex:-1, turnStartTime:null });
    var el=$('cyBeatAudio'); if(el){ try{ el.pause(); el.currentTime=0; }catch(e){} }
    toast('⏹ Cypher ended');
  }

  async function cyToggleAutoRotate(){
    if(!isMeDj()){ toast('Only the DJ controls auto-rotate'); return; }
    await updateCypherDoc({ autoRotate:!(st.cypherDoc&&st.cypherDoc.autoRotate!==false) });
  }

  function cyStartRename(){
    var inp=$('cyRenameInput'), name=$('cySessionName'), btn=$('cyRenameBtn');
    if(!inp||!name) return;
    inp.value=name.textContent; inp.style.display='inline-block'; name.style.display='none';
    if(btn) btn.style.display='none'; inp.focus(); inp.select();
  }

  async function cyCommitRename(){
    var inp=$('cyRenameInput'), name=$('cySessionName'), btn=$('cyRenameBtn');
    if(!inp) return;
    var val=(inp.value||'').trim();
    if(val){ if(isMeDj()) await updateCypherDoc({sessionName:val}); else if(name) name.textContent=val; }
    inp.style.display='none'; if(name) name.style.display=''; if(btn) btn.style.display='';
  }

  function cyCancelRename(){
    var inp=$('cyRenameInput'), name=$('cySessionName'), btn=$('cyRenameBtn');
    if(inp) inp.style.display='none'; if(name) name.style.display=''; if(btn) btn.style.display='';
  }

  async function toggleCypherMic(){
    if(!st.livekitRoom){ toast('Not connected'); return; }
    st.micOn=!st.micOn;
    try{ await st.livekitRoom.localParticipant.setMicrophoneEnabled(st.micOn); }catch(e){}
    var btn=$('cyMicBtn'); if(btn) btn.textContent=st.micOn?'🎤':'🔇';
    toast(st.micOn?'🎤 Mic on':'🔇 Mic off');
  }

  async function leaveCypher(){
    stopTimer();
    var el=$('cyBeatAudio'); if(el){ try{ el.pause(); }catch(e){} }
    try{ await removeMeFromParticipants(); }catch(e){}
    if(st.livekitRoom){ try{ st.livekitRoom.disconnect(); }catch(e){} st.livekitRoom=null; st.livekitConnected=false; }
    if(st.docUnsub){ try{ st.docUnsub(); }catch(e){} st.docUnsub=null; }
    if(st.beatUnsub){ try{ st.beatUnsub(); }catch(e){} st.beatUnsub=null; }
    st.role=null; st.cypherDoc=null;
    document.body.removeAttribute('data-cypher-role');
    var joinRow=$('cyJoinRow'); if(joinRow) joinRow.style.display='';
  }

  // ═══════════════════════════════════════════════════
  // CYPHER VIEWER CHAT PANEL
  // ═══════════════════════════════════════════════════
  var _cypherChatUnsub=null;

  function injectCypherChatPanel(){
    if($('ubCypherChatPanel')) return;
    var page=document.getElementById('page-cypher'); if(!page) return;
    var body=page.querySelector('.page-body'); if(!body) return;

    var panel=document.createElement('div');
    panel.id='ubCypherChatPanel';
    panel.style.cssText='margin-top:12px;border-radius:14px;border:1px solid rgba(64,208,255,.2);background:rgba(0,0,0,.3);overflow:hidden;';
    panel.innerHTML=[
      '<div style="padding:8px 12px;border-bottom:1px solid rgba(64,208,255,.12);font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;color:#40D0FF;">&#128172; CYPHER LIVE CHAT</div>',
      '<div id="ubCypherChatList" style="height:140px;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:4px;"></div>',
      '<div style="display:grid;grid-template-columns:1fr auto;gap:6px;padding:8px 10px;border-top:1px solid rgba(64,208,255,.1);">',
        '<input id="ubCypherChatInput" maxlength="200" placeholder="Say something..." style="background:#05070d;border:1px solid rgba(64,208,255,.35);border-radius:8px;color:#fff;padding:8px 10px;font-size:.85rem;outline:none;width:100%;box-sizing:border-box;">',
        '<button id="ubCypherChatSend" style="border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.44rem;font-weight:900;padding:0 12px;cursor:pointer;white-space:nowrap;">SEND</button>',
      '</div>'
    ].join('');
    body.appendChild(panel);

    // Wire send
    var input=$('ubCypherChatInput');
    var sendBtn=$('ubCypherChatSend');
    function doSend(){
      var fb=getFb(); if(!fb) return;
      var msg=(input&&input.value||'').trim(); if(!msg) return;
      if(input) input.value='';
      fb.setDoc(fb.doc(fb.db,'live_chats',CYPHER_ROOM),{room:CYPHER_ROOM,updatedAt:Date.now()},{merge:true}).catch(function(){});
      fb.addDoc(fb.collection(fb.db,'live_chats',CYPHER_ROOM,'messages'),
        {from:st.username||'guest', text:msg, at:Date.now()}).catch(function(e){ toast('Chat error: '+e.message); });
    }
    if(sendBtn) sendBtn.onclick=doSend;
    if(input) input.addEventListener('keydown',function(e){ if(e.key==='Enter') doSend(); });

    // Listen
    var fb=getFb(); if(!fb) return;
    fb.setDoc(fb.doc(fb.db,'live_chats',CYPHER_ROOM),{room:CYPHER_ROOM,updatedAt:Date.now()},{merge:true}).catch(function(){});
    var q=fb.query(fb.collection(fb.db,'live_chats',CYPHER_ROOM,'messages'),fb.orderBy('at','asc'));
    if(_cypherChatUnsub){ try{_cypherChatUnsub();}catch(e){} }
    _cypherChatUnsub=fb.onSnapshot(q,function(snap){
      var list=$('ubCypherChatList'); if(!list) return;
      list.innerHTML='';
      snap.forEach(function(doc){
        var d=doc.data();
        var row=document.createElement('div');
        row.style.cssText='font-size:.82rem;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);';
        var isMe=d.from===st.username;
        row.innerHTML='<b style="color:'+(isMe?'#F0C040':'#40D0FF')+';">'+esc(d.from)+':</b> '+esc(d.text);
        list.appendChild(row);
      });
      list.scrollTop=list.scrollHeight;
    });
  }

  // ═══════════════════════════════════════════════════
  // HOME CARD
  // ═══════════════════════════════════════════════════
  function injectHomeCypherCard(){
    var homeBody=document.querySelector('#page-home .page-body');
    if(!homeBody||$('ub-cypher-home-launch')) return;
    var card=document.createElement('div'); card.id='ub-cypher-home-launch';
    card.setAttribute('role','button');
    card.onclick=function(){ if(window.goToPage) window.goToPage('cypher'); };
    card.style.cssText='display:block;margin:16px 0 18px;padding:16px;border-radius:14px;border:1px solid rgba(201,168,76,.65);background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(0,170,255,.13));box-shadow:0 18px 40px rgba(0,0,0,.38);cursor:pointer;color:#fff;';
    card.innerHTML='<div style="display:flex;align-items:center;gap:14px;"><div style="font-size:2.4rem;">🌀</div><div style="flex:1;"><div style="display:inline-block;margin-bottom:7px;padding:4px 9px;border-radius:999px;border:1px solid #40D0FF;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;font-weight:900;">NEW MODE · LIVE</div><div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:1.65rem;letter-spacing:2px;line-height:1.05;">CYPHER ROOM</div><div style="color:rgba(240,237,232,.78);font-size:.86rem;margin-top:5px;">Multi-artist freestyle circle · 60-sec turns · DJ controls rotation</div></div><div style="font-size:1.55rem;color:#C9A84C;">→</div></div>';
    var actionRow=homeBody.querySelector('.home-action-row');
    if(actionRow) actionRow.insertAdjacentElement('afterend',card); else homeBody.insertBefore(card,homeBody.firstChild);
  }

  // ═══════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════
  function boot(){
    if(!isPage()) return;
    injectCypherCss();

    // Wire global functions
    window.joinCypher=joinCypher;
    window.cyStartSession=cyStartSession;
    window.cyAdvanceTurn=cyAdvanceTurn;
    window.cyEndSession=cyEndSession;
    window.cyToggleAutoRotate=cyToggleAutoRotate;
    window.cyStartRename=cyStartRename;
    window.cyCommitRename=cyCommitRename;
    window.cyCancelRename=cyCancelRename;
    window.toggleCypherMic=toggleCypherMic;
    window.leaveCypher=leaveCypher;

    injectHomeCypherCard();

    // FIX: Wire back button reliably using interval retry
    // setTimeout(600) was racing — page may not be rendered yet
    var _backBtnInterval=setInterval(function(){
      var back=document.querySelector('#page-cypher .top-bar .icon-btn');
      if(back){
        clearInterval(_backBtnInterval);
        back.onclick=async function(e){
          e.preventDefault(); e.stopPropagation();
          await leaveCypher();
          if(window.goToPage) window.goToPage('home');
        };
      }
    },200);
    // Also wire any element with data-page="home" or href on cypher page
    setTimeout(function(){
      document.querySelectorAll('#page-cypher [onclick*="home"], #page-cypher .back-btn').forEach(function(el){
        el.onclick=async function(e){
          e.preventDefault(); e.stopPropagation();
          await leaveCypher();
          if(window.goToPage) window.goToPage('home');
        };
      });
    },1000);

    // Re-inject home card if page changes
    var lastHome=null;
    setInterval(function(){
      var hb=document.querySelector('#page-home .page-body');
      if(hb&&hb!==lastHome){ lastHome=hb; injectHomeCypherCard(); }
    },2000);

    window.ubCypher={ state:st, join:joinCypher, leave:leaveCypher, start:cyStartSession, next:cyAdvanceTurn, end:cyEndSession };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
