// unifreestyle-profile-follow.js
// Creator Economy Phase: clean mobile-first PUBLIC PROFILE screen + follow foundation.
// Fix: never blank the profile. If custom render fails, original profile stays visible.
(function(){
  'use strict';

  var STORE={follows:'ub_profile_follows_v1',users:'ub_users',current:'ub_current_user'};

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function toast(msg){if(typeof window.showToast==='function')window.showToast(msg);else console.log('[profile-follow]',msg);}
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeJson(raw){try{return raw?JSON.parse(raw):null;}catch(e){return null;}}

  function getCurrent(){
    var u=safeJson(localStorage.getItem(STORE.current))||safeJson(localStorage.getItem('ub_user'));
    if(u&&u.username)return u;
    try{ if(window.currentUser&&window.currentUser.username)return window.currentUser; }catch(e){}
    var users=getUsers();
    var keys=Object.keys(users);
    if(keys.length===1)return users[keys[0]];
    var title=document.getElementById('pfTopTitle');
    if(title){
      var guess=String(title.textContent||'').replace('@','').trim().toLowerCase();
      if(guess&&users[guess])return users[guess];
    }
    return u||null;
  }

  function setCurrent(u){try{localStorage.setItem(STORE.current,JSON.stringify(u));localStorage.setItem('ub_user',JSON.stringify(u));}catch(e){} try{window.currentUser=u;}catch(e){}}
  function getUsers(){try{return JSON.parse(localStorage.getItem(STORE.users)||'{}');}catch(e){return {};}}
  function saveUsers(users){try{localStorage.setItem(STORE.users,JSON.stringify(users));}catch(e){}}
  function getFollows(){try{return JSON.parse(localStorage.getItem(STORE.follows)||'{}');}catch(e){return {};}}
  function saveFollows(f){try{localStorage.setItem(STORE.follows,JSON.stringify(f));}catch(e){}}
  function uname(u){return(u&&(u.username||u.name))?String(u.username||u.name).toLowerCase().replace(/[^a-z0-9_]/g,''):'';}
  function format(n){n=Number(n||0);if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}

  function countsFor(target){var f=getFollows(),followers=0,following=0;Object.keys(f).forEach(function(k){var x=f[k];if(x&&x.following===target)followers++;if(x&&x.follower===target)following++;});return{followers:followers,following:following};}
  function syncUserCounts(target){var c=countsFor(target),users=getUsers();if(users[target]){users[target].followers=c.followers;users[target].following=c.following;saveUsers(users);}var cur=getCurrent();if(cur&&uname(cur)===target){cur.followers=c.followers;cur.following=c.following;setCurrent(cur);}return c;}

  function ensureCss(){
    if(document.getElementById('ubProfileCleanCss'))return;
    var css=document.createElement('style');css.id='ubProfileCleanCss';css.textContent=[
      '#page-profile .page-body{padding:8px 12px 112px!important;overflow-y:auto!important;}',
      '#page-profile.has-clean-profile .pf-banner,#page-profile.has-clean-profile .pf-main{display:none!important;}',
      '#page-profile.has-clean-profile [id*="profileLive"],#page-profile.has-clean-profile [class*="profile-live"],#page-profile.has-clean-profile [class*="creator-tools"],#page-profile.has-clean-profile [id*="creatorTools"],#page-profile.has-clean-profile [class*="cover"],#page-profile.has-clean-profile [id*="cover"]{display:none!important;}',
      '.ub-clean-profile{max-width:760px;margin:0 auto;color:#fff;}',
      '.ub-profile-hero{position:relative;overflow:hidden;border:1px solid rgba(64,208,255,.34);border-radius:18px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));box-shadow:0 18px 45px rgba(0,0,0,.42);}',
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
      '.ub-profile-actions{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:8px;margin-top:10px;}',
      '.ub-profile-actions button{border-radius:12px;padding:12px 7px;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.4px;font-weight:900;cursor:pointer;border:1px solid transparent;}',
      '.ub-btn-follow{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-btn-msg{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important;}',
      '.ub-btn-challenge{background:rgba(201,168,76,.10);color:#F0C040;border-color:rgba(201,168,76,.34)!important;}',
      '.ub-profile-about{margin-top:10px;border:1px solid rgba(201,168,76,.22);border-radius:16px;background:rgba(0,0,0,.22);padding:12px;text-align:left;}',
      '.ub-profile-about-title{font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#F0C040;margin-bottom:7px;}',
      '.ub-profile-about-text{font-size:.86rem;line-height:1.45;color:rgba(240,237,232,.75);}',
      '.ub-profile-small{margin-top:8px;font-size:.72rem;color:rgba(240,237,232,.45);text-align:center;}',
      '.ub-profile-edit-link{display:inline-block;margin-top:8px;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:1.4px;cursor:pointer;}',
      '@media(max-width:520px){#page-profile .page-body{padding:6px 10px 106px!important;}.ub-profile-cover{height:92px}.ub-profile-core{margin-top:-39px;padding:0 10px 12px}.ub-profile-avatar{width:82px;height:82px;font-size:2.2rem}.ub-profile-name{font-size:1.72rem}.ub-profile-stat b{font-size:1.32rem}.ub-profile-stat span{font-size:.36rem}.ub-profile-actions{grid-template-columns:1fr}.ub-profile-actions button{padding:11px}.ub-profile-pill{font-size:.72rem;padding:5px 8px}}'
    ].join('');document.head.appendChild(css);
  }

  function roleBadges(u){var role=(u.role||'artist').toLowerCase();var arr=['✔ Verified'];if(role==='dj')arr.push('🎧 DJ');else if(role==='viewer')arr.push('👀 Viewer');else if(role==='fan')arr.push('❤️ Fan');else arr.push('🎤 Artist');if(role==='artist')arr.push('⚔️ Battle Rapper');return arr;}

  function render(){
    if(!ok())return;ensureCss();
    var page=document.getElementById('page-profile');if(!page)return;
    var body=page.querySelector('.page-body');if(!body)return;
    var u=getCurrent();
    if(!u||!uname(u)){page.classList.remove('has-clean-profile');return;}
    var target=uname(u),c=syncUserCounts(target);
    var old=document.getElementById('ubCleanProfile');if(old)old.remove();
    var avatar=u.photo?'<img src="'+esc(u.photo)+'" alt="profile">':esc(u.avatar||'🎤');
    var badges=roleBadges(u).map(function(b){return '<span class="ub-profile-badge">'+esc(b)+'</span>';}).join('');
    var bio=(u.bio&&u.bio.trim())?esc(u.bio):"You haven't added your story yet. Tap edit to tell people who you are, what your music is about, and where you're from.";
    var html='<div class="ub-clean-profile" id="ubCleanProfile"><div class="ub-profile-hero"><div class="ub-profile-cover"></div><div class="ub-profile-core"><div class="ub-profile-avatar" onclick="if(window.openPhotoModal)openPhotoModal()">'+avatar+'</div><div class="ub-profile-name">'+esc(u.name||'UniBeatz')+'</div><div class="ub-profile-user">@'+esc(target)+'</div><div class="ub-profile-badges">'+badges+'</div><div class="ub-profile-meta"><span class="ub-profile-pill">📍 '+esc(u.city||'UniBeatz World')+'</span><span class="ub-profile-pill">🌐 unibeatzproduction.com</span></div><div class="ub-profile-stats"><div class="ub-profile-stat"><b>'+format(c.followers)+'</b><span>FOLLOWERS</span></div><div class="ub-profile-stat"><b>'+format(c.following)+'</b><span>FOLLOWING</span></div><div class="ub-profile-stat"><b>'+format(u.battles||0)+'</b><span>BATTLES</span></div></div><div class="ub-profile-actions"><button class="ub-btn-follow" onclick="showToast(\'This is your profile\')">✓ MY PROFILE</button><button class="ub-btn-msg" onclick="showToast(\'💬 Messages coming soon\')">MESSAGE</button><button class="ub-btn-challenge" onclick="goToPage(\'queue\')">CHALLENGE</button></div><div class="ub-profile-about"><div class="ub-profile-about-title">ABOUT ME</div><div class="ub-profile-about-text">'+bio+'</div><span class="ub-profile-edit-link" onclick="goToPage(\'editprofile\')">EDIT PROFILE →</span></div><div class="ub-profile-small">User ID: '+esc(u.uid||'UB-000000')+' · Joined '+esc(u.joined||'2025')+'</div></div></div></div>';
    body.insertAdjacentHTML('afterbegin',html);
    page.classList.add('has-clean-profile');
  }

  function toggleFollowProfile(target){var me=uname(getCurrent());target=String(target||'').toLowerCase();if(!me||!target||me===target){toast('This is your profile');return;}var f=getFollows(),key=me+'__'+target;if(f[key]){delete f[key];toast('Unfollowed @'+target);}else{f[key]={follower:me,following:target,at:Date.now()};toast('✅ Following @'+target);}saveFollows(f);syncUserCounts(me);syncUserCounts(target);render();}
  function patchLegacyFollow(){window.toggleFollow=function(btn){if(btn){btn.textContent='✓ My Profile';btn.classList.add('followed');}render();toast('This is your profile');};}
  function boot(){patchLegacyFollow();render();}

  window.ubProfileFollow={refresh:render,follow:toggleFollowProfile,counts:countsFor};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,500);setTimeout(boot,1400);setInterval(function(){if(document.querySelector('#page-profile.active'))render();},3000);
})();