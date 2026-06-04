// unifreestyle-profile-directory-bridge.js
// Saves the visible/current profile into ub_users so Browse Producers can register it.
(function(){
  'use strict';
  function get(k,f){try{return JSON.parse(localStorage.getItem(k)||f)}catch(e){return JSON.parse(f)}}
  function set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function clean(s){return String(s||'').replace('@','').toLowerCase().replace(/[^a-z0-9_]/g,'')}
  function nice(s){return String(s||'').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()})}
  function saveUser(u){
    var username=clean(u&&u.username);
    if(!username||username==='djblaze'||username==='phantombeats')return;
    var users=get('ub_users','{}');
    users[username]=Object.assign({},users[username]||{},u,{username:username,role:u.role||'artist'});
    set('ub_users',users);
  }
  function currentUser(){
    try{if(window.currentUser&&clean(window.currentUser.username||window.currentUser.name))return window.currentUser}catch(e){}
    return get('ub_current_user','null')||get('ub_user','null')||null;
  }
  function harvest(){
    var u=currentUser();
    if(u)saveUser(u);
    var usernameEl=document.querySelector('.ub-profile-user,#pfUsername');
    var nameEl=document.querySelector('.ub-profile-name,#pfDisplayName');
    if(usernameEl){
      var username=clean(usernameEl.textContent);
      if(username){saveUser({username:username,name:(nameEl&&nameEl.textContent||nice(username)).trim(),role:'artist',avatar:'🎤',bio:'Producer on Uni Freestyle.'});}
    }
    if(window.ubHomeSessions&&window.ubHomeSessions.renderProducers){try{window.ubHomeSessions.renderProducers()}catch(e){}}
  }
  function patchButton(){
    Array.from(document.querySelectorAll('button')).forEach(function(btn){
      var t=String(btn.textContent||'').toLowerCase();
      if(t.indexOf('browser producer')>-1||t.indexOf('browse producer')>-1){
        btn.textContent='BROWSE PRODUCERS';
        btn.onclick=function(e){if(e){e.preventDefault();e.stopPropagation()}harvest();if(window.goToPage)goToPage('browseproducer');setTimeout(harvest,100);return false;};
      }
    });
  }
  function tick(){harvest();patchButton();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();
  setTimeout(tick,500);setTimeout(tick,1500);setInterval(tick,1000);
  window.ubProfileDirectoryBridge={harvest:harvest};
})();