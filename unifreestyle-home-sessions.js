// unifreestyle-home-sessions.js
// Home cleanup: remove Instant Mode safely + live counts + top profile icon guard.
(function(){
  'use strict';

  var SESSION_KEY='ub_home_session_counts_v1';
  var DEFAULTS={
    open:{id:'open',title:'OPEN FREESTYLE BATTLE',label:'Artists Waiting',count:0},
    beatkill:{id:'beatkill',title:'BEAT KILL SESSION',label:'Artists Waiting',count:0}
  };

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function getLocal(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'{}');}catch(e){return {};}}
  function setLocal(v){try{localStorage.setItem(SESSION_KEY,JSON.stringify(v));}catch(e){}}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();}

  function css(){
    if(document.getElementById('ubHomeSessionsCss'))return;
    var s=document.createElement('style');
    s.id='ubHomeSessionsCss';
    s.textContent=[
      '.ub-live-count{color:#23d36b!important;font-weight:900!important;letter-spacing:2px!important;}',
      '.ub-live-count::before{content:"⚡ ";}',
      '.ub-session-enter{cursor:pointer!important;}',
      '.ub-session-enter:hover{filter:brightness(1.12)!important;}',
      '#page-home .instant-card,#page-home .ub-hide-instant-section{display:none!important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function findSessionCards(){
    return {
      open:document.querySelector('#page-home .session-card.live') || findByTitle('open freestyle battle'),
      beatkill:document.querySelector('#page-home .session-card.upcoming') || findByTitle('beat kill session')
    };
  }

  function findByTitle(title){
    var all=[].slice.call(document.querySelectorAll('#page-home .session-card,#page-home div'));
    for(var i=0;i<all.length;i++){
      var txt=norm(all[i].textContent);
      if(txt.indexOf(title)>-1 && txt.length<500) return all[i].closest('.session-card') || all[i];
    }
    return null;
  }

  function removeInstantMode(){
    var home=document.getElementById('page-home');
    if(!home)return;
    var instant=home.querySelector('.instant-card');
    if(instant) instant.style.display='none';
    [].slice.call(home.querySelectorAll('.section-head')).forEach(function(el){
      if(norm(el.textContent).indexOf('instant mode')>-1){
        el.classList.add('ub-hide-instant-section');
        el.style.display='none';
      }
    });
  }

  function replaceTextNode(root, matcher, replacement){
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
    var n;
    while((n=walker.nextNode())){
      if(matcher.test(n.nodeValue)) n.nodeValue=n.nodeValue.replace(matcher,replacement);
    }
  }

  function enhanceCard(type,el,count){
    if(!el)return;
    el.style.display='';
    el.dataset.ubSessionType=type;
    el.classList.add('ub-session-enter');
    replaceTextNode(el,/\d+\s+Artists\s+(in Lobby|Queued|Waiting)/i,count+' Artists Waiting');
    replaceTextNode(el,/Artists\s+(in Lobby|Queued)/i,'Artists Waiting');

    var target=el.querySelector('[data-ub-live-count="'+type+'"]');
    if(!target){
      var lobby=el.querySelector('.session-lobby');
      if(lobby){
        lobby.innerHTML='<span class="ub-live-count" data-ub-live-count="'+type+'">'+count+' Artists Waiting</span>';
      }
    }

    if(el.dataset.ubClickReady!=='1'){
      el.dataset.ubClickReady='1';
      el.addEventListener('click',function(ev){
        var tag=(ev.target&&ev.target.tagName||'').toLowerCase();
        if(tag==='button'||tag==='a')return;
        enterSession(type);
      });
      [].slice.call(el.querySelectorAll('button,a')).forEach(function(btn){
        var t=norm(btn.textContent);
        if(t==='join'||t.indexOf('enter')>-1||t.indexOf('live now')>-1){
          btn.onclick=function(e){e.preventDefault();e.stopPropagation();enterSession(type);};
        }
      });
    }
  }

  function updateCount(type,count){
    [].slice.call(document.querySelectorAll('[data-ub-live-count="'+type+'"]')).forEach(function(x){
      x.textContent=count+' Artists Waiting';
    });
  }

  function enterSession(type){
    var session=DEFAULTS[type]||DEFAULTS.open;
    try{localStorage.setItem('ub_selected_home_session',JSON.stringify({type:type,title:session.title,at:Date.now()}));}catch(e){}
    bump(type,1);
    if(typeof window.goToPage==='function') window.goToPage('queue');
    else location.hash='#queue';
  }

  function bump(type,delta){
    var data=getLocal();
    data[type]=Math.max(0,Number(data[type]||0)+delta);
    setLocal(data);
    updateCount(type,data[type]);
  }

  function currentCounts(){
    var local=getLocal();
    return {open:Number(local.open||0),beatkill:Number(local.beatkill||0)};
  }

  function forceTopProfileIcon(){
    var home=document.getElementById('page-home');
    if(!home)return;
    [].slice.call(home.querySelectorAll('.top-bar .icon-btn')).forEach(function(btn){
      if((btn.textContent||'').indexOf('👤')>-1){
        btn.onclick=function(e){
          if(e){e.preventDefault();e.stopPropagation();}
          if(typeof window.goToPage==='function') window.goToPage('profile');
          return false;
        };
      }
    });
  }

  function render(){
    if(!ok())return;
    css();
    removeInstantMode();
    forceTopProfileIcon();
    var cards=findSessionCards();
    var counts=currentCounts();
    enhanceCard('open',cards.open,counts.open);
    enhanceCard('beatkill',cards.beatkill,counts.beatkill);
  }

  function wireFirebase(){
    window.ubHomeSessionsUpdate=function(counts){
      var data=getLocal();
      if(typeof counts.open==='number')data.open=counts.open;
      if(typeof counts.beatkill==='number')data.beatkill=counts.beatkill;
      setLocal(data);
      updateCount('open',Number(data.open||0));
      updateCount('beatkill',Number(data.beatkill||0));
    };
  }

  function boot(){wireFirebase();render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(render,400);
  setTimeout(render,1200);
  setInterval(render,3000);
})();