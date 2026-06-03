// unifreestyle-battle-modes.js
// Rebuilds Join Battle into real mode classes without touching Cypher.
// Modes: Showdown, Dog Cage, Team Battle, Tournament.

(function(){
  'use strict';

  function ok(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function toast(msg){ if(typeof window.showToast === 'function') window.showToast(msg); else console.log('[battle-modes]', msg); }
  function go(page){ if(typeof window.goToPage === 'function') window.goToPage(page); }

  var MODES = {
    showdown: {
      title: 'SHOWDOWN',
      tag: '3 MIN ROUNDS',
      desc: 'Classic face-to-face battle format. Three-minute rounds, DJ-controlled beat, live cam and mic.',
      room: 'battle-showdown',
      slots: ['artist1','artist2'],
      cta: 'ENTER SHOWDOWN'
    },
    dogcage: {
      title: 'DOG CAGE',
      tag: '1V1 ONLY',
      desc: 'Raw 1v1 cage match. No team help, no hiding. Two artists, one winner.',
      room: 'battle-dog-cage',
      slots: ['artist1','artist2'],
      cta: 'ENTER DOG CAGE'
    },
    team: {
      title: 'TEAM BATTLE',
      tag: '2V2',
      desc: 'Two crews, four artists. Team chemistry, round rotation, live cam and mic for all artists.',
      room: 'battle-team-2v2',
      slots: ['teamA1','teamA2','teamB1','teamB2'],
      cta: 'ENTER TEAM BATTLE'
    },
    tournament: {
      title: 'TOURNAMENT',
      tag: 'BRACKET RULES',
      desc: 'Bracket-style battles with rounds, advancement, elimination, and final winner setup.',
      room: 'battle-tournament',
      slots: ['artist1','artist2'],
      cta: 'ENTER TOURNAMENT'
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

  function injectModeSelector(){
    if(!ok() || document.getElementById('ubBattleModesPanel')) return;
    var queueBody = document.querySelector('#page-queue .page-body, #page-battle .page-body, #page-home .page-body');
    if(!queueBody) return;
    var panel = document.createElement('div');
    panel.id = 'ubBattleModesPanel';
    panel.style.cssText = 'margin:16px 0 20px;padding:16px;border-radius:16px;border:1px solid rgba(64,208,255,.35);background:rgba(0,0,0,.26);color:#fff;';
    panel.innerHTML = '<div style="font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">JOIN BATTLE CLASSES</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.9rem;letter-spacing:2px;color:#F0C040;line-height:1;">CHOOSE YOUR BATTLE FORMAT</div><div style="font-size:.9rem;color:rgba(240,237,232,.7);margin:7px 0 14px;">All formats are built for live cam and mic on mobile and PC.</div><div id="ubBattleModesGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;"></div>';
    var grid = panel.querySelector('#ubBattleModesGrid');
    Object.keys(MODES).forEach(function(k){ grid.appendChild(createModeCard(k, MODES[k])); });
    queueBody.insertBefore(panel, queueBody.firstChild);
  }

  function ensureBattlePage(){
    var page = document.getElementById('page-battle-live');
    if(page) return page;
    page = document.createElement('section');
    page.id = 'page-battle-live';
    page.className = 'page';
    page.innerHTML = '<div class="top-bar"><button class="icon-btn" id="ubBattleBackBtn">←</button><div class="brand-title">LIVE BATTLE</div><button class="icon-btn" id="ubBattleCamBtn">📹</button></div><div class="page-body"><div id="ubBattleModeTitle" style="font-family:Bebas Neue,Arial,sans-serif;font-size:2rem;letter-spacing:2px;color:#F0C040;margin-bottom:6px;">BATTLE</div><div id="ubBattleModeDesc" style="color:rgba(240,237,232,.72);margin-bottom:14px;"></div><div id="ubBattleLiveStage" style="margin:14px 0;padding:12px;border:1px solid rgba(201,168,76,.45);border-radius:14px;background:rgba(0,0,0,.35);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;color:#fff;"></div><div id="ubBattleRoleRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px;"></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:10px;"><button class="btn btn-blue" onclick="toggleBattleMic && toggleBattleMic()">🎤 MIC</button><button class="btn btn-blue" onclick="toggleBattleCam && toggleBattleCam()">📹 CAM</button><button class="btn btn-gold" onclick="disconnectBattleLive && disconnectBattleLive()">LEAVE LIVE</button></div></div>';
    document.body.appendChild(page);
    var back = page.querySelector('#ubBattleBackBtn');
    if(back) back.onclick = function(){ disconnectBattleLive && disconnectBattleLive(); go('queue'); };
    return page;
  }

  function makeSlotTile(slot){
    var tile = document.createElement('div');
    tile.id = slot === 'teamA1' ? 'artist1Video' : slot === 'teamB1' ? 'artist2Video' : 'battleSlot_' + slot;
    tile.dataset.battleVideo = slot;
    tile.style.cssText = 'position:relative;aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid rgba(64,208,255,.45);background:#05070d;display:flex;align-items:center;justify-content:center;color:rgba(240,237,232,.55);font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:1.5px;text-align:center;';
    tile.innerHTML = '<div>' + slot.toUpperCase() + '<br><span style="font-size:.45rem;color:#40D0FF;">LIVE CAM READY</span></div><div style="position:absolute;left:10px;bottom:8px;z-index:4;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.7);color:#F0C040;font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.5px;">' + slot.toUpperCase() + '</div>';
    return tile;
  }

  function openMode(key){
    var mode = MODES[key] || MODES.showdown;
    var page = ensureBattlePage();
    var title = page.querySelector('#ubBattleModeTitle');
    var desc = page.querySelector('#ubBattleModeDesc');
    var stage = page.querySelector('#ubBattleLiveStage');
    var roles = page.querySelector('#ubBattleRoleRow');
    if(title) title.textContent = mode.title + ' · ' + mode.tag;
    if(desc) desc.textContent = mode.desc;
    if(stage){ stage.innerHTML = ''; mode.slots.forEach(function(s){ stage.appendChild(makeSlotTile(s)); }); }
    if(roles){
      roles.innerHTML = '';
      mode.slots.forEach(function(slot, i){
        var liveRole = slot.indexOf('2') !== -1 || slot === 'teamB1' || slot === 'teamB2' ? 'artist2' : 'artist1';
        var btn = document.createElement('button');
        btn.className = 'btn btn-gold';
        btn.textContent = 'JOIN ' + slot.toUpperCase();
        btn.onclick = function(){ if(window.connectBattleLive) window.connectBattleLive(liveRole, mode.room); else toast('Battle LiveKit is still loading. Refresh and try again.'); };
        roles.appendChild(btn);
      });
      var dj = document.createElement('button');
      dj.className = 'btn btn-blue';
      dj.textContent = 'JOIN AS DJ';
      dj.onclick = function(){ if(window.connectBattleLive) window.connectBattleLive('dj', mode.room); };
      roles.appendChild(dj);
      var viewer = document.createElement('button');
      viewer.className = 'btn btn-blue';
      viewer.textContent = 'WATCH';
      viewer.onclick = function(){ if(window.connectBattleLive) window.connectBattleLive('viewer', mode.room); };
      roles.appendChild(viewer);
    }
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    page.classList.add('active');
  }

  function routeHomeJoinToQueue(){
    var home = document.getElementById('page-home');
    if(!home) return;
    var join = home.querySelector('.home-action-row .btn-gold');
    if(join && join.dataset.ubModeRoute !== 'yes'){
      join.dataset.ubModeRoute = 'yes';
      join.removeAttribute('onclick');
      join.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); go('queue'); setTimeout(injectModeSelector, 250); return false; }, true);
    }
  }

  function boot(){
    if(!ok()) return;
    window.ubBattleModes = { modes: MODES, open: openMode, inject: injectModeSelector };
    injectModeSelector();
    routeHomeJoinToQueue();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 1800);
  setInterval(routeHomeJoinToQueue, 2000);
})();
