// unifreestyle-battle-livekit.js
// Shared LiveKit camera/mic engine for UniFreestyle battle modes.
// Cypher stays separate.

(function(){
  'use strict';

  var TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';
  var st = { room:null, connected:false, username:null, role:null, battleRoom:null, camOn:true, micOn:true };

  function isFreestyle(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(typeof window.showToast === 'function') window.showToast(msg); else console.log('[battle-livekit]', msg); }
  function currentUser(){ try { var raw = localStorage.getItem('ub_current_user') || localStorage.getItem('ub_user'); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
  function resolveUsername(role){ var u=currentUser(); return (u && (u.username || u.name)) || (role || 'user') + '_' + Math.floor(Math.random()*9999); }
  function safeId(s){ return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }

  async function waitForLiveKit(maxMs){
    if(window.LivekitClient) return window.LivekitClient;
    var start = Date.now();
    while(Date.now() - start < (maxMs || 6000)){
      await new Promise(function(r){ setTimeout(r,100); });
      if(window.LivekitClient) return window.LivekitClient;
    }
    throw new Error('LiveKit SDK did not load');
  }

  function findContainer(role, identity){
    var selectors = [];
    var r = String(role || '').toLowerCase();
    if(r === 'artist1' || r === 'artista' || r === 'teama1' || r === 'teama2') selectors.push('#artist1Video','[data-battle-video="artist1"]','[data-battle-video="teamA1"]','[data-battle-video="teamA2"]');
    if(r === 'artist2' || r === 'artistb' || r === 'teamb1' || r === 'teamb2') selectors.push('#artist2Video','[data-battle-video="artist2"]','[data-battle-video="teamB1"]','[data-battle-video="teamB2"]');
    if(r === 'dj') selectors.push('#djVideo','#djCam','#battleDjVideo','.dj-video','[data-battle-video="dj"]');
    if(r === 'dj1') selectors.push('#dj1Video','[data-battle-video="dj1"]');
    if(r === 'dj2') selectors.push('#dj2Video','[data-battle-video="dj2"]');
    if(r === 'practice') selectors.push('#practiceVideo','#practiceCam','.practice-video','[data-battle-video="practice"]');
    selectors.push('#ubBattleLiveStage','#liveBattleStage','#battleLiveStage','#page-battle-live .page-body','#page-live .page-body','#page-battle .page-body','#page-instant .page-body','#page-practice .page-body');
    for(var i=0;i<selectors.length;i++){ var el=document.querySelector(selectors[i]); if(el) return el; }
    return makeFallbackStage(role, identity);
  }

  function makeFallbackStage(role, identity){
    var page=document.querySelector('#page-battle-live .page-body,#page-live .page-body,#page-battle .page-body,#page-instant .page-body,#page-practice .page-body,main,body');
    var stage=document.getElementById('ubBattleLiveStage');
    if(!stage){
      stage=document.createElement('div');
      stage.id='ubBattleLiveStage';
      stage.style.cssText='margin:14px 0;padding:12px;border:1px solid rgba(201,168,76,.45);border-radius:14px;background:rgba(0,0,0,.35);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;color:#fff;';
      if(page) page.insertBefore(stage,page.firstChild);
    }
    var tileId='ub-battle-tile-'+safeId(role || identity);
    var tile=document.getElementById(tileId);
    if(!tile){
      tile=document.createElement('div');
      tile.id=tileId;
      tile.style.cssText='position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid rgba(64,208,255,.45);background:#05070d;';
      tile.innerHTML='<div style="position:absolute;left:10px;bottom:8px;z-index:4;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.7);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;">'+(role || identity || 'LIVE')+'</div>';
      stage.appendChild(tile);
    }
    return tile;
  }

  function roleFromIdentity(identity){
    var s = String(identity || '').toLowerCase();
    if(s.indexOf('dj1') !== -1) return 'dj1';
    if(s.indexOf('dj2') !== -1) return 'dj2';
    if(s.indexOf('dj') !== -1) return 'dj';
    if(s.indexOf('teamb') !== -1 || s.indexOf('artist2') !== -1) return 'artist2';
    if(s.indexOf('practice') !== -1) return 'practice';
    return 'artist1';
  }

  function styleVideo(video, local){
    video.autoplay=true; video.playsInline=true; video.setAttribute('playsinline','true');
    if(local) video.muted=true;
    video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;background:#000;'+(local ? 'transform:scaleX(-1);' : '');
  }

  function attachVideoTo(container, track, identity, local){
    if(!container || !track) return;
    container.style.position = container.style.position || 'relative';
    container.style.overflow = 'hidden';
    var id='ub-livekit-video-'+safeId(identity || (local ? st.username : 'remote'));
    var old=container.querySelector('#'+id+', video[data-ub-battle-livekit="yes"]');
    if(old) old.remove();
    var vid=document.createElement('video');
    vid.id=id; vid.dataset.ubBattleLivekit='yes';
    styleVideo(vid, local);
    container.appendChild(vid);
    track.attach(vid);
  }

  function attachAudio(track, identity){
    var id='ub-livekit-audio-'+safeId(identity);
    var old=document.getElementById(id); if(old) old.remove();
    var aud=track.attach(); aud.id=id; aud.autoplay=true; aud.playsInline=true; document.body.appendChild(aud);
  }

  async function connectBattleLive(role, roomName){
    if(!isFreestyle()) return;
    role=String(role || 'viewer').toLowerCase();
    roomName=roomName || 'battle-room';
    st.role=role; st.battleRoom=roomName; st.username=resolveUsername(role);

    var LK=await waitForLiveKit();
    var identity = st.username + '-' + role;
    var url=TOKEN_FN+'?room='+encodeURIComponent(roomName)+'&username='+encodeURIComponent(identity);
    var resp=await fetch(url); var data=await resp.json();
    if(!resp.ok || !data.token || !data.url) throw new Error(data.error || 'Token fetch failed');

    var room=new LK.Room({ adaptiveStream:true, dynacast:true });
    st.room=room;

    room.on('trackSubscribed', function(track, publication, participant){
      if(track.kind === 'audio') return attachAudio(track, participant.identity);
      if(track.kind === 'video') attachVideoTo(findContainer(roleFromIdentity(participant.identity), participant.identity), track, participant.identity, false);
    });
    room.on('trackUnsubscribed', function(track, publication, participant){
      var v=document.getElementById('ub-livekit-video-'+safeId(participant.identity)); if(v) v.remove();
      var a=document.getElementById('ub-livekit-audio-'+safeId(participant.identity)); if(a) a.remove();
    });
    room.on('disconnected', function(){ st.connected=false; });

    await room.connect(data.url, data.token);
    st.connected=true;

    var performer = !['viewer','watch','audience'].includes(role);
    if(performer){
      await room.localParticipant.enableCameraAndMicrophone();
      room.localParticipant.trackPublications.forEach(function(pub){
        if(pub.track && pub.track.kind === 'video') attachVideoTo(findContainer(role, st.username), pub.track, identity, true);
      });
      toast('📹 Live cam + mic connected: '+role);
    } else {
      toast('👁️ Viewing live battle');
    }
    return room;
  }

  async function toggleBattleMic(){ if(!st.room) return toast('Not connected'); st.micOn=!st.micOn; await st.room.localParticipant.setMicrophoneEnabled(st.micOn); toast(st.micOn?'🎤 Mic on':'🔇 Mic off'); }
  async function toggleBattleCam(){
    if(!st.room) return toast('Not connected');
    st.camOn=!st.camOn; await st.room.localParticipant.setCameraEnabled(st.camOn);
    if(st.camOn){ st.room.localParticipant.trackPublications.forEach(function(pub){ if(pub.track && pub.track.kind === 'video') attachVideoTo(findContainer(st.role, st.username), pub.track, st.username+'-'+st.role, true); }); }
    toast(st.camOn?'📹 Camera on':'📷 Camera off');
  }
  function disconnectBattleLive(){
    if(st.room){ try{ st.room.disconnect(); }catch(e){} }
    st.room=null; st.connected=false;
    document.querySelectorAll('[data-ub-battle-livekit="yes"], audio[id^="ub-livekit-audio-"]').forEach(function(el){ el.remove(); });
  }

  window.connectBattleLive=connectBattleLive;
  window.joinBattleLiveAs=connectBattleLive;
  window.toggleBattleMic=toggleBattleMic;
  window.toggleBattleCam=toggleBattleCam;
  window.disconnectBattleLive=disconnectBattleLive;
  window.ubBattleLiveKit={ state:st, connect:connectBattleLive, mic:toggleBattleMic, cam:toggleBattleCam, disconnect:disconnectBattleLive };
})();