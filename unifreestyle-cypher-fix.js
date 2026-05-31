// unifreestyle-cypher-fix.js
// Stable Freestyle fixes only: visible Cypher card + Home Join Battle routes to queue + Cypher role buttons.

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

  function openCypherRoom(){ goPageSafe('cypher'); }
  window.openCypherRoom = openCypherRoom;

  window.joinCypher = function(role){
    var clean = String(role || 'artist').toLowerCase();
    window.ubCypherRole = clean;
    document.body.setAttribute('data-cypher-role', clean);
    if(clean === 'dj') showMsg('🎧 Joined Cypher as DJ. DJ controls ready.');
    else if(clean === 'watch') showMsg('👀 Watch Only mode active.');
    else showMsg('🎤 Joined Cypher as Artist. Waiting for turn.');
  };

  function makeCypherCard(id){
    var card = document.createElement('div');
    card.id = id;
    card.setAttribute('role','button');
    card.onclick = openCypherRoom;
    card.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;min-height:96px!important;height:auto!important;margin:16px 0 18px!important;padding:16px!important;border-radius:14px!important;border:1px solid rgba(201,168,76,.65)!important;background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(0,170,255,.13))!important;box-shadow:0 18px 40px rgba(0,0,0,.38),0 0 18px rgba(0,170,255,.14)!important;cursor:pointer!important;overflow:visible!important;position:relative!important;z-index:40!important;color:#fff!important;';
    card.innerHTML = '<div style="display:flex!important;align-items:center!important;gap:14px!important;width:100%!important;min-height:64px!important;">' +
      '<div style="font-size:2.4rem!important;line-height:1!important;flex:0 0 auto!important;">🌀</div>' +
      '<div style="flex:1!important;min-width:0!important;">' +
        '<div style="display:inline-block!important;margin-bottom:7px!important;padding:4px 9px!important;border-radius:999px!important;border:1px solid #40D0FF!important;color:#40D0FF!important;font-family:Orbitron,sans-serif!important;font-size:.48rem!important;letter-spacing:2px!important;font-weight:900!important;line-height:1!important;">NEW MODE · LIVE</div>' +
        '<div style="display:block!important;color:#F0C040!important;font-family:Bebas Neue,Arial,sans-serif!important;font-size:1.65rem!important;letter-spacing:2px!important;line-height:1.05!important;">CYPHER ROOM</div>' +
        '<div style="display:block!important;color:rgba(240,237,232,.78)!important;font-size:.86rem!important;line-height:1.35!important;margin-top:5px!important;">Multi-artist freestyle circle · 60-sec turns · DJ controls rotation</div>' +
      '</div>' +
      '<div style="font-size:1.55rem!important;color:#C9A84C!important;flex:0 0 auto!important;">→</div>' +
    '</div>';
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
      joinBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        goPageSafe('queue');
        return false;
      }, true);
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
    var buttons = Array.from(document.querySelectorAll('button, .btn, [role="button"'));
    buttons.forEach(function(btn){
      var txt = (btn.textContent || '').toLowerCase().replace(/\s+/g,' ').trim();
      var role = null;
      if(txt.includes('join as artist')) role = 'artist';
      if(txt.includes('join as dj')) role = 'dj';
      if(txt.includes('watch only')) role = 'watch';
      if(!role || btn.dataset.ubCypherRoleFixed === 'yes') return;
      btn.dataset.ubCypherRoleFixed = 'yes';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        window.joinCypher(role);
        return false;
      }, true);
    });
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
