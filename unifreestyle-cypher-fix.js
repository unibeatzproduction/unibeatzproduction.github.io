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

  function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function escapeAttr(s){ return escapeHtml(s).replace(/`/g,'&#96;'); }

  async function loadMarketplaceBeats(){
    if(window.ubCypherBeats && window.ubCypherBeats.length) return window.ubCypherBeats;

    var windowSources = [window.beats, window.marketplaceBeats, window.ubMarketplaceBeats, window.UB_MARKETPLACE_BEATS, window.battleBeats, window.ubBattleBeats];
    for(var i=0;i<windowSources.length;i++){
      if(Array.isArray(windowSources[i]) && windowSources[i].length){
        window.ubCypherBeats = windowSources[i].map(normalizeBeat).filter(Boolean);
        return window.ubCypherBeats;
      }
    }

    try {
      var raw = localStorage.getItem('ub_marketplace_beats') || localStorage.getItem('marketplace_beats') || localStorage.getItem('ub_beats') || localStorage.getItem('battle_beats');
      if(raw){
        var parsed = JSON.parse(raw);
        if(Array.isArray(parsed) && parsed.length){
          window.ubCypherBeats = parsed.map(normalizeBeat).filter(Boolean);
          return window.ubCypherBeats;
        }
      }
    } catch(e) {}

    try {
      var fb = window.UB_FIREBASE;
      if(fb && fb.app){
        var mod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
        var db = mod.getFirestore(fb.app);
        var snap = await mod.getDocs(mod.query(mod.collection(db, 'marketplace_beats'), mod.orderBy('createdAt', 'desc')));
        window.ubCypherBeats = snap.docs.map(function(d){ return normalizeBeat(Object.assign({id:d.id}, d.data())); }).filter(Boolean);
        return window.ubCypherBeats;
      }
    } catch(e) {
      console.warn('[Cypher] marketplace_beats load failed', e);
    }

    return [];
  }

  function normalizeBeat(b){
    if(!b) return null;
    if(typeof b === 'string') return { name:b, audioUrl:'' };
    var name = b.name || b.title || b.beatName || b.fileName || b.filename || 'Untitled Beat';
    var audioUrl = b.audioUrl || b.url || b.downloadUrl || b.fileUrl || b.previewUrl || b.preview || b.audio || '';
    return { id:b.id || name, name:name, audioUrl:audioUrl, bpm:b.bpm || '', key:b.key || '', tag:b.tag || b.genre || '' };
  }

  function ensureAudioUnlocked(audio){
    if(!audio) return;
    audio.setAttribute('playsinline','true');
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.controls = true;
  }

  function playCypherBeat(beat){
    if(!beat) return;
    window.ubCypherBeat = beat;
    window.ubSharedCurrentBeat = beat;
    localStorage.setItem('ub_current_battle_beat', JSON.stringify(beat));
    var current = document.getElementById('ubCypherCurrentBeat');
    if(current) current.innerHTML = 'Current Beat: <strong style="color:#F0C040;">' + escapeHtml(beat.name) + '</strong>' + (beat.bpm ? ' · ' + escapeHtml(beat.bpm) + ' BPM' : '');

    var audio = document.getElementById('ubCypherBeatAudio');
    var playBtn = document.getElementById('ubCypherManualPlay');
    if(audio && beat.audioUrl){
      ensureAudioUnlocked(audio);
      audio.style.display = 'block';
      audio.pause();
      audio.src = beat.audioUrl;
      audio.load();
      if(playBtn) {
        playBtn.style.display = 'block';
        playBtn.textContent = '▶ PLAY SELECTED BEAT';
        playBtn.onclick = function(e){
          if(e){ e.preventDefault(); e.stopImmediatePropagation(); }
          ensureAudioUnlocked(audio);
          audio.play().then(function(){ playBtn.textContent = '⏸ BEAT PLAYING'; }).catch(function(err){ showMsg('⚠️ Tap the audio controls to play. ' + (err && err.message ? err.message : '')); });
          return false;
        };
      }
      audio.onplay = function(){ if(playBtn) playBtn.textContent = '⏸ BEAT PLAYING'; };
      audio.onpause = function(){ if(playBtn) playBtn.textContent = '▶ PLAY SELECTED BEAT'; };
      audio.onerror = function(){ showMsg('⚠️ Audio file could not load for: ' + beat.name); };
      audio.play().catch(function(){ showMsg('🎧 Beat selected: ' + beat.name + '. Tap PLAY SELECTED BEAT or the audio bar.'); });
    } else if(playBtn) {
      playBtn.style.display = 'none';
      showMsg('⚠️ Beat has no audio URL: ' + beat.name);
    }
    window.dispatchEvent(new CustomEvent('ub-battle-beat-changed', { detail: beat }));
  }

  function renderBeatGrid(beats){
    var panel = document.getElementById('ubCypherDjPanel');
    var grid = document.getElementById('ubCypherBeatGrid');
    if(!panel || !grid) return;
    grid.innerHTML = '';
    if(!beats || !beats.length){
      grid.innerHTML = '<div style="grid-column:1/-1;color:rgba(240,237,232,.65);font-size:.82rem;line-height:1.35;">No marketplace beats found yet. Upload/push beats to UniBeatzWorld marketplace_beats, then refresh.</div>';
      return;
    }
    beats.forEach(function(beat){
      var btn = document.createElement('button');
      btn.innerHTML = '<strong>' + escapeHtml(beat.name) + '</strong><br><span style="opacity:.65;font-size:.72em;">' + escapeHtml([beat.tag, beat.bpm ? beat.bpm + ' BPM' : '', beat.key].filter(Boolean).join(' · ')) + '</span>';
      btn.style.cssText = 'padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.4);background:rgba(0,0,0,.28);color:#fff;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1px;cursor:pointer;text-align:left;line-height:1.35;';
      btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); playCypherBeat(beat); return false; }, true);
      grid.appendChild(btn);
    });
  }

  function openCypherRoom(){ goPageSafe('cypher'); setTimeout(bindCypherButtons, 250); }
  window.openCypherRoom = openCypherRoom;

  function updateSessionTitle(name){
    window.ubCypherSessionName = name;
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
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;"><div><div style="font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#40D0FF;">DJ CONTROL PANEL</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.4rem;letter-spacing:2px;color:#F0C040;">SWITCH CYPHER BEATS</div></div><button id="ubCypherSkipTurn" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(64,208,255,.7);background:rgba(64,208,255,.12);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1.5px;cursor:pointer;">SKIP TURN</button></div><div id="ubCypherCurrentBeat" style="padding:9px 10px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);margin-bottom:10px;color:rgba(240,237,232,.82);">Current Beat: <strong style="color:#F0C040;">None selected</strong></div><audio id="ubCypherBeatAudio" controls playsinline preload="auto" style="display:none;width:100%;margin:0 0 10px;"></audio><button id="ubCypherManualPlay" style="display:none;width:100%;margin:0 0 10px;padding:11px;border-radius:8px;border:1px solid #40D0FF;background:rgba(64,208,255,.14);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:2px;cursor:pointer;">▶ PLAY SELECTED BEAT</button><div id="ubCypherBeatGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;"><div style="grid-column:1/-1;color:rgba(240,237,232,.65);">Loading marketplace beats...</div></div>';
    var target = root.querySelector('.page-body') || root;
    target.appendChild(panel);
    panel.querySelector('#ubCypherSkipTurn').addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); showMsg('⏭️ DJ skipped to next cypher turn.'); }, true);
    loadMarketplaceBeats().then(renderBeatGrid);
  }

  function showDjPanel(){
    ensureSessionTitle();
    ensureDjPanel();
    var panel = document.getElementById('ubCypherDjPanel');
    if(panel) panel.style.display = 'block';
    loadMarketplaceBeats().then(renderBeatGrid);
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
