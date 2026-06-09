// unifreestyle-superchat.js
// UniBeatz Production — Super Chat "Drop The Bag" + Bundle system
// Full-screen animations, hip hop culture bundles, Stripe payment

(function(){
  'use strict';

  // ── Stripe Price IDs — fill in after creating products ──
  var PRICES = {
    // Super Chats
    respect:    { id:'price_REPLACE_RESPECT',    amount:1.99,  label:'RESPECT',      emoji:'🤜' },
    showlove:   { id:'price_REPLACE_SHOWLOVE',   amount:4.99,  label:'SHOW LOVE',    emoji:'🔥' },
    runitup:    { id:'price_REPLACE_RUNITUP',    amount:9.99,  label:'RUN IT UP',    emoji:'💰' },
    cakeup:     { id:'price_REPLACE_CAKEUP',     amount:19.99, label:'CAKE UP',      emoji:'💎' },
    dropthebag: { id:'price_REPLACE_DROPTHEBAG', amount:49.99, label:'DROP THE BAG', emoji:'👑' },
    // Bundles
    comeup:     { id:'price_REPLACE_COMEUP',     amount:1.99,  label:'THE COME UP',  emoji:'🌱', bundle:true },
    goldenera:  { id:'price_REPLACE_GOLDENERA',  amount:2.99,  label:'GOLDEN ERA',   emoji:'🥇', bundle:true },
    trapking:   { id:'price_REPLACE_TRAPKING',   amount:3.99,  label:'TRAP KING',    emoji:'👿', bundle:true },
    ciphergod:  { id:'price_REPLACE_CIPHERGOD',  amount:4.99,  label:'CIPHER GOD',   emoji:'🌀', bundle:true },
    streetpoet: { id:'price_REPLACE_STREETPOET', amount:5.99,  label:'STREET POET',  emoji:'✍🏽', bundle:true },
    thedon:     { id:'price_REPLACE_THEDON',     amount:6.99,  label:'THE DON',      emoji:'🎩', bundle:true },
    slanguage:  { id:'price_REPLACE_SLANGUAGE',  amount:7.99,  label:'SLANGUAGE',    emoji:'🗣️', bundle:true },
    warready:   { id:'price_REPLACE_WARREADY',   amount:8.99,  label:'WAR READY',    emoji:'⚔️', bundle:true },
    empire:     { id:'price_REPLACE_EMPIRE',     amount:9.99,  label:'EMPIRE',       emoji:'⚡', bundle:true }
  };

  // Bundle perks definition
  var BUNDLE_PERKS = {
    comeup:    { border:'#40D0FF', glow:'rgba(64,208,255,.6)',  badge:'🌱 THE COME UP',   entrance:'come_up_entrance',    desc:'Hungry newcomer. Grind aesthetic.' },
    goldenera: { border:'#C9A84C', glow:'rgba(201,168,76,.8)',  badge:'🥇 GOLDEN ERA',    entrance:'golden_era_entrance', desc:'90s boom bap. Pete Rock energy.' },
    trapking:  { border:'#9B30FF', glow:'rgba(155,48,255,.7)',  badge:'👿 TRAP KING',     entrance:'trap_king_entrance',  desc:'Atlanta streets. Dark & cold.' },
    ciphergod: { border:'#00C85A', glow:'rgba(0,200,90,.7)',    badge:'🌀 CIPHER GOD',    entrance:'cipher_god_entrance', desc:'The one who never loses a cipher.' },
    streetpoet:{ border:'#FF8C00', glow:'rgba(255,140,0,.7)',   badge:'✍🏽 STREET POET', entrance:'street_poet_entrance',desc:'Words over everything.' },
    thedon:    { border:'#F0C040', glow:'rgba(240,192,64,.9)',  badge:'🎩 THE DON',       entrance:'the_don_entrance',    desc:'Boardroom energy. Power moves.' },
    slanguage: { border:'#FF3C3C', glow:'rgba(255,60,60,.7)',   badge:'🗣️ SLANGUAGE',   entrance:'slanguage_entrance',  desc:'Pure slang culture. Built different.' },
    warready:  { border:'#888',    glow:'rgba(180,180,180,.7)', badge:'⚔️ WAR READY',    entrance:'war_ready_entrance',  desc:'Battle rap legend. Built for war.' },
    empire:    { border:'#F0C040', glow:'rgba(240,192,64,1)',   badge:'⚡ EMPIRE',        entrance:'empire_entrance',     desc:'The whole thing. You built this.' }
  };

  // Super chat visual config
  var SUPERCHAT_STYLES = {
    respect:    { bg:'rgba(64,208,255,.12)',  border:'#40D0FF', size:'1.4rem', duration:3000,  shake:false, rain:false  },
    showlove:   { bg:'rgba(255,140,0,.15)',   border:'#FF8C00', size:'1.8rem', duration:4000,  shake:false, rain:false  },
    runitup:    { bg:'rgba(240,192,64,.2)',   border:'#F0C040', size:'2.2rem', duration:5000,  shake:true,  rain:false  },
    cakeup:     { bg:'rgba(155,48,255,.22)',  border:'#9B30FF', size:'2.8rem', duration:6000,  shake:true,  rain:true   },
    dropthebag: { bg:'rgba(240,192,64,.35)',  border:'#F0C040', size:'3.4rem', duration:8000,  shake:true,  rain:true   }
  };

  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function read(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f||'null'); } }
  function write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function toast(m){ if(window.showToast) window.showToast(m); else console.log('[sc]',m); }

  function getCurrent(){
    return read('ub_current_user',null)||read('ub_user',null)||null;
  }
  function myName(){
    var u=getCurrent(); return String((u&&(u.username||u.name))||'').toLowerCase().replace(/[^a-z0-9_]/g,'');
  }
  function getFb(){
    var fb=window.UB_FIREBASE||{};
    return (fb.db&&fb.collection)?fb:null;
  }

  // ── CSS ──
  function injectCss(){
    if(document.getElementById('ubScCss')) return;
    var s=document.createElement('style'); s.id='ubScCss';
    s.textContent=[
      // Full-screen overlay
      '#ubScOverlay{position:fixed;inset:0;z-index:999998;pointer-events:none;display:flex;align-items:center;justify-content:center;background:transparent;}',
      '#ubScOverlay.active{pointer-events:none;}',
      '.ub-sc-blast{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;}',
      '.ub-sc-bg{position:absolute;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);}',
      '.ub-sc-card{position:relative;z-index:2;text-align:center;padding:24px 32px;border-radius:20px;max-width:85vw;animation:ubScPop .4s cubic-bezier(.34,1.56,.64,1) both;}',
      '.ub-sc-from{font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:3px;color:rgba(240,237,232,.7);margin-bottom:6px;}',
      '.ub-sc-emoji{line-height:1;margin-bottom:8px;animation:ubScBounce .6s ease infinite alternate;}',
      '.ub-sc-label{font-family:Bebas Neue,Arial,sans-serif;letter-spacing:4px;margin-bottom:6px;}',
      '.ub-sc-msg{font-size:1.1rem;color:#fff;line-height:1.4;margin-top:8px;font-family:Rajdhani,Arial,sans-serif;}',
      '.ub-sc-amount{font-family:Bebas Neue,Arial,sans-serif;font-size:1rem;letter-spacing:2px;margin-top:4px;opacity:.8;}',
      '@keyframes ubScPop{from{opacity:0;transform:scale(.5) translateY(40px);}to{opacity:1;transform:scale(1) translateY(0);}}',
      '@keyframes ubScBounce{from{transform:scale(1);}to{transform:scale(1.15);}}',
      '@keyframes ubScShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-8px);}40%{transform:translateX(8px);}60%{transform:translateX(-5px);}80%{transform:translateX(5px);}}',
      // Money rain
      '.ub-sc-rain{position:fixed;inset:0;pointer-events:none;z-index:999997;overflow:hidden;}',
      '.ub-sc-bill{position:absolute;top:-60px;font-size:2rem;animation:ubScFall linear both;opacity:.9;}',
      '@keyframes ubScFall{to{transform:translateY(110vh) rotate(720deg);opacity:0;}}',
      // Super chat button
      '.ub-sc-launch{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:12px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-family:Orbitron,sans-serif;font-size:.5rem;font-weight:900;letter-spacing:1.5px;padding:10px 16px;cursor:pointer;}',
      // Panel
      '#ubScPanel{position:fixed;inset:0;background:rgba(0,0,0,.94);z-index:99998;display:none;flex-direction:column;color:#fff;overflow-y:auto;}',
      '.ub-sc-panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(201,168,76,.3);background:rgba(3,3,5,.98);position:sticky;top:0;z-index:2;}',
      '.ub-sc-panel-title{font-family:Bebas Neue,Arial,sans-serif;font-size:1.8rem;letter-spacing:3px;color:#F0C040;}',
      '.ub-sc-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(64,208,255,.2);}',
      '.ub-sc-tab{padding:12px;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;text-align:center;cursor:pointer;border:0;background:transparent;color:rgba(240,237,232,.5);}',
      '.ub-sc-tab.active{color:#F0C040;border-bottom:2px solid #F0C040;}',
      '.ub-sc-section{padding:16px;}',
      // Super chat tiers
      '.ub-sc-tier{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:14px;border-radius:14px;margin-bottom:10px;cursor:pointer;border:2px solid transparent;transition:all .2s;}',
      '.ub-sc-tier:hover{transform:scale(1.01);}',
      '.ub-sc-tier-emoji{font-size:2rem;line-height:1;}',
      '.ub-sc-tier-name{font-family:Bebas Neue,Arial,sans-serif;font-size:1.4rem;letter-spacing:2px;}',
      '.ub-sc-tier-sub{font-family:Orbitron,sans-serif;font-size:.4rem;letter-spacing:1.5px;opacity:.7;margin-top:2px;}',
      '.ub-sc-tier-price{font-family:Bebas Neue,Arial,sans-serif;font-size:1.5rem;letter-spacing:1px;}',
      // Bundle cards
      '.ub-bundle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:16px;}',
      '.ub-bundle-card{border-radius:16px;padding:16px;cursor:pointer;border:2px solid transparent;transition:all .25s;text-align:center;}',
      '.ub-bundle-card:hover{transform:translateY(-3px);}',
      '.ub-bundle-card.owned{cursor:default;}',
      '.ub-bundle-emoji{font-size:2.6rem;margin-bottom:8px;display:block;}',
      '.ub-bundle-name{font-family:Bebas Neue,Arial,sans-serif;font-size:1.3rem;letter-spacing:2px;color:#F0C040;line-height:1;}',
      '.ub-bundle-desc{font-size:.78rem;color:rgba(240,237,232,.6);margin:6px 0 10px;line-height:1.35;}',
      '.ub-bundle-price{font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:1px;}',
      '.ub-bundle-owned{font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:1.5px;color:#00C85A;margin-top:6px;}',
      // Message input in super chat
      '.ub-sc-msg-input{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(64,208,255,.4);background:#05070d;color:#fff;font-size:.95rem;margin:10px 0;box-sizing:border-box;outline:none;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Full-screen blast animation ──
  function fireBlast(key, from, message){
    var p=PRICES[key]; var style=SUPERCHAT_STYLES[key];
    if(!p||!style) return;

    // Money rain for big ones
    if(style.rain) showMoneyRain();

    var blast=document.createElement('div');
    blast.className='ub-sc-blast';
    blast.innerHTML='<div class="ub-sc-bg"></div>';

    var card=document.createElement('div');
    card.className='ub-sc-card';
    card.style.cssText='background:'+style.bg+';border:2px solid '+style.border+';box-shadow:0 0 60px '+style.border+',0 0 120px '+style.border+'44;';
    if(style.shake) card.style.animation='ubScPop .4s cubic-bezier(.34,1.56,.64,1) both, ubScShake .5s ease .4s';

    card.innerHTML=
      '<div class="ub-sc-from">@'+esc(from)+'</div>'+
      '<div class="ub-sc-emoji" style="font-size:'+style.size+'">'+p.emoji+'</div>'+
      '<div class="ub-sc-label" style="font-size:calc('+style.size+' * .8);color:'+style.border+'">'+p.label+'</div>'+
      (message?'<div class="ub-sc-msg">'+esc(message)+'</div>':'')+
      '<div class="ub-sc-amount" style="color:'+style.border+'">$'+p.amount.toFixed(2)+'</div>';

    blast.appendChild(card);
    document.body.appendChild(blast);

    // Auto-remove
    setTimeout(function(){ blast.style.transition='opacity .5s'; blast.style.opacity='0'; setTimeout(function(){ blast.remove(); },500); }, style.duration);
  }

  function showMoneyRain(){
    var rain=document.createElement('div'); rain.className='ub-sc-rain';
    var emojis=['💰','💵','💸','🤑','💎'];
    for(var i=0;i<30;i++){
      var bill=document.createElement('div'); bill.className='ub-sc-bill';
      bill.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      bill.style.left=Math.random()*100+'vw';
      bill.style.animationDuration=(1.5+Math.random()*2)+'s';
      bill.style.animationDelay=(Math.random()*1.5)+'s';
      bill.style.fontSize=(1.5+Math.random()*2)+'rem';
      rain.appendChild(bill);
    }
    document.body.appendChild(rain);
    setTimeout(function(){ rain.remove(); }, 5000);
  }

  // ── Listen for super chats in current room ──
  var _scUnsub=null;
  var _scLastSeen=Date.now();

  function listenSuperChats(roomName){
    var fb=getFb(); if(!fb) return;
    if(_scUnsub){ try{_scUnsub();}catch(e){} }
    _scLastSeen=Date.now();
    var q=fb.query(
      fb.collection(fb.db,'super_chats'),
      fb.where('room','==',roomName),
      fb.orderBy('at','asc')
    );
    _scUnsub=fb.onSnapshot(q,function(snap){
      snap.docChanges().forEach(function(change){
        if(change.type==='added'){
          var d=change.doc.data();
          if(d.at>_scLastSeen){
            fireBlast(d.tier, d.from, d.message);
          }
        }
      });
    });
  }

  // ── Send super chat ──
  async function sendSuperChat(tier, message, roomName){
    var fb=getFb(); if(!fb) return;
    var me=myName(); if(!me) return toast('Sign in to Drop The Bag');
    var p=PRICES[tier]; if(!p) return;

    // In production this triggers Stripe checkout first
    // For now, write to Firestore and show locally
    // TODO: replace with Stripe checkout session
    await fb.addDoc(fb.collection(fb.db,'super_chats'),{
      from:me, tier:tier, message:message||'', room:roomName||'global',
      amount:p.amount, label:p.label, at:Date.now()
    });
    toast(p.emoji+' '+p.label+' sent!');
    closeSuperChatPanel();
  }

  // ── Bundles — track ownership in Firestore + localStorage ──
  function getOwnedBundles(){
    return read('ub_owned_bundles','[]')||[];
  }

  function ownsBundle(key){
    return getOwnedBundles().indexOf(key)>-1;
  }

  async function unlockBundle(key){
    var me=myName(); if(!me) return toast('Sign in first');
    var owned=getOwnedBundles();
    if(owned.indexOf(key)===-1) owned.push(key);
    write('ub_owned_bundles',owned);
    // Sync to Firestore
    var fb=getFb();
    if(fb) await fb.setDoc(fb.doc(fb.db,'user_bundles',me),{ bundles:owned, updatedAt:Date.now() },{merge:true});
    // Apply bundle perks immediately
    applyBundle(key);
    toast('🔥 '+BUNDLE_PERKS[key].badge+' unlocked!');
  }

  async function loadMyBundles(){
    var fb=getFb(); if(!fb) return;
    var me=myName(); if(!me) return;
    try{
      var snap=await fb.getDoc(fb.doc(fb.db,'user_bundles',me));
      if(snap.exists()){
        var data=snap.data();
        write('ub_owned_bundles',data.bundles||[]);
        // Apply active bundle
        var owned=data.bundles||[];
        if(owned.length) applyBundle(owned[owned.length-1]);
      }
    }catch(e){}
  }

  function applyBundle(key){
    var perks=BUNDLE_PERKS[key]; if(!perks) return;
    write('ub_active_bundle',key);
    // Apply profile border color
    document.querySelectorAll('.ub-cp-avatar').forEach(function(el){
      el.style.border='3px solid '+perks.border;
      el.style.boxShadow='0 0 18px '+perks.glow;
    });
    // Apply to cypher tile if in cypher
    var myName2=myName();
    var tile=document.getElementById('cy-tile-'+myName2);
    if(tile){
      tile.style.borderColor=perks.border;
      tile.style.boxShadow='0 0 20px '+perks.glow;
    }
    // TODO: play entrance sound when audio files added
    // if(perks.entrance && window.ubSounds) ubSounds.play(perks.entrance);
  }

  // ── Panel UI ──
  var _activeTab='superchat';
  var _activeRoom='global';

  function ensurePanel(){
    injectCss();
    var p=document.getElementById('ubScPanel'); if(p) return p;
    p=document.createElement('div'); p.id='ubScPanel';
    p.innerHTML=[
      '<div class="ub-sc-panel-head">',
        '<div class="ub-sc-panel-title">&#9889; DROP THE BAG</div>',
        '<button id="ubScClose" style="border:0;background:transparent;color:#F0C040;font-size:1.5rem;cursor:pointer;line-height:1;">&#215;</button>',
      '</div>',
      '<div class="ub-sc-tabs">',
        '<button class="ub-sc-tab active" id="ubScTabChat" onclick="ubSuperChat.switchTab(\'superchat\')">&#128293; SUPER CHAT</button>',
        '<button class="ub-sc-tab" id="ubScTabBundle" onclick="ubSuperChat.switchTab(\'bundles\')">&#127881; BUNDLES</button>',
      '</div>',
      '<div id="ubScContent"></div>'
    ].join('');
    document.body.appendChild(p);
    p.querySelector('#ubScClose').onclick=closeSuperChatPanel;
    return p;
  }

  function renderSuperChatTab(){
    var content=document.getElementById('ubScContent'); if(!content) return;
    var tiers=[
      {key:'respect',    color:'#40D0FF'},
      {key:'showlove',   color:'#FF8C00'},
      {key:'runitup',    color:'#F0C040'},
      {key:'cakeup',     color:'#9B30FF'},
      {key:'dropthebag', color:'#F0C040'}
    ];
    var html='<div class="ub-sc-section">';
    html+='<div style="font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;color:rgba(240,237,232,.5);margin-bottom:14px;">SEND A SUPER CHAT — FULL SCREEN ON ALL DEVICES</div>';
    html+='<input class="ub-sc-msg-input" id="ubScMsgInput" placeholder="Add a message (optional)..." maxlength="120">';
    tiers.forEach(function(t){
      var p=PRICES[t.key]; var style=SUPERCHAT_STYLES[t.key];
      html+='<div class="ub-sc-tier" onclick="ubSuperChat.buy(\''+t.key+'\')" style="background:'+style.bg+';border-color:'+t.color+';">'+
        '<div class="ub-sc-tier-emoji">'+p.emoji+'</div>'+
        '<div><div class="ub-sc-tier-name" style="color:'+t.color+'">'+p.label+'</div>'+
        '<div class="ub-sc-tier-sub">'+(t.key==='respect'?'SMALL FIRE':t.key==='showlove'?'MEDIUM FIRE':t.key==='runitup'?'BIG FIRE + SHAKE':t.key==='cakeup'?'STACK + RAIN':'BAG DROP + FULL EFFECTS')+'</div></div>'+
        '<div class="ub-sc-tier-price" style="color:'+t.color+'">$'+p.amount.toFixed(2)+'</div>'+
      '</div>';
    });
    html+='</div>';
    content.innerHTML=html;
  }

  function renderBundlesTab(){
    var content=document.getElementById('ubScContent'); if(!content) return;
    var owned=getOwnedBundles();
    var active=read('ub_active_bundle',null);
    var keys=['comeup','goldenera','trapking','ciphergod','streetpoet','thedon','slanguage','warready','empire'];
    var html='<div style="padding:12px 16px;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;color:rgba(240,237,232,.5);">ONE-TIME UNLOCK — PROFILE BORDER + BADGE + ENTRANCE ANIMATION</div>';
    html+='<div class="ub-bundle-grid">';
    keys.forEach(function(key){
      var p=PRICES[key]; var perks=BUNDLE_PERKS[key];
      var isOwned=owned.indexOf(key)>-1;
      var isActive=active===key;
      html+='<div class="ub-bundle-card'+(isOwned?' owned':'')+'" '+
        'style="background:rgba(0,0,0,.4);border-color:'+perks.border+';box-shadow:'+(isActive?'0 0 20px '+perks.glow:'none')+';" '+
        (isOwned?'onclick="ubSuperChat.activateBundle(\''+key+'\')"':'onclick="ubSuperChat.buy(\''+key+'\')"')+'>'+
        '<span class="ub-bundle-emoji">'+p.emoji+'</span>'+
        '<div class="ub-bundle-name">'+p.label+'</div>'+
        '<div class="ub-bundle-desc">'+perks.desc+'</div>'+
        (isOwned?
          '<div class="ub-bundle-owned">'+(isActive?'✅ ACTIVE — TAP TO RE-APPLY':'✅ OWNED — TAP TO EQUIP')+'</div>':
          '<div class="ub-bundle-price" style="color:'+perks.border+'">$'+p.amount.toFixed(2)+' ONE TIME</div>'
        )+
      '</div>';
    });
    html+='</div>';
    content.innerHTML=html;
  }

  function switchTab(tab){
    _activeTab=tab;
    document.querySelectorAll('.ub-sc-tab').forEach(function(t){ t.classList.remove('active'); });
    var activeTabEl=document.getElementById(tab==='superchat'?'ubScTabChat':'ubScTabBundle');
    if(activeTabEl) activeTabEl.classList.add('active');
    if(tab==='superchat') renderSuperChatTab();
    else renderBundlesTab();
  }

  function openSuperChatPanel(roomName){
    _activeRoom=roomName||_activeRoom;
    var p=ensurePanel(); p.style.display='flex';
    switchTab('superchat');
  }

  function closeSuperChatPanel(){
    var p=document.getElementById('ubScPanel'); if(p) p.style.display='none';
  }

  // ── Buy flow ──
  function buy(key){
    var p=PRICES[key]; if(!p) return;
    if(p.bundle){
      if(ownsBundle(key)){ activateBundle(key); return; }
      // Stripe checkout for bundle
      initiateCheckout(key, p.amount, p.label, false);
    } else {
      // Super chat — get message first
      var input=document.getElementById('ubScMsgInput');
      var message=input?input.value.trim():'';
      initiateCheckout(key, p.amount, p.label, true, message);
    }
  }

  function initiateCheckout(key, amount, label, isSuperChat, message){
    var p=PRICES[key];
    // If price ID is set, open Stripe checkout
    if(p.id && p.id.indexOf('REPLACE')===-1){
      // Build Stripe checkout URL
      var params=new URLSearchParams({
        price_id: p.id,
        type: isSuperChat?'superchat':'bundle',
        key: key,
        room: _activeRoom,
        message: message||'',
        username: myName()
      });
      window.open('https://checkout.unibeatzproduction.com/checkout?'+params.toString(),'_blank');
    } else {
      // Price ID not set yet — demo mode
      if(isSuperChat){
        // Fire blast immediately in demo mode
        var me=myName()||'you';
        fireBlast(key, me, message);
        closeSuperChatPanel();
        // Still write to Firestore for others to see
        sendSuperChat(key, message, _activeRoom);
      } else {
        // Bundle demo unlock
        if(confirm('Unlock '+label+' for $'+amount.toFixed(2)+'?\n\n(Stripe not connected yet — this will unlock for demo)')){
          unlockBundle(key);
          closeSuperChatPanel();
        }
      }
    }
  }

  function activateBundle(key){
    if(!ownsBundle(key)) return;
    applyBundle(key);
    write('ub_active_bundle',key);
    closeSuperChatPanel();
    toast('✅ '+BUNDLE_PERKS[key].badge+' equipped!');
  }

  // ── Inject launch button into battle/cypher pages ──
  function injectLaunchBtn(container, roomName){
    if(!container||document.getElementById('ubScLaunchBtn')) return;
    var btn=document.createElement('button');
    btn.id='ubScLaunchBtn';
    btn.className='ub-sc-launch';
    btn.innerHTML='&#128293; DROP THE BAG';
    btn.onclick=function(){ openSuperChatPanel(roomName); };
    container.appendChild(btn);
  }

  // ── Boot ──
  function boot(){
    injectCss();
    loadMyBundles();

    // Re-apply active bundle on load
    var active=read('ub_active_bundle',null);
    if(active) setTimeout(function(){ applyBundle(active); }, 1000);

    // Watch for battle/cypher pages and inject button
    setInterval(function(){
      var battlePage=document.querySelector('#page-battle-live.active, #page-livebattle.active');
      if(battlePage){
        var roleRow=battlePage.querySelector('#ubBattleRoleRow, .battle-controls');
        if(roleRow && !document.getElementById('ubScLaunchBtn')){
          var roomName=(window.ubBattle&&window.ubBattle.modes&&Object.values(window.ubBattle.modes)[0]&&Object.values(window.ubBattle.modes)[0].room)||'battle-room';
          injectLaunchBtn(roleRow, roomName);
          listenSuperChats(roomName);
        }
      }
      var cypherPage=document.querySelector('#page-cypher.active');
      if(cypherPage){
        var joinRow=cypherPage.querySelector('#cyJoinRow, .cy-controls');
        if(joinRow && !document.getElementById('ubScLaunchBtn')){
          injectLaunchBtn(joinRow, 'cypher-main');
          listenSuperChats('cypher-main');
        }
      }
    }, 2000);
  }

  window.ubSuperChat={
    open: openSuperChatPanel,
    close: closeSuperChatPanel,
    buy: buy,
    switchTab: switchTab,
    activateBundle: activateBundle,
    blast: fireBlast,
    listen: listenSuperChats,
    applyBundle: applyBundle
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
  setTimeout(boot,800);

})();
