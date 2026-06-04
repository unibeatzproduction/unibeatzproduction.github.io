// unifreestyle-home-sessions.js
// Home cleanup: remove Instant Mode + make Open Freestyle / Beat Kill counts live.
(function(){
  'use strict';

  var SESSION_KEY='ub_home_session_counts_v1';
  var DEFAULTS={
    open:{id:'open',title:'OPEN FREESTYLE BATTLE',label:'Artists Waiting',count:0},
    beatkill:{id:'beatkill',title:'BEAT KILL SESSION',label:'Artists Waiting',count:0}
  };

  function ok(){return location.pathname.toLowerCase().includes('unifreestyle.html');}
  function log(){var a=[].slice.call(arguments);a.unshift('[home-sessions]');console.log.apply(console,a);}
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
      '.ub-hidden-instant{display:none!important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function findCards(){
    var cards=[];
    var all=[].slice.call(document.querySelectorAll('section,article,div'));
    all.forEach(function(el){
      var txt=norm(el.textContent);
      if(!txt)return;
      if(txt.indexOf('open freestyle battle')>-1 && txt.length<700) cards.push({type:'open',el:el});
      if(txt.indexOf('beat kill session')>-1 && txt.length<700) cards.push({type:'beatkill',el:el});
    });
    // Keep the largest reasonable parent card for each session, not nested duplicates.
    var found={};
    cards.forEach(function(c){
      if(!found[c.type] || c.el.getBoundingClientRect().height>found[c.type].el.getBoundingClientRect().height){found[c.type]=c;}
    });
    return found;
  }

  function removeInstantMode(){
    [].slice.call(document.querySelectorAll('section,article,div')).forEach(function(el){
      var txt=norm(el.textContent);
      if(txt.indexOf('instant mode')>-1 || txt.indexOf('start instant battle')>-1 || txt.indexOf('battle now')>-1){
        if(txt.length<900){el.classList.add('ub-hidden-instant');}
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
    if(!el || el.dataset.ubSessionEnhanced==='1'){
      updateCount(type,count);
      return;
    }
    el.dataset.ubSessionEnhanced='1';
    el.dataset.ubSessionType=type;
    el.classList.add('ub-session-enter');
    replaceTextNode(el,/\d+\s+Artists\s+(in Lobby|Queued|Waiting)/i,count+' Artists Waiting');
    replaceTextNode(el,/Artists\s+(in Lobby|Queued)/i,'Artists Waiting');

    var old=el.querySelector('[data-ub-live-count="'+type+'"]');
    if(!old){
      var target=null;
      [].slice.call(el.querySelectorAll('*')).some(function(x){
        if(/Artists\s+(in Lobby|Queued|Waiting)/i.test(x.textContent||'')){target=x;return true;}
        return false;
      });
      if(target){
        target.innerHTML='<span class="ub-live-count" data-ub-live-count="'+type+'">'+count+' Artists Waiting</span>';
      }
    }

    el.addEventListener('click',function(ev){
      var tag=(ev.target&&ev.target.tagName||'').toLowerCase();
      if(tag==='button' || tag==='a') return;
      enterSession(type);
    });

    [].slice.call(el.querySelectorAll('button,a')).forEach(function(btn){
      var t=norm(btn.textContent);
      if(t==='join' || t.indexOf('enter')>-1 || t.indexOf('live now')>-1){
        btn.onclick=function(e){e.preventDefault();enterSession(type);};
      }
    });
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

  function render(){
    if(!ok())return;
    css();
    removeInstantMode();
    var cards=findCards();
    var counts=currentCounts();
    if(cards.open) enhanceCard('open',cards.open.el,counts.open);
    if(cards.beatkill) enhanceCard('beatkill',cards.beatkill.el,counts.beatkill);
  }

  function wireFirebase(){
    // Optional hook: if another script exposes Firebase counts later, this module will use them.
    window.ubHomeSessionsUpdate=function(counts){
      var data=getLocal();
      if(typeof counts.open==='number') data.open=counts.open;
      if(typeof counts.beatkill==='number') data.beatkill=counts.beatkill;
      setLocal(data);
      updateCount('open',Number(data.open||0));
      updateCount('beatkill',Number(data.beatkill||0));
    };
  }

  function boot(){wireFirebase();render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(render,600);
  setTimeout(render,1600);
  setInterval(render,3000);
})();