// unifreestyle-profile-follow.js
// Clean public profile + Firestore follow counts + profile live bridge.
(function(){
  'use strict';

  var STORE = { users:'ub_users', current:'ub_current_user' };
  var lastRenderKey = '';
  var liveCache = {};
  var liveWatchStarted = false;
  var countCache = {};

  function ok(){
    return location.pathname.toLowerCase().includes('unifreestyle.html');
  }

  function toast(m){
    if(window.showToast) window.showToast(m);
    else console.log('[profile]', m);
  }

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, function(c){
      return {
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c];
    });
  }

  function jget(k,f){
    try { return JSON.parse(localStorage.getItem(k) || f); }
    catch(e){ return JSON.parse(f); }
  }

  function jset(k,v){
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch(e){}
  }

  function getUsers(){
    return jget(STORE.users, '{}');
  }

  function saveUsers(u){
    jset(STORE.users, u);
  }

  function clean(v){
    return String(v || '').toLowerCase().replace(/[^a-z0-9_]/g,'');
  }

  function uname(u){
    return clean(u && (u.username || u.name));
  }

  function fmt(n){
    n = Number(n || 0);
    if(n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if(n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function getCurrent(){
    var u = jget(STORE.current,'null') || jget('ub_user','null');

    if(u && uname(u)) return u;

    try {
      if(window.currentUser && uname(window.currentUser)) return window.currentUser;
    } catch(e){}

    try {
      if(window.UB_ACCOUNT && uname(window.UB_ACCOUNT)) return window.UB_ACCOUNT;
    } catch(e){}

    var users = getUsers();
    var keys = Object.keys(users);

    if(keys.length === 1) return users[keys[0]];

    return u || null;
  }

  function setCurrent(u){
    jset(STORE.current, u);
    jset('ub_user', u);

    try {
      window.currentUser = u;
      window.UB_ACCOUNT = u;
    } catch(e){}
  }

  async function fb(){
    var g = window.UB_FIREBASE || {};

    if(g.db && g.collection && g.doc && g.getDocs && g.setDoc && g.query && g.where){
      return g;
    }

    if(!g.app && !g.db){
      return null;
    }

    var fs = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');

    return {
      app: g.app,
      db: g.db || fs.getFirestore(g.app),
      collection: g.collection || fs.collection,
      doc: g.doc || fs.doc,
      getDoc: g.getDoc || fs.getDoc,
      getDocs: g.getDocs || fs.getDocs,
      setDoc: g.setDoc || fs.setDoc,
      onSnapshot: g.onSnapshot || fs.onSnapshot,
      query: g.query || fs.query,
      where: g.where || fs.where,
      orderBy: g.orderBy || fs.orderBy,
      serverTimestamp: g.serverTimestamp || fs.serverTimestamp
    };
  }

  function defaultCounts(t){
    var u = getCurrent();
    if(u && uname(u) === t){
      return {
        followers: Number(u.followers || 0),
        following: Number(u.following || 0)
      };
    }

    return { followers:0, following:0 };
  }

  async function fetchCounts(t){
    t = clean(t);

    if(!t) return { followers:0, following:0 };

    var f = await fb();

    if(!f || !f.db){
      return defaultCounts(t);
    }

    var followersSnap = await f.getDocs(
      f.query(
        f.collection(f.db, 'profile_follows'),
        f.where('following', '==', t)
      )
    );

    var followingSnap = await f.getDocs(
      f.query(
        f.collection(f.db, 'profile_follows'),
        f.where('follower', '==', t)
      )
    );

    var followers = 0;
    var following = 0;

    followersSnap.forEach(function(docSnap){
      var x = docSnap.data() || {};
      if(x.active !== false) followers++;
    });

    followingSnap.forEach(function(docSnap){
      var x = docSnap.data() || {};
      if(x.active !== false) following++;
    });

    countCache[t] = {
      followers: followers,
      following: following
    };

    var users = getUsers();
    var cur = getCurrent();

    if(users[t]){
      users[t].followers = followers;
      users[t].following = following;
      saveUsers(users);
    }

    if(cur && uname(cur) === t){
      cur.followers = followers;
      cur.following = following;
      setCurrent(cur);
    }

    updateCountBoxes(t, countCache[t]);

    return countCache[t];
  }

  function countsFor(t){
    t = clean(t);

    if(countCache[t]){
      return countCache[t];
    }

    var c = defaultCounts(t);
    countCache[t] = c;

    fetchCounts(t).catch(function(err){
      console.warn('[profile counts] failed', err);
    });

    return c;
  }

  function updateCountBoxes(t, c){
    var root = document.getElementById('ubCleanProfile');
    if(!root) return;

    var userEl = root.querySelector('.ub-profile-user');
    if(!userEl || userEl.textContent !== '@' + t) return;

    var boxes = root.querySelectorAll('.ub-profile-stat b');

    if(boxes[0]) boxes[0].textContent = fmt(c.followers);
    if(boxes[1]) boxes[1].textContent = fmt(c.following);
  }

  function cacheLive(t,on){
    liveCache[t] = !!on;

    var users = getUsers();

    Object.keys(users).forEach(function(k){
      if(k === t || uname(users[k]) === t){
        users[k].isLive = !!on;
        users[k].live = !!on;
      }
    });

    saveUsers(users);

    var u = getCurrent();

    if(u && uname(u) === t){
      u.isLive = !!on;
      u.live = !!on;
      setCurrent(u);
    }
  }

  function isLive(t){
    if(Object.prototype.hasOwnProperty.call(liveCache, t)){
      return !!liveCache[t];
    }

    var u = getCurrent();

    if(u && uname(u) === t && (u.isLive || u.live)){
      return true;
    }

    return false;
  }

  function watchLive(){
    var f = window.UB_FIREBASE || {};

    if(liveWatchStarted || !f.db || !f.collection || !f.onSnapshot){
      return;
    }

    liveWatchStarted = true;

    f.onSnapshot(
      f.collection(f.db, 'live_profiles'),
      function(snap){
        snap.forEach(function(d){
          var p = d.data() || {};
          var t = clean(p.username || d.id);

          if(t){
            cacheLive(t, !!(p.isLive || p.live));
          }
        });

        lastRenderKey = '';
        render();
      },
      function(e){
        console.warn('[profile live] watch failed', e);
      }
    );
  }

  function css(){
    if(document.getElementById('ubProfileCleanCss')) return;

    var s = document.createElement('style');
    s.id = 'ubProfileCleanCss';

    s.textContent = [
      '#page-profile .page-body{padding:8px 12px 112px!important;overflow-y:auto!important;}',
      '#page-profile.has-clean-profile .pf-banner,#page-profile.has-clean-profile .pf-main{display:none!important;}',
      '#page-profile.has-clean-profile > .page-body > div:not(#ubCleanProfile){display:none!important;}',
      '.ub-clean-profile{max-width:760px;margin:0 auto;color:#fff;}',
      '.ub-profile-hero{overflow:hidden;border:1px solid rgba(64,208,255,.34);border-radius:18px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));box-shadow:0 18px 45px rgba(0,0,0,.42);}',
      '.ub-profile-cover{height:116px;background:radial-gradient(circle at 25% 0%,rgba(64,208,255,.28),transparent 36%),radial-gradient(circle at 80% 40%,rgba(240,192,64,.18),transparent 35%),linear-gradient(135deg,rgba(8,16,32,.95),rgba(0,0,0,.65));border-bottom:1px solid rgba(201,168,76,.22);}',
      '.ub-profile-core{padding:0 14px 14px;text-align:center;margin-top:-46px;}',
      '.ub-profile-avatar{width:96px;height:96px;margin:0 auto 8px;border-radius:50%;border:3px solid #F0C040;background:#030305;display:flex;align-items:center;justify-content:center;font-size:2.6rem;overflow:hidden;box-shadow:0 0 24px rgba(240,192,64,.26);cursor:pointer;}',
      '.ub-profile-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.ub-profile-name{font-family:Bebas Neue,Arial,sans-serif;font-size:2.05rem;letter-spacing:2px;color:#F0C040;line-height:1;margin:4px 0 0;}',
      '.ub-profile-user{font-family:Orbitron,sans-serif;font-size:.58rem;letter-spacing:2px;color:#40D0FF;margin-top:4px;}',
      '.ub-profile-badges{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:10px 0;}',
      '.ub-profile-badge{padding:4px 8px;border-radius:999px;border:1px solid rgba(64,208,255,.35);background:rgba(64,208,255,.09);font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.2px;color:#fff;}',
      '.ub-profile-meta{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:8px 0 12px;}',
      '.ub-profile-pill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);font-size:.78rem;color:rgba(240,237,232,.74);}',
      '.ub-profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;}',
      '.ub-profile-stat{border:1px solid rgba(64,208,255,.24);border-radius:12px;background:rgba(255,255,255,.035);padding:9px 4px;}',
      '.ub-profile-stat b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.55rem;letter-spacing:1.4px;color:#F0C040;line-height:1;}',
      '.ub-profile-stat span{display:block;margin-top:4px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.4px;color:rgba(240,237,232,.62);}',
      '.ub-profile-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;}',
      '.ub-profile-actions button,.ub-tool-btn{border-radius:12px;padding:12px 7px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.2px;font-weight:900;cursor:pointer;border:1px solid transparent;}',
      '.ub-btn-gold{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-btn-blue{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important;}',
      '.ub-btn-red{background:rgba(255,51,51,.13);color:#ff6b6b;border-color:rgba(255,51,51,.35)!important;}',
      '.ub-profile-section{margin-top:10px;border:1px solid rgba(201,168,76,.22);border-radius:16px;background:rgba(0,0,0,.22);padding:12px;text-align:left;}',
      '.ub-profile-section-title{font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#F0C040;margin-bottom:7px;}',
      '.ub-profile-section-text{font-size:.86rem;line-height:1.45;color:rgba(240,237,232,.75);}',
      '.ub-live-preview{margin-top:10px;border:1px solid rgba(255,51,51,.4);border-radius:14px;overflow:hidden;background:#000;position:relative;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:#ff6b6b;font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;}',
      '.ub-tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:9px;}',
      '.ub-profile-small{margin-top:8px;font-size:.72rem;color:rgba(240,237,232,.45);text-align:center;}',
      '.ub-edit-link{display:inline-block;margin-top:8px;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:1.4px;cursor:pointer;}',
      '@media(max-width:520px){#page-profile .page-body{padding:6px 10px 106px!important;}.ub-profile-cover{height:92px}.ub-profile-core{margin-top:-39px;padding:0 10px 12px}.ub-profile-avatar{width:82px;height:82px;font-size:2.2rem}.ub-profile-name{font-size:1.72rem}.ub-profile-actions{grid-template-columns:1fr 1fr}.ub-tool-grid{grid-template-columns:1fr}.ub-profile-actions button,.ub-tool-btn{padding:11px 5px;font-size:.43rem}.ub-profile-stat b{font-size:1.32rem}.ub-profile-stat span{font-size:.36rem}.ub-live-preview{aspect-ratio:9/16;max-height:54vh;}}'
    ].join('');

    document.head.appendChild(s);
  }

  function badges(u){
    var r = (u.role || 'artist').toLowerCase();
    var a = ['✔ Verified'];

    a.push(r === 'dj' ? '🎧 DJ' : r === 'viewer' ? '👀 Viewer' : '🎤 Artist');

    if(r === 'artist') a.push('⚔️ Battle Rapper');

    return a.map(function(x){
      return '<span class="ub-profile-badge">' + esc(x) + '</span>';
    }).join('');
  }

  async function toggleLive(){
    var u = getCurrent();
    var t = uname(u);

    if(!t) return;

    if(isLive(t)){
      if(window.ubProfileLive && window.ubProfileLive.endLive){
        await window.ubProfileLive.endLive();
      }

      cacheLive(t, false);
      toast('Live ended');
    } else {
      if(window.ubProfileLive && window.ubProfileLive.goLive){
        await window.ubProfileLive.goLive();
      }

      cacheLive(t, true);
      toast('🔴 You are live');
    }

    lastRenderKey = '';
    render();
  }

  async function toggleFollow(t){
    t = clean(t);

    if(window.ubProfileLive && window.ubProfileLive.follow){
      await window.ubProfileLive.follow(t);
      countCache = {};
      fetchCounts(t).catch(function(){});
      fetchCounts(uname(getCurrent())).catch(function(){});
      lastRenderKey = '';
      render();
      return;
    }

    toast('Follow system not ready');
  }

  function render(){
    if(!ok()) return;

    css();
    watchLive();

    var page = document.getElementById('page-profile');
    if(!page) return;

    var body = page.querySelector('.page-body');
    if(!body) return;

    var u = getCurrent();

    if(!u || !uname(u)){
      page.classList.remove('has-clean-profile');
      return;
    }

    var t = uname(u);
    var c = countsFor(t);
    var live = isLive(t);
    var bioRaw = (u.bio && u.bio.trim())
      ? u.bio
      : "You haven't added your story yet. Tap edit to tell people who you are, what your music is about, and where you're from.";

    var key = [
      t,
      u.name || '',
      u.photo || '',
      u.avatar || '',
      u.city || '',
      bioRaw,
      c.followers,
      c.following,
      u.battles || 0,
      live ? '1' : '0'
    ].join('|');

    if(lastRenderKey === key && document.getElementById('ubCleanProfile')){
      return;
    }

    lastRenderKey = key;

    var old = document.getElementById('ubCleanProfile');
    if(old) old.remove();

    var av = u.photo
      ? '<img src="' + esc(u.photo) + '" alt="profile">'
      : esc(u.avatar || '🎤');

    var preview = live
      ? '<div class="ub-live-preview">🔴 LIVE CAM ACTIVE</div>'
      : '';

    var html =
      '<div class="ub-clean-profile" id="ubCleanProfile">' +
        '<div class="ub-profile-hero">' +
          '<div class="ub-profile-cover"></div>' +
          '<div class="ub-profile-core">' +
            '<div class="ub-profile-avatar" onclick="if(window.openPhotoModal)openPhotoModal()">' + av + '</div>' +
            '<div class="ub-profile-name">' + esc(u.name || 'UniBeatz') + '</div>' +
            '<div class="ub-profile-user">@' + esc(t) + '</div>' +
            '<div class="ub-profile-badges">' + badges(u) + '</div>' +

            '<div class="ub-profile-meta">' +
              '<span class="ub-profile-pill">📍 ' + esc(u.city || 'UniBeatz World') + '</span>' +
              '<span class="ub-profile-pill">🌐 unibeatzproduction.com</span>' +
            '</div>' +

            preview +

            '<div class="ub-profile-stats">' +
              '<div class="ub-profile-stat"><b>' + fmt(c.followers) + '</b><span>FOLLOWERS</span></div>' +
              '<div class="ub-profile-stat"><b>' + fmt(c.following) + '</b><span>FOLLOWING</span></div>' +
              '<div class="ub-profile-stat"><b>' + fmt(u.battles || 0) + '</b><span>BATTLES</span></div>' +
            '</div>' +

            '<div class="ub-profile-actions">' +
              '<button class="ub-btn-gold" onclick="showToast(\'This is your profile\')">MY PROFILE</button>' +
              '<button class="ub-btn-blue" onclick="showToast(\'💬 Messages coming soon\')">MESSAGE</button>' +
              '<button class="ub-btn-blue" onclick="goToPage(\'queue\')">CHALLENGE</button>' +
              '<button class="' + (live ? 'ub-btn-red' : 'ub-btn-gold') + '" onclick="ubProfileFollow.toggleLive()">' + (live ? 'END LIVE' : 'GO LIVE') + '</button>' +
            '</div>' +

            '<div class="ub-profile-section">' +
              '<div class="ub-profile-section-title">ABOUT ME</div>' +
              '<div class="ub-profile-section-text">' + esc(bioRaw) + '</div>' +
              '<span class="ub-edit-link" onclick="goToPage(\'editprofile\')">EDIT PROFILE →</span>' +
            '</div>' +

            '<div class="ub-profile-section">' +
              '<div class="ub-profile-section-title">CREATOR TOOLS</div>' +
              '<div class="ub-profile-section-text">Manage your creator side without cluttering the top of your profile.</div>' +
              '<div class="ub-tool-grid">' +
                '<button class="ub-tool-btn ub-btn-blue" onclick="goToPage(\'editprofile\')">EDIT PROFILE</button>' +
                '<button class="ub-tool-btn ub-btn-blue" onclick="showToast(\'Cover photo tools coming next\')">COVER PHOTO</button>' +
                '<button class="ub-tool-btn ub-btn-gold" onclick="if(window.ubHomeSessions&&window.ubHomeSessions.openBrowseProducers)ubHomeSessions.openBrowseProducers();else goToPage(\'browseproducer\')">BROWSE PRODUCERS</button>' +
              '</div>' +
            '</div>' +

            '<div class="ub-profile-small">User ID: ' + esc(u.uid || 'UB-000000') + ' · Joined ' + esc(u.joined || '2025') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    body.insertAdjacentHTML('afterbegin', html);
    page.classList.add('has-clean-profile');

    fetchCounts(t).catch(function(err){
      console.warn('[profile counts] refresh failed', err);
    });
  }

  function boot(){
    window.toggleFollow = function(t){
      return toggleFollow(t);
    };

    watchLive();
    render();
  }

  window.ubProfileFollow = {
    refresh: function(){
      lastRenderKey = '';
      render();
    },
    toggleLive: toggleLive,
    toggleFollow: toggleFollow,
    isLive: isLive,
    setLive: function(t,on){
      cacheLive(clean(t), !!on);
      lastRenderKey = '';
      render();
    },
    refreshCounts: function(t){
      return fetchCounts(clean(t || uname(getCurrent())));
    }
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('ub-firebase-ready', function(){
    setTimeout(boot, 200);
  });

  window.addEventListener('ub-firestore-ready', function(){
    setTimeout(boot, 200);
  });

  setTimeout(boot, 400);
  setTimeout(boot, 1200);

  setInterval(function(){
    watchLive();
    render();
  }, 3000);
})();
