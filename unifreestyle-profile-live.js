// unifreestyle-profile-live.js
// Profile live: Firestore status + LiveKit camera/audio broadcaster and receiver.
(function(){
  'use strict';

  var TOKEN_FN='https://getlivekittoken-vikmcq7yva-uc.a.run.app';
  var st={fb:null,db:null,chatUnsub:null,viewerTarget:null,room:null,liveRole:null};
  var UBP_CUT=0.10;

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function toast(msg){if(window.showToast)window.showToast(msg);else console.log('[profile-live]',msg);}
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function user(){try{var raw=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user');return raw?JSON.parse(raw):{};}catch(e){return {};}}
  function uname(){var u=user();return String(u.username||u.name||'guest_'+Math.floor(Math.random()*9999)).toLowerCase().replace(/[^a-z0-9_]/g,'');}
  function roomName(target){return 'profile-live-'+String(target||'guest').toLowerCase().replace(/[^a-z0-9_-]/g,'_');}
  function safeId(s){return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_');}

  function injectScrollFix(){
    if(document.getElementById('ubProfileScrollFix'))return;
    var css=document.createElement('style');css.id='ubProfileScrollFix';
    css.textContent='html,body{overflow-y:auto!important;}#page-profile,#page-profile.active,#page-profile .page-body{overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;height:auto!important;min-height:100vh!important;max-height:none!important;padding-bottom:160px!important;}#ubLiveProfilesRail{width:100%!important;box-sizing:border-box!important;max-width:100%!important;}#ubLiveProfilesList::-webkit-scrollbar{height:4px;}#ubLiveProfilesList::-webkit-scrollbar-thumb{background:rgba(64,208,255,.45);border-radius:999px;}#ubLiveVideoBox{position:relative;overflow:hidden;}#ubLiveVideoBox video{width:100%;height:100%;object-fit:cover;background:#000;}';
    document.head.appendChild(css);
  }

  async function fb(){
  var g = window.UB_FIREBASE || {};

  if (!g.app && !g.db) {
    throw new Error('Firebase not ready');
  }

  const fs = await import(
    'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js'
  );

  st.db = g.db || fs.getFirestore(g.app);

  st.fb = {
    db: st.db,
    collection: g.collection || fs.collection,
    doc: g.doc || fs.doc,
    getDoc: g.getDoc || fs.getDoc,
    getDocs: g.getDocs || fs.getDocs,
    setDoc: g.setDoc || fs.setDoc,
    addDoc: g.addDoc || fs.addDoc,
    updateDoc: g.updateDoc || fs.updateDoc,
    onSnapshot: g.onSnapshot || fs.onSnapshot,
    query: g.query || fs.query,
    where: g.where || fs.where,
    orderBy: g.orderBy || fs.orderBy,
    serverTimestamp: g.serverTimestamp || fs.serverTimestamp
  };

  return st;
}

  async function waitLiveKit(){
    if(window.LivekitClient)return window.LivekitClient;
    var start=Date.now();
    while(Date.now()-start<6000){await new Promise(function(r){setTimeout(r,100);});if(window.LivekitClient)return window.LivekitClient;}
    throw new Error('LiveKit SDK did not load');
  }

  function clearMedia(){
    document.querySelectorAll('[data-profile-livekit="yes"], audio[data-profile-livekit="yes"]').forEach(function(el){try{el.remove();}catch(e){}});
  }
  function videoBox(){return document.getElementById('ubLiveVideoBox');}
  function attachVideo(track,identity,local){
    var box=videoBox(); if(!box||!track)return;
    box.innerHTML='';
    var v=document.createElement('video');
    v.dataset.profileLivekit='yes'; v.autoplay=true; v.playsInline=true; v.setAttribute('playsinline','true');
    if(local)v.muted=true;
    v.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;'+(local?'transform:scaleX(-1);':'');
    box.appendChild(v); track.attach(v); v.play().catch(function(){});
  }
  function attachAudio(track,identity){
    var id='profile-live-audio-'+safeId(identity); var old=document.getElementById(id); if(old)old.remove();
    var a=track.attach(); a.id=id; a.dataset.profileLivekit='yes'; a.autoplay=true; a.playsInline=true; document.body.appendChild(a); a.play&&a.play().catch(function(){});
  }
  async function connectMedia(target,role){
    var LK=await waitLiveKit();
    if(st.room){try{st.room.disconnect();}catch(e){} st.room=null;}
    clearMedia();
    var identity=uname()+'-'+role+'-'+Date.now();
    var rn=roomName(target);
    var resp=await fetch(TOKEN_FN+'?room='+encodeURIComponent(rn)+'&username='+encodeURIComponent(identity));
    var data=await resp.json();
    if(!resp.ok||!data.token||!data.url)throw new Error(data.error||'LiveKit token failed');
    var room=new LK.Room({adaptiveStream:true,dynacast:true}); st.room=room; st.liveRole=role;
    room.on('trackSubscribed',function(track,pub,participant){
      if(track.kind==='video')attachVideo(track,participant.identity,false);
      if(track.kind==='audio')attachAudio(track,participant.identity);
    });
    room.on('trackUnsubscribed',function(track,pub,participant){clearMedia();});
    room.on('disconnected',function(){st.room=null;});
    await room.connect(data.url,data.token);
    if(role==='host'){
      await room.localParticipant.enableCameraAndMicrophone();
      room.localParticipant.trackPublications.forEach(function(pub){if(pub.track&&pub.track.kind==='video')attachVideo(pub.track,identity,true);});
      toast('📹 Profile live cam + mic connected');
    }else{
      var box=videoBox(); if(box)box.innerHTML='<div style="padding:18px;text-align:center;color:#40D0FF;font-family:Orbitron;">Connecting to live camera + audio...</div>';
      toast('👁️ Watching live profile');
    }
    return room;
  }
  function disconnectMedia(){if(st.room){try{st.room.disconnect();}catch(e){}}st.room=null;clearMedia();}

  async function setLive(isLive){
    await fb();
    var u=user(),name=uname();
    if(isLive)await connectMedia(name,'host'); else disconnectMedia();
    await st.fb.setDoc(st.fb.doc(st.db,'live_profiles',name),{username:name,displayName:u.name||name,role:u.role||'artist',avatar:u.avatar||'🎤',photo:u.photo||u.avatarUrl||'',cover:u.cover||u.coverPhoto||u.banner||'',verified:u.verified!==false,isLive:!!isLive,hasAudio:!!isLive,hasVideo:!!isLive,liveRoom:roomName(name),startedAt:isLive?Date.now():0,updatedAt:Date.now()},{merge:true});
    await ensurePublicProfile();
    toast(isLive?'🔴 You are live on your profile':'Live ended');
    refreshLiveProfiles();
  }

  async function ensurePublicProfile(){await fb();var u=user(),name=uname();await st.fb.setDoc(st.fb.doc(st.db,'profiles',name),{username:name,displayName:u.name||name,role:u.role||'artist',avatar:u.avatar||'🎤',photo:u.photo||u.avatarUrl||'',cover:u.cover||u.coverPhoto||u.banner||'',verified:u.verified!==false,search:(name+' '+(u.name||'')).toLowerCase(),updatedAt:Date.now()},{merge:true});}
  async function follow(target){await fb();var me=uname();if(!target||target===me)return;await st.fb.setDoc(st.fb.doc(st.db,'profile_follows',me+'_'+target),{follower:me,following:target,at:Date.now()},{merge:true});await st.fb.setDoc(st.fb.doc(st.db,'profiles',target),{updatedAt:Date.now()},{merge:true});toast('✅ Following '+target);updateFollowCounts(target);}
  async function updateFollowCounts(target){await fb();var followers=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'profile_follows'),st.fb.where('following','==',target)));var following=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'profile_follows'),st.fb.where('follower','==',target)));document.querySelectorAll('[data-followers]').forEach(function(el){el.textContent=followers.size;});document.querySelectorAll('[data-following]').forEach(function(el){el.textContent=following.size;});}
  async function sendChat(target,msg){await fb();msg=String(msg||'').trim();if(!msg)return;await st.fb.addDoc(st.fb.collection(st.db,'profile_live_chats',target,'messages'),{from:uname(),text:msg,type:'chat',at:Date.now()});}
  async function sendSuperChat(target,amount,emoji){await fb();amount=Number(amount||0);if(!amount||amount<1){toast('Enter an amount');return;}var ubp=Math.round(amount*UBP_CUT*100)/100;var creator=Math.round((amount-ubp)*100)/100;await st.fb.addDoc(st.fb.collection(st.db,'profile_live_chats',target,'messages'),{from:uname(),type:'superchat',emoji:emoji||'🔥',amount:amount,creatorAmount:creator,ubpAmount:ubp,payout:'quarterly',at:Date.now()});await st.fb.addDoc(st.fb.collection(st.db,'creator_earnings'),{creator:target,from:uname(),amount:amount,creatorAmount:creator,ubpAmount:ubp,platformCut:UBP_CUT,payout:'quarterly',status:'pending',at:Date.now()});toast('💰 Super Chat logged');}

  function homeRail(){var home=document.querySelector('#page-home .page-body');if(!home)return null;var box=document.getElementById('ubLiveProfilesRail');if(box)return box;box=document.createElement('div');box.id='ubLiveProfilesRail';box.style.cssText='margin:8px 0 10px;padding:6px 8px;border-radius:12px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.22);color:#fff;min-height:58px;max-height:70px;overflow:hidden;';box.innerHTML='<div style="display:flex;align-items:center;gap:10px;height:100%;"><div style="flex:0 0 auto;line-height:1;"><div style="font-family:Orbitron,sans-serif;font-size:.38rem;letter-spacing:1.6px;color:#40D0FF;">LIVE PROFILES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:.95rem;letter-spacing:1.6px;color:#F0C040;line-height:.95;">WATCH LIVE NOW</div></div><div id="ubLiveProfilesList" style="flex:1;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;padding:0 2px 2px;"></div><div style="flex:0 0 auto;font-family:Orbitron,sans-serif;font-size:.38rem;color:rgba(240,237,232,.55);letter-spacing:1px;">SLIDE →</div></div>';var hero=home.querySelector('.home-hero');if(hero)hero.insertAdjacentElement('afterend',box);else home.insertBefore(box,home.firstChild);return box;}
  async function refreshLiveProfiles(){if(!ok())return;await fb();var rail=homeRail();if(!rail)return;var list=rail.querySelector('#ubLiveProfilesList');if(!list)return;var q=st.fb.query(st.fb.collection(st.db,'live_profiles'),st.fb.where('isLive','==',true));var snap=await st.fb.getDocs(q);list.innerHTML='';if(snap.empty){list.innerHTML='<div style="color:rgba(240,237,232,.65);font-size:.75rem;padding:8px 2px;white-space:nowrap;">No one is live yet.</div>';return;}snap.forEach(function(doc){var p=doc.data();var card=document.createElement('div');var cover=p.cover?'background-image:linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.42)),url('+esc(p.cover)+');background-size:cover;background-position:center;':'background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(64,208,255,.10));';card.style.cssText='flex:0 0 174px;scroll-snap-align:start;height:44px;padding:6px 8px;border-radius:10px;border:1px solid rgba(201,168,76,.38);'+cover+'cursor:pointer;box-shadow:0 6px 15px rgba(0,0,0,.2);display:flex;align-items:center;';card.innerHTML='<div style="display:flex;align-items:center;gap:7px;min-width:0;"><div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid #F0C040;font-size:1rem;overflow:hidden;background:rgba(0,0,0,.55);flex:0 0 auto;">'+(p.photo?'<img src="'+esc(p.photo)+'" style="width:100%;height:100%;object-fit:cover;">':esc(p.avatar||'🎤'))+'</div><div style="min-width:0;"><div style="display:flex;align-items:center;gap:4px;color:#F0C040;font-family:Bebas Neue;font-size:.92rem;letter-spacing:1.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">'+esc(p.displayName||p.username)+(p.verified?' <span style="color:#40D0FF;font-size:.68rem;">✓</span>':'')+'</div><div style="color:#40D0FF;font-family:Orbitron;font-size:.36rem;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">🔴 LIVE · @'+esc(p.username)+'</div></div></div>';card.onclick=function(){openLive(p.username);};list.appendChild(card);});}

  function modal(){var m=document.getElementById('ubProfileLiveModal');if(m)return m;m=document.createElement('div');m.id='ubProfileLiveModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;display:none;color:#fff;overflow:auto;padding:18px;';m.innerHTML='<div style="max-width:1000px;margin:0 auto;"><button id="ubLiveClose" class="btn btn-gold" style="width:auto;margin-bottom:12px;">← CLOSE</button><div id="ubLiveHeader"></div><div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:12px;"><div id="ubLiveVideoBox" style="min-height:320px;border-radius:14px;border:1px solid rgba(64,208,255,.45);background:#05070d;display:flex;align-items:center;justify-content:center;color:#40D0FF;font-family:Orbitron;">CONNECTING LIVE CAMERA + AUDIO...</div><div style="border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.35);padding:12px;"><div style="font-family:Orbitron;color:#40D0FF;font-size:.55rem;letter-spacing:2px;margin-bottom:8px;">LIVE CHAT</div><div id="ubLiveChatList" style="height:245px;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin-bottom:8px;"></div><input id="ubLiveChatInput" placeholder="Talk live..." style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;margin-bottom:8px;"><button id="ubLiveSend" class="btn btn-blue">SEND CHAT</button><div style="display:grid;grid-template-columns:1fr 80px;gap:8px;margin-top:8px;"><select id="ubLiveEmoji" style="border-radius:8px;background:#05070d;color:#fff;border:1px solid rgba(201,168,76,.5);padding:8px;"><option>🔥</option><option>⚡</option><option>👑</option><option>🎤</option><option>💎</option></select><input id="ubLiveAmount" type="number" min="1" placeholder="$" style="border-radius:8px;background:#05070d;color:#fff;border:1px solid rgba(201,168,76,.5);padding:8px;"></div><button id="ubLiveSuper" class="btn btn-gold" style="margin-top:8px;">SUPER CHAT</button><div style="font-size:.7rem;color:rgba(240,237,232,.6);margin-top:7px;">90% creator / 10% UniBeatzProduction. Quarterly payout tracking.</div></div></div></div>';document.body.appendChild(m);m.querySelector('#ubLiveClose').onclick=function(){m.style.display='none';if(st.chatUnsub)try{st.chatUnsub();}catch(e){};leaveLiveViewer();disconnectMedia();};return m;}
  async function openLive(target){await fb();var m=modal();m.style.display='block';await joinLiveViewer(target);updateFollowCounts(target);m.querySelector('#ubLiveHeader').innerHTML='<div style="margin-bottom:12px;padding:12px;border-radius:14px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.35);"><div style="font-family:Bebas Neue;font-size:2rem;letter-spacing:2px;color:#F0C040;">@'+esc(target)+' LIVE</div><div style="font-family:Orbitron;font-size:.5rem;color:#40D0FF;letter-spacing:1.5px;margin-top:4px;">👁️ <span data-live-viewers>0</span> VIEWERS · <span data-followers>0</span> FOLLOWERS · <span data-following>0</span> FOLLOWING</div><button class="btn btn-blue" style="width:auto;margin-top:8px;" onclick="ubProfileLive.follow(\''+esc(target)+'\')">FOLLOW</button></div>';m.querySelector('#ubLiveSend').onclick=function(){var input=m.querySelector('#ubLiveChatInput');sendChat(target,input.value);input.value='';};m.querySelector('#ubLiveSuper').onclick=function(){sendSuperChat(target,m.querySelector('#ubLiveAmount').value,m.querySelector('#ubLiveEmoji').value);};listenChat(target);connectMedia(target,'viewer').catch(function(e){console.error(e);toast('Live camera/audio connection failed');});}

  async function joinLiveViewer(target){await fb();if(st.viewerTarget&&st.viewerTarget!==target)await leaveLiveViewer();st.viewerTarget=target;await st.fb.setDoc(st.fb.doc(st.db,'live_profile_viewers',target+'_'+uname()),{profile:target,viewer:uname(),active:true,at:Date.now()},{merge:true});refreshViewerCount(target);}
  async function leaveLiveViewer(){if(!st.viewerTarget)return;await fb();await st.fb.setDoc(st.fb.doc(st.db,'live_profile_viewers',st.viewerTarget+'_'+uname()),{active:false,leftAt:Date.now()},{merge:true});st.viewerTarget=null;}
  async function refreshViewerCount(target){await fb();var snap=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'live_profile_viewers'),st.fb.where('profile','==',target),st.fb.where('active','==',true)));document.querySelectorAll('[data-live-viewers]').forEach(function(el){el.textContent=snap.size;});}
  async function listenChat(target){await fb();if(st.chatUnsub)try{st.chatUnsub();}catch(e){}var list=document.getElementById('ubLiveChatList');if(!list)return;var q=st.fb.query(st.fb.collection(st.db,'profile_live_chats',target,'messages'),st.fb.orderBy('at','asc'));st.chatUnsub=st.fb.onSnapshot(q,function(snap){list.innerHTML='';snap.forEach(function(d){var x=d.data();var row=document.createElement('div');row.style.cssText='padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.86rem;';row.innerHTML=x.type==='superchat'?'<b style="color:#F0C040;">'+esc(x.emoji||'🔥')+' '+esc(x.from)+' sent $'+esc(x.amount)+'</b><div style="color:#40D0FF;font-size:.72rem;">Creator $'+esc(x.creatorAmount)+' · UBP $'+esc(x.ubpAmount)+'</div>':'<b style="color:#40D0FF;">'+esc(x.from)+':</b> '+esc(x.text);list.appendChild(row);});list.scrollTop=list.scrollHeight;});}
  function profileTools(){var profile=document.querySelector('#page-profile .page-body');if(!profile||document.getElementById('ubProfileLiveTools'))return;var box=document.createElement('div');box.id='ubProfileLiveTools';box.style.cssText='margin:14px 0;padding:14px;border-radius:14px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.28);';box.innerHTML='<div style="font-family:Orbitron;color:#40D0FF;font-size:.5rem;letter-spacing:2px;margin-bottom:8px;">PROFILE LIVE</div><button class="btn btn-gold" onclick="ubProfileLive.goLive()">🔴 GO LIVE</button><button class="btn btn-blue" onclick="ubProfileLive.endLive()" style="margin-top:8px;">END LIVE</button><div style="font-size:.8rem;color:rgba(240,237,232,.65);margin-top:8px;">Live profiles appear on the homepage with camera + audio.</div><div id="ubProfileSearchBox" style="margin-top:12px;"><input id="ubProfileSearchInput" placeholder="Search profiles..." style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;"><div id="ubProfileSearchResults" style="display:grid;gap:8px;margin-top:8px;"></div></div>';profile.insertBefore(box,profile.firstChild);var input=box.querySelector('#ubProfileSearchInput');input.addEventListener('input',function(){searchProfiles(input.value);});ensurePublicProfile();}
  async function searchProfiles(term){await fb();var out=document.getElementById('ubProfileSearchResults');if(!out)return;term=String(term||'').toLowerCase().trim();if(term.length<2){out.innerHTML='';return;}var snap=await st.fb.getDocs(st.fb.collection(st.db,'profiles'));out.innerHTML='';snap.forEach(function(doc){var p=doc.data();var hay=(p.search||p.username||'').toLowerCase();if(hay.indexOf(term)>-1){var row=document.createElement('div');row.style.cssText='padding:8px;border:1px solid rgba(201,168,76,.35);border-radius:10px;display:flex;justify-content:space-between;align-items:center;';row.innerHTML='<span style="color:#F0C040;">@'+esc(p.username)+'</span><button class="btn btn-blue" style="width:auto;padding:6px 10px;" onclick="ubProfileLive.follow(\''+esc(p.username)+'\')">FOLLOW</button>';out.appendChild(row);}});}
  function boot(){if(!ok())return;injectScrollFix();profileTools();refreshLiveProfiles();}
  window.ubProfileLive={goLive:function(){setLive(true);},endLive:function(){setLive(false);},refresh:refreshLiveProfiles,open:openLive,follow:follow,chat:sendChat,superChat:sendSuperChat,search:searchProfiles,connectMedia:connectMedia,disconnectMedia:disconnectMedia};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,800);setInterval(function(){injectScrollFix();profileTools();refreshLiveProfiles();if(st.viewerTarget)refreshViewerCount(st.viewerTarget);},5000);
})();
