// unifreestyle-cypher-fix.js
// Stable Freestyle fixes only: visible Cypher card + Home Join Battle routes to queue + Cypher role buttons + DJ panel.

(function(){
  function isFreestylePage(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }

  function goPageSafe(page){
    if(typeof window.goToPage === 'function') return window.goToPage(page);
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    var el = document.getElementById('page-' + page);
    if(el) el.classList.add('active');
  }

  function showMsg(msg){
    if(typeof window.showToast === 'function') window.showToast(msg);
    var tip = document.getElementById('cyTip');
    if(tip) tip.innerHTML = '<strong>' + msg + '</strong>';
  }

  function getCypherRoot(){
    var byId = document.getElementById('page-cypher');
    if(byId) return byId;
    var candidates = Array.from(document.querySelectorAll('.page.active, .page, main, body'));
    return candidates.find(function(el){ return (el.textContent || '').toLowerCase().includes('join as artist') && (el.textContent || '').toLowerCase().includes('join as dj'); }) || document.body;
  }

  function openCypherRoom(){ goPageSafe('cypher'); setTimeout(bindCypherButtons, 250); }
  window.openCypherRoom = openCypherRoom;

  function updateSessionTitle(name){
    window.ubCypherSessionName = name;
    Array.from(document.querySelectorAll('*')).forEach(function(el){
      var t = (el.textContent || '').trim().toLowerCase();
      if(t === 'on the mic' || t === 'turn order' || t.includes('waiting for artists to join')) return;
    });
    var title = document.getElementById('ubCypherSessionTitle');
    if(title) title.textContent = name;
    showMsg('✅ Session renamed: ' + name);
  }

  window.renameCypherSession = function(){
    var current = window.ubCypherSessionName || 'Open Cypher Session';
    var next = prompt('Rename Cypher Session:', current);
    if(!next) return;
    updateSessionTitle(next.trim());
  };

  function ensureSessionTitle(){
    var root = getCypherRoot();
    if(!root || document.getElementById('ubCypherSessionHeader')) return;
    var box = document.createElement('div');
    box.id = 'ubCypherSessionHeader';
    box.style.cssText = 'margin:10px auto 12px;max-width:780px;padding:10px 14px;border:1px solid rgba(64,208,255,.35);border-radius:10px;background:rgba(0,170,255,.08);color:#fff;font-family:Rajdhani,Arial,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:10px;';
    box.innerHTML = '<div><div style="font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#40D0FF;margin-bottom:3px;">CYPHER SESSION</div><div id="ubCypherSessionTitle" style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.35rem;letter-spacing:2px;color:#F0C040;line-height:1;">' + (window.ubCypherSessionName || 'Open Cypher Session') + '</div></div><button id="ubRenameCypherBtn" style="padding:8px 12px;border-radius:8px;border:1px solid #C9A84C;background:rgba(201,168,76,.16);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.5px;cursor:pointer;">RENAME</button>';
    var target = root.querySelector('.page-body') || root;
    target.insertBefore(box, target.firstChild);
    box.querySelector('#ubRenameCypherBtn').addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); window.renameCypherSession(); }, true);
  }

  function ensureDjPanel(){
    var root = getCypherRoot();
    if(!root || document.getElementById('ubCypherDjPanel')) return;
    var panel = document.createElement('div');
    panel.id = 'ubCypherDjPanel';
    panel.style.cssText = 'display:none;margin:12px auto 16px;max-width:780px;padding:14px;border:1px solid rgba(201,168,76,.55);border-radius:12px;background:linear-gradient(135deg,rgba(201,168,76,.12),rgba(0,170,255,.08));box-shadow:0 14px 32px rgba(0,0,0,.35);color:#fff;font-family:Rajdhani,Arial,sans-serif;';
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;"><div><div style="font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#40D0FF;">DJ CONTROL PANEL</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.4rem;letter-spacing:2px;color:#F0C040;">SWITCH CYPHER BEATS</div></div><button id="ubCypherSkipTurn" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(64,208,255,.7);background:rgba(64,208,255,.12);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.5px;cursor:pointer;">SKIP TURN</button></div><div id="ubCypherCurrentBeat" style="padding:9px 10px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);margin-bottom:10px;color:rgba(240,237,232,.82);">Current Beat: <strong style="color:#F0C040;">UBP Battle Beat 1</strong></div><div id="ubCypherBeatGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;"></div>';
    var target = root.querySelector('.page-body') || root;
    target.appendChild(panel);

    var beats = ['UBP Battle Beat 1','Trap Pressure','Boom Bap Heat','R&B Smoke','Drill Energy','Afro Bounce'];
    var grid = panel.querySelector('#ubCypherBeatGrid');
    beats.forEach(function(beat){
      var btn = document.createElement('button');
      btn.textContent = beat;
      btn.style.cssText = 'padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.4);background:rgba(0,0,0,.28);color:#fff;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1px;cursor:pointer;';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        window.ubCypherBeat = beat;
        panel.querySelector('#ubCypherCurrentBeat').innerHTML = 'Current Beat: <strong style="color:#F0C040;">' + beat + '</strong>';
        showMsg('🎧 DJ switched beat: ' + beat);
      }, true);
      grid.appendChild(btn);
    });
    panel.querySelector('#ubCypherSkipTurn').addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); showMsg('⏭️ DJ skipped to next cypher turn.'); }, true);
  }

  function showDjPanel(){
    ensureSessionTitle();
    ensureDjPanel();
    var panel = document.getElementById('ubCypherDjPanel');
    if(panel) panel.style.display = 'block';
  }

  window.joinCypher = function(role){
    var clean = String(role || 'artist').toLowerCase();
    window.ubCypherRole = clean;
    document.body.setAttribute('data-cypher-role', clean);
    ensureSessionTitle();
    if(clean === 'dj') { showDjPanel(); showMsg('🎧 Joined Cypher as DJ. DJ controls ready.'); }
    else if(clean === 'watch') showMsg('👀 Watch Only mode active.');
    else showMsg('🎤 Joined Cypher as Artist. Waiting for turn.');
  };

  function makeCypherCard(id){
    var card = document.createElement('div');
    card.id = id;
    card.setAttribute('role','button');
    card.onclick = openCypherRoom;
    card.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;min-height:96px!important;height:auto!important;margin:16px 0 18px!important;padding:16px!important;border-radius:14px!important;border:1px solid rgba(201,168,76,.65)!important;background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(0,170,255,.13))!important;box-shadow:0 18px 40px rgba(0,0,0,.38),0 0 18px rgba(0,170,255,.14)!important;cursor:pointer!important;overflow:visible!important;position:relative!important;z-index:40!important;color:#fff!important;';
    card.innerHTML = '<div style="display:flex!important;align-items:center!important;gap:14px!important;width:100%!important;min-height:64px!important;"><div style="font-size:2.4rem!important;line-height:1!important;flex:0 0 auto!important;">🌀</div><div style="flex:1!important;min-width:0!important;"><div style="display:inline-block!important;margin-bottom:7px!important;padding:4px 9px!important;border-radius:999px!important;border:1px solid #40D0FF!important;color:#40D0FF!important;font-family:Orbitron,sans-serif!important;font-size:.48rem!important;letter-spacing:2px!important;font-weight:900!important;line-height:1!important;">NEW MODE · LIVE</div><div style="display:block!important;color:#F0C040!important;font-family:Bebas Neue,Arial,sans-serif!important;font-size:1.65rem!important;letter-spacing:2px!important;line-height:1.05!important;">CYPHER ROOM</div><div style="display:block!important;color:rgba(240,237,232,.78)!important;font-size:.86rem!important;line-height:1.35!important;margin-top:5px!important;">Multi-artist freestyle circle · 60-sec turns · DJ controls rotation</div></div><div style="font-size:1.55rem!important;color:#C9A84C!important;flex:0 0 auto!important;">→</div></div>';
    return card;
  }

  function fixHomeJoinBattleRouting(){
    var home = document.getElementById('page-home');
    if(!home) return;
    var joinBtn = home.querySelector('.home-action-row .btn-gold');
    if(!joinBtn) return;
    joinBtn.removeAttribute('onclick');
    joinBtn.onclick = null;
    if(joinBtn.dataset.ubJoinFixed !== 'yes') {
      joinBtn.dataset.ubJoinFixed = 'yes';
      joinBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); goPageSafe('queue'); return false; }, true);
    }
  }

  function injectHomeCypherLauncher(){
    var homeBody = document.querySelector('#page-home .page-body');
    if(!homeBody) return;
    var old = document.getElementById('ub-cypher-home-launch');
    if(old) old.remove();
    var card = makeCypherCard('ub-cypher-home-launch');
    var actionRow = homeBody.querySelector('.home-action-row');
    if(actionRow) actionRow.insertAdjacentElement('afterend', card);
    else homeBody.insertBefore(card, homeBody.firstChild);
  }

  function injectQueueCypherLauncher(){
    var queueBody = document.querySelector('#page-queue .page-body');
    if(!queueBody) return;
    var old = document.getElementById('ub-cypher-queue-launch');
    if(old) old.remove();
    var card = makeCypherCard('ub-cypher-queue-launch');
    queueBody.insertBefore(card, queueBody.firstChild);
  }

  function bindCypherButtons(){
    if(!isFreestylePage()) return;
    ensureSessionTitle();
    var buttons = Array.from(document.querySelectorAll('button, .btn, [role="button"]'));
    buttons.forEach(function(btn){
      var txt = (btn.textContent || '').toLowerCase().replace(/\s+/g,' ').trim();
      if(txt.includes('rename session')) {
        if(btn.dataset.ubRenameFixed === 'yes') return;
        btn.dataset.ubRenameFixed = 'yes';
        btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); window.renameCypherSession(); return false; }, true);
        return;
      }
      var role = null;
      if(txt.includes('join as artist')) role = 'artist';
      if(txt.includes('join as dj')) role = 'dj';
      if(txt.includes('watch only')) role = 'watch';
      if(!role || btn.dataset.ubCypherRoleFixed === 'yes') return;
      btn.dataset.ubCypherRoleFixed = 'yes';
      btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); window.joinCypher(role); return false; }, true);
    });
    if(window.ubCypherRole === 'dj') showDjPanel();
  }

  function runFix(){
    if(!isFreestylePage()) return;
    fixHomeJoinBattleRouting();
    injectHomeCypherLauncher();
    injectQueueCypherLauncher();
    bindCypherButtons();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runFix);
  else runFix();
  setInterval(bindCypherButtons, 1200);
  setTimeout(runFix, 400);
  setTimeout(runFix, 1000);
  setTimeout(runFix, 2200);
  setTimeout(runFix, 4500);
})();
