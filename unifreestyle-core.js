// unifreestyle-core.js
// UniBeatz Production — Core Firebase sync layer

(function(){
  'use strict';

  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function read(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f); } }
  function write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function niceName(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }

  function getUsers(){ return read('ub_users','{}'); }
  function saveUsers(u){ write('ub_users',u); }

  // Always read current user from BOTH keys — prefer ub_current_user
  function getCurrent(){
    return read('ub_current_user','null') || read('ub_user','null') || null;
  }

  // Write current user to BOTH keys to stay in sync with profile.js
  function setCurrent(u){
    write('ub_current_user', u);
    write('ub_user', u);
    try{ window.currentUser = u; }catch(e){}
  }

  function getFb(){
    var fb = window.UB_FIREBASE || {};
    if(fb.db && fb.setDoc && fb.getDocs) return fb;
    return null;
  }

  // ── Push current user's profile to Firestore ──
  // Only pushes what's already in localStorage — never creates new profiles
  function pushSelfToFirestore(){
    var cur = getCurrent();
    if(!cur) return;
    var name = clean(cur.username || cur.name);
    if(!name) return;
    var fb = getFb();
    if(!fb){
      window.addEventListener('ub-firebase-ready', pushSelfToFirestore, { once: true });
      return;
    }
    var data = {
      username:    name,
      displayName: cur.name || cur.displayName || niceName(name),
      role:        cur.role || 'artist',
      avatar:      cur.avatar || '🎤',
      photo:       cur.photo || cur.photoUrl || cur.photoURL || '',
      bio:         cur.bio || '',
      verified:    cur.verified || false,
      updatedAt:   Date.now()
    };
    fb.setDoc(fb.doc(fb.db,'profiles',name), data, { merge:true })
      .then(function(){ console.log('[core] Profile pushed:', name); })
      .catch(function(e){ console.warn('[core] Profile push failed:', e.message); });
  }

  // ── Sync Google Auth — only updates EXISTING user, never creates new one ──
  function syncGoogleUser(){
    var fb = getFb();
    var googleUser = fb && fb.auth && fb.auth.currentUser;
    if(!googleUser) return;

    var cur = getCurrent();
    if(!cur) return; // No local user — let finishGoogleLogin in index.html handle creation

    var curName = clean(cur.username || cur.name);
    if(!curName) return;

    // Only update the EXISTING user's data — never create a new username
    var updated = Object.assign({}, cur, {
      uid:          googleUser.uid,
      email:        googleUser.email || cur.email || '',
      photo:        cur.photo || googleUser.photoURL || '',
      authProvider: 'google',
      verified:     true,
      updatedAt:    Date.now()
    });

    // Save back under the SAME username — no new entries
    var users = getUsers();
    users[curName] = updated;
    saveUsers(users);
    setCurrent(updated);

    // Push to Firestore under existing username
    if(fb){
      fb.setDoc(fb.doc(fb.db,'users', googleUser.uid), updated, { merge:true })
        .catch(function(e){ console.warn('[core] Google sync users failed:', e.message); });
      fb.setDoc(fb.doc(fb.db,'profiles', curName), updated, { merge:true })
        .catch(function(e){ console.warn('[core] Google sync profiles failed:', e.message); });
    }
  }

  // ── Pull Firestore profiles — ONLY updates fields on existing local users ──
  // Never creates new local users — that caused the duplicate profile bug
  var _syncDone = false;
  function syncUsersFromFirestore(){
    if(_syncDone) return;
    var fb = getFb();
    if(!fb){
      window.addEventListener('ub-firebase-ready', syncUsersFromFirestore, { once: true });
      return;
    }
    _syncDone = true;
    fb.getDocs(fb.collection(fb.db,'profiles')).then(function(snap){
      if(snap.empty) return;
      var all = getUsers();
      var changed = false;
      snap.forEach(function(doc){
        var d = doc.data();
        var name = clean(doc.id || d.username || '');
        if(!name) return;
        // ONLY update if user already exists locally
        if(all[name]){
          if(d.photo || d.photoUrl){ all[name].photo = d.photo || d.photoUrl || ''; changed = true; }
          if(d.bio)                { all[name].bio   = d.bio; changed = true; }
          if(d.displayName || d.name){ all[name].name = d.displayName || d.name; changed = true; }
          if(d.avatar)             { all[name].avatar = d.avatar; changed = true; }
        }
        // If this doc matches current user by uid, update current user too
        var cur = getCurrent();
        if(cur && d.uid && d.uid === cur.uid && name !== clean(cur.username||cur.name)){
          // Firestore has a different username for this uid — sync it back
          console.warn('[core] uid username mismatch, not auto-fixing');
        }
      });
      if(changed){
        saveUsers(all);
        console.log('[core] Synced', snap.size, 'profiles from Firestore');
        if(window.ubHomeSessions && window.ubHomeSessions.renderProducers){
          window.ubHomeSessions.renderProducers();
        }
      }
    }).catch(function(err){
      console.warn('[core] Firestore sync failed:', err.message);
      setTimeout(function(){ _syncDone = false; syncUsersFromFirestore(); }, 3000);
    });
  }

  // ── Harvest current profile into ub_users registry ──
  function harvestFromDom(){
    var cur = getCurrent();
    if(!cur) return;
    var name = clean(cur.username || cur.name);
    if(!name) return;
    var users = getUsers();
    users[name] = Object.assign({}, users[name] || {}, cur, { username: name });
    saveUsers(users);
  }

  // ── Boot ──
  function boot(){
    harvestFromDom();
    pushSelfToFirestore();
    syncUsersFromFirestore();
    syncGoogleUser();
  }

  window.addEventListener('ub-firebase-ready', function(){
    setTimeout(boot, 300);
  });

  window.ubCore = {
    pushSelf:   pushSelfToFirestore,
    syncGoogle: syncGoogleUser,
    syncUsers:  syncUsersFromFirestore
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  setTimeout(boot, 800);

})();
