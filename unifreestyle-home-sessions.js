// unifreestyle-home-sessions.js
// Home cleanup + scheduled session rooms + Browse Producers discovery.
(function(){
  'use strict';

  var SESSION_KEY='ub_home_session_counts_v1';
  var ACTIVE_KEY='ub_selected_home_session';
  var FOLLOWS_KEY='ub_profile_follows_v1';
  var DEFAULTS={
    open:{id:'open',title:'OPEN FREESTYLE SESSION',roomTitle:'OPEN FREESTYLE ROOM',time:'8:00 PM',dj:'DJ Blaze',genre:'Trap + Drill Rotation'},
    beatkill:{id:'beatkill',title:'BEAT KILL SESSION',roomTitle:'BEAT KILL ROOM',time:'10:00 PM',dj:'DJ Phantom',genre:'R&B + Afrobeats'}
  };

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();}
  function toast(m){if(window.showToast)window.showToast(m);else console.log('[ub]',m);}
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function jget(k,f){try{return JSON.parse(localStorage.getItem(k)||f);}catch(e){return JSON.parse(f);}}
  function jset(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function getLocal(){return jget(SESSION_KEY,'{}');}
  function setLocal(v){jset(SESSION_KEY,v);}
  function uname(u){return(u&&(u.username||u.name))?String(u.username||u.name).toLowerCase().replace(/[^a-z0-9_]/g,''):'';}
  function getCurrent(){return jget('ub_current_user','null')||jget('ub_user','null')||{};}
  function getUsers(){return jget('ub_users','{}');}
  function getFollows(){return jget(FOLLOWS_KEY,'{}');}
  function saveFollows(f){jset(FOLLOWS_KEY,f);}
  function liveKey(t){return'ub_profile_live_'+t;}
  function isLive(t){try{return localStorage.getItem(liveKey(t))==='1';}catch(e){return false;}}

  function css(){
    if(document.getElementById('ubHomeSessionsCss'))return;
    var s=document.createElement('style'); s.id='ubHomeSessionsCss';
    s.textContent=[
      '.ub-live-count{color:#23d36b!important;font-weight:900!important;letter-spacing:2px!important;}.ub-live-count::before{content:"⚡ ";}',
      '.ub-session-enter{cursor:pointer!important;}.ub-session-enter:hover{filter:brightness(1.12)!important;}#page-home .instant-card,#page-home .ub-hide-instant-section{display:none!important;}',
      '.ub-session-room-card,.ub-browse-card{margin:14px;border:1px solid rgba(64,208,255,.32);border-radius:16px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));box-shadow:0 18px 45px rgba(0,0,0,.42);overflow:hidden;}',
      '.ub-session-room-hero,.ub-browse-hero{padding:18px 16px;border-bottom:1px solid rgba(201,168,76,.22);background:radial-gradient(circle at 15% 0%,rgba(64,208,255,.18),transparent 35%),radial-gradient(circle at 85% 25%,rgba(240,192,64,.14),transparent 35%);}',
      '.ub-room-live{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid #ff3333;border-radius:999px;color:#ff4b4b;background:rgba(255,51,51,.12);font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;font-weight:900;}',
      '.ub-room-title{font-family:Bebas Neue,Arial,sans-serif;font-size:2.05rem;letter-spacing:3px;color:#F0C040;line-height:1;margin-top:14px;}.ub-room-sub{font-size:.9rem;color:rgba(240,237,232,.7);line-height:1.5;margin-top:8px;}',
      '.ub-room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px;}.ub-room-stat{border:1px solid rgba(64,208,255,.24);border-radius:12px;background:rgba(255,255,255,.035);padding:12px 6px;text-align:center;}',
      '.ub-room-stat b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;color:#F0C040;line-height:1;letter-spacing:1px;}.ub-room-stat span{display:block;margin-top:5px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.3px;color:rgba(240,237,232,.62);}',
      '.ub-room-panel{margin:0 14px 14px;border:1px solid rgba(201,168,76,.22);border-radius:14px;padding:14px;background:rgba(0,0,0,.22);}.ub-room-panel-title{font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:9px;}.ub-room-turn{font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;letter-spacing:2px;color:#fff;}',
      '.ub-room-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px 14px;}.ub-room-actions button,.ub-producer-row button{border-radius:12px;padding:11px 8px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.2px;font-weight:900;border:1px solid transparent;cursor:pointer;}',
      '.ub-btn-gold{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}.ub-btn-blue{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important;}.ub-btn-red{background:rgba(255,51,51,.13);color:#ff6b6b;border-color:rgba(255,51,51,.35)!important;}',
      '.ub-producer-search{width:100%;box-sizing:border-box;margin-top:14px;padding:12px;border-radius:12px;border:1px solid rgba(64,208,255,.34);background:rgba(0,0,0,.28);color:#fff;font-size:.9rem;}',
      '.ub-producer-list{padding:14px;display:flex;flex-direction:column;gap:10px;}.ub-producer-row{border:1px solid rgba(201,168,76,.22);border-radius:14px;background:rgba(0,0,0,.22);padding:12px;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;}',
      '.ub-prod-avatar{width:54px;height:54px;border-radius:50%;border:2px solid #F0C040;display:flex;align-items:center;justify-content:center;font-size:1.6rem;overflow:hidden;background:#030305;}.ub-prod-avatar img{width:100%;height:100%;object-fit:cover;}',
      '.ub-prod-name{font-family:Bebas Neue,Arial,sans-serif;font-size:1.35rem;letter-spacing:1.5px;color:#F0C040;line-height:1;}.ub-prod-user{font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:1.4px;color:#40D0FF;margin-top:3px;}.ub-prod-bio{font-size:.78rem;color:rgba(240,237,232,.65);margin-top:5px;line-height:1.35;}.ub-prod-actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px;}',
      '@media(max-width:520px){.ub-room-title{font-size:1.75rem}.ub-room-grid{grid-template-columns:1fr}.ub-room-actions,.ub-prod-actions{grid-template-columns:1fr}.ub-producer-row{grid-template-columns:auto 1fr}}'
    ].join(''); document.head.appendChild(s);
  }

  function navHtml(active){return '<div class="bottom-nav"><button class="nav-item" onclick="goToPage(\'home\')"><span class="nav-icon">🏠</span><span class="nav-label">Home</span></button><button class="nav-item '+(active==='battle'?'active':'')+'" onclick="goToPage(\'queue\')"><span class="nav-icon">🎤</span><span class="nav-label">Battle</span></button><button class="nav-item" onclick="goToPage(\'leaderboard\')"><span class="nav-icon">🏆</span><span class="nav-label">Ranks</span></button><button class="nav-item" onclick="goToPage(\'aidj\')"><span class="nav-icon">🤖</span><span class="nav-label">AI DJ</span></button><button class="nav-item" onclick="goToPage(\'profile\')"><span class="nav-icon">👤</span><span class="nav-label">Profile</span></button></div>';}
  function ensureStandaloneRooms(){
    var home=document.getElementById('page-home'); if(!home)return;
    if(!document.getElementById('page-openfreestyle')){home.insertAdjacentHTML('afterend',roomHtml('openfreestyle','open'));document.getElementById('page-openfreestyle').insertAdjacentHTML('afterend',roomHtml('beatkill','beatkill'));}
    ensureBrowseProducersPage();
  }
  function roomHtml(pageName,type){var s=DEFAULTS[type];return '<div class="page" id="page-'+pageName+'"><div class="top-bar"><button class="icon-btn" onclick="goToPage(\'home\')">←</button><h1>'+s.roomTitle+'</h1><div class="icon-btn" onclick="goToPage(\'profile\')">👤</div></div><div class="page-body"><div class="ub-session-room-card"><div class="ub-session-room-hero"><span class="ub-room-live"><span class="live-dot"></span> LIVE SESSION</span><div class="ub-room-title">'+s.roomTitle+'</div><div class="ub-room-sub">'+s.dj+' · '+s.genre+' · Florida time '+s.time+'</div></div><div class="ub-room-grid"><div class="ub-room-stat"><b data-ub-room-count="'+type+'">0</b><span>ARTISTS WAITING</span></div><div class="ub-room-stat"><b>'+s.time+'</b><span>FLORIDA TIME</span></div><div class="ub-room-stat"><b id="ubRoomTimer-'+type+'">--:--</b><span>SESSION TIMER</span></div></div><div class="ub-room-panel"><div class="ub-room-panel-title">ROOM STATUS</div><div class="ub-room-turn">Waiting for artists to enter...</div><div style="margin-top:8px;color:rgba(240,237,232,.68);line-height:1.5;font-size:.9rem;">This is a scheduled session room, separate from battles, dog cage, tournament, cypher, and DJ battles.</div></div><div class="ub-room-actions"><button class="ub-btn-gold" onclick="ubHomeSessions.joinRoom(\''+type+'\')">ENTER ROOM</button><button class="ub-btn-blue" onclick="goToPage(\'home\')">BACK HOME</button></div></div></div>'+navHtml('battle')+'</div>';}

  function ensureBrowseProducersPage(){
    if(document.getElementById('page-browseproducer'))return;
    var profile=document.getElementById('page-profile')||document.getElementById('page-home'); if(!profile)return;
    profile.insertAdjacentHTML('afterend','<div class="page" id="page-browseproducer"><div class="top-bar"><button class="icon-btn" onclick="goToPage(\'profile\')">←</button><h1>🔎 Browse Producers</h1><div class="icon-btn" onclick="goToPage(\'profile\')">👤</div></div><div class="page-body"><div class="ub-browse-card"><div class="ub-browse-hero"><span class="ub-room-live" style="border-color:#40D0FF;color:#40D0FF;background:rgba(64,208,255,.12);">PRODUCER SEARCH</span><div class="ub-room-title">BROWSE PRODUCERS</div><div class="ub-room-sub">Search producers, follow them, and watch when they go live.</div><input id="ubProducerSearchInput" class="ub-producer-search" placeholder="Search producers by name or @username" oninput="ubHomeSessions.renderProducers()"></div><div id="ubProducerList" class="ub-producer-list"></div></div></div>'+navHtml('')+'</div>');
  }

  function producerData(){
    var users=getUsers(), out=[], cur=getCurrent(), curName=uname(cur);
    Object.keys(users).forEach(function(k){var u=users[k];var role=norm(u.role||'');if(role==='artist'||role==='dj'||role==='producer'||role==='fan'||role==='viewer')out.push(u);});
    if(curName&&!out.some(function(u){return uname(u)===curName;}))out.unshift(cur);
    if(out.length<3){out=out.concat([{name:'DJ Blaze',username:'djblaze',role:'producer',avatar:'🎧',bio:'Trap and drill rotation producer.'},{name:'Phantom Beats',username:'phantombeats',role:'producer',avatar:'🎹',bio:'R&B and Afrobeats producer.'},{name:'UniBeatz',username:'unibeatz',role:'producer',avatar:'👑',bio:'Built From Pressure.'}]);}
    var seen={}; return out.filter(function(u){var n=uname(u);if(!n||seen[n])return false;seen[n]=true;return true;});
  }
  function isFollowing(target){var me=uname(getCurrent());return !!getFollows()[me+'__'+target];}
  function toggleFollowProducer(target){var me=uname(getCurrent());if(!me){toast('Sign in first');return;}if(me===target){toast('This is your profile');return;}var f=getFollows(),k=me+'__'+target;if(f[k]){delete f[k];toast('Unfollowed @'+target);}else{f[k]={follower:me,following:target,at:Date.now()};toast('✅ Following @'+target);}saveFollows(f);renderProducers();}
  function watchProducer(target){if(isLive(target)){toast('🔴 Watching @'+target+' live');}else{toast('@'+target+' is not live right now');}try{localStorage.setItem('ub_watch_producer',target);}catch(e){}}
  function openProducerProfile(target){try{localStorage.setItem('ub_view_producer_profile',target);}catch(e){}toast('Opening @'+target+' profile');if(window.goToPage)goToPage('profile');}
  function renderProducers(){
    ensureBrowseProducersPage(); var list=document.getElementById('ubProducerList'); if(!list)return;
    var q=norm((document.getElementById('ubProducerSearchInput')||{}).value||'');
    var data=producerData().filter(function(u){var hay=norm((u.name||'')+' '+(u.username||'')+' '+(u.bio||'')+' '+(u.role||''));return !q||hay.indexOf(q)>-1;});
    list.innerHTML=data.map(function(u){var n=uname(u), live=isLive(n), fol=isFollowing(n), avatar=u.photo?'<img src="'+esc(u.photo)+'">':esc(u.avatar||'🎹');return '<div class="ub-producer-row"><div class="ub-prod-avatar">'+avatar+'</div><div><div class="ub-prod-name">'+esc(u.name||n||'Producer')+' '+(live?'🔴':'')+'</div><div class="ub-prod-user">@'+esc(n)+' · '+esc(u.role||'producer')+'</div><div class="ub-prod-bio">'+esc(u.bio||'Producer on Uni Freestyle.')+'</div></div><div class="ub-prod-actions"><button class="'+(fol?'ub-btn-blue':'ub-btn-gold')+'" onclick="ubHomeSessions.followProducer(\''+n+'\')">'+(fol?'FOLLOWING':'FOLLOW')+'</button><button class="'+(live?'ub-btn-red':'ub-btn-blue')+'" onclick="ubHomeSessions.watchProducer(\''+n+'\')">'+(live?'WATCH LIVE':'NOT LIVE')+'</button><button class="ub-btn-blue" onclick="ubHomeSessions.openProducerProfile(\''+n+'\')">PROFILE</button></div></div>';}).join('')||'<div style="padding:14px;color:rgba(240,237,232,.65);">No producers found.</div>';
  }
  function openBrowseProducers(){ensureBrowseProducersPage();if(window.goToPage)goToPage('browseproducer');setTimeout(renderProducers,50);}
  function patchBrowseProducerButton(){[].slice.call(document.querySelectorAll('button')).forEach(function(btn){var t=norm(btn.textContent);if(t.indexOf('browser producer')>-1||t.indexOf('browse producer')>-1||t.indexOf('browse producers')>-1){btn.textContent='BROWSE PRODUCERS';btn.onclick=function(e){if(e){e.preventDefault();e.stopPropagation();}openBrowseProducers();return false;};}});}

  function findSessionCards(){return {open:document.querySelector('#page-home .session-card.live')||findByTitle('open freestyle battle')||findByTitle('open freestyle session'),beatkill:document.querySelector('#page-home .session-card.upcoming')||findByTitle('beat kill session')};}
  function findByTitle(title){var all=[].slice.call(document.querySelectorAll('#page-home .session-card,#page-home div'));for(var i=0;i<all.length;i++){var txt=norm(all[i].textContent);if(txt.indexOf(title)>-1&&txt.length<500)return all[i].closest('.session-card')||all[i];}return null;}
  function removeInstantMode(){var home=document.getElementById('page-home');if(!home)return;var instant=home.querySelector('.instant-card');if(instant)instant.style.display='none';[].slice.call(home.querySelectorAll('.section-head')).forEach(function(el){if(norm(el.textContent).indexOf('instant mode')>-1){el.classList.add('ub-hide-instant-section');el.style.display='none';}});}
  function replaceTextNode(root,matcher,replacement){var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n;while((n=walker.nextNode())){if(matcher.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(matcher,replacement);}}
  function enhanceCard(type,el,c){if(!el)return;el.style.display='';el.dataset.ubSessionType=type;el.classList.add('ub-session-enter');replaceTextNode(el,/Open Freestyle Battle/i,'Open Freestyle Session');replaceTextNode(el,/\d+\s+Artists\s+(in Lobby|Queued|Waiting)/i,c+' Artists Waiting');replaceTextNode(el,/Artists\s+(in Lobby|Queued)/i,'Artists Waiting');if(!el.querySelector('[data-ub-live-count="'+type+'"]')){var lobby=el.querySelector('.session-lobby');if(lobby)lobby.innerHTML='<span class="ub-live-count" data-ub-live-count="'+type+'">'+c+' Artists Waiting</span>';}if(el.dataset.ubClickReady!=='1'){el.dataset.ubClickReady='1';el.addEventListener('click',function(ev){var tag=(ev.target&&ev.target.tagName||'').toLowerCase();if(tag==='button'||tag==='a')return;openRoom(type);});[].slice.call(el.querySelectorAll('button,a')).forEach(function(btn){var t=norm(btn.textContent);if(t==='join'||t.indexOf('enter')>-1||t.indexOf('live now')>-1){btn.onclick=function(e){e.preventDefault();e.stopPropagation();openRoom(type);};}});}}
  function updateCount(type,c){[].slice.call(document.querySelectorAll('[data-ub-live-count="'+type+'"]')).forEach(function(x){x.textContent=c+' Artists Waiting';});[].slice.call(document.querySelectorAll('[data-ub-room-count="'+type+'"]')).forEach(function(x){x.textContent=c;});}
  function bump(type,delta){var data=getLocal();data[type]=Math.max(0,Number(data[type]||0)+delta);setLocal(data);updateCount(type,data[type]);}
  function openRoom(type){var s=DEFAULTS[type]||DEFAULTS.open;try{localStorage.setItem(ACTIVE_KEY,JSON.stringify({type:type,title:s.title,room:s.roomTitle,at:Date.now()}));}catch(e){}bump(type,1);var page=type==='beatkill'?'beatkill':'openfreestyle';if(window.goToPage)goToPage(page);else location.hash='#'+page;}
  function joinRoom(type){bump(type,1);var s=DEFAULTS[type]||DEFAULTS.open;toast('✅ Entered '+s.roomTitle);}
  function currentCounts(){var local=getLocal();return{open:Number(local.open||0),beatkill:Number(local.beatkill||0)};}
  function forceTopProfileIcon(){var home=document.getElementById('page-home');if(!home)return;[].slice.call(home.querySelectorAll('.top-bar .icon-btn')).forEach(function(btn){if((btn.textContent||'').indexOf('👤')>-1){btn.onclick=function(e){if(e){e.preventDefault();e.stopPropagation();}if(window.goToPage)goToPage('profile');return false;};}});}
  function render(){if(!ok())return;css();ensureStandaloneRooms();removeInstantMode();forceTopProfileIcon();patchBrowseProducerButton();var cards=findSessionCards(),counts=currentCounts();enhanceCard('open',cards.open,counts.open);enhanceCard('beatkill',cards.beatkill,counts.beatkill);updateCount('open',counts.open);updateCount('beatkill',counts.beatkill);if(document.querySelector('#page-browseproducer.active'))renderProducers();}
  function wireFirebase(){window.ubHomeSessionsUpdate=function(counts){var data=getLocal();if(typeof counts.open==='number')data.open=counts.open;if(typeof counts.beatkill==='number')data.beatkill=counts.beatkill;setLocal(data);updateCount('open',Number(data.open||0));updateCount('beatkill',Number(data.beatkill||0));};}
  function tickTimers(){var d=new Date();var txt=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');var a=document.getElementById('ubRoomTimer-open');if(a)a.textContent=txt;var b=document.getElementById('ubRoomTimer-beatkill');if(b)b.textContent=txt;}
  function boot(){wireFirebase();render();tickTimers();}
  window.ubHomeSessions={openRoom:openRoom,joinRoom:joinRoom,refresh:render,openBrowseProducers:openBrowseProducers,renderProducers:renderProducers,followProducer:toggleFollowProducer,watchProducer:watchProducer,openProducerProfile:openProducerProfile};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(render,400);setTimeout(render,1200);setInterval(render,3000);setInterval(tickTimers,1000);
})();