// unifreestyle-profile-live.js
// Live profile foundation: compact tools, horizontal live rail, cover support, follow, and live chat.
(function(){
  'use strict';

  var st = { fb:null, db:null, chatUnsub:null };
  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(window.showToast) window.showToast(msg); else console.log('[profile-live]', msg); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function user(){ try{ var raw=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user'); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function uname(){ var u=user(); return u.username || u.name || 'guest_'+Math.floor(Math.random()*9999); }

  async function fb(){
    if(st.fb && st.db) return st;
    if(!window.UB_FIREBASE || !window.UB_FIREBASE.app) throw new Error('Firebase not ready');
    st.fb = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    st.db = st.fb.getFirestore(window.UB_FIREBASE.app);
    return st;
  }

  async function setLive(isLive){
    await fb();
    var u=user(), name=uname();
    await st.fb.setDoc(st.fb.doc(st.db,'live_profiles',name),{
      username:name,
      displayName:u.name||name,
      role:u.role||'artist',
      avatar:u.avatar||'🎤',
      photo:u.photo||u.avatarUrl||'',
      cover:u.cover||u.coverPhoto||u.banner||'',
      verified: u.verified !== false,
      isLive:!!isLive,
      startedAt:isLive?Date.now():0,
      updatedAt:Date.now()
    },{merge:true});
    toast(isLive?'🔴 You are live on your profile':'Live ended');
    refreshLiveProfiles();
  }

  async function follow(target){
    await fb();
    var me=uname();
    if(!target || target===me) return;
    await st.fb.setDoc(st.fb.doc(st.db,'profile_follows',me+'_'+target),{follower:me,following:target,at:Date.now()},{merge:true});
    toast('✅ Following '+target);
  }

  async function sendChat(target,msg){
    await fb();
    msg=String(msg||'').trim();
    if(!msg) return;
    await st.fb.addDoc(st.fb.collection(st.db,'profile_live_chats',target,'messages'),{from:uname(),text:msg,at:Date.now()});
  }

  function homeRail(){
    var home=document.querySelector('#page-home .page-body');
    if(!home) return null;
    var box=document.getElementById('ubLiveProfilesRail');
    if(box) return box;
    box=document.createElement('div');
    box.id='ubLiveProfilesRail';
    box.style.cssText='margin:12px 0 14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.24);color:#fff;min-height:92px;';
    box.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;"><div><div style="font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:2px;color:#40D0FF;">LIVE PROFILES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.2rem;letter-spacing:2px;color:#F0C040;line-height:1;">WATCH LIVE NOW</div></div><div style="font-family:Orbitron,sans-serif;font-size:.42rem;color:rgba(240,237,232,.55);letter-spacing:1px;">SLIDE →</div></div><div id="ubLiveProfilesList" style="display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;padding-bottom:4px;"></div>';
    var hero=home.querySelector('.home-hero');
    if(hero) hero.insertAdjacentElement('afterend',box); else home.insertBefore(box,home.firstChild);
    return box;
  }

  async function refreshLiveProfiles(){
    if(!ok()) return;
    await fb();
    var rail=homeRail(); if(!rail) return;
    var list=rail.querySelector('#ubLiveProfilesList'); if(!list) return;
    var q=st.fb.query(st.fb.collection(st.db,'live_profiles'),st.fb.where('isLive','==',true));
    var snap=await st.fb.getDocs(q);
    list.innerHTML='';
    if(snap.empty){ list.innerHTML='<div style="color:rgba(240,237,232,.65);font-size:.82rem;padding:8px 2px;white-space:nowrap;">No one is live yet.</div>'; return; }
    snap.forEach(function(doc){
      var p=doc.data();
      var card=document.createElement('div');
      var cover=p.cover ? 'background-image:linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.42)),url('+esc(p.cover)+');background-size:cover;background-position:center;' : 'background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(64,208,255,.10));';
      card.style.cssText='flex:0 0 260px;scroll-snap-align:start;min-height:74px;padding:10px;border-radius:12px;border:1px solid rgba(201,168,76,.38);'+cover+'cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.25);';
      card.innerHTML='<div style="display:flex;align-items:center;gap:10px;"><div style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #F0C040;font-size:1.35rem;overflow:hidden;background:rgba(0,0,0,.55);">'+(p.photo?'<img src="'+esc(p.photo)+'" style="width:100%;height:100%;object-fit:cover;">':esc(p.avatar||'🎤'))+'</div><div style="min-width:0;"><div style="display:flex;align-items:center;gap:5px;color:#F0C040;font-family:Bebas Neue;font-size:1.15rem;letter-spacing:1.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">'+esc(p.displayName||p.username)+(p.verified?' <span style="color:#40D0FF;font-size:.8rem;">✓</span>':'')+'</div><div style="color:#40D0FF;font-family:Orbitron;font-size:.42rem;letter-spacing:1.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">🔴 LIVE · @'+esc(p.username)+'</div></div></div>';
      card.onclick=function(){ openLive(p.username); };
      list.appendChild(card);
    });
  }

  function modal(){
    var m=document.getElementById('ubProfileLiveModal');
    if(m) return m;
    m=document.createElement('div');
    m.id='ubProfileLiveModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;display:none;color:#fff;overflow:auto;padding:18px;';
    m.innerHTML='<div style="max-width:960px;margin:0 auto;"><button id="ubLiveClose" class="btn btn-gold" style="width:auto;margin-bottom:12px;">← CLOSE</button><div id="ubLiveHeader"></div><div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:12px;"><div id="ubLiveVideoBox" style="min-height:320px;border-radius:14px;border:1px solid rgba(64,208,255,.45);background:#05070d;display:flex;align-items:center;justify-content:center;color:#40D0FF;font-family:Orbitron;">LIVE PROFILE VIDEO</div><div style="border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.35);padding:12px;"><div style="font-family:Orbitron;color:#40D0FF;font-size:.55rem;letter-spacing:2px;margin-bottom:8px;">LIVE CHAT</div><div id="ubLiveChatList" style="height:260px;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;margin-bottom:8px;"></div><input id="ubLiveChatInput" placeholder="Talk live..." style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;margin-bottom:8px;"><button id="ubLiveSend" class="btn btn-blue">SEND CHAT</button></div></div></div>';
    document.body.appendChild(m);
    m.querySelector('#ubLiveClose').onclick=function(){m.style.display='none'; if(st.chatUnsub)try{st.chatUnsub();}catch(e){}};
    return m;
  }

  async function openLive(target){
    await fb();
    var m=modal();
    m.style.display='block';
    m.querySelector('#ubLiveHeader').innerHTML='<div style="margin-bottom:12px;padding:12px;border-radius:14px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.35);"><div style="font-family:Bebas Neue;font-size:2rem;letter-spacing:2px;color:#F0C040;">@'+esc(target)+' LIVE</div><button class="btn btn-blue" style="width:auto;margin-top:8px;" onclick="ubProfileLive.follow(\''+esc(target)+'\')">FOLLOW</button></div>';
    m.querySelector('#ubLiveSend').onclick=function(){var input=m.querySelector('#ubLiveChatInput'); sendChat(target,input.value); input.value='';};
    listenChat(target);
  }

  async function listenChat(target){
    await fb();
    if(st.chatUnsub) try{st.chatUnsub();}catch(e){}
    var list=document.getElementById('ubLiveChatList'); if(!list) return;
    var q=st.fb.query(st.fb.collection(st.db,'profile_live_chats',target,'messages'),st.fb.orderBy('at','asc'));
    st.chatUnsub=st.fb.onSnapshot(q,function(snap){
      list.innerHTML='';
      snap.forEach(function(d){var x=d.data(); var row=document.createElement('div'); row.style.cssText='padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.86rem;'; row.innerHTML='<b style="color:#40D0FF;">'+esc(x.from)+':</b> '+esc(x.text); list.appendChild(row);});
      list.scrollTop=list.scrollHeight;
    });
  }

  function profileTools(){
    var profile=document.querySelector('#page-profile .page-body');
    if(!profile || document.getElementById('ubProfileLiveTools')) return;
    var box=document.createElement('div');
    box.id='ubProfileLiveTools';
    box.style.cssText='margin:8px 0 10px;padding:8px 10px;border-radius:12px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.22);';
    box.innerHTML='<div style="display:flex;align-items:center;gap:8px;"><div style="font-family:Orbitron;color:#40D0FF;font-size:.45rem;letter-spacing:2px;min-width:92px;">PROFILE LIVE</div><button class="btn btn-gold" onclick="ubProfileLive.goLive()" style="padding:7px 10px;min-height:0;">🔴 GO LIVE</button><button class="btn btn-blue" onclick="ubProfileLive.endLive()" style="padding:7px 10px;min-height:0;">END</button></div>';
    profile.insertBefore(box,profile.firstChild);
  }

  function boot(){ if(!ok()) return; profileTools(); refreshLiveProfiles(); }
  window.ubProfileLive={goLive:function(){setLive(true);},endLive:function(){setLive(false);},refresh:refreshLiveProfiles,open:openLive,follow:follow,chat:sendChat};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
  setTimeout(boot,800); setInterval(function(){profileTools();refreshLiveProfiles();},5000);
})();