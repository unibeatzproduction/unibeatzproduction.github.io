// unifreestyle-live-chat.js
// UniFreestyle Phase 2: Twitch-style live chat foundation.
// Chat now locks to actual live sessions: profile live, battle live, cypher live, practice live.
(function(){
  'use strict';

  var st = { fb:null, db:null, unsub:null, activeRoom:null, slow:false, lastSend:0, live:false, mode:'offline' };

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(window.showToast) window.showToast(msg); else console.log('[live-chat]', msg); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function user(){ try{ var raw=localStorage.getItem('ub_current_user')||localStorage.getItem('ub_user'); return raw?JSON.parse(raw):{}; }catch(e){ return {}; } }
  function uname(){ var u=user(); return u.username || u.name || 'guest_'+Math.floor(Math.random()*9999); }
  function role(){ var u=user(); return u.role || 'viewer'; }

  async function fb(){
    if(st.fb && st.db) return st;
    if(!window.UB_FIREBASE || !window.UB_FIREBASE.app) throw new Error('Firebase not ready');
    st.fb = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    st.db = st.fb.getFirestore(window.UB_FIREBASE.app);
    return st;
  }

  function injectCss(){
    if(document.getElementById('ubLiveChatCss')) return;
    var css=document.createElement('style');
    css.id='ubLiveChatCss';
    css.textContent=[
      '.ub-live-chat-launch{position:fixed;right:18px;bottom:96px;z-index:9998;width:48px;height:48px;border-radius:50%;border:1px solid rgba(64,208,255,.6);background:rgba(8,8,15,.78);backdrop-filter:blur(10px);color:#40D0FF;display:flex;align-items:center;justify-content:center;font-size:1.25rem;box-shadow:0 0 18px rgba(64,208,255,.18);cursor:pointer;}',
      '.ub-live-chat-launch.offline{opacity:.45;filter:grayscale(.5);}',
      '.ub-live-chat-panel{position:fixed;right:14px;bottom:150px;z-index:9999;width:min(360px,calc(100vw - 28px));height:min(520px,calc(100dvh - 190px));display:none;flex-direction:column;border:1px solid rgba(201,168,76,.45);border-radius:16px;background:rgba(3,3,5,.94);backdrop-filter:blur(12px);box-shadow:0 20px 60px rgba(0,0,0,.55);overflow:hidden;color:#fff;}',
      '.ub-live-chat-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(64,208,255,.25);background:linear-gradient(90deg,rgba(201,168,76,.10),rgba(64,208,255,.08));}',
      '.ub-live-chat-title{font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;color:#40D0FF;}',
      '.ub-live-chat-room{font-family:Bebas Neue,sans-serif;font-size:1.15rem;letter-spacing:1.5px;color:#F0C040;line-height:1;}',
      '.ub-live-chat-close{border:0;background:transparent;color:#F0C040;font-size:1.1rem;cursor:pointer;}',
      '.ub-live-chat-feed{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}',
      '.ub-chat-msg{padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055);font-size:.88rem;line-height:1.25;}',
      '.ub-chat-meta{display:flex;align-items:center;gap:6px;margin-bottom:2px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:1.2px;color:#40D0FF;}',
      '.ub-chat-role{color:#F0C040;}',
      '.ub-chat-text{color:rgba(240,237,232,.9);word-break:break-word;}',
      '.ub-chat-offline{margin:auto;padding:18px;text-align:center;color:rgba(240,237,232,.72);font-size:.92rem;line-height:1.45;}',
      '.ub-chat-offline b{display:block;font-family:Bebas Neue,sans-serif;font-size:1.45rem;letter-spacing:2px;color:#F0C040;margin-bottom:7px;}',
      '.ub-chat-super{border-color:rgba(240,192,64,.7);background:linear-gradient(135deg,rgba(240,192,64,.18),rgba(64,208,255,.08));box-shadow:0 0 16px rgba(240,192,64,.18);}',
      '.ub-live-chat-emoji{display:flex;gap:6px;padding:7px 10px;border-top:1px solid rgba(255,255,255,.05);overflow-x:auto;}',
      '.ub-live-chat-emoji button{flex:0 0 auto;border:1px solid rgba(201,168,76,.25);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 9px;font-size:1rem;cursor:pointer;}',
      '.ub-live-chat-input{display:grid;grid-template-columns:1fr auto;gap:7px;padding:10px;border-top:1px solid rgba(64,208,255,.18);}',
      '.ub-live-chat-input input{background:#05070d;border:1px solid rgba(64,208,255,.45);border-radius:10px;color:#fff;padding:10px;outline:none;}',
      '.ub-live-chat-input button{border:0;border-radius:10px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.52rem;font-weight:900;letter-spacing:1.5px;padding:0 12px;cursor:pointer;}',
      '.ub-live-chat-input.disabled input{opacity:.5;pointer-events:none;}',
      '.ub-live-chat-input.disabled button{opacity:.5;pointer-events:none;}',
      '.ub-live-reaction{position:fixed;right:32px;bottom:160px;z-index:10000;font-size:1.8rem;animation:ubFloat 1.35s ease-out forwards;pointer-events:none;text-shadow:0 0 12px rgba(64,208,255,.55);}',
      '@keyframes ubFloat{0%{transform:translateY(0) scale(.8);opacity:0}12%{opacity:1}100%{transform:translateY(-140px) scale(1.35);opacity:0}}',
      '@media(max-width:600px){.ub-live-chat-panel{left:10px;right:10px;bottom:92px;width:auto;height:min(450px,calc(100dvh - 130px));}.ub-live-chat-launch{bottom:86px;right:14px;width:46px;height:46px;}}'
    ].join('');
    document.head.appendChild(css);
  }

  async function isProfileLive(username){
    await fb();
    var snap = await st.fb.getDoc(st.fb.doc(st.db,'live_profiles',username));
    return snap.exists() && snap.data() && snap.data().isLive === true;
  }

  function isBattleLive(){
    if(window.ubBattleLiveKit && window.ubBattleLiveKit.state && window.ubBattleLiveKit.state.connected) return true;
    if(window.ubBattleModes && document.getElementById('page-battle-live') && document.getElementById('page-battle-live').classList.contains('active')) return true;
    if(window.location.hash && window.location.hash.toLowerCase().indexOf('live')>-1) return true;
    return false;
  }

  function isCypherLive(){
    var active=document.querySelector('.page.active');
    if(active && /cypher/i.test(active.textContent || '')) return true;
    if(document.body && /CYPHER ROOM/i.test(document.body.textContent || '') && document.querySelector('[id*="cy"], [class*="cypher"]')) return true;
    return false;
  }

  async function resolveLiveRoom(room){
    var active=document.querySelector('.page.active');
    var id=active ? active.id : 'home';
    var clean = function(s){ return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_'); };
    if(room) return { live:true, room:clean(room), label:clean(room).replace(/_/g,' ').toUpperCase(), mode:'manual' };

    if(id==='page-battle-live' || isBattleLive()) return { live:true, room:'battle_live', label:'BATTLE LIVE', mode:'battle' };
    if(isCypherLive()) return { live:true, room:'cypher_live', label:'CYPHER LIVE', mode:'cypher' };
    if(id==='page-practice') return { live:true, room:'practice_'+clean(uname()), label:'PRACTICE LIVE', mode:'practice' };

    if(id==='page-profile'){
      var target=uname();
      var live=await isProfileLive(target);
      return { live:live, room:'profile_'+clean(target), label: live ? 'PROFILE LIVE '+target.toUpperCase() : 'PROFILE OFFLINE', mode:'profile' };
    }

    return { live:false, room:'offline', label:'OFFLINE', mode:'offline' };
  }

  function ensurePanel(){
    injectCss();
    var launch=document.getElementById('ubLiveChatLaunch');
    if(!launch){
      launch=document.createElement('button');
      launch.id='ubLiveChatLaunch';
      launch.className='ub-live-chat-launch offline';
      launch.innerHTML='💬';
      launch.onclick=function(){ toggleChat(); };
      document.body.appendChild(launch);
    }
    var panel=document.getElementById('ubLiveChatPanel');
    if(panel) return panel;
    panel=document.createElement('div');
    panel.id='ubLiveChatPanel';
    panel.className='ub-live-chat-panel';
    panel.innerHTML='<div class="ub-live-chat-head"><div><div class="ub-live-chat-title">LIVE CHAT</div><div class="ub-live-chat-room" id="ubLiveChatRoom">OFFLINE</div></div><button class="ub-live-chat-close" id="ubLiveChatClose">×</button></div><div class="ub-live-chat-feed" id="ubLiveChatFeed"></div><div class="ub-live-chat-emoji"><button data-emoji="🔥">🔥</button><button data-emoji="⚡">⚡</button><button data-emoji="👑">👑</button><button data-emoji="🎤">🎤</button><button data-emoji="💎">💎</button><button data-emoji="😂">😂</button><button data-emoji="👏">👏</button></div><div class="ub-live-chat-input disabled" id="ubLiveChatInputRow"><input id="ubLiveChatInput" maxlength="220" placeholder="Chat unlocks when live..."><button id="ubLiveChatSend">SEND</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#ubLiveChatClose').onclick=function(){ panel.style.display='none'; };
    panel.querySelector('#ubLiveChatSend').onclick=function(){ sendFromInput(); };
    panel.querySelector('#ubLiveChatInput').addEventListener('keydown',function(e){ if(e.key==='Enter') sendFromInput(); });
    panel.querySelectorAll('[data-emoji]').forEach(function(btn){ btn.onclick=function(){ sendReaction(btn.dataset.emoji); }; });
    return panel;
  }

  async function toggleChat(room){
    var panel=ensurePanel();
    if(panel.style.display==='flex'){ panel.style.display='none'; return; }
    panel.style.display='flex';
    await open(room);
  }

  function setUiLive(live,label){
    st.live=!!live;
    var title=document.getElementById('ubLiveChatRoom');
    if(title) title.textContent=label || (live?'LIVE':'OFFLINE');
    var row=document.getElementById('ubLiveChatInputRow');
    var input=document.getElementById('ubLiveChatInput');
    if(row) row.classList.toggle('disabled',!live);
    if(input) input.placeholder = live ? 'Say something live...' : 'Chat unlocks when the session is live...';
    var launch=document.getElementById('ubLiveChatLaunch');
    if(launch) launch.classList.toggle('offline',!live);
  }

  async function open(room){
    await fb();
    var res=await resolveLiveRoom(room);
    st.activeRoom=res.room;
    st.mode=res.mode;
    setUiLive(res.live,res.label);
    if(st.unsub) try{ st.unsub(); }catch(e){}
    var feed=document.getElementById('ubLiveChatFeed');
    if(!res.live){
      if(feed) feed.innerHTML='<div class="ub-chat-offline"><b>OFFLINE</b>This chat is locked until the creator, battle, cypher, or practice session goes live.</div>';
      return;
    }
    var q=st.fb.query(st.fb.collection(st.db,'live_chats',res.room,'messages'),st.fb.orderBy('at','asc'),st.fb.limit(80));
    st.unsub=st.fb.onSnapshot(q,function(snap){ render(snap); });
  }

  function render(snap){
    var feed=document.getElementById('ubLiveChatFeed');
    if(!feed) return;
    feed.innerHTML='';
    snap.forEach(function(d){
      var m=d.data();
      var row=document.createElement('div');
      row.className='ub-chat-msg'+(m.type==='superchat'?' ub-chat-super':'');
      row.innerHTML='<div class="ub-chat-meta"><span>'+esc(m.from||'guest')+'</span><span class="ub-chat-role">'+esc(m.role||'viewer')+'</span></div><div class="ub-chat-text">'+esc(m.text||'')+'</div>';
      feed.appendChild(row);
    });
    feed.scrollTop=feed.scrollHeight;
  }

  async function send(text,type){
    await fb();
    if(!st.live){ toast('Chat unlocks when session is live'); return; }
    var now=Date.now();
    if(st.slow && now-st.lastSend<5000){ toast('Slow mode: wait a few seconds'); return; }
    text=String(text||'').trim();
    if(!text) return;
    var room=st.activeRoom;
    st.lastSend=now;
    await st.fb.addDoc(st.fb.collection(st.db,'live_chats',room,'messages'),{ from:uname(), role:role(), text:text, type:type||'chat', at:now });
  }

  function sendFromInput(){
    var input=document.getElementById('ubLiveChatInput');
    if(!input) return;
    var val=input.value;
    input.value='';
    send(val,'chat');
  }

  function floatEmoji(e){
    if(!st.live){ toast('Reactions unlock when live'); return; }
    var el=document.createElement('div');
    el.className='ub-live-reaction';
    el.textContent=e;
    el.style.right=(24+Math.random()*70)+'px';
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); },1500);
  }

  async function sendReaction(emoji){
    if(!st.live){ toast('Reactions unlock when live'); return; }
    floatEmoji(emoji);
    await send(emoji,'reaction');
  }

  async function refreshLiveIndicator(){
    try{
      var res=await resolveLiveRoom();
      var launch=document.getElementById('ubLiveChatLaunch');
      if(launch) launch.classList.toggle('offline',!res.live);
      if(document.getElementById('ubLiveChatPanel') && document.getElementById('ubLiveChatPanel').style.display==='flex') await open();
    }catch(e){}
  }

  function boot(){
    if(!ok()) return;
    ensurePanel();
    refreshLiveIndicator();
  }

  window.ubLiveChat={ open:open, toggle:toggleChat, send:send, reaction:sendReaction, slow:function(on){st.slow=!!on;}, refresh:refreshLiveIndicator };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  setTimeout(boot,800);
  setInterval(refreshLiveIndicator,5000);
})();