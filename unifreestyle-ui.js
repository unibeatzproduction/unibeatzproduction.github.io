// unifreestyle-ui.js
// UniBeatz Production — UI layer: Browse Producers, home cleanup, nav fix
// Source of truth for Browse Producers: Firestore profiles/{username}

(function(){
  'use strict';

  var LOCAL_FOLLOWS = 'ub_profile_follows_v1';
  var _profilesCache = [];
  var _followsCache = {};
  var _liveCache = {};
  var _loading = false;
  var _lastSync = 0;

  function norm(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function get(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f); } }
  function set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function niceName(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }
  function uname(u){ return u&&(u.username||u.name||u.displayName)?clean(u.username||u.name||u.displayName):''; }
  function toast(m){ if(window.showToast) window.showToast(m); else console.log('[ui]',m); }

  function getUsers(){ return get('ub_users','{}'); }
  function saveUsers(v){ set('ub_users',v); }
  function getCurrent(){ return get('ub_current_user','null')||get('ub_user','null')||{}; }
  function getLocalFollows(){ return get(LOCAL_FOLLOWS,'{}'); }
  function saveLocalFollows(f){ set(LOCAL_FOLLOWS,f); }
  function getFb(){ var fb=window.UB_FIREBASE||{}; return (fb.db&&fb.collection&&fb.getDocs&&fb.setDoc&&fb.doc)?fb:null; }

  function injectNavFix(){
    if(document.getElementById('ubNavFix')) return;
    var s=document.createElement('style'); s.id='ubNavFix';
    s.textContent=[
      'html,body{height:100%!important;overflow:hidden!important;}',
      '.page{position:fixed!important;inset:0!important;height:100dvh!important;max-height:100dvh!important;overflow:hidden!important;}',
      '.page.active{display:flex!important;}',
      '.page-body{min-height:0!important;height:auto!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;}',
      '#page-profile .page-body{padding-bottom:96px!important;}',
      '.bottom-nav{height:82px!important;min-height:82px!important;max-height:82px!important;flex-shrink:0!important;background:rgba(8,8,15,.95)!important;}',
      '.bottom-nav .nav-item{padding:10px 6px!important;}',
      '.bottom-nav .nav-icon{font-size:1.6rem!important;line-height:1!important;}',
      '.bottom-nav .nav-label{font-size:.65rem!important;line-height:1.2!important;font-weight:700!important;}',
      '@media(min-width:900px){.bottom-nav{width:min(680px,70vw)!important;margin:0 auto 8px!important;border-radius:14px!important;border:1px solid rgba(201,168,76,.25)!important;}.page-body{padding-bottom:110px!important;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function injectCss(){
    if(document.getElementById('ubUiCss')) return;
    var s=document.createElement('style'); s.id='ubUiCss';
    s.textContent=[
      '#page-home .instant-card{display:none!important}',
      '.ub-producer-list{padding:14px;display:flex;flex-direction:column;gap:10px}',
      '.ub-producer-row{border:1px solid rgba(201,168,76,.22);border-radius:14px;background:rgba(0,0,0,.22);padding:12px;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}',
      '.ub-prod-avatar{width:54px;height:54px;border-radius:50%;border:2px solid #F0C040;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:1.6rem;background:#030305}',
      '.ub-prod-avatar img{width:100%;height:100%;object-fit:cover}',
      '.ub-prod-name{font-family:Bebas Neue,Arial,sans-serif;font-size:1.35rem;color:#F0C040}',
      '.ub-prod-user{font-family:Orbitron,sans-serif;font-size:.45rem;color:#40D0FF}',
      '.ub-prod-bio{font-size:.78rem;color:rgba(240,237,232,.65)}',
      '.ub-prod-actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}',
      '.ub-prod-actions button{border-radius:12px;padding:11px 8px;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;border:1px solid transparent;cursor:pointer}',
      '.ub-btn-gold{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305}',
      '.ub-btn-blue{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important}',
      '.ub-btn-red{background:rgba(255,51,51,.13);color:#ff6b6b;border-color:rgba(255,51,51,.35)!important}',
      '.ub-producer-search{width:100%;box-sizing:border-box;margin-top:14px;padding:12px;border-radius:12px;border:1px solid rgba(64,208,255,.34);background:rgba(0,0,0,.28);color:#fff}',
      '@media(max-width:520px){.ub-prod-actions{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }

  function nav(){
    return '<div class="bottom-nav"><button class="nav-item" onclick="goToPage(\'home\')"><span class="nav-icon">🏠</span><span class="nav-label">Home</span></button><button class="nav-item" onclick="goToPage(\'queue\')"><span class="nav-icon">🎤</span><span class="nav-label">Battle</span></button><button class="nav-item" onclick="goToPage(\'leaderboard\')"><span class="nav-icon">🏆</span><span class="nav-label">Ranks</span></button><button class="nav-item" onclick="goToPage(\'aidj\')"><span class="nav-icon">🤖</span><span class="nav-label">AI DJ</span></button><button class="nav-item" onclick="goToPage(\'profile\')"><span class="nav-icon">👤</span><span class="nav-label">Profile</span></button></div>';
  }

  function ensureBrowsePage(){
    if(document.getElementById('page-browseproducer')) return;
    var anchor=document.getElementById('page-profile')||document.getElementById('page-home');
    if(!anchor) return;
    anchor.insertAdjacentHTML('afterend',
      '<div class="page" id="page-browseproducer">'+
        '<div class="top-bar"><button class="icon-btn" onclick="goToPage(\'profile\')">←</button><h1>🔎 Browse Producers</h1><div class="icon-btn" onclick="goToPage(\'profile\')">👤</div></div>'+
        '<div class="page-body">'+
          '<div style="margin:14px;border:1px solid rgba(64,208,255,.32);border-radius:16px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));overflow:hidden;">'+
            '<div style="padding:18px 16px;border-bottom:1px solid rgba(201,168,76,.22);">'+
              '<div style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:3px;color:#F0C040;">BROWSE PRODUCERS</div>'+
              '<div style="font-size:.9rem;color:rgba(240,237,232,.7);margin-top:8px;">Search producers, follow them, and watch when they go live.</div>'+
              '<input id="ubProducerSearchInput" class="ub-producer-search" placeholder="Search by name or @username" oninput="ubUI.renderProducers()">'+
            '</div>'+
            '<div id="ubProducerList" class="ub-producer-list"></div>'+
          '</div>'+
        '</div>'+nav()+
      '</div>'
    );
  }

  function normalizeProfile(docId,d){
    d=d||{};
    var username=clean(d.username||docId||d.name||d.displayName);
    if(!username||username==='djblaze'||username==='phantombeats') return null;
    return {
      username: username,
      name: d.displayName||d.name||niceName(username),
      role: d.role||'artist',
      avatar: d.avatar||'🎤',
      photo: d.photo||d.photoUrl||d.photoURL||'',
      bio: d.bio||'Producer on Uni Freestyle.',
      verified: !!d.verified,
      uid: d.uid||''
    };
  }

  function currentAsProfile(){
    var cur=getCurrent();
    var name=uname(cur);
    if(!name) return null;
    return normalizeProfile(name,cur);
  }

  function fallbackLocalProfiles(){
    var all=getUsers(), out=[], seen={};
    Object.keys(all||{}).forEach(function(k){
      var p=normalizeProfile(k,all[k]);
      if(p&&!seen[p.username]){ seen[p.username]=1; out.push(p); }
    });
    var cur=currentAsProfile();
    if(cur&&!seen[cur.username]) out.unshift(cur);
    return out;
  }

  async function syncFromFirestore(force){
    var now=Date.now();
    if(_loading) return;
    if(!force && now-_lastSync<2500) return;
    var fb=getFb();
    if(!fb){ _profilesCache=fallbackLocalProfiles(); return; }
    _loading=true;
    try{
      var profiles={}, follows={}, live={};
      var ps=await fb.getDocs(fb.collection(fb.db,'profiles'));
      ps.forEach(function(doc){ var p=normalizeProfile(doc.id,doc.data()); if(p) profiles[p.username]=p; });
      var cur=currentAsProfile(); if(cur&&!profiles[cur.username]) profiles[cur.username]=cur;

      try{
        var ls=await fb.getDocs(fb.collection(fb.db,'live_profiles'));
        ls.forEach(function(doc){
          var d=doc.data()||{}; var name=clean(d.username||doc.id);
          if(name) live[name]=!!d.isLive;
          if(name && !profiles[name] && d.displayName){ profiles[name]=normalizeProfile(name,{username:name,displayName:d.displayName,role:d.role,avatar:d.avatar,photo:d.photo,bio:d.bio,verified:d.verified}); }
        });
      }catch(e){}

      try{
        var fs=await fb.getDocs(fb.collection(fb.db,'profile_follows'));
        fs.forEach(function(doc){
          var d=doc.data()||{}; if(d.active===false) return;
          var follower=clean(d.follower||''); var following=clean(d.following||'');
          if(follower&&following) follows[follower+'__'+following]={follower:follower,following:following,at:d.at||0,active:true};
        });
      }catch(e){}

      var arr=Object.keys(profiles).sort().map(function(k){ return profiles[k]; });
      _profilesCache=arr; _followsCache=follows; _liveCache=live; _lastSync=Date.now();
      var local={}; arr.forEach(function(p){ local[p.username]=p; }); saveUsers(local); saveLocalFollows(follows);
    }catch(e){ console.warn('[ui] Firestore producer sync failed:',e); _profilesCache=fallbackLocalProfiles(); }
    finally{ _loading=false; }
  }

  function producerData(){
    var seen={}, out=[];
    (_profilesCache.length?_profilesCache:fallbackLocalProfiles()).forEach(function(x){
      var r=norm(x&&x.role||'artist'), name=uname(x);
      if(!name||name==='djblaze'||name==='phantombeats'||seen[name]) return;
      if(['artist','dj','producer','fan','viewer','admin'].indexOf(r)===-1) return;
      seen[name]=1; out.push(x);
    });
    return out;
  }

  function countFollowers(t){ var c=0; Object.keys(_followsCache||{}).forEach(function(k){ if(clean((_followsCache[k]||{}).following)===t) c++; }); return c; }
  function isFollowing(t){ var me=uname(getCurrent()); return !!(_followsCache||{})[me+'__'+t]; }

  async function followProducer(t){
    t=clean(t); var me=uname(getCurrent());
    if(!me) return toast('Sign in first');
    if(!t||me===t) return toast('This is your profile');
    var key=me+'__'+t, fb=getFb(), currently=!!_followsCache[key];
    if(fb){ await fb.setDoc(fb.doc(fb.db,'profile_follows',key),{ follower:me, following:t, active:currently?false:true, at:Date.now(), updatedAt:Date.now() },{merge:true}); }
    if(currently) delete _followsCache[key]; else _followsCache[key]={follower:me,following:t,active:true,at:Date.now()};
    saveLocalFollows(_followsCache); toast(currently?'Unfollowed @'+t:'✅ Following @'+t); renderProducers(true);
  }

  function isLive(t){ return !!_liveCache[t] || localStorage.getItem('ub_profile_live_'+t)==='1'; }
  function watchProducer(t){ if(isLive(t)&&window.ubProfile&&window.ubProfile.open){ window.ubProfile.open(t); return; } toast(isLive(t)?'🔴 Watching @'+t+' live':'@'+t+' is not live right now'); }
  function openProducerProfile(t){ try{ localStorage.setItem('ub_view_producer_profile',t); }catch(e){} if(window.goToPage) goToPage('profile'); }

  async function renderProducers(force){
    ensureBrowsePage(); var list=document.getElementById('ubProducerList'); if(!list) return;
    if(!_profilesCache.length || force) await syncFromFirestore(!!force);
    var q=norm((document.getElementById('ubProducerSearchInput')||{}).value||'');
    var data=producerData().filter(function(x){ return !q||norm((x.name||'')+' '+(x.username||'')+' '+(x.bio||'')+' '+(x.role||'')).indexOf(q)>-1; });
    if(!data.length){ list.innerHTML='<div style="padding:14px;color:rgba(240,237,232,.65);">No producers found yet. Loading...</div>'; return; }
    list.innerHTML=data.map(function(x){
      var name=uname(x), live=isLive(name), fol=isFollowing(name), followers=countFollowers(name);
      var av=x.photo?'<img src="'+esc(x.photo)+'">':esc(x.avatar||'🎤');
      return '<div class="ub-producer-row"><div class="ub-prod-avatar">'+av+'</div><div><div class="ub-prod-name">'+esc(x.name||niceName(name))+' '+(live?'🔴':'')+'</div><div class="ub-prod-user">@'+esc(name)+' · '+esc(x.role||'artist')+' · '+followers+' follower'+(followers===1?'':'s')+'</div><div class="ub-prod-bio">'+esc(x.bio||'Producer on Uni Freestyle.')+'</div></div><div class="ub-prod-actions"><button class="'+(fol?'ub-btn-blue':'ub-btn-gold')+'" onclick="ubUI.follow(\''+name+'\')">'+(fol?'FOLLOWING':'FOLLOW')+'</button><button class="'+(live?'ub-btn-red':'ub-btn-blue')+'" onclick="ubUI.watch(\''+name+'\')">'+(live?'WATCH LIVE':'NOT LIVE')+'</button><button class="ub-btn-blue" onclick="ubUI.openProfile(\''+name+'\')">PROFILE</button></div></div>';
    }).join('');
  }

  function cleanupHome(){
    var home=document.getElementById('page-home'); if(!home) return;
    var i=home.querySelector('.instant-card'); if(i) i.style.display='none';
    home.querySelectorAll('.session-dj').forEach(function(x){ x.textContent=x.textContent.replace(/DJ Blaze|DJ Phantom/g,'').replace(/🎧\s*·/,'🎧'); });
    home.querySelectorAll('.section-head').forEach(function(x){ if(norm(x.textContent).indexOf('instant mode')>-1) x.style.display='none'; });
  }

  function patchButtons(){
    document.querySelectorAll('button').forEach(function(b){
      var t=norm(b.textContent);
      if(t.indexOf('browse producer')>-1||t.indexOf('browser producer')>-1){
        b.textContent='BROWSE PRODUCERS';
        if(b.dataset.ubUiPatched==='yes') return;
        b.dataset.ubUiPatched='yes';
        b.onclick=function(e){ if(e){ e.preventDefault(); e.stopPropagation(); } ensureBrowsePage(); if(window.goToPage) goToPage('browseproducer'); setTimeout(function(){ renderProducers(true); },50); return false; };
      }
    });
    var home=document.getElementById('page-home');
    if(home){ home.querySelectorAll('.top-bar .icon-btn').forEach(function(b){ if((b.textContent||'').indexOf('👤')>-1&&b.dataset.ubProfileRoute!=='yes'){ b.dataset.ubProfileRoute='yes'; b.onclick=function(e){ if(e){ e.preventDefault(); e.stopPropagation(); } if(window.goToPage) goToPage('profile'); return false; }; } }); }
  }

  function render(){
    injectNavFix(); injectCss(); cleanupHome(); ensureBrowsePage(); patchButtons();
    syncFromFirestore(false).then(function(){ if(document.querySelector('#page-browseproducer.active')) renderProducers(false); });
  }

  window.ubUI = { render:render, renderProducers:renderProducers, follow:followProducer, watch:watchProducer, openProfile:openProducerProfile, sync:function(){ return syncFromFirestore(true); } };
  window.ubHomeSessions = { refresh:render, renderProducers:renderProducers, followProducer:followProducer, watchProducer:watchProducer, openProducerProfile:openProducerProfile };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',render); else render();
  window.addEventListener('ub-firebase-ready',function(){ setTimeout(function(){ syncFromFirestore(true).then(render); },300); });
  setTimeout(render,400); setTimeout(render,1200); setInterval(render,4000);
})();