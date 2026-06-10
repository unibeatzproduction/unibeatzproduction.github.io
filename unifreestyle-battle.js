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
        // Write DJ username to Firestore so others see slot is taken
        if(role==='dj'||role==='dj1'||role==='dj2'){
          var fb2=window.UB_FIREBASE;
          if(fb2&&fb2.db&&roomName){
            fb2.setDoc(fb2.doc(fb2.db,'battle_rooms',roomName),
              { djUsername:liveSt.username, updatedAt:Date.now() },
              { merge:true }
            ).catch(function(){});
          }
        }
        // Inject record button for DJ, artist, admin (not viewers)
        setTimeout(function(){
          if(window.ubRecorder && window.ubRecorder.canRecord('battle')){
            var controls=document.querySelector('.battle-controls, #page-livebattle .top-bar, #page-battle-live .top-bar');
            var btn=document.createElement('div');
            btn.style.cssText='display:inline-block;margin-left:8px;';
            if(controls) controls.appendChild(btn);
            window.ubRecorder.injectBtn('battle', roomName||'battle', btn);
          }
        },500);
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

  function isDj(){ return liveSt.role==='dj'||liveSt.role==='dj1'||liveSt.role==='dj2'; }

  function escHtml(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function djPanelShell(title,inner){ return '<div style="margin-top:14px;padding:14px;border-radius:14px;border:2px solid rgba(201,168,76,.7);background:rgba(0,0,0,.45);"><div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#F0C040;margin-bottom:4px;">🎧 DJ CONTROL PANEL</div><div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:#40D0FF;margin-bottom:10px;">'+title+'</div>'+inner+'</div>'; }

  function viewerPanel(key, roomName){
    // Build viewer panel via DOM to avoid escaping issues
    var wrap=document.createElement('div');
    wrap.id='ubViewerPanel';
    wrap.style.cssText='margin-top:10px;';

    // Scoreboard strip
    var score=document.createElement('div');
    score.style.cssText='display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 12px;border-radius:10px;border:1px solid rgba(201,168,76,.3);background:rgba(0,0,0,.3);margin-bottom:8px;';
    score.innerHTML=
      '<div style="text-align:center;"><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.1rem;color:#F0C040;">TEAM A</div><div data-score="teamA" style="font-family:Orbitron,sans-serif;font-size:1.4rem;color:#40D0FF;">0</div></div>'+
      '<div style="font-family:Orbitron,sans-serif;font-size:.44rem;color:rgba(240,237,232,.4);text-align:center;padding:0 8px;"><div data-timer style="color:#F0C040;font-size:.8rem;margin-bottom:2px;"></div><div>VS</div></div>'+
      '<div style="text-align:center;"><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.1rem;color:#F0C040;">TEAM B</div><div data-score="teamB" style="font-family:Orbitron,sans-serif;font-size:1.4rem;color:#40D0FF;">0</div></div>';
    wrap.appendChild(score);

    // Vote poll
    var poll=document.createElement('div');
    poll.id='ubVotePoll';
    poll.style.cssText='padding:10px 12px;border-radius:10px;border:1px solid rgba(64,208,255,.25);background:rgba(0,0,0,.25);margin-bottom:8px;';
    var pollTitle=document.createElement('div');
    pollTitle.style.cssText='font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:#40D0FF;margin-bottom:8px;';
    pollTitle.textContent="WHO'S WINNING?";
    poll.appendChild(pollTitle);
    var pollBtns=document.createElement('div');
    pollBtns.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    var btnA=document.createElement('button'); btnA.id='ubVoteA';
    btnA.style.cssText='padding:10px;border-radius:10px;border:1px solid rgba(240,192,64,.4);background:rgba(240,192,64,.1);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;cursor:pointer;';
    btnA.textContent='TEAM A'; btnA.onclick=function(){ castVote('teamA',roomName); };
    var btnB=document.createElement('button'); btnB.id='ubVoteB';
    btnB.style.cssText='padding:10px;border-radius:10px;border:1px solid rgba(64,208,255,.4);background:rgba(64,208,255,.1);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;cursor:pointer;';
    btnB.textContent='TEAM B'; btnB.onclick=function(){ castVote('teamB',roomName); };
    pollBtns.appendChild(btnA); pollBtns.appendChild(btnB); poll.appendChild(pollBtns);
    var results=document.createElement('div'); results.id='ubVoteResults'; results.style.cssText='margin-top:8px;display:none;';
    var resultGrid=document.createElement('div'); resultGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:4px;font-family:Orbitron,sans-serif;font-size:.4rem;color:rgba(240,237,232,.6);';
    var barA=document.createElement('div'); barA.id='ubVoteBarA'; barA.style.cssText='background:rgba(240,192,64,.3);border-radius:4px;padding:4px 6px;text-align:center;';
    var barB=document.createElement('div'); barB.id='ubVoteBarB'; barB.style.cssText='background:rgba(64,208,255,.3);border-radius:4px;padding:4px 6px;text-align:center;';
    resultGrid.appendChild(barA); resultGrid.appendChild(barB); results.appendChild(resultGrid); poll.appendChild(results);
    wrap.appendChild(poll);

    // Live chat
    var chatBox=document.createElement('div');
    chatBox.style.cssText='border-radius:10px;border:1px solid rgba(64,208,255,.2);background:rgba(0,0,0,.22);overflow:hidden;';
    var chatHead=document.createElement('div');
    chatHead.style.cssText='padding:8px 10px;border-bottom:1px solid rgba(64,208,255,.12);font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;color:#40D0FF;';
    chatHead.textContent='LIVE CHAT';
    var chatList=document.createElement('div'); chatList.id='ubBattleChatList';
    chatList.style.cssText='height:130px;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px;';
    var chatRow=document.createElement('div'); chatRow.style.cssText='display:grid;grid-template-columns:1fr auto;gap:6px;padding:8px;';
    var chatInput=document.createElement('input'); chatInput.id='ubBattleChatInput'; chatInput.maxLength=200; chatInput.placeholder='Say something...';
    chatInput.style.cssText='background:#05070d;border:1px solid rgba(64,208,255,.35);border-radius:8px;color:#fff;padding:8px 10px;font-size:.85rem;outline:none;';
    chatInput.addEventListener('keydown',function(e){ if(e.key==='Enter') sendBattleChat(roomName); });
    var chatSend=document.createElement('button');
    chatSend.style.cssText='border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.44rem;font-weight:900;padding:0 12px;cursor:pointer;';
    chatSend.textContent='SEND'; chatSend.onclick=function(){ sendBattleChat(roomName); };
    chatRow.appendChild(chatInput); chatRow.appendChild(chatSend);
    chatBox.appendChild(chatHead); chatBox.appendChild(chatList); chatBox.appendChild(chatRow);
    wrap.appendChild(chatBox);

    return wrap.outerHTML;
  }


  function renderControlPanel(key){
    var panel=document.getElementById('ubBattleControlPanel');
    if(!panel){
      // FIX: create control panel if it doesn't exist yet
      panel=document.createElement('div');
      panel.id='ubBattleControlPanel';
      panel.style.cssText='margin-top:10px;';
      var page=document.getElementById('page-battle-live');
      var body=page?page.querySelector('.page-body'):null;
      if(body) body.appendChild(panel);
      else return; // truly no battle page
    }
    var roomName=modeState.room||'battle-room';
    var isDJRole=isDj();
    var vp=viewerPanel(key,roomName);

    // Build DJ-only control HTML using DOM to avoid quote escaping issues
    function makeDjPanel(title, buildFn){
      var wrap=document.createElement('div');
      wrap.style.cssText='margin-top:14px;padding:14px;border-radius:14px;border:2px solid rgba(201,168,76,.7);background:rgba(0,0,0,.45);';
      wrap.innerHTML='<div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#F0C040;margin-bottom:4px;">&#127911; DJ CONTROL PANEL</div><div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:#40D0FF;margin-bottom:10px;">'+title+'</div>';
      buildFn(wrap);
      return wrap;
    }

    function addBtn(parent,label,cls,fn){
      var b=document.createElement('button'); b.className='btn '+(cls||'btn-blue');
      b.textContent=label; b.onclick=fn; parent.appendChild(b); return b;
    }

    function addGrid(parent,cols){
      var g=document.createElement('div');
      g.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax('+(cols||120)+'px,1fr));gap:8px;margin-bottom:8px;';
      parent.appendChild(g); return g;
    }

    panel.innerHTML=''; // clear
    var vpDiv=document.createElement('div'); vpDiv.innerHTML=vp; panel.appendChild(vpDiv);

    // FIX: wire chat input Enter key after DOM injection
    var chatInput=panel.querySelector('#ubBattleChatInput');
    if(chatInput) chatInput.addEventListener('keydown',function(e){ if(e.key==='Enter') sendBattleChat(roomName); });

    // FIX: small delay so DOM is painted before snapshot listener tries to find #ubBattleChatList
    setTimeout(function(){
      startBattleChatListener(roomName);
      startVoteListener(roomName);
    }, 100);

    if(!isDJRole){ return; }

    // Build DJ panel based on mode
    var djWrap=makeDjPanel(
      key==='showdown'?'SHOWDOWN CONTROL':key==='dogcage'?'DOG CAGE CONTROL':key==='djbattle'?'DJ BATTLE CONTROL':key==='tournament'?'TOURNAMENT BRACKET':'PRACTICE CONTROL',
      function(wrap){
        if(key==='showdown'){
          // Score boxes
          var sg=addGrid(wrap,140);
          ['teamA','teamB'].forEach(function(k,i){
            var box=document.createElement('div');
            box.style.cssText='border:1px solid rgba(64,208,255,.35);border-radius:10px;padding:10px;text-align:center;';
            var nm=i===0?'TEAM A':'TEAM B';
            box.innerHTML='<div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:1.3rem;letter-spacing:2px;">'+nm+'</div><div data-score="'+k+'" style="font-size:1.6rem;color:#40D0FF;font-family:Orbitron,sans-serif;">0</div>';
            var bg=addGrid(box,60); bg.style.gridTemplateColumns='1fr 1fr';
            var p1=document.createElement('button'); p1.className='btn btn-blue'; p1.textContent='+1'; p1.onclick=function(){ setScore(k,1); }; bg.appendChild(p1);
            var m1=document.createElement('button'); m1.className='btn btn-blue'; m1.textContent='-1'; m1.onclick=function(){ setScore(k,-1); }; bg.appendChild(m1);
            sg.appendChild(box);
          });
          var cg=addGrid(wrap,110);
          addBtn(cg,'🎧 DJ PANEL','btn-blue',function(){ openEquipment(); });
          addBtn(cg,'⏱️ 3:00','btn-blue',function(){ startTimer(180); });
          addBtn(cg,'RESET','btn-blue',function(){ resetScores(); });
          addBtn(cg,'TEAM A WINS','btn-gold',function(){ setWinner('teamA'); });
          addBtn(cg,'TEAM B WINS','btn-gold',function(){ setWinner('teamB'); });
          var wd=document.createElement('div'); wd.style.cssText='margin-top:8px;color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;';
          wd.innerHTML='Winner: <span data-winner>—</span>'; wrap.appendChild(wd);
        } else if(key==='dogcage'){
          var cg=addGrid(wrap,110);
          addBtn(cg,'⚡ QUICK','btn-blue',function(){ startTimer(60); });
          addBtn(cg,'⏱️ STANDARD','btn-blue',function(){ startTimer(120); });
          addBtn(cg,'🔥 EXTENDED','btn-blue',function(){ startTimer(180); });
          addBtn(cg,'ARTIST 1 WINS','btn-gold',function(){ setWinner('artist1'); });
          addBtn(cg,'ARTIST 2 WINS','btn-gold',function(){ setWinner('artist2'); });
          var wd=document.createElement('div'); wd.style.cssText='margin-top:8px;color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;';
          wd.innerHTML='Winner: <span data-winner>—</span>'; wrap.appendChild(wd);
        } else if(key==='djbattle'){
          var sg=addGrid(wrap,140);
          ['dj1','dj2'].forEach(function(k,i){
            var box=document.createElement('div');
            box.style.cssText='border:1px solid rgba(64,208,255,.35);border-radius:10px;padding:10px;text-align:center;';
            box.innerHTML='<div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:1.3rem;letter-spacing:2px;">'+(i===0?'DJ 1':'DJ 2')+'</div><div data-score="'+k+'" style="font-size:1.6rem;color:#40D0FF;font-family:Orbitron,sans-serif;">0</div>';
            var bg=addGrid(box,60); bg.style.gridTemplateColumns='1fr 1fr';
            var kk=k;
            var p1=document.createElement('button'); p1.className='btn btn-blue'; p1.textContent='+1'; p1.onclick=function(){ setScore(kk,1); }; bg.appendChild(p1);
            var m1=document.createElement('button'); m1.className='btn btn-blue'; m1.textContent='-1'; m1.onclick=function(){ setScore(kk,-1); }; bg.appendChild(m1);
            sg.appendChild(box);
          });
          var cg=addGrid(wrap,110);
          addBtn(cg,'🎚️ EQUIPMENT','btn-blue',function(){ openEquipment(); });
          addBtn(cg,'🎛️ MIDI','btn-blue',function(){ openMidi(); });
          addBtn(cg,'⏱️ START','btn-blue',function(){ startTimer(180); });
          addBtn(cg,'DJ 1 WINS','btn-gold',function(){ setWinner('dj1'); });
          addBtn(cg,'DJ 2 WINS','btn-gold',function(){ setWinner('dj2'); });
          var wd=document.createElement('div'); wd.style.cssText='margin-top:8px;color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;';
          wd.innerHTML='Winner: <span data-winner>—</span>'; wrap.appendChild(wd);
        } else if(key==='tournament'){
          var sg=addGrid(wrap,100);
          ['ROUND','MATCH','CHAMPION'].forEach(function(lbl,i){
            var box=document.createElement('div');
            box.style.cssText='border:1px solid rgba(201,168,76,.35);border-radius:10px;padding:9px;color:#F0C040;text-align:center;font-family:Orbitron,sans-serif;font-size:.48rem;';
            var attr=i===0?'data-bracket-round':i===1?'data-bracket-match':'data-bracket-champion';
            box.innerHTML=lbl+'<br><span '+attr+' style="color:#40D0FF;">'+( i===2?'—':'1')+'</span>';
            sg.appendChild(box);
          });
          var cg=addGrid(wrap,110);
          addBtn(cg,'8 ARTISTS','btn-blue',function(){ pickBracketSize(8); });
          addBtn(cg,'16 ARTISTS','btn-blue',function(){ pickBracketSize(16); });
          addBtn(cg,'⏱️ TIMER','btn-blue',function(){ startTimer(180); });
          addBtn(cg,'A1 ADVANCE','btn-gold',function(){ advanceTournament('artist1'); });
          addBtn(cg,'A2 ADVANCE','btn-gold',function(){ advanceTournament('artist2'); });
        } else {
          // Practice
          var cg=addGrid(wrap,120);
          addBtn(cg,'🎵 AUDIO','btn-blue',function(){ openEquipment(); });
          addBtn(cg,'▶ 60 SEC PRACTICE','btn-gold',function(){ startTimer(60); });
          // AI DJ toggle
          var aiBtn=addBtn(cg,_aiDjActive?'🤖 STOP AI DJ':'🤖 AI DJ ON','btn-blue',function(){
            if(_aiDjActive) stopAiDj(); else startAiDj(roomName);
            aiBtn.textContent=_aiDjActive?'🤖 STOP AI DJ':'🤖 AI DJ ON';
          });
        }
      }
    );
    panel.appendChild(djWrap);
    // FIX: already called above with delay, but ensure for DJ too
    setTimeout(function(){
      startBattleChatListener(roomName);
      startVoteListener(roomName);
    }, 150);
  }


  var _battleChatUnsub=null;
  function startBattleChatListener(roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    if(_battleChatUnsub){ try{_battleChatUnsub();}catch(e){} }
    fb.setDoc(fb.doc(fb.db,'live_chats',roomName),{room:roomName,updatedAt:Date.now()},{merge:true}).catch(function(){});
    var q=fb.query(fb.collection(fb.db,'live_chats',roomName,'messages'),fb.orderBy('at','asc'));
    _battleChatUnsub=fb.onSnapshot(q,function(snap){
      var list=document.getElementById('ubBattleChatList'); if(!list) return;
      list.innerHTML='';
      snap.forEach(function(doc){
        var d=doc.data();
        var row=document.createElement('div');
        row.style.cssText='font-size:.82rem;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);';
        row.innerHTML='<b style="color:#40D0FF;">'+escHtml(d.from)+':</b> '+escHtml(d.text);
        list.appendChild(row);
      });
      list.scrollTop=list.scrollHeight;
    });
  }

  function sendBattleChat(roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    var input=document.getElementById('ubBattleChatInput'); if(!input) return;
    var msg=input.value.trim(); if(!msg) return;
    var u=currentUser(); var me=(u&&(u.username||u.name))||'guest';
    input.value='';
    fb.addDoc(fb.collection(fb.db,'live_chats',roomName,'messages'),{from:me,text:msg,at:Date.now()}).catch(function(){});
  }

  var _voteUnsub=null; var _myVote=null;
  function startVoteListener(roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    if(_voteUnsub){ try{_voteUnsub();}catch(e){} }
    _myVote=null;
    var ref=fb.doc(fb.db,'battle_votes',roomName);
    _voteUnsub=fb.onSnapshot(ref,function(snap){
      if(!snap.exists()) return;
      var d=snap.data()||{};
      renderVoteResults(d.teamA||0,d.teamB||0);
    });
  }

  function castVote(side,roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    var u=currentUser(); var me=(u&&(u.username||u.name))||'guest';
    if(_myVote){ window.showToast&&showToast('Already voted'); return; }
    _myVote=side;
    var btnA=document.getElementById('ubVoteA'),btnB=document.getElementById('ubVoteB');
    if(btnA){btnA.disabled=true;btnA.style.opacity=side==='teamA'?'1':'0.4';}
    if(btnB){btnB.disabled=true;btnB.style.opacity=side==='teamB'?'1':'0.4';}
    var update={voters:fb.arrayUnion(me)};
    update[side]=fb.increment(1);
    fb.setDoc(fb.doc(fb.db,'battle_votes',roomName),update,{merge:true}).catch(function(){});
    window.showToast&&showToast('Vote cast!');
  }

  function renderVoteResults(a,b){
    var results=document.getElementById('ubVoteResults'); if(!results) return;
    var total=a+b; if(!total) return;
    results.style.display='block';
    var pA=Math.round(a/total*100),pB=Math.round(b/total*100);
    var barA=document.getElementById('ubVoteBarA'),barB=document.getElementById('ubVoteBarB');
    if(barA) barA.textContent=pA+'% ('+a+' votes)';
    if(barB) barB.textContent=pB+'% ('+b+' votes)';
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
        // FIX: check if DJ slot already taken
        var djTaken=liveSt.connected&&liveSt.role==='dj';
        // Also check Firestore for DJ in this room
        var fb=window.UB_FIREBASE;
        if(fb&&fb.db){
          fb.getDoc(fb.doc(fb.db,'battle_rooms',mode.room)).then(function(snap){
            if(snap.exists()){
              var d=snap.data()||{};
              var existingDj=d.djUsername||'';
              var me=(currentUser()&&(currentUser().username||currentUser().name))||'';
              if(existingDj&&existingDj!==me){
                dj.disabled=true;
                dj.style.opacity='0.4';
                dj.style.cursor='not-allowed';
                dj.textContent='🎧 DJ: @'+existingDj;
                dj.title='DJ slot taken by @'+existingDj;
              }
            }
          }).catch(function(){});
        }
        if(djTaken){
          dj.disabled=true; dj.style.opacity='0.4'; dj.style.cursor='not-allowed';
          dj.textContent='🎧 You are DJ';
        } else {
          dj.textContent='JOIN AS DJ';
          dj.onclick=function(){ connectBattleLive('dj',mode.room); };
        }
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
    // Auto-start AI DJ for instant/practice modes
    checkAiDjAutoStart(key, mode.room);
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
  // ── AI DJ System ──
  var _aiDjActive=false;
  var _aiDjTimer=null;
  var _aiDjRound=0;
  var _aiDjPool=[]; // loaded from platform_beats
  var _aiDjRoomName='battle-instant-ai';
  var INSTANT_MODES=['dogcage','practice'];

  async function loadAiDjPool(){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    try{
      var snap=await fb.getDocs(fb.collection(fb.db,'platform_beats'));
      _aiDjPool=[];
      snap.forEach(function(doc){
        var d=doc.data();
        if(d.audioUrl) _aiDjPool.push(Object.assign({id:doc.id},d));
      });
    }catch(e){ console.warn('[aidj] pool load failed',e); }
  }

  function aiDjPickBeat(){
    if(!_aiDjPool.length) return null;
    return _aiDjPool[Math.floor(Math.random()*_aiDjPool.length)];
  }

  async function aiDjAnnounceWinner(roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    try{
      var voteSnap=await fb.getDoc(fb.doc(fb.db,'battle_votes',roomName));
      var votes=voteSnap.exists()?voteSnap.data():{};
      var aVotes=votes.teamA||0, bVotes=votes.teamB||0;
      var winner='';
      if(aVotes>bVotes) winner='TEAM A';
      else if(bVotes>aVotes) winner='TEAM B';
      else winner='TIE';
      // Post winner to chat
      await fb.addDoc(fb.collection(fb.db,'live_chats',roomName,'messages'),{
        from:'AI DJ',
        text:'🏆 Round '+_aiDjRound+' Winner by votes: '+winner+' ('+aVotes+' vs '+bVotes+')',
        at:Date.now(), type:'system'
      });
      // Reset votes for next round
      await fb.setDoc(fb.doc(fb.db,'battle_votes',roomName),{teamA:0,teamB:0,voters:[]});
      // Update battle state
      setWinner(winner.toLowerCase().replace(' ',''));
    }catch(e){ console.warn('[aidj] announce failed',e); }
  }

  async function aiDjStartRound(roomName){
    var fb=window.UB_FIREBASE; if(!fb||!fb.db) return;
    _aiDjRound++;
    // Pick and set beat
    var beat=aiDjPickBeat();
    if(beat){
      await fb.setDoc(fb.doc(fb.db,'battle_rooms','battle-room'),{
        selectedBeat:{
          name:beat.name||'AI Beat',
          audioUrl:beat.audioUrl,
          bpm:beat.bpm||'',
          key:beat.key||'',
          genre:beat.genre||'',
          beatId:beat.id,
          selectedBy:'AI DJ',
          selectedAt:new Date().toISOString()
        }
      },{merge:true});
    }
    // Post to chat
    await fb.addDoc(fb.collection(fb.db,'live_chats',roomName,'messages'),{
      from:'AI DJ',
      text:'\uD83C\uDFA7 Round '+_aiDjRound+' starting! Beat: '+(beat?beat.name:'Random')+(beat&&beat.bpm?' ('+beat.bpm+' BPM)':'')+'. Vote for who is winning! 3 minutes on the clock.',
      at:Date.now(), type:'system'
    });
    // Start timer
    startTimer(180);
    // Schedule winner announcement after round
    if(_aiDjTimer) clearTimeout(_aiDjTimer);
    _aiDjTimer=setTimeout(function(){
      aiDjAnnounceWinner(roomName).then(function(){
        if(_aiDjActive){
          // Small break between rounds
          setTimeout(function(){ aiDjStartRound(roomName); }, 15000);
        }
      });
    }, 185000); // 3min 5sec
  }

  async function startAiDj(roomName){
    if(_aiDjActive){ toast('AI DJ already running'); return; }
    roomName=roomName||_aiDjRoomName;
    await loadAiDjPool();
    if(!_aiDjPool.length){ toast('⚠️ No beats in pool. Upload beats to platform_beats first.'); return; }
    _aiDjActive=true; _aiDjRound=0;
    var fb=window.UB_FIREBASE;
    if(fb&&fb.db){
      await fb.setDoc(fb.doc(fb.db,'live_chats',roomName),{room:roomName,updatedAt:Date.now()},{merge:true}).catch(function(){});
      await fb.addDoc(fb.collection(fb.db,'live_chats',roomName,'messages'),{
        from:'AI DJ',text:'🤖 AI DJ is in the building! Instant battle starting in 10 seconds...',at:Date.now(),type:'system'
      }).catch(function(){});
    }
    toast('🤖 AI DJ activated');
    setTimeout(function(){ aiDjStartRound(roomName); }, 10000);
  }

  function stopAiDj(){
    _aiDjActive=false;
    if(_aiDjTimer){ clearTimeout(_aiDjTimer); _aiDjTimer=null; }
    toast('AI DJ stopped');
  }

  // Auto-start AI DJ for instant battle mode
  function checkAiDjAutoStart(key, roomName){
    // All battle modes get AI DJ after 1 minute if no human DJ joins
    if(_aiDjActive) return;
    var hasDj=liveSt.connected&&(liveSt.role==='dj'||liveSt.role==='dj1'||liveSt.role==='dj2');
    if(hasDj) return;

    // Show countdown toast so users know AI DJ is coming
    var countdown=60;
    var countInterval=setInterval(function(){
      countdown--;
      if(_aiDjActive||liveSt.role==='dj'||liveSt.role==='dj1'||liveSt.role==='dj2'){
        clearInterval(countInterval);
        return;
      }
      if(countdown===30) window.showToast&&showToast('🤖 AI DJ joining in 30 seconds...');
      if(countdown===10) window.showToast&&showToast('🤖 AI DJ joining in 10 seconds...');
      if(countdown<=0){
        clearInterval(countInterval);
        // Final check — still no human DJ?
        var stillNoDj=!(liveSt.connected&&(liveSt.role==='dj'||liveSt.role==='dj1'||liveSt.role==='dj2'));
        if(stillNoDj && !_aiDjActive) startAiDj(roomName);
      }
    },1000);
  }

  window.ubBattle = {
    modes:MODES, open:openMode, inject:injectModeSelector,
    score:setScore, resetScores:resetScores, start:startTimer, stop:stopTimer,
    win:setWinner, advance:advanceTournament, bracket:pickBracketSize,
    equipment:openEquipment, midi:openMidi,
    previewBeat:previewBeat, selectBeat:selectBeat, deleteBeat:deleteBeat,
    sendChat:sendBattleChat, vote:castVote,
    aiDj:{ start:startAiDj, stop:stopAiDj, active:function(){ return _aiDjActive; } },
    leaveRoom:function(){ stopAiDj(); go('queue'); setTimeout(injectModeSelector,250); }
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
