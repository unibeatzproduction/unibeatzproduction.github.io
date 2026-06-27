// unifreestyle-core.js
// UniBeatz Production — Core Firebase sync layer
// Handles: Google user sync, profile push to Firestore, Browse Producers sync
// Replaces: unifreestyle-google-user-sync.js, unifreestyle-google-user-sync-v2.js,
//           unifreestyle-profile-directory-bridge.js, unifreestyle-browse-producers-cl...

(function(){
  'use strict';

  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function read(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f); } }
  function write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function niceName(s){ return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }); }

  function getUsers(){ return read('ub_users','{}'); }
  function saveUsers(u){ write('ub_users',u); }
  function getCurrent(){ return read('ub_current_user','null') || read('ub_user','null') || null; }

  function getFb(){
    var fb = window.UB_FIREBASE || {};
    if(fb.db && fb.setDoc && fb.getDocs) return fb;
    return null;
  }

  // ── Push current logged-in user to Firestore profiles/{username} ──
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
      username: name,
      displayName: cur.name || cur.displayName || niceName(name),
      role: cur.role || 'artist',
      avatar: cur.avatar || '🎤',
      photo: cur.photo || cur.photoUrl || cur.photoURL || '',
      bio: cur.bio || '',
      verified: cur.verified || false,
      updatedAt: Date.now()
    };
    fb.setDoc(fb.doc(fb.db,'profiles',name), data, { merge:true })
      .then(function(){ console.log('[core] Profile pushed:', name); })
      .catch(function(e){ console.warn('[core] Profile push failed:', e.message); });
  }

  // ── Sync Google Auth user into localStorage + Firestore ──
  function syncGoogleUser(){
    var fb = getFb();
    var auth = fb && fb.auth;
    var googleUser = auth && auth.currentUser;
    if(!googleUser) return;

    var saved = getCurrent() || {};
    var name = clean(saved.username || saved.name || googleUser.displayName || googleUser.email.split('@')[0] || googleUser.uid);

    var profile = {
      uid: googleUser.uid,
      name: saved.name || googleUser.displayName || 'Google User',
      username: name,
      email: googleUser.email || '',
      photo: saved.photo || googleUser.photoURL || '',
      avatar: saved.avatar || '👑',
      role: saved.role || 'artist',
      bio: saved.bio || '',
      city: saved.city || 'UniBeatz World',
      authProvider: 'google',
      verified: true,
      updatedAt: Date.now()
    };

    // Update localStorage
    var users = getUsers();
    users[name] = Object.assign({}, users[name] || {}, profile);
    delete users.djblaze;
    delete users.phantombeats;
    saveUsers(users);
    write('ub_current_user', profile);
    write('ub_user', profile);

    if(!fb) return;
    // Write to Firestore — users/{uid}, profiles/{username}
    fb.setDoc(fb.doc(fb.db,'users',googleUser.uid), profile, { merge:true })
      .catch(function(e){ console.warn('[core] Google sync users failed:', e.message); });
    fb.setDoc(fb.doc(fb.db,'profiles',name), profile, { merge:true })
      .catch(function(e){ console.warn('[core] Google sync profiles failed:', e.message); });
  }

  // ── Pull all profiles from Firestore into ub_users ──
  var _syncDone = false;
  function syncUsersFromFirestore(){
    if(_syncDone) return;
    var fb = getFb();
    if(!fb){
      window.addEventListener('ub-firebase-ready', syncUsersFromFirestore, { once: true });
      setTimeout(syncUsersFromFirestore, 1000);
      return;
    }
    _syncDone = true;
    fb.getDocs(fb.collection(fb.db,'profiles')).then(function(snap){
      if(snap.empty) return;
      var all = getUsers();
      var changed = false;
      snap.forEach(function(doc){
        var d = doc.data();
        var name = (doc.id || d.username || '').toLowerCase().replace(/[^a-z0-9_]/g,'');
        if(!name || name === 'djblaze' || name === 'phantombeats') return;
        // ONLY update existing local users — never create new ones from Firestore
        // Creating from Firestore was causing duplicate profiles for Google users
        if(all[name]){
          if(d.photo || d.photoUrl){ all[name].photo = d.photo || d.photoUrl; changed = true; }
          if(d.bio){ all[name].bio = d.bio; changed = true; }
          if(d.displayName || d.name){ all[name].name = d.displayName || d.name; changed = true; }
          if(d.avatar){ all[name].avatar = d.avatar; changed = true; }
        }
      });
      if(changed){
        saveUsers(all);
        console.log('[core] Synced', snap.size, 'profiles from Firestore');
        if(window.ubHomeSessions && window.ubHomeSessions.renderProducers) window.ubHomeSessions.renderProducers();
      }
    }).catch(function(err){
      console.warn('[core] Firestore sync failed:', err.message);
      // Retry once on QUIC error
      setTimeout(function(){ _syncDone = false; syncUsersFromFirestore(); }, 3000);
    });
  }

  // ── Harvest current profile from DOM (fallback for non-Google users) ──
  function harvestFromDom(){
    var cur = getCurrent();
    if(cur){
      var name = clean(cur.username || cur.name);
      if(name){
        var users = getUsers();
        users[name] = Object.assign({}, users[name] || {}, cur, { username: name });
        delete users.djblaze; delete users.phantombeats;
        saveUsers(users);
      }
    }
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

  window.ubCore = { pushSelf: pushSelfToFirestore, syncGoogle: syncGoogleUser, syncUsers: syncUsersFromFirestore };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  setTimeout(boot, 800);
  // Removed: setInterval syncGoogleUser was overwriting current user every 5s
})();
