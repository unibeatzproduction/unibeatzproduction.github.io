// Sync Firebase Auth Google users into ub_users for Browse Producers
(function(){
  'use strict';
  function clean(s){return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,'');}
  function read(k,f){try{return JSON.parse(localStorage.getItem(k)||f)}catch(e){return JSON.parse(f)}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function usernameFrom(user){
    var saved=read('ub_current_user','null')||read('ub_user','null')||{};
    if(saved.username)return clean(saved.username);
    if((user.displayName||'').toLowerCase().indexOf('eugene')>-1)return 'uniiversalallah';
    return clean((user.email||'').split('@')[0]||user.uid);
  }
  function sync(){
    var fb=window.UB_FIREBASE||{};
    var auth=fb.auth;
    var googleUser=auth&&auth.currentUser;
    if(!googleUser)return;
    var username=usernameFrom(googleUser);
    var saved=read('ub_current_user','null')||read('ub_user','null')||{};
    var profile={
      uid:googleUser.uid,
      name:saved.name||googleUser.displayName||'Google User',
      username:username,
      email:googleUser.email||'',
      photo:saved.photo||googleUser.photoURL||'',
      avatar:saved.avatar||'👑',
      role:saved.role||'artist',
      bio:saved.bio||'Producer on Uni Freestyle.',
      city:saved.city||'UniBeatz World',
      authProvider:'google',
      updatedAt:Date.now()
    };
    var users=read('ub_users','{}');
    users[username]=Object.assign({},users[username]||{},profile);
    delete users.djblaze;
    delete users.phantombeats;
    write('ub_users',users);
    write('ub_current_user',profile);
    write('ub_user',profile);
    if(fb.db&&fb.doc&&fb.setDoc){
      fb.setDoc(fb.doc(fb.db,'users',username),profile,{merge:true}).catch(function(err){console.warn('[google user sync]',err)});
    }
    if(window.ubBrowseProducersClean&&window.ubBrowseProducersClean.render)window.ubBrowseProducersClean.render();
  }
  window.ubGoogleUserSync={sync:sync};
  window.addEventListener('ub-firebase-ready',function(){setTimeout(sync,300)});
  window.addEventListener('ub-firestore-ready',function(){setTimeout(sync,300)});
  setTimeout(sync,800);
  setInterval(sync,4000);
})();