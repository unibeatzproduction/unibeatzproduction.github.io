// unifreestyle-profile-follow.js
// Creator Economy Phase: cleaned profile header + follow/followers/following system.
// Safe layer: injects into existing #page-profile without touching battle/live engines.
(function(){
  'use strict';

  var STORE = {
    follows:'ub_profile_follows_v1',
    users:'ub_users',
    current:'ub_current_user'
  };

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(typeof window.showToast==='function') window.showToast(msg); else console.log('[profile-follow]',msg); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function getCurrent(){ try{ return JSON.parse(localStorage.getItem(STORE.current)||localStorage.getItem('ub_user')||'null'); }catch(e){ return null; } }
  function setCurrent(u){ try{ localStorage.setItem(STORE.current,JSON.stringify(u)); localStorage.setItem('ub_user',JSON.stringify(u)); }catch(e){} if(window.currentUser) window.currentUser=u; }
  function getUsers(){ try{ return JSON.parse(localStorage.getItem(STORE.users)||'{}'); }catch(e){ return {}; } }
  function saveUsers(users){ try{ localStorage.setItem(STORE.users,JSON.stringify(users)); }catch(e){} }
  function getFollows(){ try{ return JSON.parse(localStorage.getItem(STORE.follows)||'{}'); }catch(e){ return {}; } }
  function saveFollows(f){ try{ localStorage.setItem(STORE.follows,JSON.stringify(f)); }catch(e){} }
  function uname(u){ return (u && (u.username || u.name)) ? String(u.username || u.name).toLowerCase().replace(/[^a-z0-9_]/g,'') : ''; }

  function ensureCss(){
    if(document.getElementById('ubProfileFollowCss')) return;
    var css=document.createElement('style');
    css.id='ubProfileFollowCss';
    css.textContent=[
      '#page-profile .page-body{padding-bottom:130px!important;}',
      '.pf-banner{height:118px!important;background:radial-gradient(circle at 20% 0%,rgba(64,208,255,.22),transparent 35%),linear-gradient(135deg,rgba(201,168,76,.18),rgba(0,0,0,.18))!important;border-bottom:1px solid rgba(201,168,76,.25)!important;}',
      '.pf-main{margin:-54px 12px 0!important;padding:0 0 14px!important;border-radius:18px!important;overflow:hidden!important;background:linear-gradient(180deg,rgba(5,7,13,.96),rgba(3,3,5,.9))!important;border:1px solid rgba(64,208,255,.28)!important;box-shadow:0 18px 45px rgba(0,0,0,.42)!important;}',
      '.pf-avatar-wrap{padding-top:16px!important;display:flex!important;justify-content:center!important;}',
      '.pf-avatar{width:112px!important;height:112px!important;border:3px solid #F0C040!important;box-shadow:0 0 24px rgba(240,192,64,.25)!important;background:rgba(0,0,0,.65)!important;}',
      '.pf-info{text-align:center!important;padding:8px 14px 0!important;}',
      '.pf-display-name{font-family:Bebas Neue,Arial,sans-serif!important;font-size:2rem!important;letter-spacing:2px!important;color:#F0C040!important;margin:6px 0 0!important;line-height:1!important;}',
      '.pf-username{font-family:Orbitron,sans-serif!important;font-size:.58rem!important;letter-spacing:2px!important;color:#40D0FF!important;margin:4px 0 10px!important;}',
      '.pf-badges{display:flex!important;justify-content:center!important;gap:6px!important;flex-wrap:wrap!important;margin:6px 0 10px!important;}',
      '.pf-location,.pf-website{font-size:.78rem!important;color:rgba(240,237,232,.72)!important;}',
      '.ub-follow-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 12px;}',
      '.ub-follow-stat{border:1px solid rgba(64,208,255,.24);border-radius:12px;padding:9px 6px;background:rgba(255,255,255,.035);}',
      '.ub-follow-stat b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.45rem;letter-spacing:1.5px;color:#F0C040;line-height:1;}',
      '.ub-follow-stat span{display:block;margin-top:4px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.4px;color:rgba(240,237,232,.62);}',
      '.ub-profile-action-row{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;margin:10px 0 12px;}',
      '.ub-profile-action-row button{border:0;border-radius:12px;padding:11px 7px;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.5px;font-weight:900;cursor:pointer;}',
      '.ub-follow-btn{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-follow-btn.following{background:linear-gradient(135deg,rgba(64,208,255,.18),rgba(64,208,255,.35));color:#40D0FF;border:1px solid rgba(64,208,255,.55)!important;}',
      '.ub-msg-btn{background:rgba(64,208,255,.12);color:#40D0FF;border:1px solid rgba(64,208,255,.32)!important;}',
      '.ub-challenge-btn{background:rgba(201,168,76,.12);color:#F0C040;border:1px solid rgba(201,168,76,.32)!important;}',
      '.pf-about-section{margin:12px 0!important;text-align:left!important;border-radius:14px!important;border:1px solid rgba(201,168,76,.24)!important;background:rgba(0,0,0,.25)!important;padding:12px!important;}',
      '.pf-stats-grid{margin-top:10px!important;display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:8px!important;}',
      '.pf-stat-box{border-radius:12px!important;background:rgba(255,255,255,.035)!important;border:1px solid rgba(64,208,255,.18)!important;padding:9px 4px!important;}',
      '.pf-actions{display:none!important;}',
      '@media(max-width:520px){.ub-profile-action-row{grid-template-columns:1fr;}.pf-stats-grid{grid-template-columns:repeat(2,1fr)!important;}.pf-display-name{font-size:1.8rem!important;}.pf-main{margin-left:10px!important;margin-right:10px!important;}}'
    ].join('');
    document.head.appendChild(css);
  }

  function format(n){ n=Number(n||0); if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return String(n); }
  function countsFor(target){
    var f=getFollows(), followers=0, following=0;
    Object.keys(f).forEach(function(k){ var x=f[k]; if(x && x.following===target) followers++; if(x && x.follower===target) following++; });
    return {followers:followers, following:following};
  }
  function isFollowing(me,target){ return !!getFollows()[me+'__'+target]; }

  function syncUserCounts(target){
    var c=countsFor(target), users=getUsers();
    if(users[target]){ users[target].followers=c.followers; users[target].following=c.following; saveUsers(users); }
    var cur=getCurrent();
    if(cur && uname(cur)===target){ cur.followers=c.followers; cur.following=c.following; setCurrent(cur); }
    return c;
  }

  function currentTarget(){
    var cur=getCurrent();
    return uname(cur);
  }

  function renderHeader(){
    if(!ok()) return;
    var page=document.getElementById('page-profile'); if(!page) return;
    var info=page.querySelector('.pf-info'); if(!info) return;
    var target=currentTarget(); if(!target) return;
    var cur=getCurrent() || {};
    var c=syncUserCounts(target);

    var old=document.getElementById('ubProfileFollowBlock');
    if(old) old.remove();

    var block=document.createElement('div');
    block.id='ubProfileFollowBlock';
    block.innerHTML='<div class="ub-follow-stats"><div class="ub-follow-stat"><b id="ubFollowersCount">'+format(c.followers)+'</b><span>FOLLOWERS</span></div><div class="ub-follow-stat"><b id="ubFollowingCount">'+format(c.following)+'</b><span>FOLLOWING</span></div><div class="ub-follow-stat"><b>'+format(cur.battles||0)+'</b><span>BATTLES</span></div></div><div class="ub-profile-action-row"><button id="ubFollowMainBtn" class="ub-follow-btn">FOLLOW</button><button class="ub-msg-btn" onclick="showToast(\'💬 Messages coming soon\')">MESSAGE</button><button class="ub-challenge-btn" onclick="goToPage(\'queue\')">CHALLENGE</button></div>';

    var badges=document.getElementById('pfBadges');
    if(badges) badges.insertAdjacentElement('afterend',block); else info.insertBefore(block,info.firstChild);

    var btn=block.querySelector('#ubFollowMainBtn');
    if(btn){
      btn.textContent='✓ MY PROFILE';
      btn.classList.add('following');
      btn.onclick=function(){ toast('This is your profile'); };
    }
  }

  function toggleFollowProfile(target){
    var me=currentTarget(); target=String(target||'').toLowerCase();
    if(!me || !target || me===target){ toast('This is your profile'); return; }
    var f=getFollows(), key=me+'__'+target;
    if(f[key]){ delete f[key]; toast('Unfollowed @'+target); }
    else { f[key]={follower:me,following:target,at:Date.now()}; toast('✅ Following @'+target); }
    saveFollows(f); syncUserCounts(me); syncUserCounts(target); renderHeader();
  }

  function patchLegacyFollow(){
    window.toggleFollow=function(btn){
      var target=currentTarget();
      if(!target){ toast('Sign in first'); return; }
      if(btn){ btn.textContent='✓ My Profile'; btn.classList.add('followed'); }
      renderHeader();
      toast('This is your profile');
    };
  }

  function boot(){ ensureCss(); patchLegacyFollow(); renderHeader(); }
  window.ubProfileFollow={refresh:renderHeader,follow:toggleFollowProfile,counts:countsFor};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  setTimeout(boot,700); setInterval(function(){ if(document.querySelector('#page-profile.active')) renderHeader(); },2500);
})();