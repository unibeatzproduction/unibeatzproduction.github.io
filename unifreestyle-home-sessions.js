// unifreestyle-home-sessions.js
// Home cleanup: remove Instant Mode safely + live counts + standalone scheduled session rooms.
(function(){
  'use strict';

  var SESSION_KEY='ub_home_session_counts_v1';
  var ACTIVE_KEY='ub_selected_home_session';
  var DEFAULTS={
    open:{id:'open',title:'OPEN FREESTYLE SESSION',roomTitle:'OPEN FREESTYLE ROOM',time:'8:00 PM',dj:'DJ Blaze',genre:'Trap + Drill Rotation',label:'Artists Waiting'},
    beatkill:{id:'beatkill',title:'BEAT KILL SESSION',roomTitle:'BEAT KILL ROOM',time:'10:00 PM',dj:'DJ Phantom',genre:'R&B + Afrobeats',label:'Artists Waiting'}
  };

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function getLocal(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'{}');}catch(e){return {};}}
  function setLocal(v){try{localStorage.setItem(SESSION_KEY,JSON.stringify(v));}catch(e){}}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();}
  function count(type){return Number(getLocal()[type]||0);}

  function css(){
    if(document.getElementById('ubHomeSessionsCss'))return;
    var s=document.createElement('style');
    s.id='ubHomeSessionsCss';
    s.textContent=[
      '.ub-live-count{color:#23d36b!important;font-weight:900!important;letter-spacing:2px!important;}',
      '.ub-live-count::before{content:"⚡ ";}',
      '.ub-session-enter{cursor:pointer!important;}','.ub-session-enter:hover{filter:brightness(1.12)!important;}',
      '#page-home .instant-card,#page-home .ub-hide-instant-section{display:none!important;}',
      '.ub-session-room-card{margin:14px;border:1px solid rgba(64,208,255,.32);border-radius:16px;background:linear-gradient(180deg,rgba(8,12,20,.96),rgba(3,3,5,.94));box-shadow:0 18px 45px rgba(0,0,0,.42);overflow:hidden;}',
      '.ub-session-room-hero{padding:18px 16px;border-bottom:1px solid rgba(201,168,76,.22);background:radial-gradient(circle at 15% 0%,rgba(64,208,255,.18),transparent 35%),radial-gradient(circle at 85% 25%,rgba(240,192,64,.14),transparent 35%);}',
      '.ub-room-live{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid #ff3333;border-radius:999px;color:#ff4b4b;background:rgba(255,51,51,.12);font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;font-weight:900;}',
      '.ub-room-title{font-family:Bebas Neue,Arial,sans-serif;font-size:2.05rem;letter-spacing:3px;color:#F0C040;line-height:1;margin-top:14px;}',
      '.ub-room-sub{font-size:.9rem;color:rgba(240,237,232,.7);line-height:1.5;margin-top:8px;}',
      '.ub-room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px;}',
      '.ub-room-stat{border:1px solid rgba(64,208,255,.24);border-radius:12px;background:rgba(255,255,255,.035);padding:12px 6px;text-align:center;}',
      '.ub-room-stat b{display:block;font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;color:#F0C040;line-height:1;letter-spacing:1px;}',
      '.ub-room-stat span{display:block;margin-top:5px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.3px;color:rgba(240,237,232,.62);}',
      '.ub-room-panel{margin:0 14px 14px;border:1px solid rgba(201,168,76,.22);border-radius:14px;padding:14px;background:rgba(0,0,0,.22);}',
      '.ub-room-panel-title{font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:9px;}',
      '.ub-room-turn{font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;letter-spacing:2px;color:#fff;}',
      '.ub-room-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px 14px;}',
      '.ub-room-actions button{border-radius:12px;padding:13px 8px;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:1.5px;font-weight:900;border:1px solid transparent;}',
      '.ub-btn-gold{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-btn-blue{background:rgba(64,208,255,.12);color:#40D0FF;border-color:rgba(64,208,255,.34)!important;}',
      '@media(max-width:520px){.ub-room-title{font-size:1.75rem}.ub-room-grid{grid-template-columns:1fr}.ub-room-actions{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureStandaloneRooms(){
    if(document.getElementById('page-openfreestyle'))return;
    var home=document.getElementById('page-home');
    if(!home)return;
    home.insertAdjacentHTML('afterend',roomHtml('openfreestyle','open'));
    document.getElementById('page-openfreestyle').insertAdjacentHTML('afterend',roomHtml('beatkill','beatkill'));
  }

  function navHtml(active){
    return '<div class="bottom-nav">'+
      '<button class="nav-item" onclick="goToPage(\'home\')"><span class="nav-icon">🏠</span><span class="nav-label">Home</span></button>'+
      '<button class="nav-item '+(active==='battle'?'active':'')+'" onclick="goToPage(\'queue\')"><span class="nav-icon">🎤</span><span class="nav-label">Battle</span></button>'+
      '<button class="nav-item" onclick="goToPage(\'leaderboard\')"><span class="nav-icon">🏆</span><span class="nav-label">Ranks</span></button>'+
      '<button class="nav-item" onclick="goToPage(\'aidj\')"><span class="nav-icon">🤖</span><span class="nav-label">AI DJ</span></button>'+
      '<button class="nav-item" onclick="goToPage(\'profile\')"><span class="nav-icon">👤</span><span class="nav-label">Profile</span></button></div>';
  }

  function roomHtml(pageName,type){
    var s=DEFAULTS[type];
    return '<div class="page" id="page-'+pageName+'"><div class="top-bar"><button class="icon-btn" onclick="goToPage(\'home\')">←</button><h1>'+s.roomTitle+'</h1><div class="icon-btn" onclick="goToPage(\'profile\')">👤</div></div><div class="page-body"><div class="ub-session-room-card"><div class="ub-session-room-hero"><span class="ub-room-live"><span class="live-dot"></span> LIVE SESSION</span><div class="ub-room-title">'+s.roomTitle+'</div><div class="ub-room-sub">'+s.dj+' · '+s.genre+' · Florida time '+s.time+'</div></div><div class="ub-room-grid"><div class="ub-room-stat"><b data-ub-room-count="'+type+'">0</b><span>ARTISTS WAITING</span></div><div class="ub-room-stat"><b>'+s.time+'</b><span>FLORIDA TIME</span></div><div class="ub-room-stat"><b id="ubRoomTimer-'+type+'">--:--</b><span>SESSION TIMER</span></div></div><div class="ub-room-panel"><div class="ub-room-panel-title">ROOM STATUS</div><div class="ub-room-turn">Waiting for artists to enter...</div><div style="margin-top:8px;color:rgba(240,237,232,.68);line-height:1.5;font-size:.9rem;">This is a scheduled session room, separate from battles, dog cage, tournament, cypher, and DJ battles.</div></div><div class="ub-room-actions"><button class="ub-btn-gold" onclick="ubHomeSessions.joinRoom(\''+type+'\')">ENTER ROOM</button><button class="ub-btn-blue" onclick="goToPage(\'home\')">BACK HOME</button></div></div></div>'+navHtml('battle')+'</div>';
  }

  function findSessionCards(){
    return {open:document.querySelector('#page-home .session-card.live')||findByTitle('open freestyle battle')||findByTitle('open freestyle session'),beatkill:document.querySelector('#page-home .session-card.upcoming')||findByTitle('beat kill session')};
  }
  function findByTitle(title){var all=[].slice.call(document.querySelectorAll('#page-home .session-card,#page-home div'));for(var i=0;i<all.length;i++){var txt=norm(all[i].textContent);if(txt.indexOf(title)>-1&&txt.length<500)return all[i].closest('.session-card')||all[i];}return null;}
  function removeInstantMode(){var home=document.getElementById('page-home');if(!home)return;var instant=home.querySelector('.instant-card');if(instant)instant.style.display='none';[].slice.call(home.querySelectorAll('.section-head')).forEach(function(el){if(norm(el.textContent).indexOf('instant mode')>-1){el.classList.add('ub-hide-instant-section');el.style.display='none';}});}
  function replaceTextNode(root,matcher,replacement){var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n;while((n=walker.nextNode())){if(matcher.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(matcher,replacement);}}

  function enhanceCard(type,el,c){
    if(!el)return;el.style.display='';el.dataset.ubSessionType=type;el.classList.add('ub-session-enter');
    replaceTextNode(el,/Open Freestyle Battle/i,'Open Freestyle Session');
    replaceTextNode(el,/\d+\s+Artists\s+(in Lobby|Queued|Waiting)/i,c+' Artists Waiting');replaceTextNode(el,/Artists\s+(in Lobby|Queued)/i,'Artists Waiting');
    if(!el.querySelector('[data-ub-live-count="'+type+'"]')){var lobby=el.querySelector('.session-lobby');if(lobby)lobby.innerHTML='<span class="ub-live-count" data-ub-live-count="'+type+'">'+c+' Artists Waiting</span>';}
    if(el.dataset.ubClickReady!=='1'){
      el.dataset.ubClickReady='1';
      el.addEventListener('click',function(ev){var tag=(ev.target&&ev.target.tagName||'').toLowerCase();if(tag==='button'||tag==='a')return;openRoom(type);});
      [].slice.call(el.querySelectorAll('button,a')).forEach(function(btn){var t=norm(btn.textContent);if(t==='join'||t.indexOf('enter')>-1||t.indexOf('live now')>-1){btn.onclick=function(e){e.preventDefault();e.stopPropagation();openRoom(type);};}});
    }
  }

  function updateCount(type,c){[].slice.call(document.querySelectorAll('[data-ub-live-count="'+type+'"]')).forEach(function(x){x.textContent=c+' Artists Waiting';});[].slice.call(document.querySelectorAll('[data-ub-room-count="'+type+'"]')).forEach(function(x){x.textContent=c;});}
  function bump(type,delta){var data=getLocal();data[type]=Math.max(0,Number(data[type]||0)+delta);setLocal(data);updateCount(type,data[type]);}

  function openRoom(type){
    var s=DEFAULTS[type]||DEFAULTS.open;
    try{localStorage.setItem(ACTIVE_KEY,JSON.stringify({type:type,title:s.title,room:s.roomTitle,at:Date.now()}));}catch(e){}
    bump(type,1);
    var page=type==='beatkill'?'beatkill':'openfreestyle';
    if(typeof window.goToPage==='function')window.goToPage(page);else location.hash='#'+page;
  }

  function joinRoom(type){bump(type,1);var s=DEFAULTS[type]||DEFAULTS.open;if(window.showToast)showToast('✅ Entered '+s.roomTitle);}
  function currentCounts(){var local=getLocal();return{open:Number(local.open||0),beatkill:Number(local.beatkill||0)};}
  function forceTopProfileIcon(){var home=document.getElementById('page-home');if(!home)return;[].slice.call(home.querySelectorAll('.top-bar .icon-btn')).forEach(function(btn){if((btn.textContent||'').indexOf('👤')>-1){btn.onclick=function(e){if(e){e.preventDefault();e.stopPropagation();}if(typeof window.goToPage==='function')window.goToPage('profile');return false;};}});}

  function render(){if(!ok())return;css();ensureStandaloneRooms();removeInstantMode();forceTopProfileIcon();var cards=findSessionCards(),counts=currentCounts();enhanceCard('open',cards.open,counts.open);enhanceCard('beatkill',cards.beatkill,counts.beatkill);updateCount('open',counts.open);updateCount('beatkill',counts.beatkill);}
  function wireFirebase(){window.ubHomeSessionsUpdate=function(counts){var data=getLocal();if(typeof counts.open==='number')data.open=counts.open;if(typeof counts.beatkill==='number')data.beatkill=counts.beatkill;setLocal(data);updateCount('open',Number(data.open||0));updateCount('beatkill',Number(data.beatkill||0));};}
  function tickTimers(){var d=new Date();var txt=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');var a=document.getElementById('ubRoomTimer-open');if(a)a.textContent=txt;var b=document.getElementById('ubRoomTimer-beatkill');if(b)b.textContent=txt;}
  function boot(){wireFirebase();render();tickTimers();}
  window.ubHomeSessions={openRoom:openRoom,joinRoom:joinRoom,refresh:render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(render,400);setTimeout(render,1200);setInterval(render,3000);setInterval(tickTimers,1000);
})();