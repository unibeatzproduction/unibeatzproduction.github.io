// unifreestyle-cypher-audio-url-fix.js
// Small override: forces Cypher DJ panel to use Firestore marketplace_beats audioUrl records.

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
          tag: b.tag || b.genre || ''
        };
      });
    } catch(e) {
      console.warn('[Cypher audio override] Firestore load failed', e);
      return [];
    }
  }

  function playBeat(beat){
    var audio = document.getElementById('ubCypherBeatAudio');
    var playBtn = document.getElementById('ubCypherManualPlay');
    var current = document.getElementById('ubCypherCurrentBeat');

    if(current) current.innerHTML = 'Current Beat: <strong style="color:#F0C040;">' + esc(beat.name) + '</strong>' + (beat.bpm ? ' · ' + esc(beat.bpm) + ' BPM' : '');

    window.ubCypherBeat = beat;
    window.ubSharedCurrentBeat = beat;
    try { localStorage.setItem('ub_current_battle_beat', JSON.stringify(beat)); } catch(e) {}
    window.dispatchEvent(new CustomEvent('ub-battle-beat-changed', { detail: beat }));

    if(!beat.audioUrl){
      msg('⚠️ Beat has no audioUrl saved in Firestore: ' + beat.name);
      return;
    }

    if(!audio){
      msg('⚠️ Audio player not found. Rejoin as DJ and try again.');
      return;
    }

    audio.style.display = 'block';
    audio.controls = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline','true');
    audio.pause();
    audio.src = beat.audioUrl;
    audio.load();

    if(playBtn){
      playBtn.style.display = 'block';
      playBtn.textContent = '▶ PLAY SELECTED BEAT';
      playBtn.onclick = function(e){
        if(e){ e.preventDefault(); e.stopImmediatePropagation(); }
        audio.play().then(function(){ playBtn.textContent = '⏸ BEAT PLAYING'; }).catch(function(err){ msg('⚠️ Tap the audio bar controls. ' + (err && err.message ? err.message : '')); });
        return false;
      };
    }

    audio.play().then(function(){ if(playBtn) playBtn.textContent = '⏸ BEAT PLAYING'; }).catch(function(){ msg('🎧 Beat selected: ' + beat.name + '. Tap PLAY SELECTED BEAT.'); });
  }

  function renderBeats(beats){
    var grid = document.getElementById('ubCypherBeatGrid');
    if(!grid || !beats.length) return;
    grid.innerHTML = '';
    beats.forEach(function(beat){
      var btn = document.createElement('button');
      btn.innerHTML = '<strong>' + esc(beat.name) + '</strong><br><span style="opacity:.65;font-size:.72em;">' + esc([beat.tag, beat.bpm ? beat.bpm + ' BPM' : '', beat.key].filter(Boolean).join(' · ')) + '</span>';
      btn.style.cssText = 'padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.4);background:rgba(0,0,0,.28);color:#fff;font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:1px;cursor:pointer;text-align:left;line-height:1.35;';
      btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); playBeat(beat); return false; }, true);
      grid.appendChild(btn);
    });
  }

  async function refreshCypherAudioBeats(){
    if(!isFreestyle()) return;
    var grid = document.getElementById('ubCypherBeatGrid');
    if(!grid) return;
    var beats = await getFirestoreBeats();
    if(beats.length){
      window.ubCypherBeats = beats;
      renderBeats(beats);
    }
  }

  window.refreshCypherAudioBeats = refreshCypherAudioBeats;
  setInterval(refreshCypherAudioBeats, 2500);
  setTimeout(refreshCypherAudioBeats, 800);
  setTimeout(refreshCypherAudioBeats, 2000);
  setTimeout(refreshCypherAudioBeats, 4500);
})();
