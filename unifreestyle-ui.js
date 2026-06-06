// unifreestyle-ui.js
// UniBeatz Production — UI layer: Browse Producers, home sessions cleanup, nav fix
// Replaces: unifreestyle-home-sessions.js, unifreestyle-home-sessions-v2.js,
//           unifreestyle-nav-fix.js

(function(){
  'use strict';

  var FOLLOWS = 'ub_profile_follows_v1';
  var _dir = { profiles:{}, follows:{}, live:{}, syncing:false, lastSync:0, ready:false };

  function norm(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function get(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f); } }
  function set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function niceName(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }
  function uname(u){ return u&&(u.username||u.name)?clean(u.username||u.name):''; }

  function getUsers(){ return get('ub_users','{}'); }
  function saveUsers(v){ set('ub_users',v); }
  function getCurrent(){ return get('ub_current_user','null')||get('ub_user','null')||{}; }
  function getFollows(){ return get(FOLLOWS,'{}'); }
  function saveFollows(f){ set(FOLLOWS,f); }
  function getFb(){ var fb=window.UB_FIREBASE||{}; return (fb.db&&fb.collection&&fb.getDocs&&fb.setDoc)?fb:null; }
  function isLive(t){ t=clean(t); if(_dir.live&&_dir.live[t]) return true; try{ return localStorage.getItem('ub_profile_live_'+t)==='1'; }catch(e){ return false; } }

  function mergeProfile(out, raw, docId){
    raw=raw||{};
    var name=clean(raw.username||raw.searchUsername||raw.handle||docId||raw.name||raw.displayName);
    if(!name||name==='djblaze'||name==='phantombeats') return;
    var existing=out[name]||{};
    out[name]=Object.assign({}, existing, {
      username:name,
      name:raw.displayName||raw.name||existing.name||niceName(name),
      role:raw.role||existing.role||'artist',
      avatar:raw.avatar||existing.avatar||'🎤',
      photo:raw.photo||raw.photoUrl||raw.photoURL||existing.photo||'',
      bio:raw.bio||existing.bio||'Producer on Uni Freestyle.',
      verified:!!(raw.verified||existing.verified)
    });
  }

  async function syncDirectory(force){
    var now=Date.now();
    if(_dir.syncing) return;
    if(!force&&_dir.ready&&(now-_dir.lastSync)<5000) return;
    var fb=getFb();
    if(!fb) return;
    _dir.syncing=true;
    try{
      var profiles={}, follows={}, live={};
      var collections=['profiles','producer_profiles','users'];
      for(var i=0;i<collections.length;i++){
        try{
          var snap=await fb.getDocs(fb.collection(fb.db,collections[i]));
          snap.forEach(function(d){ mergeProfile(profiles,d.data(),d.id); });
        }catch(e){ console.warn('[ui] '+collections[i]+' sync failed',e.message); }
      }
      try{
        var fs=await fb.getDocs(fb.collection(fb.db,'profile_follows'));
        fs.forEach(function(d){ var r=d.data()||{}; var follower=clean(r.follower), following=clean(r.following); if(follower&&following){ follows[follower+'__'+following]={follower:follower,following:following,active:r.active!==false,at:r.at||0}; }});
      }catch(e){ console.warn('[ui] follow sync failed',e.message); }
      try{
        var ls=await fb.getDocs(fb.collection(fb.db,'live_profiles'));
        ls.forEach(function(d){ var r=d.data()||{}; var name=clean(r.username||d.id); if(name&&r.isLive===true) live[name]=true; });
      }catch(e){ console.warn('[ui] live sync failed',e.message); }
      _dir.profiles=profiles; _dir.follows=follows; _dir.live=live; _dir.ready=true; _dir.lastSync=Date.now();
      saveUsers(profiles); saveFollows(follows);
    } finally { _dir.syncing=false; }
  }

  // ═══════════════════════════════════════════════════
  // NAV FIX
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════════════════
  function injectCss(){
    if(document.getElementById('ubUiCss')) return;
    var s=document.createElement('style'); s.id='ubUiCss';
    s.textContent=[
      '#page-home .instant-card{display:none!important}',
      '.ub-producer-list{padding:14px;display:flex;flex-direction:column;gap:10px}',
      '.ub-producer-row{border:1px solid rgba(201,168,76,.22);border-radius:14px;background:rgba(0,0,0,.22);padding:12px;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}',
      '.ub-prod-avatar{width:54px;height:54px;border-radius:50%;border:2px solid #F0C040;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:1.6rem}',
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

  // ═══════════════════════════════════════════════════
  // BROWSE PRODUCERS
  // ═══════════════════════════════════════════════════
  function nav(){ return '<div class="bottom-nav"><button class="nav-item" onclick="goToPage(\'home\')"><span class="nav-icon">🏠</span><span class="nav-label">Home</span></button><button class="nav-item" onclick="goToPage(\'queue\')"><span class="nav-icon">🎤</span><span class="nav-label">Battle</span></button><button class="nav-item" onclick="goToPage(\'leaderboard\')"><span class="nav-icon">🏆</span><span class="nav-label">Ranks</span></button><button class="nav-item" onclick="goToPage(\'aidj\')"><span class="nav-icon">🤖</span><span class="nav-label">AI DJ</span></button><button class="nav-item" onclick="goToPage(\'profile\')"><span class="nav-icon">👤</span><span class="nav-label">Profile</span></button></div>'; }

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
        '</div>'+
      nav()+
      '</div>'
    );
  }

  function hydrateMissing(){
    // Firestore is the source of truth now. localStorage is only cache/fallback.
    if(_dir.ready) return _dir.profiles;
    return getUsers();
  }

  function producerData(){
    var out=[], all=_dir.ready?_dir.profiles:getUsers(), cur=getCurrent(), cn=uname(cur), seen={};
    Object.keys(all||{}).forEach(function(k){
      var x=all[k], r=norm(x&&x.role||'artist');
      if(x&&uname(x)&&['artist','dj','producer','fan','viewer','admin'].indexOf(r)>-1) out.push(x);
    });
    if(cn&&!out.some(function(x){ return uname(x)===cn; })) out.unshift(cur);
    return out.filter(function(x){
      var name=uname(x);
      if(!name||name==='djblaze'||name==='phantombeats'||seen[name]) return false;
      seen[name]=1; return true;
    });
  }

  function countFollowers(t){
    t=clean(t); var f=_dir.ready?_dir.follows:getFollows(), c=0;
    Object.keys(f||{}).forEach(function(k){ var r=f[k]||{}; if(clean(r.following)===t&&r.active!==false) c++; });
    return c;
  }

  function isFollowing(t){
    var me=uname(getCurrent()), f=_dir.ready?_dir.follows:getFollows(), r=f[me+'__'+clean(t)];
    return !!(r&&r.active!==false);
  }

  async function followProducer(t){
    var me=uname(getCurrent()); t=clean(t); if(!me||me===t) return;
    var fb=getFb(), key=me+'__'+t, willFollow=!isFollowing(t);
    if(fb){
      await fb.setDoc(fb.doc(fb.db,'profile_follows',key),{ follower:me, following:t, active:willFollow, at:Date.now() },{merge:true});
    }
    var f=getFollows();
    if(willFollow) f[key]={ follower:me, following:t, active:true, at:Date.now() };
    else if(f[key]) f[key].active=false;
    saveFollows(f);
    if(window.showToast) showToast(willFollow?'✅ Following @'+t:'Unfollowed @'+t);
    await syncDirectory(true);
    renderProducers();
  }

  function watchProducer(t){
    if(isLive(t)&&window.ubProfile&&window.ubProfile.open){ window.ubProfile.open(t); return; }
    if(window.showToast) showToast(isLive(t)?'🔴 Watching @'+t+' live':'@'+t+' is not live right now');
  }

  function openProducerProfile(t){
    try{ localStorage.setItem('ub_view_producer_profile',t); }catch(e){}
    if(window.goToPage) goToPage('profile');
  }

  function renderProducers(){
    ensureBrowsePage();
    var list=document.getElementById('ubProducerList'); if(!list) return;
    var shouldResync=!_dir.ready || (Date.now()-_dir.lastSync)>5000;
    if(shouldResync) syncDirectory(false).then(function(){ if(document.querySelector('#page-browseproducer.active')) renderProducers(); });
    var q=norm((document.getElementById('ubProducerSearchInput')||{}).value||'');
    var data=producerData().filter(function(x){
      return !q||norm((x.name||'')+' '+(x.username||'')+' '+(x.bio||'')+' '+(x.role||'')).indexOf(q)>-1;
    });
    if(!data.length){ list.innerHTML='<div style="padding:14px;color:rgba(240,237,232,.65);">No producers found yet. Loading...</div>'; return; }
    list.innerHTML=data.map(function(x){
      var name=uname(x), live=isLive(name), fol=isFollowing(name), followers=countFollowers(name);
      var av=x.photo?'<img src="'+esc(x.photo)+'">':esc(x.avatar||'🎤');
      return '<div class="ub-producer-row">'+
        '<div class="ub-prod-avatar">'+av+'</div>'+
        '<div>'+
          '<div class="ub-prod-name">'+esc(x.name||niceName(name))+' '+(live?'🔴':'')+'</div>'+
          '<div class="ub-prod-user">@'+esc(name)+' · '+esc(x.role||'artist')+' · '+followers+' follower'+(followers===1?'':'s')+'</div>'+
          '<div class="ub-prod-bio">'+esc(x.bio||'Producer on Uni Freestyle.')+'</div>'+
        '</div>'+
        '<div class="ub-prod-actions">'+
          '<button class="'+(fol?'ub-btn-blue':'ub-btn-gold')+'" onclick="ubUI.follow(\''+name+'\')">'+(fol?'FOLLOWING':'FOLLOW')+'</button>'+
          '<button class="'+(live?'ub-btn-red':'ub-btn-blue')+'" onclick="ubUI.watch(\''+name+'\')">'+(live?'WATCH LIVE':'NOT LIVE')+'</button>'+
          '<button class="ub-btn-blue" onclick="ubUI.openProfile(\''+name+'\')">PROFILE</button>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  // ═══════════════════════════════════════════════════
  // HOME CLEANUP
  // ═══════════════════════════════════════════════════
  function cleanupHome(){
    var home=document.getElementById('page-home'); if(!home) return;
    // Hide instant mode card
    var i=home.querySelector('.instant-card'); if(i) i.style.display='none';
    // Remove DJ Blaze / Phantom from session cards
    home.querySelectorAll('.session-dj').forEach(function(x){
      x.textContent=x.textContent.replace(/DJ Blaze|DJ Phantom/g,'').replace(/🎧\s*·/,'🎧');
    });
    // Remove instant mode section header
    home.querySelectorAll('.section-head').forEach(function(x){
      if(norm(x.textContent).indexOf('instant mode')>-1) x.style.display='none';
    });
  }

  // ═══════════════════════════════════════════════════
  // BUTTON PATCHING
  // ═══════════════════════════════════════════════════
  function patchButtons(){
    // Patch any "Browse Producers" or "Browser Producer" buttons to go to correct page
    document.querySelectorAll('button').forEach(function(b){
      var t=norm(b.textContent);
      if(t.indexOf('browse producer')>-1||t.indexOf('browser producer')>-1){
        b.textContent='BROWSE PRODUCERS';
        if(b.dataset.ubUiPatched==='yes') return;
        b.dataset.ubUiPatched='yes';
        b.onclick=function(e){
          if(e){ e.preventDefault(); e.stopPropagation(); }
          ensureBrowsePage();
          if(window.goToPage) goToPage('browseproducer');
          setTimeout(renderProducers,50);
          return false;
        };
      }
    });

    // Profile icon in home top bar → goes to profile
    var home=document.getElementById('page-home');
    if(home){
      home.querySelectorAll('.top-bar .icon-btn').forEach(function(b){
        if((b.textContent||'').indexOf('👤')>-1&&b.dataset.ubProfileRoute!=='yes'){
          b.dataset.ubProfileRoute='yes';
          b.onclick=function(e){ if(e){ e.preventDefault(); e.stopPropagation(); } if(window.goToPage) goToPage('profile'); return false; };
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════
  function render(){
    injectNavFix();
    injectCss();
    cleanupHome();
    ensureBrowsePage();
    patchButtons();
    syncDirectory(false).then(function(){ if(document.querySelector('#page-browseproducer.active')) renderProducers(); });
    if(document.querySelector('#page-browseproducer.active')) renderProducers();
  }

  window.ubUI = {
    render: render,
    renderProducers: renderProducers,
    follow: followProducer,
    watch: watchProducer,
    openProfile: openProducerProfile
  };

  // Backward compat
  window.ubHomeSessions = {
    refresh: render,
    renderProducers: renderProducers,
    followProducer: followProducer,
    watchProducer: watchProducer,
    openProducerProfile: openProducerProfile
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',render);
  else render();

  setTimeout(render,400);
  setTimeout(render,1200);
  setInterval(render,5000);
})();