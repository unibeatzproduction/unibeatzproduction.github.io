// unifreestyle-battle.js
// UniBeatz Production — Battle system: LiveKit cam/mic, battle modes, beat selector, Firestore sync
// Replaces: unifreestyle-battle-livekit.js, unifreestyle-battle-modes.js, unifreestyle-battle-sync.js

(function(){
  'use strict';

  var TOKEN_FN = 'https://getlivekittoken-vikmcq7yva-uc.a.run.app';

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(typeof window.showToast === 'function') window.showToast(msg); else console.log('[battle]', msg); }
  function go(page){ if(typeof window.goToPage === 'function') window.goToPage(page); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function safeId(s){ return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_'); }
  function getFb(){ var fb=window.UB_FIREBASE||{}; return (fb.db&&fb.setDoc)?fb:null; }

  function currentUser(){ try{ var r=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user'); return r?JSON.parse(r):null; }catch(e){ return null; } }
  function resolveUsername(role){ var u=currentUser(); return (u&&(u.username||u.name))||(role||'user')+'_'+Math.floor(Math.random()*9999); }

  // ═══════════════════════════════════════════════════
  // LIVEKIT BATTLE ENGINE
  // ═══════════════════════════════════════════════════
  var liveSt = { room:null, connected:false, username:null, role:null, battleRoom:null, camOn:true, micOn:true };

  async function waitForLiveKit(maxMs){
    if(window.LivekitClient) return window.LivekitClient;
    var start=Date.now();
    while(Date.now()-start<(maxMs||6000)){
      await new Promise(function(r){ setTimeout(r,100); });
      if(window.LivekitClient) return window.LivekitClient;
    }
    throw new Error('LiveKit SDK did not load');
  }

  function findVideoContainer(role, identity){
    var r=String(role||'').toLowerCase();
    var selectors=[];
    if(r==='artist1'||r==='teama1'||r==='teama2') selectors.push('#artist1Video','[data-battle-video="artist1"]','[data-battle-video="teamA1"]');
    if(r==='artist2'||r==='teamb1'||r==='teamb2') selectors.push('#artist2Video','[data-battle-video="artist2"]','[data-battle-video="teamB1"]');
    if(r==='dj') selectors.push('#djVideo','[data-battle-video="dj"]');
    if(r==='dj1') selectors.push('#dj1Video','[data-battle-video="dj1"]');
    if(r==='dj2') selectors.push('#dj2Video','[data-battle-video="dj2"]');
    if(r==='practice') selectors.push('#practiceVideo','[data-battle-video="practice"]');
    selectors.push('#ubBattleLiveStage','#page-battle-live .page-body');
    for(var i=0;i<selectors.length;i++){ var el=document.querySelector(selectors[i]); if(el) return el; }
    return makeFallbackStage(role,identity);
  }

  function makeFallbackStage(role, identity){
    var page=document.querySelector('#page-battle-live .page-body,main,body');
    var stage=document.getElementById('ubBattleLiveStage');
    if(!stage){
      stage=document.createElement('div'); stage.id='ubBattleLiveStage';
      stage.style.cssText='margin:14px 0;padding:12px;border:1px solid rgba(201,168,76,.45);border-radius:14px;background:rgba(0,0,0,.35);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;color:#fff;';
      if(page) page.insertBefore(stage,page.firstChild);
    }
    var id='ub-battle-tile-'+safeId(role||identity);
    var tile=document.getElementById(id);
    if(!tile){
      tile=document.createElement('div'); tile.id=id;
      tile.style.cssText='position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid rgba(64,208,255,.45);background:#05070d;';
      tile.innerHTML='<div style="position:absolute;left:10px;bottom:8px;z-index:4;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.7);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;">'+(role||identity||'LIVE')+'</div>';
      stage.appendChild(tile);
    }
    return tile;
  }

  function styleVideo(vid, local){
    vid.autoplay=true; vid.playsInline=true; vid.setAttribute('playsinline','true');
    if(local) vid.muted=true;
    vid.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;background:#000;'+(local?'transform:scaleX(-1);':'');
  }

  function attachVideoTo(container, track, identity, local){
    if(!container||!track) return;
    container.style.position=container.style.position||'relative';
    container.style.overflow='hidden';
    var id='ub-lk-video-'+safeId(identity||(local?liveSt.username:'remote'));
    var old=container.querySelector('#'+id);
    if(old) old.remove();
    var vid=document.createElement('video'); vid.id=id; vid.dataset.ubBattleLivekit='yes';
    styleVideo(vid,local);
    container.appendChild(vid);
    track.attach(vid);
  }

  function attachAudio(track, identity){
    var id='ub-lk-audio-'+safeId(identity);
    var old=document.getElementById(id); if(old) old.remove();
    var a=track.attach(); a.id=id; a.autoplay=true; a.playsInline=true;
    document.body.appendChild(a);
  }

  function roleFromIdentity(identity){
    var s=String(identity||'').toLowerCase();
    if(s.indexOf('dj1')!==-1) return 'dj1';
    if(s.indexOf('dj2')!==-1) return 'dj2';
    if(s.indexOf('dj')!==-1) return 'dj';
    if(s.indexOf('teamb')!==-1||s.indexOf('artist2')!==-1) return 'artist2';
    if(s.indexOf('practice')!==-1) return 'practice';
    return 'artist1';
  }

  async function connectBattleLive(role, roomName){
    if(!ok()) return;
    role=String(role||'viewer').toLowerCase();
    roomName=roomName||'battle-room';
    liveSt.role=role; liveSt.battleRoom=roomName; liveSt.username=resolveUsername(role);

    try {
      var LK=await waitForLiveKit();
      var identity=liveSt.username+'-'+role;
      var url=TOKEN_FN+'?room='+encodeURIComponent(roomName)+'&username='+encodeURIComponent(identity);
      var resp=await fetch(url); var data=await resp.json();
      if(!resp.ok||!data.token||!data.url) throw new Error(data.error||'Token fetch failed');

      var room=new LK.Room({ adaptiveStream:true, dynacast:true });
      liveSt.room=room;
      room.on('trackSubscribed',function(track,pub,participant){
        if(track.kind==='audio') return attachAudio(track,participant.identity);
        if(track.kind==='video') attachVideoTo(findVideoContainer(roleFromIdentity(participant.identity),participant.identity),track,participant.identity,false);
      });
      room.on('trackUnsubscribed',function(track,pub,participant){
        var v=document.getElementById('ub-lk-video-'+safeId(participant.identity)); if(v) v.remove();
        var a=document.getElementById('ub-lk-audio-'+safeId(participant.identity)); if(a) a.remove();
      });
      room.on('disconnected',function(){ liveSt.connected=false; });
      await room.connect(data.url,data.token);
      liveSt.connected=true;

      var isPerformer=['viewer','watch','audience'].indexOf(role)===-1;
      if(isPerformer){
        await room.localParticipant.enableCameraAndMicrophone();
        room.localParticipant.trackPublications.forEach(function(pub){
          if(pub.track&&pub.track.kind==='video') attachVideoTo(findVideoContainer(role,liveSt.username),pub.track,identity,true);
        });
        toast('📹 Live cam + mic: '+role);
      } else {
        toast('👁️ Viewing live battle');
      }
      // Sync beat listener
      startBeatListener();
      return room;
    } catch(e){
      toast('⚠️ Battle connect failed: '+(e.message||e));
      console.error('[battle]',e);
    }
  }

  async function toggleBattleMic(){
    if(!liveSt.room) return toast('Not connected');
    liveSt.micOn=!liveSt.micOn;
    await liveSt.room.localParticipant.setMicrophoneEnabled(liveSt.micOn);
    toast(liveSt.micOn?'🎤 Mic on':'🔇 Mic off');
  }

  async function toggleBattleCam(){
    if(!liveSt.room) return toast('Not connected');
    liveSt.camOn=!liveSt.camOn;
    await liveSt.room.localParticipant.setCameraEnabled(liveSt.camOn);
    toast(liveSt.camOn?'📹 Camera on':'📷 Camera off');
  }

  function disconnectBattleLive(){
    if(liveSt.room){ try{ liveSt.room.disconnect(); }catch(e){} }
    liveSt.room=null; liveSt.connected=false;
    document.querySelectorAll('[data-ub-battle-livekit="yes"],[id^="ub-lk-audio-"]').forEach(function(el){ el.remove(); });
  }

  // ═══════════════════════════════════════════════════
  // BEAT SELECTOR (DJ selects from platform_beats)
  // ═══════════════════════════════════════════════════
  var _currentBeat=null, _beatUnsub=null, _beatCache=[];

  function startBeatListener(){
    var fb=getFb(); if(!fb||_beatUnsub) return;
    try{
      _beatUnsub=fb.onSnapshot(fb.doc(fb.db,'battle_rooms','battle-room'),function(snap){
        if(!snap.exists()) return;
        _currentBeat=(snap.data()||{}).selectedBeat||null;
        updateBeatUI();
      });
    }catch(e){}
  }

  function updateBeatUI(){
    var nameEl=document.getElementById('currentBattleBeatName');
    var metaEl=document.getElementById('currentBattleBeatMeta');
    var audio=document.getElementById('battleBeatAudio');
    if(!_currentBeat){
      if(nameEl) nameEl.textContent='No beat selected';
      if(metaEl) metaEl.textContent='Waiting for DJ selection';
      if(audio){ audio.removeAttribute('src'); audio.style.display='none'; }
      return;
    }
    var meta=[_currentBeat.genre,_currentBeat.bpm?_currentBeat.bpm+' BPM':'',_currentBeat.key].filter(Boolean).join(' · ');
    if(nameEl) nameEl.textContent=_currentBeat.name||'Selected Beat';
    if(metaEl) metaEl.textContent=meta||'Selected by DJ';
    if(audio&&_currentBeat.audioUrl){ audio.src=_currentBeat.audioUrl; audio.style.display='block'; }
  }

  async function loadPlatformBeats(){
    var fb=getFb(); if(!fb) return;
    try{
      var q=fb.query(fb.collection(fb.db,'platform_beats'),fb.orderBy('createdAt','desc'));
      var snap=await fb.getDocs(q);
      _beatCache=[];
      snap.forEach(function(d){ _beatCache.push(Object.assign({id:d.id},d.data())); });
      var adminList=document.getElementById('adminBeatList');
      var djList=document.getElementById('djBeatList');
      if(adminList) adminList.innerHTML=_beatCache.length?_beatCache.map(function(b){ return beatRowHtml(b.id,b,'admin'); }).join(''):'<div style="color:rgba(240,237,232,.65);">No beats uploaded yet.</div>';
      if(djList) djList.innerHTML=_beatCache.length?_beatCache.map(function(b){ return beatRowHtml(b.id,b,'dj'); }).join(''):'<div style="color:rgba(240,237,232,.65);">No platform beats available yet.</div>';
      window.__platformBeatsCache=_beatCache;
    }catch(e){ toast('Could not load beats'); }
  }

  function beatRowHtml(id, beat, mode){
    var meta=[beat.genre,beat.bpm?beat.bpm+' BPM':'',beat.key].filter(Boolean).join(' · ')||'Platform beat';
    return '<div class="beat-row"><div class="beat-row-main"><div class="beat-row-name">'+esc(beat.name||'Untitled')+'</div><div class="beat-row-meta">'+esc(meta)+'</div></div><div class="beat-row-actions"><button class="btn btn-blue" onclick="ubBattle.previewBeat(\''+esc(id)+'\')">▶</button>'+(mode==='dj'?'<button class="btn btn-gold" onclick="ubBattle.selectBeat(\''+esc(id)+'\')">Select</button>':'')+(mode==='admin'?'<button class="btn btn-red" onclick="ubBattle.deleteBeat(\''+esc(id)+'\')">Delete</button>':'')+'</div></div>';
  }

  async function selectBeat(id){
    var fb=getFb(); if(!fb) return;
    var beat=(_beatCache||[]).find(function(b){ return b.id===id; });
    if(!beat) return toast('Beat not found');
    var selected={ beatId:id, name:beat.name||'Untitled', bpm:beat.bpm||'', key:beat.key||'', genre:beat.genre||'', audioUrl:beat.audioUrl, selectedBy:resolveUsername('dj'), selectedAt:new Date().toISOString() };
    await fb.setDoc(fb.doc(fb.db,'battle_rooms','battle-room'),{ selectedBeat:selected, updatedAt:fb.serverTimestamp() },{merge:true});
    toast('🎧 Beat selected for battle');
  }

  function previewBeat(id){
    var beat=(_beatCache||[]).find(function(b){ return b.id===id; });
    if(!beat||!beat.audioUrl) return;
    var audio=document.getElementById('battleBeatAudio')||new Audio();
    audio.src=beat.audioUrl; audio.style.display='block';
    audio.play().catch(function(){});
  }

  async function deleteBeat(id){
    if(!confirm('Delete this beat?')) return;
    var fb=getFb(); if(!fb) return;
    await fb.deleteDoc(fb.doc(fb.db,'platform_beats',id));
    await loadPlatformBeats();
    toast('🗑️ Beat deleted');
  }

  // ═══════════════════════════════════════════════════
  // BATTLE MODES (Showdown, Dog Cage, Tournament, DJ Battle, Practice)
  // ═══════════════════════════════════════════════════
  var MODES = {
    showdown:{ title:'SHOWDOWN', tag:'2V2 · 3 MIN ROUNDS', desc:'Main event team battle. Team A vs Team B, four live cameras, live mics, DJ-controlled beat, and 3-minute rounds.', room:'battle-showdown-2v2', slots:['teamA1','teamA2','teamB1','teamB2'], round:'3:00', type:'artist' },
    dogcage:{ title:'DOG CAGE', tag:'1V1 · FLEXIBLE ROUNDS', desc:'Raw 1v1 battle mode. Quick, standard, or extended rounds.', room:'battle-dog-cage-1v1', slots:['artist1','artist2'], round:'Optional', type:'artist' },
    tournament:{ title:'TOURNAMENT', tag:'BRACKET · 3 MIN ROUNDS', desc:'Official bracket competition. 8, 16, or 32 artists, elimination advancement, final champion.', room:'battle-tournament-bracket', slots:['artist1','artist2'], round:'3:00', type:'tournament' },
    djbattle:{ title:'DJ BATTLE ROOM', tag:'DJ VS DJ · EQUIPMENT READY', desc:'Two DJs go head-to-head live. MIDI controller ready, perform, scratch, and let the crowd watch.', room:'battle-dj-room', slots:['dj1','dj2'], round:'DJ Controlled', type:'dj' },
    practice:{ title:'PRACTICE', tag:'SOLO · TRAINING MODE', desc:'Solo training mode. Select a beat, test mic/cam, sharpen rounds before entering live battles.', room:'battle-practice-solo', slots:['practice'], round:'Optional', type:'practice' }
  };

  var modeState = { mode:'showdown', room:'battle-showdown-2v2', status:'waiting', round:1, roundSeconds:180, startedAt:null, scores:{ teamA:0,teamB:0,artist1:0,artist2:0,dj1:0,dj2:0 }, winner:'', bracket:{ size:8,round:1,match:1,champion:'' } };

  function saveState(){ try{ localStorage.setItem('ub_battle_state_'+modeState.room,JSON.stringify(modeState)); }catch(e){} renderState(); }
  function setScore(key,delta){ modeState.scores[key]=Math.max(0,(Number(modeState.scores[key])||0)+delta); saveState(); }
  function resetScores(){ modeState.scores={teamA:0,teamB:0,artist1:0,artist2:0,dj1:0,dj2:0}; modeState.winner=''; saveState(); }
  function startTimer(sec){ modeState.roundSeconds=sec||180; modeState.startedAt=Date.now(); modeState.status='live'; saveState(); toast('▶ Round started'); }
  function stopTimer(){ modeState.status='paused'; saveState(); toast('⏸ Timer stopped'); }
  function setWinner(name){ modeState.winner=name; modeState.status='complete'; saveState(); toast('🏆 Winner: '+name); }
  function pickBracketSize(size){ modeState.bracket={size:size,round:1,match:1,champion:''}; saveState(); }
  function advanceTournament(name){ modeState.bracket.match+=1; if(modeState.bracket.match>Math.max(1,modeState.bracket.size/Math.pow(2,modeState.bracket.round))){ modeState.bracket.round+=1; modeState.bracket.match=1; } if(modeState.bracket.round>Math.log2(modeState.bracket.size)) modeState.bracket.champion=name; saveState(); toast(modeState.bracket.champion?'👑 Champion locked':'➡️ Winner advanced'); }

  function timeLeft(){ if(modeState.status!=='live'||!modeState.startedAt) return modeState.status; var left=Math.max(0,modeState.roundSeconds-Math.floor((Date.now()-modeState.startedAt)/1000)); if(left<=0&&modeState.status==='live'){ modeState.status='round-ended'; saveState(); } var m=Math.floor(left/60),s=left%60; return m+':'+(s<10?'0':'')+s; }

  function renderState(){
    document.querySelectorAll('[data-score]').forEach(function(el){ el.textContent=modeState.scores[el.dataset.score]||0; });
    document.querySelectorAll('[data-timer]').forEach(function(el){ el.textContent=timeLeft(); });
    document.querySelectorAll('[data-winner]').forEach(function(el){ el.textContent=modeState.winner||'—'; });
    document.querySelectorAll('[data-bracket-round]').forEach(function(el){ el.textContent=modeState.bracket.round; });
    document.querySelectorAll('[data-bracket-match]').forEach(function(el){ el.textContent=modeState.bracket.match; });
    document.querySelectorAll('[data-bracket-champion]').forEach(function(el){ el.textContent=modeState.bracket.champion||'—'; });
  }
  setInterval(renderState,500);

  function labelForSlot(slot){ return slot==='dj1'?'DJ 1':slot==='dj2'?'DJ 2':slot.toUpperCase(); }
  function liveRoleForSlot(slot){ if(slot==='practice') return 'practice'; if(slot==='dj1') return 'dj1'; if(slot==='dj2') return 'dj2'; if(slot==='artist2'||slot==='teamB1'||slot==='teamB2') return 'artist2'; return 'artist1'; }

  function makeSlotTile(slot){
    var tile=document.createElement('div');
    tile.dataset.battleVideo=slot;
    tile.style.cssText='position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid rgba(64,208,255,.45);background:#05070d;display:flex;align-items:center;justify-content:center;color:rgba(240,237,232,.55);font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;text-align:center;';
    tile.innerHTML='<div>'+labelForSlot(slot)+'<br><span style="font-size:.45rem;color:#40D0FF;">LIVE CAM READY</span></div><div style="position:absolute;left:10px;bottom:8px;z-index:4;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.7);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.5px;">'+labelForSlot(slot)+'</div>';
    return tile;
  }

  function panelShell(title,inner){ return '<div style="margin-top:14px;padding:14px;border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.32);"><div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">'+title+'</div>'+inner+'</div>'; }
  function scoreBox(name,key){ return '<div style="border:1px solid rgba(64,208,255,.35);border-radius:10px;padding:10px;text-align:center;"><div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;letter-spacing:2px;">'+name+'</div><div data-score="'+key+'" style="font-size:1.8rem;color:#40D0FF;font-family:Orbitron,sans-serif;">0</div><button class="btn btn-blue" onclick="ubBattle.score(\''+key+'\',1)">+1</button><button class="btn btn-blue" onclick="ubBattle.score(\''+key+'\',-1)">-1</button></div>'; }

  function renderControlPanel(key){
    var panel=document.getElementById('ubBattleControlPanel'); if(!panel) return;
    if(key==='showdown') panel.innerHTML=panelShell('SHOWDOWN CONTROL','<div data-timer style="color:#F0C040;font-family:Orbitron;margin-bottom:10px;">waiting</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:10px;">'+scoreBox('TEAM A','teamA')+scoreBox('TEAM B','teamB')+'</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;"><button class="btn btn-blue" onclick="ubBattle.equipment()">🎧 DJ PANEL</button><button class="btn btn-blue" onclick="ubBattle.start(180)">⏱️ 3:00 TIMER</button><button class="btn btn-blue" onclick="ubBattle.resetScores()">RESET</button><button class="btn btn-gold" onclick="ubBattle.win(\'teamA\')">TEAM A WINS</button><button class="btn btn-gold" onclick="ubBattle.win(\'teamB\')">TEAM B WINS</button></div><div style="margin-top:8px;color:#F0C040;">Winner: <span data-winner>—</span></div>');
    else if(key==='dogcage') panel.innerHTML=panelShell('DOG CAGE CONTROL','<div data-timer style="color:#F0C040;font-family:Orbitron;margin-bottom:10px;">waiting</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;"><button class="btn btn-blue" onclick="ubBattle.start(60)">⚡ QUICK</button><button class="btn btn-blue" onclick="ubBattle.start(120)">⏱️ STANDARD</button><button class="btn btn-blue" onclick="ubBattle.start(180)">🔥 EXTENDED</button><button class="btn btn-gold" onclick="ubBattle.win(\'artist1\')">ARTIST 1 WINS</button><button class="btn btn-gold" onclick="ubBattle.win(\'artist2\')">ARTIST 2 WINS</button></div><div style="margin-top:8px;color:#F0C040;">Winner: <span data-winner>—</span></div>');
    else if(key==='djbattle') panel.innerHTML=panelShell('DJ BATTLE CONTROL','<div data-timer style="color:#F0C040;font-family:Orbitron;margin-bottom:10px;">waiting</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">'+scoreBox('DJ 1','dj1')+scoreBox('DJ 2','dj2')+'</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;"><button class="btn btn-blue" onclick="ubBattle.equipment()">🎚️ EQUIPMENT</button><button class="btn btn-blue" onclick="ubBattle.midi()">🎛️ MIDI SETUP</button><button class="btn btn-blue" onclick="ubBattle.start(180)">⏱️ START TIMER</button><button class="btn btn-gold" onclick="ubBattle.win(\'dj1\')">DJ 1 WINS</button><button class="btn btn-gold" onclick="ubBattle.win(\'dj2\')">DJ 2 WINS</button></div><div style="margin-top:8px;color:#F0C040;">Winner: <span data-winner>—</span></div>');
    else if(key==='tournament') panel.innerHTML=panelShell('TOURNAMENT BRACKET','<div data-timer style="color:#F0C040;font-family:Orbitron;margin-bottom:10px;">waiting</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px;"><div style="border:1px solid rgba(201,168,76,.35);border-radius:10px;padding:9px;color:#F0C040;">ROUND<br><span data-bracket-round style="color:#40D0FF;">1</span></div><div style="border:1px solid rgba(201,168,76,.35);border-radius:10px;padding:9px;color:#F0C040;">MATCH<br><span data-bracket-match style="color:#40D0FF;">1</span></div><div style="border:1px solid rgba(201,168,76,.35);border-radius:10px;padding:9px;color:#F0C040;">CHAMPION<br><span data-bracket-champion style="color:#40D0FF;">—</span></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;"><button class="btn btn-blue" onclick="ubBattle.bracket(8)">8 ARTISTS</button><button class="btn btn-blue" onclick="ubBattle.bracket(16)">16 ARTISTS</button><button class="btn btn-blue" onclick="ubBattle.start(180)">⏱️ TIMER</button><button class="btn btn-gold" onclick="ubBattle.advance(\'artist1\')">ARTIST 1 ADVANCE</button><button class="btn btn-gold" onclick="ubBattle.advance(\'artist2\')">ARTIST 2 ADVANCE</button></div>');
    else panel.innerHTML=panelShell('PRACTICE CONTROL','<div data-timer style="color:#F0C040;font-family:Orbitron;margin-bottom:10px;">waiting</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;"><button class="btn btn-blue" onclick="ubBattle.equipment()">🎵 AUDIO SETUP</button><button class="btn btn-gold" onclick="ubBattle.start(60)">▶ 60 SEC PRACTICE</button></div>');
  }

  function ensureBattlePage(){
    var page=document.getElementById('page-battle-live'); if(page) return page;
    page=document.createElement('section'); page.id='page-battle-live'; page.className='page';
    page.innerHTML='<div class="top-bar"><button class="icon-btn" id="ubBattleBackBtn">←</button><div class="brand-title" style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.2rem;letter-spacing:3px;color:#F0C040;">LIVE BATTLE</div><div></div></div><div class="page-body"><div id="ubBattleModeTitle" style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:2px;color:#F0C040;margin-bottom:6px;">BATTLE</div><div id="ubBattleModeDesc" style="color:rgba(240,237,232,.72);margin-bottom:10px;font-size:.9rem;"></div><div id="ubBattleRoundInfo" style="display:inline-block;margin-bottom:12px;padding:5px 9px;border-radius:999px;border:1px solid rgba(64,208,255,.55);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.8px;">ROUND</div><div id="ubBattleLiveStage" style="margin:14px 0;padding:12px;border:1px solid rgba(201,168,76,.45);border-radius:14px;background:rgba(0,0,0,.35);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;color:#fff;"></div><div id="ubBattleRoleRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px;"></div><div id="ubBattleControlPanel"></div><div style="display:grid;gap:10px;margin-top:10px;"><button class="btn btn-gold" onclick="disconnectBattleLive&&disconnectBattleLive();ubBattle.leaveRoom()">LEAVE LIVE</button></div></div>';
    document.body.appendChild(page);
    page.querySelector('#ubBattleBackBtn').onclick=function(){ disconnectBattleLive&&disconnectBattleLive(); go('queue'); };
    return page;
  }

  function openMode(key){
    var mode=MODES[key]||MODES.showdown;
    modeState.mode=key; modeState.room=mode.room;
    try{ var raw=localStorage.getItem('ub_battle_state_'+mode.room); if(raw) Object.assign(modeState,JSON.parse(raw)); }catch(e){}
    var page=ensureBattlePage();
    var title=page.querySelector('#ubBattleModeTitle'); if(title) title.textContent=mode.title+' · '+mode.tag;
    var desc=page.querySelector('#ubBattleModeDesc'); if(desc) desc.textContent=mode.desc;
    var round=page.querySelector('#ubBattleRoundInfo'); if(round) round.textContent='ROUND: '+mode.round;
    var stage=page.querySelector('#ubBattleLiveStage');
    if(stage){ stage.innerHTML=''; mode.slots.forEach(function(s){ stage.appendChild(makeSlotTile(s)); }); }
    var roles=page.querySelector('#ubBattleRoleRow');
    if(roles){
      roles.innerHTML='';
      mode.slots.forEach(function(slot){
        var liveRole=liveRoleForSlot(slot);
        var btn=document.createElement('button'); btn.className='btn btn-gold';
        btn.textContent='JOIN '+labelForSlot(slot);
        btn.onclick=function(){ connectBattleLive(liveRole,mode.room); };
        roles.appendChild(btn);
      });
      if(key!=='practice'&&key!=='djbattle'){
        var dj=document.createElement('button'); dj.className='btn btn-blue';
        dj.textContent='JOIN AS DJ';
        dj.onclick=function(){ connectBattleLive('dj',mode.room); };
        roles.appendChild(dj);
      }
      // Viewer button for all modes
      var viewer=document.createElement('button'); viewer.className='btn btn-blue';
      viewer.textContent='👀 WATCH';
      viewer.onclick=function(){ connectBattleLive('viewer',mode.room); };
      roles.appendChild(viewer);
    }
    renderControlPanel(key);
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    page.classList.add('active');
    renderState();
    loadPlatformBeats();
    startBeatListener();
  }

  function injectModeSelector(){
    if(!ok()) return;
    var queueBody=document.querySelector('#page-queue .page-body'); if(!queueBody) return;
    var existing=document.getElementById('ubBattleModesPanel');
    if(existing&&existing.closest('#page-queue')) return;
    if(existing) existing.remove();
    var panel=document.createElement('div'); panel.id='ubBattleModesPanel';
    panel.style.cssText='margin:0 0 18px;padding:16px;border-radius:16px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.26);color:#fff;';
    panel.innerHTML='<div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">JOIN BATTLE CLASSES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.9rem;letter-spacing:2px;color:#F0C040;line-height:1;">CHOOSE YOUR BATTLE FORMAT</div><div style="font-size:.9rem;color:rgba(240,237,232,.7);margin:7px 0 14px;">Artist battles, DJ battles, tournament brackets, and solo practice.</div><div id="ubBattleModesGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;"></div>';
    var grid=panel.querySelector('#ubBattleModesGrid');
    Object.keys(MODES).forEach(function(k){
      var mode=MODES[k];
      var card=document.createElement('div');
      card.style.cssText='padding:15px;border-radius:14px;border:1px solid rgba(201,168,76,.42);background:linear-gradient(135deg,rgba(201,168,76,.10),rgba(64,208,255,.07));cursor:pointer;color:#fff;';
      card.innerHTML='<div><div style="display:inline-block;margin-bottom:8px;padding:4px 8px;border-radius:999px;border:1px solid #40D0FF;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:2px;font-weight:900;">'+mode.tag+'</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.65rem;letter-spacing:2px;color:#F0C040;line-height:1;">'+mode.title+'</div><div style="font-size:.86rem;line-height:1.35;color:rgba(240,237,232,.75);margin-top:7px;">'+mode.desc+'</div></div>';
      card.onclick=function(){ openMode(k); };
      grid.appendChild(card);
    });
    queueBody.insertBefore(panel,queueBody.firstChild);
  }

  // ── Equipment / MIDI scanner ──
  async function scanMedia(){
    try{ await navigator.mediaDevices.getUserMedia({audio:true,video:true}); }catch(e){}
    var devices=[]; try{ devices=await navigator.mediaDevices.enumerateDevices(); }catch(e){}
    return { audioIn:devices.filter(function(d){return d.kind==='audioinput';}), audioOut:devices.filter(function(d){return d.kind==='audiooutput';}), videoIn:devices.filter(function(d){return d.kind==='videoinput';}) };
  }

  async function scanMidi(){
    if(!navigator.requestMIDIAccess) return { supported:false, inputs:[], outputs:[] };
    try{
      var access=await navigator.requestMIDIAccess();
      var inputs=[]; access.inputs.forEach(function(v){ inputs.push({label:v.name,type:'MIDI Input'}); });
      var outputs=[]; access.outputs.forEach(function(v){ outputs.push({label:v.name,type:'MIDI Output'}); });
      return { supported:true, inputs:inputs, outputs:outputs };
    }catch(e){ return { supported:true, inputs:[], outputs:[], error:e.message }; }
  }

  function deviceRow(label,items){
    if(!items||!items.length) return '<div style="padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:rgba(240,237,232,.62);">No '+label+' detected yet.</div>';
    return items.map(function(d){ return '<div style="padding:10px;border:1px solid rgba(64,208,255,.25);border-radius:10px;margin-bottom:7px;background:rgba(255,255,255,.035);"><b style="color:#F0C040;">'+(d.label||label)+'</b><div style="font-size:.75rem;color:rgba(240,237,232,.62);">'+(d.kind||d.type||'connected')+'</div></div>'; }).join('');
  }

  function ensureSetupModal(){
    var m=document.getElementById('ubDjSetupModal'); if(m) return m;
    m=document.createElement('div'); m.id='ubDjSetupModal';
    m.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.86);display:none;align-items:center;justify-content:center;padding:18px;color:#fff;';
    m.innerHTML='<div style="width:min(760px,96vw);max-height:88vh;overflow:auto;border-radius:18px;border:1px solid rgba(201,168,76,.55);background:rgba(5,7,13,.97);padding:16px;"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;"><div><div style="font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;color:#40D0FF;">DJ EQUIPMENT CENTER</div><div id="ubDjSetupTitle" style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:2px;color:#F0C040;line-height:1;">SETUP</div></div><button class="btn btn-gold" id="ubDjSetupClose" style="width:auto;padding:9px 12px;">CLOSE</button></div><div id="ubDjSetupBody"></div></div>';
    document.body.appendChild(m);
    m.querySelector('#ubDjSetupClose').onclick=function(){ m.style.display='none'; };
    return m;
  }

  async function openEquipment(){
    var m=ensureSetupModal(); m.style.display='flex';
    m.querySelector('#ubDjSetupTitle').textContent='EQUIPMENT SETUP';
    var body=m.querySelector('#ubDjSetupBody');
    body.innerHTML='<div>Scanning devices...</div>';
    var media=await scanMedia();
    body.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;"><div><div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:7px;">MIC / AUDIO INPUT</div>'+deviceRow('audio input',media.audioIn)+'</div><div><div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:7px;">SPEAKERS / OUTPUT</div>'+deviceRow('audio output',media.audioOut)+'</div><div><div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:7px;">CAMERA</div>'+deviceRow('camera',media.videoIn)+'</div></div><button class="btn btn-gold" style="margin-top:12px;" onclick="ubBattle.equipment()">SCAN AGAIN</button>';
  }

  async function openMidi(){
    var m=ensureSetupModal(); m.style.display='flex';
    m.querySelector('#ubDjSetupTitle').textContent='MIDI SETUP';
    var body=m.querySelector('#ubDjSetupBody');
    body.innerHTML='<div>Scanning MIDI controllers...</div>';
    var midi=await scanMidi();
    body.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;"><div><div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:7px;">MIDI INPUTS</div>'+deviceRow('MIDI input',midi.inputs)+'</div><div><div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:7px;">MIDI OUTPUTS</div>'+deviceRow('MIDI output',midi.outputs)+'</div></div>'+(!midi.supported?'<div style="margin-top:10px;color:#F0C040;">This browser does not support Web MIDI. Chrome/Edge desktop works best.</div>':'')+(midi.error?'<div style="margin-top:10px;color:#F0C040;">'+midi.error+'</div>':'')+'<button class="btn btn-gold" style="margin-top:12px;" onclick="ubBattle.midi()">SCAN AGAIN</button>';
  }

// ═══════════════════════════════════════════════════
// SCHEDULED SESSIONS + MATCHMAKING ENGINE
// Injected into unifreestyle-battle.js
// ═══════════════════════════════════════════════════

// ── EST Time Helpers ──
function getNYTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function getSessionWindow() {
  var ny = getNYTime();
  var h = ny.getHours(), m = ny.getMinutes();
  var totalMins = h * 60 + m;
  // 8:00 PM = 1200, 10:00 PM = 1320, midnight = 1440
  if (totalMins >= 1200 && totalMins < 1440) {
    return {
      open: true,
      session: totalMins < 1320 ? 'open_freestyle' : 'beat_kill',
      sessionName: totalMins < 1320 ? 'Open Freestyle Battle' : 'Beat Kill Session',
      startHour: totalMins < 1320 ? 20 : 22,
      closesAt: 1440
    };
  }
  // Find next session
  var nextStart = totalMins < 1200 ? 1200 : 1200 + 1440; // next 8PM
  var minsUntil = nextStart - totalMins;
  if (minsUntil < 0) minsUntil += 1440;
  return { open: false, minsUntil: minsUntil, nextName: 'Open Freestyle Battle', nextHour: 20 };
}

function fmtCountdown(minsUntil) {
  var h = Math.floor(minsUntil / 60), m = minsUntil % 60;
  if (h > 0) return h + 'h ' + m + 'm until next session';
  return m + ' min until next session';
}

// ── Matchmaking Queue ──
var _queueEntry = null;
var _queueUnsub = null;
var _matchTimeout = null;
var _viewerCountUnsub = null;

function getSessionRoomId(sessionId) {
  return 'scheduled-' + sessionId + '-' + new Date().toISOString().slice(0, 10);
}

async function joinMatchmakingQueue(sessionId) {
  var fb = getFb(); if (!fb) return toast('Firebase not ready');
  var u = currentUser();
  if (!u || !u.username) return toast('Sign in first');

  var win = getSessionWindow();
  if (!win.open) {
    toast('⏰ Sessions open at 8 PM EST. ' + fmtCountdown(win.minsUntil));
    return;
  }

  toast('🔍 Looking for an opponent... (60 seconds)');

  var roomId = getSessionRoomId(sessionId);
  var entryId = u.username + '_' + Date.now();

  _queueEntry = {
    id: entryId,
    username: u.username,
    name: u.name || u.username,
    sessionId: sessionId,
    roomId: roomId,
    joinedAt: Date.now(),
    matched: false
  };

  // Write to queue
  try {
    await fb.setDoc(fb.doc(fb.db, 'matchmaking_queue', entryId), _queueEntry, { merge: true });
  } catch(e) {
    toast('Queue join failed: ' + e.message); return;
  }

  // Update home banner
  updateOpponentBanner(true, u.username);

  // Watch queue for a match
  _queueUnsub = fb.onSnapshot(
    fb.query(
      fb.collection(fb.db, 'matchmaking_queue'),
      fb.where('sessionId', '==', sessionId),
      fb.where('matched', '==', false)
    ),
    function(snap) {
      var entries = [];
      snap.forEach(function(d) { entries.push(Object.assign({ _docId: d.id }, d.data())); });
      // Sort by joinedAt
      entries.sort(function(a, b) { return a.joinedAt - b.joinedAt; });

      // Filter out stale entries (> 65 seconds old)
      var now = Date.now();
      entries = entries.filter(function(e) { return now - e.joinedAt < 65000; });

      // Find two unmatched players
      if (entries.length >= 2) {
        var me = entries.find(function(e) { return e.username === u.username; });
        if (!me) return;
        var opponent = entries.find(function(e) { return e.username !== u.username; });
        if (!opponent) return;

        // Only the player who joined first triggers the match
        if (me.joinedAt <= opponent.joinedAt) {
          createMatch(me, opponent, sessionId, roomId, fb);
        }
      }
    }
  );

  // 60 second timeout
  _matchTimeout = setTimeout(function() {
    cancelQueue();
    toast('⏱ No opponent found. Try again.');
    updateOpponentBanner(false, '');
  }, 60000);
}

async function createMatch(me, opponent, sessionId, roomId, fb) {
  if (!fb) return;
  clearTimeout(_matchTimeout);
  if (_queueUnsub) { try { _queueUnsub(); } catch(e) {} _queueUnsub = null; }

  // Mark both as matched
  try {
    await fb.setDoc(fb.doc(fb.db, 'matchmaking_queue', me._docId), { matched: true, matchedWith: opponent.username, matchRoom: roomId }, { merge: true });
    await fb.setDoc(fb.doc(fb.db, 'matchmaking_queue', opponent._docId), { matched: true, matchedWith: me.username, matchRoom: roomId }, { merge: true });
  } catch(e) { console.warn('[match] mark matched failed:', e); }

  // Create battle session
  try {
    await fb.setDoc(fb.doc(fb.db, 'battle_sessions', roomId), {
      sessionId: sessionId,
      roomId: roomId,
      artist1: me.username,
      artist2: opponent.username,
      startedAt: Date.now(),
      live: true,
      viewerCount: 0
    }, { merge: true });
  } catch(e) { console.warn('[match] session create failed:', e); }

  updateOpponentBanner(false, '');
  toast('⚔️ MATCH FOUND! vs @' + opponent.username + ' — Get ready!');

  setTimeout(function() {
    launchScheduledBattle(roomId, me.username, opponent.username);
  }, 2000);
}

async function cancelQueue() {
  clearTimeout(_matchTimeout);
  if (_queueUnsub) { try { _queueUnsub(); } catch(e) {} _queueUnsub = null; }
  if (_queueEntry) {
    var fb = getFb();
    if (fb) {
      try {
        await fb.deleteDoc(fb.doc(fb.db, 'matchmaking_queue', _queueEntry.id));
      } catch(e) {}
    }
    _queueEntry = null;
  }
  updateOpponentBanner(false, '');
}

function launchScheduledBattle(roomId, artist1, artist2) {
  var u = currentUser();
  var myUsername = u ? u.username : '';
  var role = myUsername === artist1 ? 'artist1' : myUsername === artist2 ? 'artist2' : 'viewer';

  // Open battle page
  if (typeof window.goToPage === 'function') window.goToPage('battle-live');

  setTimeout(function() {
    connectBattleLive(role, roomId);
    startViewerCount(roomId);
    startSessionWatcher(roomId);
  }, 500);
}

// ── Viewer Join as Silent Subscriber ──
async function joinAsViewer(sessionId) {
  var win = getSessionWindow();
  if (!win.open) { toast('⏰ No active session right now'); return; }

  var fb = getFb(); if (!fb) return;

  // Find active battle session for this session type
  try {
    var snap = await fb.getDocs(
      fb.query(
        fb.collection(fb.db, 'battle_sessions'),
        fb.where('sessionId', '==', sessionId),
        fb.where('live', '==', true)
      )
    );
    if (snap.empty) { toast('No active battle right now. Join the queue!'); return; }
    var session = snap.docs[0].data();
    var roomId = session.roomId;

    // Increment viewer count
    await fb.setDoc(fb.doc(fb.db, 'battle_sessions', roomId), {
      viewerCount: fb.increment(1)
    }, { merge: true });

    // Connect as viewer (silent subscriber)
    connectBattleLive('viewer', roomId);
    startViewerCount(roomId);

    toast('👁️ Watching live battle');
  } catch(e) {
    toast('Could not join as viewer: ' + e.message);
  }
}

// ── Live Viewer Count ──
function startViewerCount(roomId) {
  var fb = getFb(); if (!fb) return;
  if (_viewerCountUnsub) { try { _viewerCountUnsub(); } catch(e) {} }

  _viewerCountUnsub = fb.onSnapshot(fb.doc(fb.db, 'battle_sessions', roomId), function(snap) {
    if (!snap.exists()) return;
    var count = (snap.data() || {}).viewerCount || 0;
    // Update viewer count in battle room UI
    var el = document.getElementById('ubLiveViewerCount');
    if (el) el.textContent = count;
    // Update home screen
    var homeEl = document.getElementById('ubHomeViewerCount');
    if (homeEl) homeEl.textContent = count;
  });
}

// ── Session Watcher — close room at midnight EST ──
function startSessionWatcher(roomId) {
  var interval = setInterval(function() {
    var win = getSessionWindow();
    if (!win.open) {
      clearInterval(interval);
      var fb = getFb();
      if (fb) {
        fb.setDoc(fb.doc(fb.db, 'battle_sessions', roomId), { live: false }, { merge: true }).catch(function() {});
      }
      disconnectBattleLive();
      toast('Session ended at midnight EST.');
      if (typeof window.goToPage === 'function') window.goToPage('home');
    }
  }, 30000); // check every 30 seconds
}

// ── Home Screen Banner ──
function updateOpponentBanner(waiting, username) {
  var banner = document.getElementById('ubOpponentWaitingBanner');
  if (!banner) return;
  if (waiting) {
    banner.style.display = 'flex';
    var label = banner.querySelector('#ubOpponentWaitingLabel');
    if (label) label.textContent = '⚡ @' + username + ' is waiting to battle!';
  } else {
    banner.style.display = 'none';
  }
}

// Watch queue for opponent banner on home screen
function watchQueueForBanner(sessionId) {
  var fb = getFb(); if (!fb) return;
  fb.onSnapshot(
    fb.query(
      fb.collection(fb.db, 'matchmaking_queue'),
      fb.where('sessionId', '==', sessionId),
      fb.where('matched', '==', false)
    ),
    function(snap) {
      var now = Date.now();
      var waiting = [];
      snap.forEach(function(d) {
        var data = d.data();
        if (now - data.joinedAt < 65000) waiting.push(data);
      });
      var u = currentUser();
      var myName = u ? u.username : '';
      // Show banner if someone else is waiting (not me)
      var others = waiting.filter(function(e) { return e.username !== myName; });
      if (others.length > 0) {
        updateOpponentBanner(true, others[0].username);
      } else {
        updateOpponentBanner(false, '');
      }
    }
  );
}


  // ═══════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════
  function routeHomeJoinToQueue(){
    var home=document.getElementById('page-home'); if(!home) return;
    var join=home.querySelector('.home-action-row .btn-gold');
    if(join&&join.dataset.ubModeRoute!=='yes'){
      join.dataset.ubModeRoute='yes'; join.removeAttribute('onclick');
      join.addEventListener('click',function(e){ e.preventDefault(); e.stopImmediatePropagation(); go('queue'); setTimeout(injectModeSelector,250); return false; },true);
    }
  }

  function boot(){
    if(!ok()) return;
    routeHomeJoinToQueue();
    if(document.querySelector('#page-queue.active')) injectModeSelector();
    startBeatListener();
    window.loadPlatformBeats=loadPlatformBeats;
  }

  // Public API

  // ═══════════════════════════════════════════════
  // BATTLE DJ DECK ENGINE
  // Local beat player + controller bridge for DJ role
  // ═══════════════════════════════════════════════

  var _djBeatAudio = null;
  var _djBeatCtx   = null;
  var _djBeatSrc   = null;

  function getDjAudio(){
    if(!_djBeatAudio){
      _djBeatAudio = new Audio();
      _djBeatAudio.crossOrigin = 'anonymous';
      _djBeatAudio.loop = true;
    }
    return _djBeatAudio;
  }

  // Load beat into local DJ player
  function djLoadBeat(url, name){
    var a = getDjAudio();
    a.src = url;
    a.load();
    toast('DJ deck loaded: ' + (name||'Beat'));
    // Update DJ deck UI if visible
    var el = document.getElementById('ubDjDeckTrack');
    if(el) el.textContent = name || 'Beat';
  }

  // Hook into selectBeat — also load locally for DJ
  var _origSelectBeat = selectBeat;
  async function selectBeat(id){
    await _origSelectBeat(id);
    var beat = (_beatCache||[]).find(function(b){ return b.id===id; });
    if(beat && beat.audioUrl) djLoadBeat(beat.audioUrl, beat.name);
  }

  // Battle DJ deck actions — maps to runDeckAction compatible interface
  function battleDjAction(action, val){
    var a = getDjAudio();
    val = val !== undefined ? val : 0;

    if(action==='playA' || action==='playB'){
      a.paused ? a.play() : a.pause();
    }
    if(action==='stopA' || action==='stopB'){
      a.pause(); a.currentTime=0;
    }
    if(action==='cueA' || action==='cueB'){
      a.currentTime=0; a.play();
    }
    if(action==='pitchA' || action==='pitchB'){
      var pct = ((val-64)/64)*8;
      a.playbackRate = 1.0+(pct/100);
    }
    if(action==='volumeA' || action==='volumeB'){
      a.volume = val/127;
    }
    if(action==='jogA' || action==='jogB'){
      var speed = val < 64 ? val : val-128;
      a.playbackRate = 1.0+(speed*0.06);
      clearTimeout(battleDjAction._jogTimer);
      battleDjAction._jogTimer = setTimeout(function(){ a.playbackRate=1.0; }, 120);
    }
  }
  battleDjAction._jogTimer = null;

  // Listen for ub-dj-action events from dj-midi-controller.js
  window.addEventListener('ub-dj-action', function(e){
    var detail  = e.detail || {};
    var action  = detail.action;
    var signal  = detail.signal || {};
    var val     = signal.value !== undefined ? signal.value : 0;
    if(!action) return;

    // Only handle if current user is DJ in this battle
    var myRole = resolveUsername('dj') ? 'dj' : null;
    if(!myRole) return;

    battleDjAction(action, val);
  });

  window.ubBattle = {
    modes:MODES, open:openMode, inject:injectModeSelector,
    joinQueue:joinMatchmakingQueue, cancelQueue:cancelQueue,
    joinAsViewer:joinAsViewer, watchQueue:watchQueueForBanner,
    getSessionWindow:getSessionWindow,
    score:setScore, resetScores:resetScores, start:startTimer, stop:stopTimer,
    win:setWinner, advance:advanceTournament, bracket:pickBracketSize,
    equipment:openEquipment, midi:openMidi,
    previewBeat:previewBeat, selectBeat:selectBeat, deleteBeat:deleteBeat,
    leaveRoom:function(){ go('queue'); setTimeout(injectModeSelector,250); }
  };
  // Backward compat
  window.ubBattleModes = window.ubBattle;
  window.connectBattleLive = connectBattleLive;
  window.joinBattleLiveAs = connectBattleLive;
  window.toggleBattleMic = toggleBattleMic;
  window.toggleBattleCam = toggleBattleCam;
  window.disconnectBattleLive = disconnectBattleLive;
  window.ubBattleLiveKit = { state:liveSt, connect:connectBattleLive, mic:toggleBattleMic, cam:toggleBattleCam, disconnect:disconnectBattleLive };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  setTimeout(boot,800);
  setInterval(function(){
    routeHomeJoinToQueue();
    if(document.querySelector('#page-queue.active')) injectModeSelector();
  },1500);
})();
