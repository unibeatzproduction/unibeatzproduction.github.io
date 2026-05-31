// unifreestyle-cypher-audio-url-fix.js
// Shared real beat override: one current battle beat for Cypher + real marketplace beats for Practice.

(function(){
  function isFreestyle(){ return location.pathname.toLowerCase().includes('unifreestyle.html'); }
  function msg(text){
    if(typeof window.showToast === 'function') window.showToast(text);
    var tip = document.getElementById('cyTip');
    if(tip) tip.innerHTML = '<strong>' + text + '</strong>';
  }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  async function getFirestoreBeats(){
    var fb = window.UB_FIREBASE;
    if(!fb || !fb.app) return [];
    try {
      var mod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      var db = mod.getFirestore(fb.app);
      var snap = await mod.getDocs(mod.query(mod.collection(db, 'marketplace_beats'), mod.orderBy('createdAt', 'desc')));
      return snap.docs.map(function(d){
        var b = d.data() || {};
        return {
          id: d.id,
          name: b.name || b.title || 'Untitled Beat',
          audioUrl: b.audioUrl || b.audioURL || b.beatAudioUrl || b.beatUrl || b.url || b.downloadUrl || b.fileUrl || '',
          bpm: b.bpm || '',
          key: b.key || '',
          tag: b.tag || b.genre || '',
          emoji: '🎵'
        };
      }).filter(function(b){ return b.name; });
    } catch(e) {
      console.warn('[Real beat override] Firestore load failed', e);
      return [];
    }
  }

  function getSavedCurrentBeat(){
    try {
      var raw = localStorage.getItem('ub_current_battle_beat');
      if(raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
  }

  async function getOneCurrentBeat(){
    var saved = getSavedCurrentBeat();
    if(saved && saved.name) return saved;
    var beats = await getFirestoreBeats();
    if(beats.length){
      try { localStorage.setItem('ub_current_battle_beat', JSON.stringify(beats[0])); } catch(e) {}
      return beats[0];
    }
    return null;
  }

  function setCurrentBeat(beat){
    if(!beat) return;
    window.ubCypherBeat = beat;
    window.ubSharedCurrentBeat = beat;
    try { localStorage.setItem('ub_current_battle_beat', JSON.stringify(beat)); } catch(e) {}
    window.dispatchEvent(new CustomEvent('ub-battle-beat-changed', { detail: beat }));
  }

  function playBeat(beat){
    if(!beat) return;
    setCurrentBeat(beat);
    var audio = document.getElementById('ubCypherBeatAudio');
    var playBtn = document.getElementById('ubCypherManualPlay');
    var current = document.getElementById('ubCypherCurrentBeat');
    if(current) current.innerHTML = 'Current Beat: <strong style="color:#F0C040;">' + esc(beat.name) + '</strong>' + (beat.bpm ? ' · ' + esc(beat.bpm) + ' BPM' : '');
    if(!beat.audioUrl){ msg('⚠️ Current beat has no audioUrl: ' + beat.name); return; }
    if(!audio){ msg('⚠️ Audio player not found. Rejoin as DJ and try again.'); return; }
    audio.style.display = 'block';
    audio.controls = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline','true');
    audio.pause();
    audio.src = beat.audioUrl;
    audio.load();
    if(playBtn){
      playBtn.style.display = 'block';
      playBtn.textContent = '▶ PLAY CURRENT BEAT';
      playBtn.onclick = function(e){
        if(e){ e.preventDefault(); e.stopImmediatePropagation(); }
        audio.play().then(function(){ playBtn.textContent = '⏸ BEAT PLAYING'; }).catch(function(err){ msg('⚠️ Tap the audio bar controls. ' + (err && err.message ? err.message : '')); });
        return false;
      };
    }
    audio.play().then(function(){ if(playBtn) playBtn.textContent = '⏸ BEAT PLAYING'; }).catch(function(){ msg('🎧 Current beat loaded: ' + beat.name + '. Tap PLAY CURRENT BEAT.'); });
  }

  function renderOneCypherBeat(beat){
    var grid = document.getElementById('ubCypherBeatGrid');
    if(!grid || !beat) return;
    grid.innerHTML = '';
    var card = document.createElement('div');
    card.style.cssText = 'grid-column:1/-1;padding:12px;border-radius:10px;border:1px solid rgba(201,168,76,.48);background:rgba(0,0,0,.28);color:#fff;font-family:Rajdhani,sans-serif;line-height:1.35;';
    card.innerHTML = '<div style="font-family:Orbitron,sans-serif;font-size:.46rem;letter-spacing:2px;color:#40D0FF;margin-bottom:6px;">CURRENT BATTLE BEAT</div><div style="font-family:Bebas Neue,Arial,sans-serif;font-size:1.35rem;letter-spacing:2px;color:#F0C040;">' + esc(beat.name) + '</div><div style="font-size:.82rem;color:rgba(240,237,232,.65);margin:4px 0 10px;">' + esc([beat.tag, beat.bpm ? beat.bpm + ' BPM' : '', beat.key].filter(Boolean).join(' · ')) + '</div><button id="ubPlayOnlyCurrentBeat" style="width:100%;padding:11px;border-radius:8px;border:1px solid #40D0FF;background:rgba(64,208,255,.14);color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;cursor:pointer;">▶ PLAY CURRENT BEAT</button>';
    grid.appendChild(card);
    var btn = document.getElementById('ubPlayOnlyCurrentBeat');
    if(btn) btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); playBeat(beat); return false; }, true);
    var current = document.getElementById('ubCypherCurrentBeat');
    if(current) current.innerHTML = 'Current Beat: <strong style="color:#F0C040;">' + esc(beat.name) + '</strong>' + (beat.bpm ? ' · ' + esc(beat.bpm) + ' BPM' : '');
  }

  async function refreshCypherAudioBeats(){
    if(!isFreestyle()) return;
    var grid = document.getElementById('ubCypherBeatGrid');
    if(!grid) return;
    var beat = await getOneCurrentBeat();
    if(beat) renderOneCypherBeat(beat);
  }

  async function renderRealPracticeBeats(){
    if(!isFreestyle()) return;
    var list = document.getElementById('beatList');
    if(!list) return;
    var beats = await getFirestoreBeats();
    if(!beats.length) return;
    window.PRACTICE_REAL_BEATS = beats;
    list.innerHTML = beats.map(function(b, i){
      return '<div class="beat-card ' + (i === 0 ? 'active' : '') + '" data-real-beat="' + esc(b.id) + '" style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid ' + (i === 0 ? 'var(--gold)' : 'rgba(201,168,76,0.15)') + ';border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;"><div style="font-size:1.6rem;flex-shrink:0;">🎵</div><div style="flex:1;min-width:0;"><div style="font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:1.5px;color:var(--white);">' + esc(b.name) + '</div><div style="font-family:Orbitron,sans-serif;font-size:0.4rem;letter-spacing:1.5px;color:var(--gray);margin-top:1px;">' + esc([b.bpm ? b.bpm + ' BPM' : '', b.key, b.tag].filter(Boolean).join(' · ')) + '</div></div><div class="beat-check" style="width:18px;height:18px;border-radius:50%;border:1.5px solid ' + (i === 0 ? 'var(--gold)' : 'rgba(201,168,76,0.25)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i === 0 ? '<span style="color:var(--gold);font-size:0.7rem;">✓</span>' : '') + '</div></div>';
    }).join('');
    if(window.practiceState) window.practiceState.selectedBeat = beats[0];
    Array.from(list.querySelectorAll('.beat-card')).forEach(function(card, idx){
      card.addEventListener('click', function(){
        var beat = beats[idx];
        if(window.practiceState) window.practiceState.selectedBeat = beat;
        list.querySelectorAll('.beat-card').forEach(function(c){ c.style.borderColor = 'rgba(201,168,76,0.15)'; var check = c.querySelector('.beat-check'); if(check){ check.style.borderColor = 'rgba(201,168,76,0.25)'; check.innerHTML = ''; } });
        card.style.borderColor = 'var(--gold)';
        var check = card.querySelector('.beat-check');
        if(check){ check.style.borderColor = 'var(--gold)'; check.innerHTML = '<span style="color:var(--gold);font-size:0.7rem;">✓</span>'; }
      }, true);
    });
  }

  function patchPracticeStart(){
    if(window.__ubPracticeStartPatched || typeof window.startPractice !== 'function') return;
    window.__ubPracticeStartPatched = true;
    var original = window.startPractice;
    window.startPractice = async function(){
      if(window.practiceState && window.practiceState.selectedBeat && window.practiceState.selectedBeat.audioUrl){
        var beat = window.practiceState.selectedBeat;
        window.__ubPracticeAudio = window.__ubPracticeAudio || new Audio();
        window.__ubPracticeAudio.pause();
        window.__ubPracticeAudio.src = beat.audioUrl;
        window.__ubPracticeAudio.loop = true;
        window.__ubPracticeAudio.preload = 'auto';
        window.__ubPracticeAudio.setAttribute('playsinline','true');
        setTimeout(function(){ window.__ubPracticeAudio.play().catch(function(){ if(typeof showToast === 'function') showToast('Practice beat loaded. Tap screen/audio if browser blocks playback.'); }); }, 800);
      }
      return original.apply(this, arguments);
    };
    var originalComplete = window.completePractice;
    if(typeof originalComplete === 'function'){
      window.completePractice = function(){
        if(window.__ubPracticeAudio){ window.__ubPracticeAudio.pause(); window.__ubPracticeAudio.currentTime = 0; }
        return originalComplete.apply(this, arguments);
      };
    }
    var originalExit = window.exitPractice;
    if(typeof originalExit === 'function'){
      window.exitPractice = function(){
        if(window.__ubPracticeAudio){ window.__ubPracticeAudio.pause(); window.__ubPracticeAudio.currentTime = 0; }
        return originalExit.apply(this, arguments);
      };
    }
  }

  function boot(){
    refreshCypherAudioBeats();
    renderRealPracticeBeats();
    patchPracticeStart();
  }

  window.refreshCypherAudioBeats = refreshCypherAudioBeats;
  window.renderRealPracticeBeats = renderRealPracticeBeats;
  setInterval(function(){ refreshCypherAudioBeats(); patchPracticeStart(); }, 2500);
  setTimeout(boot, 800);
  setTimeout(boot, 2000);
  setTimeout(boot, 4500);
  document.addEventListener('click', function(){ setTimeout(renderRealPracticeBeats, 600); }, true);
})();
