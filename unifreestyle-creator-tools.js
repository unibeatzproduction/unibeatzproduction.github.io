// unifreestyle-creator-tools.js
// Creator tools: profile cover editor, featured live rail, follower/viewer stats.
(function(){
  'use strict';

  var st = { fb:null, db:null };
  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(window.showToast) window.showToast(msg); else console.log('[creator-tools]', msg); }
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

  async function saveCover(url){
    await fb();
    var name=uname();
    url=String(url||'').trim();
    await st.fb.setDoc(st.fb.doc(st.db,'profiles',name),{cover:url,updatedAt:Date.now()},{merge:true});
    await st.fb.setDoc(st.fb.doc(st.db,'live_profiles',name),{cover:url,updatedAt:Date.now()},{merge:true});
    try{
      var raw=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user');
      var u=raw?JSON.parse(raw):{}; u.cover=url;
      localStorage.setItem('ub_current_user',JSON.stringify(u)); localStorage.setItem('ub_user',JSON.stringify(u));
    }catch(e){}
    toast('🖼️ Cover saved');
    if(window.ubProfileLive && window.ubProfileLive.refresh) window.ubProfileLive.refresh();
  }

  async function loadStats(){
    await fb();
    var name=uname();
    var followers=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'profile_follows'),st.fb.where('following','==',name)));
    var following=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'profile_follows'),st.fb.where('follower','==',name)));
    var viewers=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'live_profile_viewers'),st.fb.where('profile','==',name),st.fb.where('active','==',true)));
    setText('ubCreatorFollowers',followers.size);
    setText('ubCreatorFollowing',following.size);
    setText('ubCreatorViewers',viewers.size);
  }

  function setText(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }

  function injectProfileTools(){
    var profile=document.querySelector('#page-profile .page-body');
    if(!profile || document.getElementById('ubCreatorTools')) return;
    var box=document.createElement('div');
    box.id='ubCreatorTools';
    box.style.cssText='margin:12px 0;padding:12px;border-radius:14px;border:1px solid rgba(201,168,76,.35);background:rgba(0,0,0,.25);color:#fff;';
    box.innerHTML='<div style="font-family:Orbitron;color:#40D0FF;font-size:.48rem;letter-spacing:2px;margin-bottom:8px;">CREATOR TOOLS</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:10px;"><div class="ub-creator-stat"><b id="ubCreatorFollowers">0</b><span>Followers</span></div><div class="ub-creator-stat"><b id="ubCreatorFollowing">0</b><span>Following</span></div><div class="ub-creator-stat"><b id="ubCreatorViewers">0</b><span>Live Viewers</span></div></div><div style="display:grid;grid-template-columns:1fr auto;gap:8px;"><input id="ubCoverInput" placeholder="Paste cover image URL" style="padding:10px;border-radius:8px;border:1px solid rgba(64,208,255,.5);background:#05070d;color:#fff;"><button id="ubSaveCoverBtn" class="btn btn-blue" style="width:auto;">SAVE COVER</button></div>';
    var style=document.createElement('style');
    style.textContent='.ub-creator-stat{border:1px solid rgba(64,208,255,.25);border-radius:10px;padding:8px;text-align:center;background:rgba(0,0,0,.25)}.ub-creator-stat b{display:block;color:#F0C040;font-family:Orbitron;font-size:1rem}.ub-creator-stat span{display:block;color:rgba(240,237,232,.65);font-size:.68rem;margin-top:3px}';
    document.head.appendChild(style);
    var anchor=document.getElementById('ubProfileLiveTools');
    if(anchor) anchor.insertAdjacentElement('afterend',box); else profile.insertBefore(box,profile.firstChild);
    box.querySelector('#ubSaveCoverBtn').onclick=function(){ saveCover(box.querySelector('#ubCoverInput').value); };
    loadStats();
  }

  async function injectFeaturedLive(){
    if(!ok()) return;
    await fb();
    var home=document.querySelector('#page-home .page-body'); if(!home) return;
    if(document.getElementById('ubFeaturedCreators')) return;
    var existing=document.getElementById('ubLiveProfilesRail');
    var box=document.createElement('div');
    box.id='ubFeaturedCreators';
    box.style.cssText='margin:10px 0 14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(201,168,76,.32);background:rgba(0,0,0,.22);color:#fff;';
    box.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><div><div style="font-family:Orbitron;font-size:.45rem;color:#40D0FF;letter-spacing:2px;">FEATURED CREATORS</div><div style="font-family:Bebas Neue;font-size:1.15rem;color:#F0C040;letter-spacing:2px;line-height:1;">TOP LIVE ENERGY</div></div></div><div id="ubFeaturedCreatorsList" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;"></div>';
    if(existing) existing.insertAdjacentElement('afterend',box); else home.insertBefore(box,home.firstChild);
    refreshFeaturedLive();
  }

  async function refreshFeaturedLive(){
    await fb();
    var list=document.getElementById('ubFeaturedCreatorsList'); if(!list) return;
    var snap=await st.fb.getDocs(st.fb.query(st.fb.collection(st.db,'live_profiles'),st.fb.where('isLive','==',true)));
    list.innerHTML='';
    if(snap.empty){ list.innerHTML='<div style="font-size:.8rem;color:rgba(240,237,232,.6);white-space:nowrap;">Featured live creators appear here.</div>'; return; }
    var arr=[]; snap.forEach(function(d){ arr.push(d.data()); });
    arr.slice(0,8).forEach(function(p){
      var card=document.createElement('div');
      var cover=p.cover?'background-image:linear-gradient(90deg,rgba(0,0,0,.75),rgba(0,0,0,.4)),url('+esc(p.cover)+');background-size:cover;background-position:center;':'background:linear-gradient(135deg,rgba(201,168,76,.13),rgba(64,208,255,.08));';
      card.style.cssText='flex:0 0 190px;padding:9px;border-radius:12px;border:1px solid rgba(64,208,255,.28);'+cover+'cursor:pointer;';
      card.innerHTML='<div style="font-family:Bebas Neue;color:#F0C040;font-size:1.05rem;letter-spacing:1.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(p.displayName||p.username)+' '+(p.verified?'✓':'')+'</div><div style="font-family:Orbitron;color:#40D0FF;font-size:.4rem;letter-spacing:1.4px;">🔴 LIVE · '+esc(p.role||'creator')+'</div>';
      card.onclick=function(){ if(window.ubProfileLive) window.ubProfileLive.open(p.username); };
      list.appendChild(card);
    });
  }

  function boot(){ if(!ok()) return; injectProfileTools(); injectFeaturedLive(); }
  window.ubCreatorTools={refresh:loadStats,saveCover:saveCover,featured:refreshFeaturedLive};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  setTimeout(boot,1200);
  setInterval(function(){ injectProfileTools(); loadStats(); refreshFeaturedLive(); },7000);
})();