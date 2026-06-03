// unifreestyle-battle-modes.js
// Official UniFreestyle battle classes. Cypher stays separate and untouched.
// Modes live INSIDE the Join Battle screen, not above the homepage hero.

(function(){
  'use strict';

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(typeof window.showToast === 'function') window.showToast(msg); else console.log('[battle-modes]', msg); }
  function go(page){ if(typeof window.goToPage === 'function') window.goToPage(page); }

  var MODES = {
    showdown: {
      title: 'SHOWDOWN', tag: '2V2 · 3 MIN ROUNDS',
      desc: 'Main event team battle. Team A vs Team B, four live cameras, live mics, DJ-controlled beat, and 3-minute rounds.',
      room: 'battle-showdown-2v2', slots: ['teamA1','teamA2','teamB1','teamB2'], round: '3:00', type: 'artist'
    },
    dogcage: {
      title: 'DOG CAGE', tag: '1V1 · FLEXIBLE ROUNDS',
      desc: 'Raw 1v1 battle mode. Rounds can be quick, standard, or extended depending on the session setup.',
      room: 'battle-dog-cage-1v1', slots: ['artist1','artist2'], round: 'Optional', type: 'artist'
    },
    tournament: {
      title: 'TOURNAMENT', tag: 'BRACKET · 3 MIN ROUNDS',
      desc: 'Official bracket competition. 8, 16, or 32 artists, 3-minute rounds, elimination advancement, and final champion.',
      room: 'battle-tournament-bracket', slots: ['artist1','artist2'], round: '3:00', type: 'artist'
    },
    djbattle: {
      title: 'DJ BATTLE ROOM', tag: 'DJ VS DJ · EQUIPMENT READY',
      desc: 'Two DJs go head-to-head live. Set up DJ equipment or MIDI controller, perform, switch, scratch, and let the crowd watch the showdown.',
      room: 'battle-dj-room', slots: ['dj1','dj2'], round: 'DJ Controlled', type: 'dj'
    },
    practice: {
      title: 'PRACTICE', tag: 'SOLO · TRAINING MODE',
      desc: 'Solo training mode for artists. Select a beat, test mic/cam, and sharpen rounds before entering live battles.',
      room: 'battle-practice-solo', slots: ['practice'], round: 'Optional', type: 'practice'
    }
  };

  function createModeCard(key, mode){
    var card = document.createElement('div');
    card.className = 'ub-battle-mode-card';
    card.dataset.mode = key;
    card.style.cssText = 'padding:15px;border-radius:14px;border:1px solid rgba(201,168,76,.42);background:linear-gradient(135deg,rgba(201,168,76,.10),rgba(64,208,255,.07));box-shadow:0 12px 28px rgba(0,0,0,.28);cursor:pointer;color:#fff;';
    card.innerHTML = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;"><div><div style="display:inline-block;margin-bottom:8px;padding:4px 8px;border-radius:999px;border:1px solid #40D0FF;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:2px;font-weight:900;">' + mode.tag + '</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.65rem;letter-spacing:2px;color:#F0C040;line-height:1;">' + mode.title + '</div><div style="font-size:.86rem;line-height:1.35;color:rgba(240,237,232,.75);margin-top:7px;">' + mode.desc + '</div></div><div style="font-size:1.4rem;color:#C9A84C;">→</div></div>';
    card.onclick = function(){ openMode(key); };
    return card;
  }

  function removeHomepagePanel(){ var panel=document.getElementById('ubBattleModesPanel'); if(panel && panel.closest('#page-home')) panel.remove(); }
  function findJoinBattleBody(){ return document.querySelector('#page-queue .page-body, #page-battle .page-body'); }

  function injectModeSelector(){
    if(!ok()) return;
    removeHomepagePanel();
    var queueBody = findJoinBattleBody();
    if(!queueBody) return;
    var existing = document.getElementById('ubBattleModesPanel');
    if(existing && !existing.closest('#page-home')) return;
    if(existing) existing.remove();
    var panel = document.createElement('div');
    panel.id = 'ubBattleModesPanel';
    panel.style.cssText = 'margin:0 0 18px;padding:16px;border-radius:16px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.26);color:#fff;';
    panel.innerHTML = '<div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">JOIN BATTLE CLASSES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.9rem;letter-spacing:2px;color:#F0C040;line-height:1;">CHOOSE YOUR BATTLE FORMAT</div><div style="font-size:.9rem;color:rgba(240,237,232,.7);margin:7px 0 14px;">Artist battles, DJ battles, tournament brackets, and solo practice.</div><div id="ubBattleModesGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;"></div>';
    var grid = panel.querySelector('#ubBattleModesGrid');
    Object.keys(MODES).forEach(function(k){ grid.appendChild(createModeCard(k, MODES[k])); });
    var anchor = queueBody.querySelector('.practice-card, .battle-setup, .section-label, .section-title, .battle-type-grid');
    if(anchor) queueBody.insertBefore(panel, anchor); else queueBody.insertBefore(panel, queueBody.firstChild);
  }

  function ensureBattlePage(){
    var page = document.getElementById('page-battle-live');
    if(page) return page;
    page = document.createElement('section');
    page.id = 'page-battle-live';
    page.className = 'page';
    page.innerHTML = '<div class="top-bar"><button class="icon-btn" id="ubBattleBackBtn">←</button><div class="brand-title">LIVE BATTLE</div><button class="icon-btn" id="ubBattleCamBtn">📹</button></div><div class="page-body"><div id="ubBattleModeTitle" style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:2px;color:#F0C040;margin-bottom:6px;">BATTLE</div><div id="ubBattleModeDesc" style="color:rgba(240,237,232,.72);margin-bottom:10px;"></div><div id="ubBattleRoundInfo" style="display:inline-block;margin-bottom:12px;padding:5px 9px;border-radius:999px;border:1px solid rgba(64,208,255,.55);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.8px;">ROUND</div><div id="ubBattleLiveStage" style="margin:14px 0;padding:12px;border:1px solid rgba(201,168,76,.45);border-radius:14px;background:rgba(0,0,0,.35);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;color:#fff;"></div><div id="ubBattleRoleRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px;"></div><div id="ubDjProgramPanel" style="display:none;margin-top:14px;padding:14px;border-radius:14px;border:1px solid rgba(201,168,76,.45);background:rgba(0,0,0,.32);"><div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">DJ CONTROL CENTER</div><div style="color:rgba(240,237,232,.72);font-size:.86rem;line-height:1.35;">Beat type, round format, timer, match start/end, DJ equipment and MIDI controls belong here.</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-top:10px;"><button class="btn btn-blue">🎚️ EQUIPMENT</button><button class="btn btn-blue">🎛️ MIDI SETUP</button><button class="btn btn-blue">⏱️ TIMER</button><button class="btn btn-gold">▶ START</button></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:10px;"><button class="btn btn-blue" onclick="toggleBattleMic && toggleBattleMic()">🎤 MIC</button><button class="btn btn-blue" onclick="toggleBattleCam && toggleBattleCam()">📹 CAM</button><button class="btn btn-gold" onclick="disconnectBattleLive && disconnectBattleLive()">LEAVE LIVE</button></div></div>';
    document.body.appendChild(page);
    var back = page.querySelector('#ubBattleBackBtn');
    if(back) back.onclick = function(){ disconnectBattleLive && disconnectBattleLive(); go('queue'); setTimeout(injectModeSelector, 250); };
    return page;
  }

  function liveRoleForSlot(slot){ if(slot === 'practice') return 'practice'; if(slot === 'dj1') return 'dj1'; if(slot === 'dj2') return 'dj2'; if(slot === 'artist2' || slot === 'teamB1' || slot === 'teamB2') return 'artist2'; return 'artist1'; }
  function labelForSlot(slot){ return slot === 'dj1' ? 'DJ 1' : slot === 'dj2' ? 'DJ 2' : slot.toUpperCase(); }

  function makeSlotTile(slot){
    var tile = document.createElement('div');
    tile.id = slot === 'teamA1' || slot === 'artist1' ? 'artist1Video' : slot === 'teamB1' || slot === 'artist2' ? 'artist2Video' : slot === 'dj1' ? 'dj1Video' : slot === 'dj2' ? 'dj2Video' : 'battleSlot_' + slot;
    tile.dataset.battleVideo = slot;
    tile.style.cssText = 'position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid rgba(64,208,255,.45);background:#05070d;display:flex;align-items:center;justify-content:center;color:rgba(240,237,232,.55);font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;text-align:center;';
    tile.innerHTML = '<div>' + labelForSlot(slot) + '<br><span style="font-size:.45rem;color:#40D0FF;">LIVE CAM READY</span></div><div style="position:absolute;left:10px;bottom:8px;z-index:4;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.7);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.5px;">' + labelForSlot(slot) + '</div>';
    return tile;
  }

  function openMode(key){
    var mode = MODES[key] || MODES.showdown;
    var page = ensureBattlePage();
    var title = page.querySelector('#ubBattleModeTitle'), desc = page.querySelector('#ubBattleModeDesc'), round = page.querySelector('#ubBattleRoundInfo'), stage = page.querySelector('#ubBattleLiveStage'), roles = page.querySelector('#ubBattleRoleRow'), djPanel = page.querySelector('#ubDjProgramPanel');
    if(title) title.textContent = mode.title + ' · ' + mode.tag;
    if(desc) desc.textContent = mode.desc;
    if(round) round.textContent = 'ROUND: ' + mode.round;
    if(stage){ stage.innerHTML = ''; mode.slots.forEach(function(s){ stage.appendChild(makeSlotTile(s)); }); }
    if(djPanel) djPanel.style.display = (mode.type === 'dj') ? 'block' : 'none';
    if(roles){
      roles.innerHTML = '';
      mode.slots.forEach(function(slot){
        var liveRole = liveRoleForSlot(slot);
        var btn = document.createElement('button');
        btn.className = 'btn btn-gold';
        btn.textContent = 'JOIN ' + labelForSlot(slot);
        btn.onclick = function(){ if(window.connectBattleLive) window.connectBattleLive(liveRole, mode.room); else toast('Battle LiveKit is still loading. Refresh and try again.'); };
        roles.appendChild(btn);
      });
      if(key !== 'practice' && key !== 'djbattle'){
        var dj = document.createElement('button');
        dj.className = 'btn btn-blue';
        dj.textContent = 'JOIN AS DJ';
        dj.onclick = function(){ if(window.connectBattleLive) window.connectBattleLive('dj', mode.room); };
        roles.appendChild(dj);
      }
    }
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    page.classList.add('active');
  }

  function hideLegacySetupControls(){
    document.querySelectorAll('#page-queue .battle-type-grid,#page-queue [data-bt],#page-queue [data-rs],#page-battle .battle-type-grid,#page-battle [data-bt],#page-battle [data-rs]').forEach(function(el){
      var wrap = el.closest('.battle-type-grid, .round-format-grid, .format-grid, .setup-row') || el;
      wrap.style.display = 'none';
    });
  }

  function routeHomeJoinToQueue(){
    var home = document.getElementById('page-home'); if(!home) return;
    var join = home.querySelector('.home-action-row .btn-gold');
    if(join && join.dataset.ubModeRoute !== 'yes'){
      join.dataset.ubModeRoute = 'yes'; join.removeAttribute('onclick');
      join.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); go('queue'); setTimeout(function(){ injectModeSelector(); hideLegacySetupControls(); }, 250); return false; }, true);
    }
  }

  function boot(){
    if(!ok()) return;
    window.ubBattleModes = { modes: MODES, open: openMode, inject: injectModeSelector };
    removeHomepagePanel();
    if(document.querySelector('#page-queue.active, #page-battle.active')){ injectModeSelector(); hideLegacySetupControls(); }
    routeHomeJoinToQueue();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 800); setTimeout(boot, 1800);
  setInterval(function(){ routeHomeJoinToQueue(); removeHomepagePanel(); if(document.querySelector('#page-queue.active, #page-battle.active')){ injectModeSelector(); hideLegacySetupControls(); } }, 1200);
})();