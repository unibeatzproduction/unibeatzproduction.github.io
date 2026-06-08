// unifreestyle-profile.js
// UniBeatz Production — Profile system, live cam, follow, live chat, creator tools
// Replaces: unifreestyle-profile-live.js, unifreestyle-profile-follow.js,
//           unifreestyle-live-chat.js, unifreestyle-creator-tools.js

(function(){
  'use strict';

  // ═══════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════
  var TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';
  var UBP_CUT = 0.10;

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(window.showToast) window.showToast(msg); else console.log('[profile]', msg); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function niceName(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }
  function fmt(n){ n=Number(n||0); if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return String(n); }

  function read(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f); } }
  function write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function getUsers(){ return read('ub_users','{}'); }
  function saveUsers(u){ write('ub_users',u); }

  function getCurrent(){
    var u = read('ub_current_user','null') || read('ub_user','null');
    if(u && clean(u.username || u.name)) return u;
    try{ if(window.currentUser && clean(window.currentUser.username || window.currentUser.name)) return window.currentUser; }catch(e){}
    return u || null;
  }
  function setCurrent(u){ write('ub_current_user',u); write('ub_user',u); try{ window.currentUser=u; }catch(e){} }
  function uname(u){ return clean((u&&(u.username||u.name))||''); }
  function myName(){ return uname(getCurrent()); }

  function getFb(){
    var fb = window.UB_FIREBASE || {};
    if(fb.db && fb.collection) return fb;
    return null;
  }

  async function waitForLiveKit(maxMs){
    if(window.LivekitClient) return window.LivekitClient;
    var start = Date.now();
    while(Date.now()-start < (maxMs||6000)){
      await new Promise(function(r){ setTimeout(r,100); });
      if(window.LivekitClient) return window.LivekitClient;
    }
    throw new Error('LiveKit SDK did not load');
  }

  // ═══════════════════════════════════════════════════
  // LIVE CAM (profile live, viewer watching)
  // ═══════════════════════════════════════════════════
  // FIX: store direct DOM reference to viewer video box — no querySelector needed at attach time
  var liveSt = { room: null, role: null, chatUnsub: null, viewerTarget: null, viewerVideoBox: null };

  function profileRoomName(target){ return 'profile-live-'+clean(target||'guest'); }

  function clearLiveMedia(){
    document.querySelectorAll('[data-profile-livekit="yes"]').forEach(function(el){ try{ el.remove(); }catch(e){} });
  }

  // FIX: Host box via scoped querySelector; viewer box via direct stored reference (avoids mobile querySelector failures)
  function getHostVideoBox(){ return document.querySelector('#ubProfileLiveCamBox #ubHostVideoBox'); }
  function getViewerVideoBox(){ return liveSt.viewerVideoBox || document.getElementById('ubViewerVideoBox'); }

  function styleProfileVideo(vid, local){
    vid.autoplay=true; vid.playsInline=true; vid.setAttribute('playsinline','true');
    if(local) vid.muted=true;
    vid.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;'+(local?'transform:scaleX(-1);':'transform:none;');
  }

  function attachHostVideo(track){
    var box=getHostVideoBox(); if(!box||!track) return;
    box.innerHTML='';
    var vid=document.createElement('video');
    vid.dataset.profileLivekit='yes';
    styleProfileVideo(vid,true);
    box.appendChild(vid);
    track.attach(vid);
    vid.play().catch(function(){});
  }

  function attachViewerVideo(track){
    var box=getViewerVideoBox(); if(!box||!track) return;
    // Clear box
    box.innerHTML='';
    box.style.position='relative';
    var vid=document.createElement('video');
    vid.autoplay=true;
    vid.playsInline=true;
    vid.setAttribute('playsinline','true');
    // REAL FIX: start muted so Android autoplay policy allows it,
    // then unmute immediately after play() resolves.
    vid.muted=true;
    vid.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;transform:none;';
    vid.dataset.profileLivekit='yes';
    box.appendChild(vid);
    track.attach(vid);
    vid.play().then(function(){
      // Unmute after browser allows playback
      vid.muted=false;
    }).catch(function(e){
      console.warn('[profile] viewer video play failed:', e);
      // Still show the video even if audio is blocked
      vid.muted=true;
      vid.play().catch(function(){});
    });
  }

  function attachProfileAudio(track, identity){
    var id='profile-live-audio-'+clean(identity);
    var old=document.getElementById(id); if(old) old.remove();
    var a=track.attach(); a.id=id; a.dataset.profileLivekit='yes'; a.autoplay=true;
    document.body.appendChild(a); a.play&&a.play().catch(function(){});
  }

  async function connectProfileMedia(target, role){
    var LK = await waitForLiveKit();
    if(liveSt.room){ try{ liveSt.room.disconnect(); }catch(e){} liveSt.room=null; }
    clearLiveMedia();
    var identity = myName()+'-'+role+'-'+Date.now();
    var rn = profileRoomName(target);
    var resp = await fetch(TOKEN_FN+'?room='+encodeURIComponent(rn)+'&username='+encodeURIComponent(identity));
    var data = await resp.json();
    if(!resp.ok||!data.token||!data.url) throw new Error(data.error||'LiveKit token failed');
    var room=new LK.Room({ adaptiveStream:true, dynacast:true, autoSubscribe:true });
    liveSt.room=room; liveSt.role=role;

    room.on('trackSubscribed',function(track,pub,participant){
      if(track.kind==='video'){
        // FIX: use direct stored ref first, then fallback getElementById, then retry
        var tryAttach = function(attempts){
          var box = liveSt.viewerVideoBox || document.getElementById('ubViewerVideoBox');
          if(box){
            console.log('[profile] attaching viewer video, attempts left:', attempts);
            attachViewerVideo(track);
          } else if(attempts>0){
            console.log('[profile] viewer video box not found, retrying... attempts left:', attempts);
            setTimeout(function(){ tryAttach(attempts-1); }, 500);
          } else {
            console.error('[profile] viewer video box NEVER found after all retries');
            toast('⚠️ Could not attach host video');
          }
        };
        tryAttach(20); // 20 x 500ms = 10 seconds of retries
      }
      if(track.kind==='audio') attachProfileAudio(track,participant.identity);
    });

    room.on('disconnected',function(){ liveSt.room=null; });
    await room.connect(data.url,data.token);

    if(role==='host'){
      await room.localParticipant.enableCameraAndMicrophone();
      // FIX: use scoped host box getter
      room.localParticipant.trackPublications.forEach(function(pub){
        if(pub.track&&pub.track.kind==='video'){
          attachHostVideo(pub.track);
        }
      });
      toast('📹 You are live');
    } else {
      // Show placeholder while waiting
      var box=getViewerVideoBox();
      if(box) box.innerHTML='<div id="ubLiveVideoPlaceholder" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:2px;">Waiting for host cam...</div>';
      toast('👁️ Watching live profile');

      // After connect, scan existing remote participants once.
      // trackSubscribed handles future publishes; this handles tracks
      // already published before the viewer joined.
      room.remoteParticipants.forEach(function(participant){
        participant.trackPublications.forEach(function(pub){
          if(pub.track && pub.track.kind==='video') attachViewerVideo(pub.track);
          if(pub.track && pub.track.kind==='audio') attachProfileAudio(pub.track, participant.identity);
        });
      });
    }
    return room;
  }

  function disconnectProfileMedia(){
    if(liveSt.room){ try{ liveSt.room.disconnect(); }catch(e){} liveSt.room=null; }
    clearLiveMedia();
  }

  async function setLive(isLive){
    var fb=getFb(); if(!fb) return toast('Firebase not ready');
    var u=getCurrent(), name=myName();
    if(isLive){
      // FIX: inject box BEFORE connecting so host video box exists when tracks publish
      ensureProfileCamBox();
      ensureHostChatBox(name);
      // Inject record button for host
      if(window.ubRecorder && window.ubRecorder.canRecord('livestream')){
        setTimeout(function(){
          var camBox=document.getElementById('ubProfileLiveCamBox');
          if(camBox){
            var btn=document.createElement('div');
            btn.style.cssText='position:absolute;top:10px;right:10px;z-index:20;';
            camBox.appendChild(btn);
            window.ubRecorder.injectBtn('livestream','profile-live-'+name,btn);
          }
        },300);
      }
      // Small delay to ensure DOM is painted before LiveKit attach fires
      await new Promise(function(r){ setTimeout(r,120); });
      await connectProfileMedia(name,'host').catch(function(e){ toast('⚠️ Cam failed: '+e.message); });
    } else {
      disconnectProfileMedia();
      removeProfileCamBox();
      removeHostChatBox();
    }
    await fb.setDoc(fb.doc(fb.db,'live_profiles',name),{
      username:name, displayName:u.name||name, role:u.role||'artist',
      avatar:u.avatar||'🎤', photo:u.photo||'', isLive:!!isLive,
      hasAudio:!!isLive, hasVideo:!!isLive,
      liveRoom:profileRoomName(name), startedAt:isLive?Date.now():0, updatedAt:Date.now()
    },{merge:true});
    toast(isLive?'🔴 You are live':'Live ended');
    // FIX: always force a full re-render after live state changes.
    // The cam box guard in renderProfile handles not wiping the video feed.
    // But we MUST reset _lastProfileKey so the live/not-live button state actually updates.
    _lastProfileKey='';
    if(!document.getElementById('ubProfileLiveCamBox')){
      renderProfile();
    } else {
      // Cam box is active (we just went live) — update just the GO LIVE button in place
      // without wiping the cam feed
      var liveBtn=document.querySelector('.ub-cp-actions button:last-child');
      if(liveBtn){
        liveBtn.className=isLive?'ub-btn-red':'ub-btn-gold';
        liveBtn.textContent=isLive?'END LIVE':'GO LIVE';
      }
    }
    refreshLiveRail();
  }

  function ensureProfileCamBox(){
    if(document.getElementById('ubProfileLiveCamBox')) return;
    var body=document.querySelector('#page-profile .page-body'); if(!body) return;
    var box=document.createElement('div');
    box.id='ubProfileLiveCamBox';
    box.style.cssText='position:relative;width:100%;aspect-ratio:9/16;max-height:60vh;border-radius:14px;overflow:hidden;background:#000;border:2px solid var(--red);margin:12px 0;';
    // FIX: renamed inner id to ubHostVideoBox to avoid collision with viewer modal
    box.innerHTML='<div id="ubHostVideoBox" style="position:absolute;inset:0;"></div><div style="position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:6px;padding:5px 10px;background:rgba(255,51,51,.85);border-radius:999px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#fff;font-weight:900;z-index:10;"><span style="width:7px;height:7px;background:#fff;border-radius:50%;animation:blink 1s infinite;"></span>LIVE</div>';
    var profile=document.getElementById('ubCleanProfile');
    if(profile) profile.insertAdjacentElement('afterbegin',box);
    else body.insertBefore(box,body.firstChild);
  }

  function removeProfileCamBox(){
    var box=document.getElementById('ubProfileLiveCamBox'); if(box) box.remove();
  }

  function ensureHostChatBox(name){
    if(document.getElementById('ubHostChatBox')) return;
    var fb=getFb(); if(!fb) return;
    var body=document.querySelector('#page-profile .page-body'); if(!body) return;
    var box=document.createElement('div');
    box.id='ubHostChatBox';
    box.style.cssText='border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.35);padding:12px;margin:8px 0;';
    box.innerHTML=[
      '<div style="font-family:Orbitron,sans-serif;color:#40D0FF;font-size:.52rem;letter-spacing:2px;margin-bottom:8px;">LIVE CHAT</div>',
      '<div id="ubHostChatList" style="height:160px;overflow-y:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin-bottom:8px;"></div>',
      '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;">',
        '<input id="ubHostChatInput" placeholder="Chat with viewers..." style="padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;box-sizing:border-box;width:100%;">',
        '<button id="ubHostChatSend" style="border:0;border-radius:8px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;padding:0 12px;cursor:pointer;">SEND</button>',
      '</div>'
    ].join('');
    var camBox=document.getElementById('ubProfileLiveCamBox');
    if(camBox) camBox.insertAdjacentElement('afterend',box);
    else body.appendChild(box);

    // Wire send button and Enter key
    box.querySelector('#ubHostChatSend').onclick=function(){
      var input=box.querySelector('#ubHostChatInput');
      var msg=input.value.trim(); if(!msg) return;
      input.value='';
      sendLiveChat(name, msg);
    };
    box.querySelector('#ubHostChatInput').addEventListener('keydown',function(e){
      if(e.key==='Enter'){ var msg=e.target.value.trim(); if(!msg) return; e.target.value=''; sendLiveChat(name,msg); }
    });

    // Ensure parent doc exists before listening
    fb.setDoc(fb.doc(fb.db,'live_chats',name),{ room:name, updatedAt:Date.now() },{ merge:true }).catch(function(){});

    // Listen to chat room
    var q=fb.query(fb.collection(fb.db,'live_chats',name,'messages'),fb.orderBy('at','asc'));
    var unsub=fb.onSnapshot(q,function(snap){
      var list=document.getElementById('ubHostChatList'); if(!list) return;
      list.innerHTML='';
      snap.forEach(function(d){
        var x=d.data();
        var row=document.createElement('div');
        row.style.cssText='padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.84rem;';
        row.innerHTML='<b style="color:#40D0FF;">'+esc(x.from)+':</b> '+esc(x.text);
        list.appendChild(row);
      });
      list.scrollTop=list.scrollHeight;
    });
    box._chatUnsub=unsub;
  }

  function removeHostChatBox(){
    var box=document.getElementById('ubHostChatBox');
    if(box){ if(box._chatUnsub) try{box._chatUnsub();}catch(e){} box.remove(); }
  }

  // ── Viewer join/leave ──
  async function joinAsViewer(target){
    var fb=getFb(); if(!fb) return;
    if(liveSt.viewerTarget && liveSt.viewerTarget!==target) await leaveViewer();
    liveSt.viewerTarget=target;
    await fb.setDoc(fb.doc(fb.db,'live_profile_viewers',target+'_'+myName()),
      { profile:target, viewer:myName(), active:true, at:Date.now() },{merge:true});
  }

  async function leaveViewer(){
    var fb=getFb(); if(!fb||!liveSt.viewerTarget) return;
    await fb.setDoc(fb.doc(fb.db,'live_profile_viewers',liveSt.viewerTarget+'_'+myName()),
      { active:false, leftAt:Date.now() },{merge:true});
    liveSt.viewerTarget=null;
  }

  // ── Follow system ──
  // FIX: track follow state in memory so button reflects correct state
  var _followCache = {}; // { 'me_target': true/false }

  async function checkIsFollowing(target){
    var me=myName(); if(!me||!target) return false;
    var key=me+'_'+target;
    if(_followCache[key]!==undefined) return _followCache[key];
    var fb=getFb(); if(!fb) return false;
    try{
      var snap=await fb.getDoc(fb.doc(fb.db,'profile_follows',key));
      var val=snap.exists()&&snap.data().active!==false;
      _followCache[key]=val;
      return val;
    }catch(e){ return false; }
  }

  async function follow(target){
    target=clean(target); var me=myName();
    if(!target||target===me) return;
    var key=me+'_'+target;
    var already=_followCache[key];
    var fb=getFb();
    if(fb){
      if(already){
        // Unfollow
        await fb.setDoc(fb.doc(fb.db,'profile_follows',key),
          { follower:me, following:target, active:false, at:Date.now() },{merge:true});
        _followCache[key]=false;
        toast('➖ Unfollowed @'+target);
      } else {
        // Follow
        await fb.setDoc(fb.doc(fb.db,'profile_follows',key),
          { follower:me, following:target, active:true, at:Date.now() },{merge:true});
        _followCache[key]=true;
        toast('✅ Following @'+target);
      }
    }
    // Update follow button in modal
    var btn=document.getElementById('ubFollowBtn_'+clean(target));
    if(btn) btn.textContent=_followCache[key]?'UNFOLLOW':'FOLLOW';
    refreshFollowCounts(target);
  }

  async function refreshFollowCounts(target){
    var fb=getFb(); if(!fb) return;
    // FIX: don't use Firestore inequality filter — old docs may not have 'active' field.
    // Fetch all matching docs and filter in JS.
    var followers=await fb.getDocs(fb.query(fb.collection(fb.db,'profile_follows'),fb.where('following','==',target)));
    var following=await fb.getDocs(fb.query(fb.collection(fb.db,'profile_follows'),fb.where('follower','==',target)));
    var fc=0, fg=0;
    followers.forEach(function(d){ if(d.data().active!==false) fc++; });
    following.forEach(function(d){ if(d.data().active!==false) fg++; });
    document.querySelectorAll('[data-followers]').forEach(function(el){ el.textContent=fc; });
    document.querySelectorAll('[data-following]').forEach(function(el){ el.textContent=fg; });
    // Also directly update the rendered stat boxes without full re-render
    var statBs=document.querySelectorAll('.ub-cp-stat b');
    if(statBs.length>=2){ statBs[0].textContent=fmt(fc); statBs[1].textContent=fmt(fg); }
    if(!_countCache[target]) _countCache[target]={followers:0,following:0};
    _countCache[target].followers=fc; _countCache[target].following=fg;
  }

  // ── Live profiles rail on home ──
  function homeRail(){
    var home=document.querySelector('#page-home .page-body'); if(!home) return null;
    var box=document.getElementById('ubLiveProfilesRail'); if(box) return box;
    box=document.createElement('div'); box.id='ubLiveProfilesRail';
    box.style.cssText='margin:8px 0 10px;padding:6px 8px;border-radius:12px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.22);min-height:58px;max-height:70px;overflow:hidden;';
    box.innerHTML='<div style="display:flex;align-items:center;gap:10px;height:100%;"><div style="flex:0 0 auto;"><div style="font-family:Orbitron,sans-serif;font-size:.38rem;letter-spacing:1.6px;color:#40D0FF;">LIVE PROFILES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:.95rem;letter-spacing:1.6px;color:#F0C040;">WATCH LIVE NOW</div></div><div id="ubLiveProfilesList" style="flex:1;display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 2px 2px;"></div></div>';
    var hero=home.querySelector('.home-hero');
    if(hero) hero.insertAdjacentElement('afterend',box);
    else home.insertBefore(box,home.firstChild);
    return box;
  }

  async function refreshLiveRail(){
    if(!ok()) return;
    var fb=getFb(); if(!fb) return;
    var rail=homeRail(); if(!rail) return;
    var list=rail.querySelector('#ubLiveProfilesList'); if(!list) return;
    var q=fb.query(fb.collection(fb.db,'live_profiles'),fb.where('isLive','==',true));
    var snap=await fb.getDocs(q);
    list.innerHTML='';
    if(snap.empty){ list.innerHTML='<div style="color:rgba(240,237,232,.65);font-size:.75rem;padding:8px 2px;white-space:nowrap;">No one is live yet.</div>'; return; }
    snap.forEach(function(doc){
      var p=doc.data();
      var card=document.createElement('div');
      card.style.cssText='flex:0 0 174px;scroll-snap-align:start;height:44px;padding:6px 8px;border-radius:10px;border:1px solid rgba(201,168,76,.38);background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(64,208,255,.10));cursor:pointer;display:flex;align-items:center;';
      card.innerHTML='<div style="display:flex;align-items:center;gap:7px;min-width:0;"><div style="width:32px;height:32px;border-radius:50%;border:1.5px solid #F0C040;display:flex;align-items:center;justify-content:center;font-size:1rem;overflow:hidden;background:rgba(0,0,0,.55);">'+(p.photo?'<img src="'+esc(p.photo)+'" style="width:100%;height:100%;object-fit:cover;">':esc(p.avatar||'🎤'))+'</div><div><div style="color:#F0C040;font-family:Bebas Neue,Arial,sans-serif;font-size:.92rem;letter-spacing:1.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">'+esc(p.displayName||p.username)+'</div><div style="color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.36rem;letter-spacing:1px;">🔴 LIVE · @'+esc(p.username)+'</div></div></div>';
      card.onclick=function(){ openLiveModal(p.username); };
      list.appendChild(card);
    });
  }

  // ── Live viewer modal ──
  function ensureLiveModal(){
    var m=document.getElementById('ubProfileLiveModal'); if(m) return m;
    m=document.createElement('div'); m.id='ubProfileLiveModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:none;color:#fff;overflow-y:auto;padding:18px;-webkit-overflow-scrolling:touch;';
    // FIX: renamed video box id to ubViewerVideoBox to avoid collision with host cam box
    m.innerHTML=[
      '<div style="max-width:600px;margin:0 auto;">',
        '<button id="ubLiveClose" class="btn btn-gold" style="width:auto;margin-bottom:12px;">← CLOSE</button>',
        '<div id="ubLiveHeader"></div>',
        '<div id="ubViewerVideoBox" style="width:100%;border-radius:14px;border:2px solid rgba(255,51,51,.6);background:#000;position:relative;overflow:hidden;aspect-ratio:9/16;max-height:60vh;margin-bottom:12px;">',
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;" id="ubLiveVideoPlaceholder">Waiting for host cam...</div>',
        '</div>',
        '<div style="border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.35);padding:12px;">',
          '<div style="font-family:Orbitron,sans-serif;color:#40D0FF;font-size:.52rem;letter-spacing:2px;margin-bottom:8px;">LIVE CHAT</div>',
          '<div id="ubLiveChatList" style="height:160px;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin-bottom:8px;"></div>',
          '<input id="ubLiveChatInput" placeholder="Say something live..." style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;margin-bottom:8px;box-sizing:border-box;">',
          '<button id="ubLiveSend" class="btn btn-blue">SEND CHAT</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(m);
    // FIX: store direct reference immediately after appending to DOM
    liveSt.viewerVideoBox = m.querySelector('#ubViewerVideoBox');
    console.log('[profile] viewer video box stored:', !!liveSt.viewerVideoBox);
    m.querySelector('#ubLiveClose').onclick=function(){
      m.style.display='none';
      liveSt.viewerVideoBox = null;
      if(liveSt.chatUnsub) try{ liveSt.chatUnsub(); }catch(e){}
      leaveViewer(); disconnectProfileMedia();
    };
    m.querySelector('#ubLiveSend').onclick=function(){
      var input=m.querySelector('#ubLiveChatInput');
      var msg=input.value.trim(); if(!msg) return;
      sendLiveChat(liveSt.viewerTarget, msg);
      input.value='';
    };
    // Also send on Enter key
    m.querySelector('#ubLiveChatInput').addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        var msg=e.target.value.trim(); if(!msg) return;
        sendLiveChat(liveSt.viewerTarget, msg);
        e.target.value='';
      }
    });
    return m;
  }

  async function openLiveModal(target){
    var fb=getFb(); if(!fb) return;
    var m=ensureLiveModal(); m.style.display='block';
    // FIX: always refresh direct ref in case modal was rebuilt
    liveSt.viewerVideoBox = m.querySelector('#ubViewerVideoBox');
    console.log('[profile] openLiveModal, viewerVideoBox:', !!liveSt.viewerVideoBox);
    await joinAsViewer(target);

    // FIX: check follow state before rendering button
    var isFollowing=await checkIsFollowing(target);

    m.querySelector('#ubLiveHeader').innerHTML='<div style="margin-bottom:12px;padding:12px;border-radius:14px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.35);"><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:2px;color:#F0C040;">@'+esc(target)+' LIVE</div><div style="font-family:Orbitron,sans-serif;font-size:.5rem;color:#40D0FF;margin-top:4px;">👁️ <span data-live-viewers>0</span> VIEWERS · <span data-followers>0</span> FOLLOWERS</div><button id="ubFollowBtn_'+esc(clean(target))+'" class="btn btn-blue" style="width:auto;margin-top:8px;" onclick="ubProfile.follow(\''+esc(target)+'\')">'+(isFollowing?'UNFOLLOW':'FOLLOW')+'</button></div>';

    listenLiveChat(target);
    connectProfileMedia(target,'viewer').catch(function(e){ console.error(e); toast('Live cam connection failed'); });
    refreshFollowCounts(target);
  }

  async function sendLiveChat(target, msg){
    var fb=getFb(); if(!fb) return toast('Firebase not ready');
    target=target||liveSt.viewerTarget; if(!target) return;
    msg=String(msg||'').trim(); if(!msg) return;
    var me=myName(); if(!me) return toast('Sign in to chat');
    var check=filterMessage(msg); if(check.blocked){ toast('⚠️ Message violates community guidelines'); return; }
    try{
      // Ensure parent document exists so subcollection onSnapshot works reliably
      await fb.setDoc(fb.doc(fb.db,'live_chats',target),
        { room:target, updatedAt:Date.now() }, { merge:true });
      await fb.addDoc(fb.collection(fb.db,'live_chats',target,'messages'),
        { from:me, text:msg, role:(getCurrent()||{}).role||'viewer', type:'chat', at:Date.now() });
    } catch(e){
      console.error('[chat] send failed:', e);
      toast('⚠️ Chat error: '+e.message);
    }
  }

  async function listenLiveChat(target){
    var fb=getFb(); if(!fb) return;
    if(liveSt.chatUnsub) try{ liveSt.chatUnsub(); }catch(e){}
    var modal=document.getElementById('ubProfileLiveModal');
    var list=modal?modal.querySelector('#ubLiveChatList'):document.getElementById('ubLiveChatList');
    if(!list) return;
    // Ensure parent doc exists so subcollection snapshot works
    await fb.setDoc(fb.doc(fb.db,'live_chats',target),
      { room:target, updatedAt:Date.now() },{ merge:true }).catch(function(){});
    var q=fb.query(fb.collection(fb.db,'live_chats',target,'messages'),fb.orderBy('at','asc'));
    liveSt.chatUnsub=fb.onSnapshot(q,function(snap){
      list.innerHTML='';
      snap.forEach(function(d){
        var x=d.data();
        var isMe=x.from===myName();
        var row=document.createElement('div');
        row.style.cssText='padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.86rem;';
        row.innerHTML='<b style="color:'+(isMe?'#F0C040':'#40D0FF')+';">'+esc(x.from)+':</b> '+esc(x.text);
        list.appendChild(row);
      });
      list.scrollTop=list.scrollHeight;
    });
  }

  // ═══════════════════════════════════════════════════
  // PROFILE RENDER (clean card)
  // ═══════════════════════════════════════════════════
  var _lastProfileKey='';
  var _liveCache={};
  var _liveWatchOn=false;
  var _countCache={};

  function watchLive(){
    var fb=getFb();
    if(_liveWatchOn||!fb||!fb.onSnapshot) return;
    _liveWatchOn=true;
    fb.onSnapshot(fb.collection(fb.db,'live_profiles'),function(snap){
      snap.forEach(function(d){
        var p=d.data()||{};
        var t=clean(p.username||d.id);
        if(t) _liveCache[t]=!!(p.isLive||p.live);
      });
      // FIX: only trigger re-render if live cam box is NOT active
      if(!document.getElementById('ubProfileLiveCamBox')){
        _lastProfileKey=''; renderProfile();
      }
    },function(e){ console.warn('[profile] live watch failed',e); });
  }

  function isLive(t){ return !!_liveCache[t]; }

  function countsFor(t){
    // Always start with cached value for immediate render, then refresh from Firestore
    if(!_countCache[t]) _countCache[t]={ followers:0, following:0 };
    var fb=getFb(); if(!fb) return _countCache[t];
    // Always re-fetch — don't skip based on cache presence
    fb.getDocs(fb.query(fb.collection(fb.db,'profile_follows'),fb.where('following','==',t))).then(function(s){
      var n=0; s.forEach(function(d){ if(d.data().active!==false) n++; }); _countCache[t].followers=n;
      // Update stat boxes directly without full re-render
      var statBs=document.querySelectorAll('.ub-cp-stat b');
      if(statBs.length>=1) statBs[0].textContent=fmt(n);
      document.querySelectorAll('[data-followers]').forEach(function(el){ el.textContent=n; });
    }).catch(function(){});
    fb.getDocs(fb.query(fb.collection(fb.db,'profile_follows'),fb.where('follower','==',t))).then(function(s){
      var n=0; s.forEach(function(d){ if(d.data().active!==false) n++; }); _countCache[t].following=n;
      var statBs=document.querySelectorAll('.ub-cp-stat b');
      if(statBs.length>=2) statBs[1].textContent=fmt(n);
      document.querySelectorAll('[data-following]').forEach(function(el){ el.textContent=n; });
    }).catch(function(){});
    return _countCache[t];
  }

  function injectProfileCss(){
    if(document.getElementById('ubProfileCss')) return;
    var s=document.createElement('style'); s.id='ubProfileCss';
    s.textContent=[
      '#page-profile .page-body{padding:8px 12px 112px!important;overflow-y:auto!important;}',
      '#page-profile.has-clean-profile .pf-banner,#page-profile.has-clean-profile .pf-main{display:none!important;}',
      '#page-profile.has-clean-profile>.page-body>div:not(#ubCleanProfile){display:none!important;}',
      '.ub-cp{max-width:760px;margin:0 auto;color:#fff;}',
      '.ub-cp-hero{overflow:hidden;border:1px solid rgba(64,208,255,.34);border-radius:18px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));box-shadow:0 18px 45px rgba(0,0,0,.42);}',
      '.ub-cp-cover{height:116px;background:radial-gradient(circle at 25% 0%,rgba(64,208,255,.28),transparent 36%),radial-gradient(circle at 80% 40%,rgba(240,192,64,.18),transparent 35%),linear-gradient(135deg,rgba(8,16,32,.95),rgba(0,0,0,.65));border-bottom:1px solid rgba(201,168,76,.22);}',
      '.ub-cp-core{padding:0 14px 14px;text-align:center;margin-top:-46px;}',
      '.ub-cp-avatar{width:96px;height:96px;margin:0 auto 8px;border-radius:50%;border:3px solid #F0C040;background:#030305;display:flex;align-items:center;justify-content:center;font-size:2.6rem;overflow:hidden;box-shadow:0 0 24px rgba(240,192,64,.26);cursor:pointer;}',
      '.ub-cp-avatar img{width:100%;height:100%;object-fit:cover;}',
      '.ub-cp-name{font-family:Bebas Neue,Arial,sans-serif;font-size:2.05rem;letter-spacing:2px;color:#F0C040;line-height:1;margin:4px 0 0;}',
      '.ub-cp-user{font-family:Orbitron,sans-serif;font-size:.58rem;letter-spacing:2px;color:#40D0FF;margin-top:4px;}',
      '.ub-cp-badges{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:10px 0;}',
      '.ub-cp-badge{padding:4px 8px;border-radius:999px;border:1px solid rgba(64,208,255,.35);background:rgba(64,208,255,.09);font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.2px;color:#fff;}',
      '.ub-cp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;}',
      '.ub-cp-stat{border:1px solid rgba(64,208,255,.24);border-radius:12px;background:rgba(255,255,255,.035);padding:9px 4px;}',
      '.ub-cp-stat b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.55rem;letter-spacing:1.4px;color:#F0C040;line-height:1;}',
      '.ub-cp-stat span{display:block;margin-top:4px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.4px;color:rgba(240,237,232,.62);}',
      '.ub-cp-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;}',
      '.ub-cp-actions button{border-radius:12px;padding:12px 7px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.2px;font-weight:900;cursor:pointer;border:1px solid transparent;}',
      '.ub-cp-section{margin-top:10px;border:1px solid rgba(201,168,76,.22);border-radius:16px;background:rgba(0,0,0,.22);padding:12px;text-align:left;}',
      '.ub-cp-section-title{font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#F0C040;margin-bottom:7px;}',
      '.ub-cp-section-text{font-size:.86rem;line-height:1.45;color:rgba(240,237,232,.75);}',
      '.ub-tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:9px;}',
      '.ub-tool-btn{border-radius:12px;padding:12px 7px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.2px;font-weight:900;cursor:pointer;border:1px solid transparent;}',
      '.ub-btn-gold{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-btn-blue{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important;}',
      '.ub-btn-red{background:rgba(255,51,51,.13);color:#ff6b6b;border-color:rgba(255,51,51,.35)!important;}',
      '@media(max-width:520px){.ub-cp-actions{grid-template-columns:1fr 1fr}.ub-tool-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderProfile(){
    if(!ok()) return;
    injectProfileCss();
    watchLive();
    var page=document.getElementById('page-profile'); if(!page) return;
    var body=page.querySelector('.page-body'); if(!body) return;
    var u=getCurrent(); if(!u||!myName()){ page.classList.remove('has-clean-profile'); return; }
    var t=myName(), c=countsFor(t), live=isLive(t);
    var bio=(u.bio&&u.bio.trim())?u.bio:"You haven't added your story yet. Tap 'EDIT PROFILE' to tell people who you are.";
    var key=[t,u.name||'',u.photo||'',u.avatar||'',u.city||'',bio,c.followers,c.following,u.battles||0,live?'1':'0'].join('|');
    if(_lastProfileKey===key&&document.getElementById('ubCleanProfile')) return;
    _lastProfileKey=key;
    // FIX: guard against wiping DOM while live cam is active
    if(document.getElementById('ubProfileLiveCamBox')) return;
    var old=document.getElementById('ubCleanProfile'); if(old) old.remove();
    var av=u.photo?'<img src="'+esc(u.photo)+'" alt="profile">':esc(u.avatar||'🎤');
    var role=(u.role||'artist').toLowerCase();
    var badges=['✔ Verified', role==='dj'?'🎧 DJ':role==='viewer'?'👀 Viewer':'🎤 Artist'];
    if(role==='artist') badges.push('⚔️ Battle Rapper');
    body.insertAdjacentHTML('afterbegin',
      '<div class="ub-cp" id="ubCleanProfile">'+
        '<div class="ub-cp-hero">'+
          '<div class="ub-cp-cover"></div>'+
          '<div class="ub-cp-core">'+
            '<div class="ub-cp-avatar" onclick="if(window.openPhotoModal)openPhotoModal()">'+av+'</div>'+
            '<div class="ub-cp-name">'+esc(u.name||'UniBeatz')+'</div>'+
            '<div class="ub-cp-user">@'+esc(t)+'</div>'+
            '<div class="ub-cp-badges">'+badges.map(function(b){ return '<span class="ub-cp-badge">'+esc(b)+'</span>'; }).join('')+'</div>'+
            '<div class="ub-cp-stats">'+
              '<div class="ub-cp-stat"><b>'+fmt(c.followers)+'</b><span>FOLLOWERS</span></div>'+
              '<div class="ub-cp-stat"><b>'+fmt(c.following)+'</b><span>FOLLOWING</span></div>'+
              '<div class="ub-cp-stat"><b>'+fmt(u.battles||0)+'</b><span>BATTLES</span></div>'+
            '</div>'+
            '<div class="ub-cp-actions">'+
              '<button class="ub-btn-gold" onclick="showToast(\'This is your profile\')">MY PROFILE</button>'+
              '<button class="ub-btn-blue" onclick="ubProfile.openDM()">MESSAGE</button>'+
              '<button class="ub-btn-blue" onclick="goToPage(\'queue\')">CHALLENGE</button>'+
              '<button class="'+(live?'ub-btn-red':'ub-btn-gold')+'" onclick="ubProfile.toggleLive()">'+(live?'END LIVE':'GO LIVE')+'</button>'+
            '</div>'+
            '<div class="ub-cp-section"><div class="ub-cp-section-title">ABOUT ME</div><div class="ub-cp-section-text">'+esc(bio)+'</div><span style="display:inline-block;margin-top:8px;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:1.4px;cursor:pointer;" onclick="goToPage(\'editprofile\')">EDIT PROFILE →</span></div>'+
            '<div class="ub-cp-section"><div class="ub-cp-section-title">CREATOR TOOLS</div>'+
              '<div class="ub-tool-grid">'+
                '<button class="ub-tool-btn ub-btn-blue" onclick="goToPage(\'editprofile\')">EDIT PROFILE</button>'+
                '<button class="ub-tool-btn ub-btn-blue" onclick="showToast(\'Cover photo tools coming soon\')">COVER PHOTO</button>'+
                '<button class="ub-tool-btn ub-btn-gold" onclick="goToPage(\'browseproducer\')">BROWSE PRODUCERS</button>'+
              '</div>'+
            '</div>'+
            '<div style="font-family:Orbitron,sans-serif;font-size:.42rem;color:rgba(240,237,232,.45);text-align:center;margin-top:8px;">User ID: '+esc(u.uid||'UB-000000')+' · Joined '+esc(u.joined||'2025')+'</div>'+
          '</div>'+
        '</div>'+
      '</div>'
    );
    page.classList.add('has-clean-profile');
  }

  async function toggleLive(){
    var t=myName();
    var on=isLive(t);
    _liveCache[t]=!on;
    // FIX: don't reset _lastProfileKey here — let setLive handle the re-render decision
    await setLive(!on);
  }

  // ═══════════════════════════════════════════════════
  // LIVE CHAT BUBBLE (bottom right)
  // ═══════════════════════════════════════════════════
  var chatSt = { fb:null, unsub:null, activeRoom:null, live:false };

  function injectChatCss(){
    if(document.getElementById('ubLiveChatCss')) return;
    var s=document.createElement('style'); s.id='ubLiveChatCss';
    s.textContent=[
      '.ub-chat-launch{position:fixed;right:18px;bottom:96px;z-index:9998;width:48px;height:48px;border-radius:50%;border:1px solid rgba(64,208,255,.6);background:rgba(8,8,15,.78);backdrop-filter:blur(10px);color:#40D0FF;display:flex;align-items:center;justify-content:center;font-size:1.25rem;box-shadow:0 0 18px rgba(64,208,255,.18);cursor:pointer;}',
      '.ub-chat-launch.offline{opacity:.45;filter:grayscale(.5);}',
      '.ub-chat-panel{position:fixed;right:14px;bottom:150px;z-index:9999;width:min(360px,calc(100vw - 28px));height:min(520px,calc(100dvh - 190px));display:none;flex-direction:column;border:1px solid rgba(201,168,76,.45);border-radius:16px;background:rgba(3,3,5,.94);backdrop-filter:blur(12px);box-shadow:0 20px 60px rgba(0,0,0,.55);overflow:hidden;color:#fff;}',
      '.ub-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(64,208,255,.25);background:linear-gradient(90deg,rgba(201,168,76,.10),rgba(64,208,255,.08));}',
      '.ub-chat-title{font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;color:#40D0FF;}',
      '.ub-chat-room{font-family:Bebas Neue,Arial,sans-serif;font-size:1.15rem;letter-spacing:1.5px;color:#F0C040;line-height:1;}',
      '.ub-chat-feed{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}',
      '.ub-chat-msg{padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055);font-size:.88rem;line-height:1.25;}',
      '.ub-chat-meta{display:flex;align-items:center;gap:6px;margin-bottom:2px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.2px;color:#40D0FF;}',
      '.ub-chat-offline{margin:auto;padding:18px;text-align:center;color:rgba(240,237,232,.72);font-size:.92rem;line-height:1.45;}',
      '.ub-chat-offline b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.45rem;letter-spacing:2px;color:#F0C040;margin-bottom:7px;}',
      '.ub-chat-input-row{display:grid;grid-template-columns:1fr auto;gap:7px;padding:10px;border-top:1px solid rgba(64,208,255,.18);}',
      '.ub-chat-input-row input{background:#05070d;border:1px solid rgba(64,208,255,.45);border-radius:10px;color:#fff;padding:10px;outline:none;}',
      '.ub-chat-input-row button{border:0;border-radius:10px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.52rem;font-weight:900;letter-spacing:1.5px;padding:0 12px;cursor:pointer;}',
      '@media(max-width:600px){.ub-chat-panel{left:10px;right:10px;bottom:92px;width:auto;height:min(450px,calc(100dvh - 130px));}.ub-chat-launch{bottom:86px;right:14px;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureChatPanel(){
    injectChatCss();
    var launch=document.getElementById('ubLiveChatLaunch');
    if(!launch){
      launch=document.createElement('button'); launch.id='ubLiveChatLaunch';
      launch.className='ub-chat-launch offline'; launch.innerHTML='💬';
      launch.onclick=function(){ toggleChat(); };
      document.body.appendChild(launch);
    }
    var panel=document.getElementById('ubLiveChatPanel'); if(panel) return panel;
    panel=document.createElement('div'); panel.id='ubLiveChatPanel'; panel.className='ub-chat-panel';
    panel.innerHTML='<div class="ub-chat-head"><div><div class="ub-chat-title">LIVE CHAT</div><div class="ub-chat-room" id="ubChatRoomLabel">OFFLINE</div></div><button style="border:0;background:transparent;color:#F0C040;font-size:1.1rem;cursor:pointer;" id="ubChatClose">×</button></div><div class="ub-chat-feed" id="ubChatFeed"></div><div class="ub-chat-input-row"><input id="ubChatInput" maxlength="220" placeholder="Chat unlocks when live..."><button id="ubChatSend">SEND</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#ubChatClose').onclick=function(){ panel.style.display='none'; };
    panel.querySelector('#ubChatSend').onclick=sendChatFromInput;
    panel.querySelector('#ubChatInput').addEventListener('keydown',function(e){ if(e.key==='Enter') sendChatFromInput(); });
    return panel;
  }

  function toggleChat(){
    var panel=ensureChatPanel();
    if(panel.style.display==='flex'){ panel.style.display='none'; return; }
    panel.style.display='flex';
    autoDetectChatRoom();
  }

  function autoDetectChatRoom(){
    var active=document.querySelector('.page.active');
    var id=active?active.id:'home';
    var room='offline', label='OFFLINE', live=false;
    if(id==='page-battle-live'||id==='page-livebattle'){ room='battle_live'; label='BATTLE LIVE'; live=true; }
    else if(id==='page-cypher'){ room='cypher_live'; label='CYPHER LIVE'; live=true; }
    else if(id==='page-practice'){ room='practice_'+myName(); label='PRACTICE LIVE'; live=true; }
    // If viewing a live profile modal, use that room
    else if(liveSt.viewerTarget){
      room=liveSt.viewerTarget; label='@'+liveSt.viewerTarget.toUpperCase()+' LIVE'; live=true;
    }
    // If hosting live
    else if(document.getElementById('ubProfileLiveCamBox')){
      room=myName(); label='YOUR LIVE'; live=true;
    }
    openChatRoom(room,label,live);
  }

  function openChatRoom(room, label, isLiveRoom){
    var fb=getFb(); if(!fb) return;
    chatSt.live=!!isLiveRoom; chatSt.activeRoom=room;
    var roomEl=document.getElementById('ubChatRoomLabel'); if(roomEl) roomEl.textContent=label;
    var input=document.getElementById('ubChatInput');
    if(input) input.placeholder=isLiveRoom?'Say something live...':'Chat unlocks when session is live...';
    var launch=document.getElementById('ubLiveChatLaunch');
    if(launch) launch.classList.toggle('offline',!isLiveRoom);
    if(chatSt.unsub) try{ chatSt.unsub(); }catch(e){}
    var feed=document.getElementById('ubChatFeed'); if(!feed) return;
    if(!isLiveRoom){ feed.innerHTML='<div class="ub-chat-offline"><b>OFFLINE</b>Chat unlocks during live sessions.</div>'; return; }
    var q=fb.query(fb.collection(fb.db,'live_chats',room,'messages'),fb.orderBy('at','asc'));
    chatSt.unsub=fb.onSnapshot(q,function(snap){
      feed.innerHTML='';
      snap.forEach(function(d){
        var m=d.data();
        var row=document.createElement('div'); row.className='ub-chat-msg';
        row.innerHTML='<div class="ub-chat-meta">'+esc(m.from||'guest')+'</div><div>'+esc(m.text||m.emoji||'')+'</div>';
        feed.appendChild(row);
      });
      feed.scrollTop=feed.scrollHeight;
    });
  }

  function sendChatFromInput(){
    var fb=getFb(); if(!fb) return;
    if(!chatSt.live){ toast('Chat unlocks when session is live'); return; }
    var input=document.getElementById('ubChatInput'); if(!input) return;
    var msg=input.value.trim(); if(!msg) return;
    input.value='';
    fb.addDoc(fb.collection(fb.db,'live_chats',chatSt.activeRoom,'messages'),
      { from:myName(), role:(getCurrent()||{}).role||'viewer', text:msg, type:'chat', at:Date.now() });
  }

  // ═══════════════════════════════════════════════════
  // DM MESSAGES — Instagram-style layout
  // ═══════════════════════════════════════════════════

  // Word filter — blocks hate speech, sexual violence, and predatory content
  var _blockedWords = [
    // Sexual violence
    'rape','rapist','raping','raped',
    // Child exploitation
    'pedophile','pedo','pedophilia','child porn','cp ','kiddie',
    'molest','molested','molester','grooming',
    // Extreme slurs and hate
    'nigger','faggot','chink','spic','kike','wetback','tranny',
    // Death threats
    'i will kill you','ima kill','going to kill','kill yourself','kys',
    'i will rape','ima rape',
    // Self harm
    'kill myself','end my life','commit suicide',
    // Doxxing
    'your address','your location','i know where you live'
  ];

  function filterMessage(msg){
    var lower = msg.toLowerCase();
    for(var i=0;i<_blockedWords.length;i++){
      if(lower.indexOf(_blockedWords[i])>-1){
        return { blocked:true, word:_blockedWords[i] };
      }
    }
    return { blocked:false };
  }

  var _dmUnsub=null;
  var _dmTarget=null;

  function dmRoomId(a,b){ return [a,b].sort().join('_dm_'); }

  function injectDMCss(){
    if(document.getElementById('ubDMCss')) return;
    var s=document.createElement('style'); s.id='ubDMCss';
    s.textContent=[
      '#ubDMModal{position:fixed;inset:0;background:#05070d;z-index:99999;display:none;flex-direction:column;color:#fff;font-family:Arial,sans-serif;}',
      // Top bar — live producers rail
      '#ubDMLiveRail{flex-shrink:0;border-bottom:1px solid rgba(201,168,76,.22);background:rgba(0,0,0,.4);padding:10px 12px;overflow-x:auto;white-space:nowrap;display:flex;align-items:center;gap:10px;-webkit-overflow-scrolling:touch;}',
      '#ubDMLiveRail::-webkit-scrollbar{display:none;}',
      '.ub-dm-live-chip{display:inline-flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;}',
      '.ub-dm-live-avatar{width:46px;height:46px;border-radius:50%;border:2px solid #ff3333;overflow:hidden;position:relative;background:#111;}',
      '.ub-dm-live-avatar img,.ub-dm-live-avatar span{width:100%;height:100%;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:1.3rem;}',
      '.ub-dm-live-dot{position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:#ff3333;border-radius:50%;border:1.5px solid #05070d;}',
      '.ub-dm-live-name{font-family:Orbitron,sans-serif;font-size:.36rem;color:#40D0FF;letter-spacing:1px;max-width:52px;overflow:hidden;text-overflow:ellipsis;}',
      // Header
      '#ubDMHeader{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(64,208,255,.2);background:rgba(3,3,5,.95);flex-shrink:0;}',
      '#ubDMHeader h2{font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;letter-spacing:2px;color:#F0C040;margin:0;}',
      // Body — sidebar + thread
      '#ubDMBody{display:flex;flex:1;overflow:hidden;}',
      // Thread list sidebar
      '#ubDMThreadList{width:200px;flex-shrink:0;border-right:1px solid rgba(64,208,255,.12);overflow-y:auto;background:rgba(0,0,0,.3);}',
      '#ubDMThreadList::-webkit-scrollbar{width:3px;}',
      '#ubDMThreadList::-webkit-scrollbar-thumb{background:rgba(64,208,255,.2);}',
      '.ub-dm-thread{padding:12px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);display:flex;align-items:center;gap:9px;transition:background .15s;}',
      '.ub-dm-thread:hover,.ub-dm-thread.active{background:rgba(64,208,255,.08);}',
      '.ub-dm-thread-av{width:36px;height:36px;border-radius:50%;border:1.5px solid rgba(240,192,64,.5);background:#111;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;overflow:hidden;}',
      '.ub-dm-thread-av img{width:100%;height:100%;object-fit:cover;}',
      '.ub-dm-thread-info{min-width:0;}',
      '.ub-dm-thread-name{font-family:Bebas Neue,Arial,sans-serif;font-size:.9rem;letter-spacing:1px;color:#F0C040;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ub-dm-thread-preview{font-size:.72rem;color:rgba(240,237,232,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ub-dm-new{padding:11px 10px;cursor:pointer;border-bottom:1px solid rgba(64,208,255,.15);font-family:Orbitron,sans-serif;font-size:.42rem;color:#40D0FF;letter-spacing:1.2px;display:flex;align-items:center;gap:6px;}',
      '.ub-dm-new:hover{background:rgba(64,208,255,.06);}',
      // Message feed
      '#ubDMPane{flex:1;display:flex;flex-direction:column;overflow:hidden;}',
      '#ubDMFeedHeader{padding:10px 14px;border-bottom:1px solid rgba(64,208,255,.12);font-family:Bebas Neue,Arial,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#F0C040;flex-shrink:0;min-height:40px;}',
      '#ubDMFeed{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}',
      '#ubDMFeed::-webkit-scrollbar{width:3px;}',
      '#ubDMFeed::-webkit-scrollbar-thumb{background:rgba(64,208,255,.2);}',
      '.ub-dm-msg-mine{align-self:flex-end;max-width:75%;background:rgba(64,208,255,.15);border:1px solid rgba(64,208,255,.3);border-radius:16px 16px 4px 16px;padding:9px 13px;font-size:.88rem;line-height:1.4;}',
      '.ub-dm-msg-theirs{align-self:flex-start;max-width:75%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px 16px 16px 4px;padding:9px 13px;font-size:.88rem;line-height:1.4;}',
      '.ub-dm-msg-from{font-family:Orbitron,sans-serif;font-size:.38rem;color:#40D0FF;margin-bottom:3px;}',
      '.ub-dm-empty{margin:auto;text-align:center;color:rgba(240,237,232,.35);font-size:.88rem;padding:24px;}',
      // Input row
      '#ubDMInputRow{padding:10px 12px;border-top:1px solid rgba(64,208,255,.14);display:grid;grid-template-columns:1fr auto;gap:9px;flex-shrink:0;background:rgba(0,0,0,.3);}',
      '#ubDMInput{background:#0a0c14;border:1px solid rgba(64,208,255,.35);border-radius:12px;color:#fff;padding:10px 14px;outline:none;font-size:.9rem;width:100%;box-sizing:border-box;}',
      '#ubDMInput:focus{border-color:rgba(64,208,255,.7);}',
      '#ubDMSend{border:0;border-radius:12px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;letter-spacing:1.5px;padding:0 16px;cursor:pointer;white-space:nowrap;}',
      // Mobile responsive
      '@media(max-width:520px){#ubDMThreadList{width:64px;}',
      '.ub-dm-thread-info{display:none;}',
      '.ub-dm-thread-av{width:40px;height:40px;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureDMModal(){
    injectDMCss();
    var m=document.getElementById('ubDMModal'); if(m) return m;
    m=document.createElement('div'); m.id='ubDMModal';
    m.innerHTML=[
      // Live producers rail at top
      '<div id="ubDMLiveRail"><span style="font-family:Orbitron,sans-serif;font-size:.38rem;color:rgba(240,192,64,.6);letter-spacing:1.5px;flex-shrink:0;">LIVE</span></div>',
      // Header
      '<div id="ubDMHeader">',
        '<h2>MESSAGES</h2>',
        '<button id="ubDMClose" style="border:0;background:transparent;color:#F0C040;font-size:1.5rem;cursor:pointer;line-height:1;">×</button>',
      '</div>',
      // Body
      '<div id="ubDMBody">',
        // Sidebar thread list
        '<div id="ubDMThreadList">',
          '<div class="ub-dm-new" id="ubDMNewBtn">✏️ <span>NEW DM</span></div>',
        '</div>',
        // Message pane
        '<div id="ubDMPane">',
          '<div id="ubDMFeedHeader"></div>',
          '<div id="ubDMFeed"><div class="ub-dm-empty">Select a conversation<br>or start a new one.</div></div>',
          '<div id="ubDMInputRow">',
            '<input id="ubDMInput" maxlength="500" placeholder="Send a message...">',
            '<button id="ubDMSend">SEND</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(m);
    m.querySelector('#ubDMClose').onclick=function(){
      m.style.display='none';
      if(_dmUnsub){ try{_dmUnsub();}catch(e){} _dmUnsub=null; }
    };
    m.querySelector('#ubDMSend').onclick=sendDM;
    m.querySelector('#ubDMInput').addEventListener('keydown',function(e){ if(e.key==='Enter') sendDM(); });
    m.querySelector('#ubDMNewBtn').onclick=function(){
      var t=prompt('Enter @username to message:'); if(!t) return;
      openDMThread(clean(t));
    };
    return m;
  }

  function openDM(target){
    var m=ensureDMModal(); m.style.display='flex';
    loadDMLiveRail();
    loadDMThreadList();
    if(target) openDMThread(target);
  }

  function loadDMLiveRail(){
    var fb=getFb(); if(!fb) return;
    var rail=document.getElementById('ubDMLiveRail'); if(!rail) return;
    // Keep the LIVE label, clear the rest
    rail.innerHTML='<span style="font-family:Orbitron,sans-serif;font-size:.38rem;color:rgba(240,192,64,.6);letter-spacing:1.5px;flex-shrink:0;">LIVE NOW</span>';
    fb.getDocs(fb.query(fb.collection(fb.db,'live_profiles'),fb.where('isLive','==',true)))
      .then(function(snap){
        if(snap.empty){
          var none=document.createElement('span');
          none.style.cssText='font-size:.75rem;color:rgba(240,237,232,.3);padding-left:8px;';
          none.textContent='No one live right now';
          rail.appendChild(none); return;
        }
        snap.forEach(function(doc){
          var p=doc.data();
          var chip=document.createElement('div');
          chip.className='ub-dm-live-chip';
          chip.innerHTML='<div class="ub-dm-live-avatar">'+(p.photo?'<img src="'+esc(p.photo)+'">':'<span>'+esc(p.avatar||'🎤')+'</span>')+'<div class="ub-dm-live-dot"></div></div><div class="ub-dm-live-name">@'+esc(p.username)+'</div>';
          chip.onclick=function(){ document.getElementById('ubDMModal').style.display='none'; openLiveModal(p.username); };
          rail.appendChild(chip);
        });
      }).catch(function(){});
  }

  function loadDMThreadList(){
    var fb=getFb(); if(!fb) return;
    var me=myName(); if(!me) return;
    var list=document.getElementById('ubDMThreadList'); if(!list) return;
    var users=window.ub_users||read('ub_users','{}');
    fb.getDocs(fb.collection(fb.db,'dm_rooms')).then(function(snap){
      // Clear existing threads (keep new DM button)
      list.querySelectorAll('.ub-dm-thread').forEach(function(el){ el.remove(); });
      var threads=[];
      snap.forEach(function(doc){
        var id=doc.id, d=doc.data();
        if(id.indexOf(me)<0) return;
        var parts=id.replace('_dm_','|').split('|');
        var other=parts[0]===me?parts[1]:parts[0];
        if(other) threads.push({ roomId:id, other:other, updatedAt:d.updatedAt||0, preview:d.lastMsg||'' });
      });
      // Sort newest first
      threads.sort(function(a,b){ return b.updatedAt-a.updatedAt; });
      threads.forEach(function(th){
        var u=(users||{})[th.other]||{};
        var av=u.photo?'<img src="'+esc(u.photo)+'">':esc(u.avatar||'👤');
        var row=document.createElement('div');
        row.className='ub-dm-thread';
        row.dataset.other=th.other;
        row.innerHTML='<div class="ub-dm-thread-av">'+av+'</div><div class="ub-dm-thread-info"><div class="ub-dm-thread-name">@'+esc(th.other)+'</div><div class="ub-dm-thread-preview">'+esc(th.preview)+'</div></div>';
        row.onclick=function(){ openDMThread(th.other); };
        list.appendChild(row);
      });
    }).catch(function(){});
  }

  function openDMThread(target){
    target=clean(target); if(!target) return;
    _dmTarget=target;
    var fb=getFb(); if(!fb) return;
    var me=myName(); if(!me) return;
    var roomId=dmRoomId(me,target);
    var feed=document.getElementById('ubDMFeed'); if(!feed) return;
    var header=document.getElementById('ubDMFeedHeader');
    if(header) header.textContent='@'+target.toUpperCase();
    // Highlight active thread
    document.querySelectorAll('.ub-dm-thread').forEach(function(el){
      el.classList.toggle('active', el.dataset.other===target);
    });
    feed.innerHTML='<div class="ub-dm-empty" style="font-size:.75rem;">Loading...</div>';
    var input=document.getElementById('ubDMInput');
    if(input) input.placeholder='Message @'+target+'...';
    // Ensure room doc exists
    fb.setDoc(fb.doc(fb.db,'dm_rooms',roomId),
      { participants:[me,target], updatedAt:Date.now() },{ merge:true }).catch(function(){});
    // Unsubscribe previous
    if(_dmUnsub){ try{_dmUnsub();}catch(e){} }
    var q=fb.query(fb.collection(fb.db,'dm_rooms',roomId,'messages'),fb.orderBy('at','asc'));
    _dmUnsub=fb.onSnapshot(q,function(snap){
      feed.innerHTML='';
      if(snap.empty){
        feed.innerHTML='<div class="ub-dm-empty">No messages yet.<br>Say something!</div>';
        return;
      }
      snap.forEach(function(doc){
        var d=doc.data();
        var isMe=d.from===me;
        var row=document.createElement('div');
        row.className=isMe?'ub-dm-msg-mine':'ub-dm-msg-theirs';
        if(!isMe) row.innerHTML='<div class="ub-dm-msg-from">@'+esc(d.from)+'</div>';
        var txt=document.createElement('div');
        txt.textContent=d.text;
        row.appendChild(txt);
        feed.appendChild(row);
      });
      feed.scrollTop=feed.scrollHeight;
    });
  }

  function sendDM(){
    var fb=getFb(); if(!fb) return;
    var me=myName(); if(!me) return toast('Sign in to send messages');
    if(!_dmTarget) return toast('Select a conversation first');
    var input=document.getElementById('ubDMInput'); if(!input) return;
    var msg=input.value.trim(); if(!msg) return;
    // Word filter
    var check=filterMessage(msg);
    if(check.blocked){
      toast('⚠️ Platform links not allowed in messages');
      return;
    }
    input.value='';
    var roomId=dmRoomId(me,_dmTarget);
    fb.addDoc(fb.collection(fb.db,'dm_rooms',roomId,'messages'),
      { from:me, to:_dmTarget, text:msg, at:Date.now() }
    ).then(function(){
      fb.setDoc(fb.doc(fb.db,'dm_rooms',roomId),
        { updatedAt:Date.now(), lastMsg:msg.substring(0,40) },{ merge:true }).catch(function(){});
      // Refresh thread list to reorder
      loadDMThreadList();
    }).catch(function(e){ toast('Send failed: '+e.message); });
  }
  // ═══════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════
  function boot(){
    if(!ok()) return;
    ensureChatPanel();
    renderProfile();
    refreshLiveRail();
  }

  window.ubProfile = {
    render: renderProfile,
    goLive: function(){ setLive(true); },
    endLive: function(){ setLive(false); },
    toggleLive: toggleLive,
    follow: follow,
    open: openLiveModal,
    openDM: openDM,
    refresh: refreshLiveRail,
    chat: { open: openChatRoom, toggle: toggleChat },
    get _liveCache(){ return _liveCache; }
  };

  // Keep backward compat
  window.ubProfileLive = window.ubProfile;
  window.ubProfileFollow = { refresh: function(){ _lastProfileKey=''; renderProfile(); }, toggleLive: toggleLive };
  window.ubLiveChat = { toggle: toggleChat, open: openChatRoom, refresh: autoDetectChatRoom };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('ub-firebase-ready', function(){ setTimeout(boot, 200); });

  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setInterval(function(){ renderProfile(); refreshLiveRail(); }, 5000);
})();
