// unipack-piano-roll.js
// Adds MELODY track with piano roll to MIDI Step Sequencer
// Master tier only

(function () {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;

  // ─────────────────────────────────────────────
  // NOTES
  // ─────────────────────────────────────────────
  var NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  var OCTAVES = [2,3,4,5,6];

  // All notes from C2 to B6
  var ALL_NOTES = [];
  OCTAVES.forEach(function(oct) {
    NOTE_NAMES.forEach(function(name) {
      ALL_NOTES.push({ name: name, octave: oct, label: name + oct });
    });
  });
  ALL_NOTES.reverse(); // High notes at top

  // MIDI note number (middle C = C4 = 60)
  function noteToMidi(name, octave) {
    var idx = NOTE_NAMES.indexOf(name);
    return (octave + 1) * 12 + idx;
  }

  // Frequency from MIDI note
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ─────────────────────────────────────────────
  // STATE
  // melodySteps[step] = { note: 'C', octave: 4, velocity: 100 } | null
  // ─────────────────────────────────────────────
  var melodySteps = new Array(16).fill(null);
  var _pianoRollOpen = false;
  var _editingStep = null;

  // ─────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ub-piano-roll-style')) return;
    var s = document.createElement('style');
    s.id = 'ub-piano-roll-style';
    s.textContent = `
      /* MELODY ROW */
      .melody-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        border-top: 1px solid rgba(155,48,255,.2);
        margin-top: 4px;
      }
      .melody-track-head {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 80px;
        padding-right: 8px;
      }
      .melody-track-name {
        font-family: 'Orbitron', sans-serif;
        font-size: .46rem;
        letter-spacing: 2px;
        color: #9B30FF;
        font-weight: 700;
      }
      .melody-locked-badge {
        font-family: 'Orbitron', sans-serif;
        font-size: .38rem;
        letter-spacing: 1px;
        color: rgba(155,48,255,.6);
        background: rgba(155,48,255,.1);
        border: 1px solid rgba(155,48,255,.25);
        border-radius: 4px;
        padding: 2px 5px;
        display: inline-block;
      }
      .melody-step {
        flex: 1;
        min-width: 0;
        height: 32px;
        border: 1px solid rgba(155,48,255,.2);
        border-radius: 4px;
        background: rgba(0,0,0,.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Orbitron', sans-serif;
        font-size: .36rem;
        letter-spacing: .5px;
        color: rgba(240,237,232,.4);
        transition: all .15s;
        position: relative;
        overflow: hidden;
      }
      .melody-step:hover {
        border-color: rgba(155,48,255,.5);
        background: rgba(155,48,255,.08);
      }
      .melody-step.has-note {
        background: linear-gradient(135deg, rgba(155,48,255,.4), rgba(155,48,255,.6));
        border-color: #9B30FF;
        color: #fff;
        font-weight: 700;
        box-shadow: 0 0 8px rgba(155,48,255,.4);
      }
      .melody-step.playhead {
        border-color: #fff !important;
        box-shadow: 0 0 10px rgba(255,255,255,.5) !important;
      }
      .melody-step.locked {
        opacity: .4;
        cursor: not-allowed;
      }

      /* PIANO ROLL MODAL */
      .piano-roll-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.85);
        z-index: 5000;
        align-items: center;
        justify-content: center;
        padding: 16px;
        backdrop-filter: blur(6px);
      }
      .piano-roll-overlay.open { display: flex; }
      .piano-roll-modal {
        background: linear-gradient(135deg, #0d0d1a, #070710);
        border: 1px solid rgba(155,48,255,.4);
        border-radius: 12px;
        padding: 20px;
        max-width: 520px;
        width: 100%;
        max-height: 85vh;
        overflow-y: auto;
      }
      .piano-roll-title {
        font-family: 'Bebas Neue', sans-serif;
        font-size: 1.6rem;
        letter-spacing: 3px;
        color: #9B30FF;
        margin-bottom: 4px;
      }
      .piano-roll-sub {
        font-family: 'Orbitron', sans-serif;
        font-size: .44rem;
        letter-spacing: 2px;
        color: rgba(240,237,232,.5);
        margin-bottom: 16px;
      }
      .piano-roll-keys {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 4px;
        margin-bottom: 16px;
        max-height: 340px;
        overflow-y: auto;
        padding: 4px;
      }
      .piano-key {
        padding: 8px 4px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.06);
        color: rgba(240,237,232,.8);
        font-family: 'Orbitron', sans-serif;
        font-size: .42rem;
        letter-spacing: 1px;
        cursor: pointer;
        text-align: center;
        transition: all .15s;
      }
      .piano-key.sharp {
        background: rgba(0,0,0,.4);
        color: rgba(240,237,232,.6);
        border-color: rgba(255,255,255,.06);
      }
      .piano-key:hover {
        background: rgba(155,48,255,.3);
        border-color: #9B30FF;
        color: #fff;
      }
      .piano-key.selected {
        background: linear-gradient(135deg, rgba(155,48,255,.6), rgba(155,48,255,.8));
        border-color: #9B30FF;
        color: #fff;
        box-shadow: 0 0 10px rgba(155,48,255,.5);
      }
      .piano-roll-velocity {
        margin-bottom: 14px;
      }
      .piano-roll-velocity label {
        font-family: 'Orbitron', sans-serif;
        font-size: .44rem;
        letter-spacing: 2px;
        color: rgba(240,237,232,.6);
        display: block;
        margin-bottom: 6px;
      }
      .velocity-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(90deg, rgba(155,48,255,.4), #9B30FF);
        outline: none;
        cursor: pointer;
      }
      .velocity-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #9B30FF;
        cursor: pointer;
      }
      .piano-roll-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      .pr-btn {
        padding: 10px;
        border-radius: 6px;
        font-family: 'Orbitron', sans-serif;
        font-size: .46rem;
        letter-spacing: 1.5px;
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition: all .2s;
      }
      .pr-btn-set {
        background: linear-gradient(135deg, #5a10c0, #9B30FF);
        color: #fff;
      }
      .pr-btn-clear {
        background: rgba(255,51,51,.15);
        border: 1px solid rgba(255,51,51,.3) !important;
        color: #ff6644;
      }
      .pr-btn-cancel {
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1) !important;
        color: rgba(240,237,232,.6);
      }
      .pr-btn:hover { opacity: .85; }
      .piano-roll-preview {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 8px 12px;
        background: rgba(155,48,255,.08);
        border: 1px solid rgba(155,48,255,.2);
        border-radius: 8px;
      }
      .pr-selected-note {
        font-family: 'Bebas Neue', sans-serif;
        font-size: 1.8rem;
        letter-spacing: 2px;
        color: #9B30FF;
        min-width: 50px;
      }
      .pr-preview-btn {
        padding: 6px 12px;
        background: rgba(155,48,255,.2);
        border: 1px solid rgba(155,48,255,.4);
        border-radius: 6px;
        color: #9B30FF;
        font-family: 'Orbitron', sans-serif;
        font-size: .44rem;
        letter-spacing: 1.5px;
        cursor: pointer;
      }
      .pr-preview-btn:hover { background: rgba(155,48,255,.35); }
    `;
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────
  // CHECK MASTER TIER
  // ─────────────────────────────────────────────
  function isMasterTier() {
    if (typeof window.isMaster === 'function') return window.isMaster();
    if (typeof window.getTier === 'function') return window.getTier() === 'master';
    try {
      var u = JSON.parse(localStorage.getItem('ub_current_user') || localStorage.getItem('ub_user') || '{}');
      return (u.unipackTier || '').toLowerCase() === 'master';
    } catch(e) { return false; }
  }

  // ─────────────────────────────────────────────
  // INJECT MELODY ROW INTO MIDI GRID
  // ─────────────────────────────────────────────
  function injectMelodyRow() {
    if (document.getElementById('ubMelodyRow')) return;
    var grid = document.getElementById('midiGrid');
    if (!grid) return;

    var master = isMasterTier();

    var row = document.createElement('div');
    row.className = 'melody-row';
    row.id = 'ubMelodyRow';

    // Track head
    var head = document.createElement('div');
    head.className = 'melody-track-head';
    head.innerHTML = '<div class="melody-track-name">🎹 MELODY</div>' +
      (master ? '' : '<span class="melody-locked-badge">👑 MASTER</span>');
    row.appendChild(head);

    // 16 steps
    for (var i = 0; i < 16; i++) {
      var step = document.createElement('div');
      step.className = 'melody-step' + (master ? '' : ' locked');
      step.dataset.step = i;
      step.id = 'ubMelodyStep' + i;
      if (!master) {
        step.title = 'Upgrade to Master tier to use the Melody track';
        step.onclick = function() {
          if (typeof showPaywall === 'function') showPaywall('Melody track (piano roll) is a Master tier feature ($39.99/mo).');
        };
      } else {
        (function(stepIndex) {
          step.onclick = function() { openPianoRoll(stepIndex); };
        })(i);
      }
      row.appendChild(step);
    }

    grid.appendChild(row);
    renderMelodyRow();
  }

  function renderMelodyRow() {
    for (var i = 0; i < 16; i++) {
      var el = document.getElementById('ubMelodyStep' + i);
      if (!el) continue;
      var note = melodySteps[i];
      if (note) {
        el.classList.add('has-note');
        el.textContent = note.note + note.octave;
      } else {
        el.classList.remove('has-note');
        el.textContent = '+';
      }
    }
  }

  // ─────────────────────────────────────────────
  // PIANO ROLL MODAL
  // ─────────────────────────────────────────────
  var _selectedNote = { note: 'C', octave: 4 };
  var _selectedVelocity = 100;

  function injectPianoRollModal() {
    if (document.getElementById('ubPianoRollModal')) return;

    var modal = document.createElement('div');
    modal.className = 'piano-roll-overlay';
    modal.id = 'ubPianoRollModal';
    modal.innerHTML = `
      <div class="piano-roll-modal">
        <div class="piano-roll-title">🎹 Piano Roll</div>
        <div class="piano-roll-sub" id="prStepLabel">Step 1 — Select a note</div>
        <div class="piano-roll-preview">
          <div class="pr-selected-note" id="prSelectedNote">C4</div>
          <button class="pr-preview-btn" onclick="window.ubPreviewNote()">▶ Preview</button>
          <span style="font-family:Orbitron,sans-serif;font-size:.4rem;letter-spacing:1px;color:rgba(240,237,232,.5);">MIDI: <span id="prMidiNum">60</span></span>
        </div>
        <div class="piano-roll-keys" id="prKeys"></div>
        <div class="piano-roll-velocity">
          <label>Velocity: <span id="prVelocityVal">100</span></label>
          <input type="range" class="velocity-slider" id="prVelocitySlider" min="1" max="127" value="100" oninput="window.ubUpdateVelocity(this.value)"/>
        </div>
        <div class="piano-roll-actions">
          <button class="pr-btn pr-btn-set" onclick="window.ubSetMelodyNote()">✓ Set Note</button>
          <button class="pr-btn pr-btn-clear" onclick="window.ubClearMelodyNote()">✕ Clear</button>
          <button class="pr-btn pr-btn-cancel" onclick="window.ubClosePianoRoll()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    buildPianoKeys();
  }

  function buildPianoKeys() {
    var container = document.getElementById('prKeys');
    if (!container) return;
    container.innerHTML = ALL_NOTES.map(function(n) {
      var isSharp = n.name.includes('#');
      return '<div class="piano-key' + (isSharp ? ' sharp' : '') + '" data-note="' + n.name + '" data-octave="' + n.octave + '" onclick="window.ubSelectPianoKey(\'' + n.name + '\',' + n.octave + ',this)">' + n.label + '</div>';
    }).join('');
  }

  window.ubSelectPianoKey = function(note, octave, el) {
    _selectedNote = { note: note, octave: octave };
    document.querySelectorAll('.piano-key').forEach(function(k) { k.classList.remove('selected'); });
    if (el) el.classList.add('selected');
    var midi = noteToMidi(note, octave);
    var label = document.getElementById('prSelectedNote');
    var midiNum = document.getElementById('prMidiNum');
    if (label) label.textContent = note + octave;
    if (midiNum) midiNum.textContent = midi;
    // Auto-preview on select
    window.ubPreviewNote();
  };

  window.ubUpdateVelocity = function(val) {
    _selectedVelocity = parseInt(val);
    var el = document.getElementById('prVelocityVal');
    if (el) el.textContent = val;
  };

  window.ubPreviewNote = function() {
    var midi = noteToMidi(_selectedNote.note, _selectedNote.octave);
    var freq = midiToFreq(midi);
    try {
      var ctx = typeof ensureAudioContext === 'function' ? ensureAudioContext() : new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime((_selectedVelocity / 127) * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  };

  function openPianoRoll(stepIndex) {
    _editingStep = stepIndex;
    var existing = melodySteps[stepIndex];
    if (existing) {
      _selectedNote = { note: existing.note, octave: existing.octave };
      _selectedVelocity = existing.velocity || 100;
    } else {
      _selectedNote = { note: 'C', octave: 4 };
      _selectedVelocity = 100;
    }

    var label = document.getElementById('prStepLabel');
    if (label) label.textContent = 'Step ' + (stepIndex + 1) + ' — Select a note';

    var noteLabel = document.getElementById('prSelectedNote');
    if (noteLabel) noteLabel.textContent = _selectedNote.note + _selectedNote.octave;

    var midiNum = document.getElementById('prMidiNum');
    if (midiNum) midiNum.textContent = noteToMidi(_selectedNote.note, _selectedNote.octave);

    var vel = document.getElementById('prVelocitySlider');
    var velVal = document.getElementById('prVelocityVal');
    if (vel) vel.value = _selectedVelocity;
    if (velVal) velVal.textContent = _selectedVelocity;

    // Highlight selected key
    document.querySelectorAll('.piano-key').forEach(function(k) {
      k.classList.toggle('selected',
        k.dataset.note === _selectedNote.note &&
        parseInt(k.dataset.octave) === _selectedNote.octave
      );
    });

    var modal = document.getElementById('ubPianoRollModal');
    if (modal) modal.classList.add('open');
    _pianoRollOpen = true;
  }

  window.ubSetMelodyNote = function() {
    if (_editingStep === null) return;
    melodySteps[_editingStep] = {
      note: _selectedNote.note,
      octave: _selectedNote.octave,
      velocity: _selectedVelocity,
    };
    renderMelodyRow();
    window.ubClosePianoRoll();
    if (typeof showToast === 'function') showToast('🎹 Note set: ' + _selectedNote.note + _selectedNote.octave);
  };

  window.ubClearMelodyNote = function() {
    if (_editingStep === null) return;
    melodySteps[_editingStep] = null;
    renderMelodyRow();
    window.ubClosePianoRoll();
    if (typeof showToast === 'function') showToast('🗑️ Note cleared');
  };

  window.ubClosePianoRoll = function() {
    var modal = document.getElementById('ubPianoRollModal');
    if (modal) modal.classList.remove('open');
    _pianoRollOpen = false;
    _editingStep = null;
  };

  // ─────────────────────────────────────────────
  // PATCH MIDI PLAY TO INCLUDE MELODY
  // ─────────────────────────────────────────────
  function patchMelodyPlayback() {
    if (window._ubMelodyPatched) return;
    // Wait for swing patch to be done first, then extend it
    var attempts = 0;
    var timer = setInterval(function() {
      attempts++;
      if (window._ubSwingPatched && typeof window.startMidiPlay === 'function') {
        clearInterval(timer);
        window._ubMelodyPatched = true;
        var origStart = window.startMidiPlay;
        window.startMidiPlay = function() {
          origStart.apply(this, arguments);
          // Melody playback is handled by overriding the tick — 
          // instead we hook into the playhead highlight loop via a separate observer
        };

        // Hook melody note triggering via MutationObserver on playhead class
        var observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(m) {
            if (m.type === 'attributes' && m.attributeName === 'class') {
              var el = m.target;
              if (el.classList.contains('playhead') && el.dataset.step !== undefined) {
                var step = parseInt(el.dataset.step);
                // Find which melody step this is
                var melodyEl = document.getElementById('ubMelodyStep' + step);
                if (melodyEl) melodyEl.classList.toggle('playhead', el.classList.contains('playhead'));
                // Play melody note if set
                if (el.classList.contains('playhead') && melodySteps[step]) {
                  playMelodyNote(melodySteps[step]);
                }
              }
            }
          });
        });

        var grid = document.getElementById('midiGrid');
        if (grid) observer.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
      }
      if (attempts > 60) clearInterval(timer);
    }, 200);
  }

  function playMelodyNote(noteObj) {
    if (!noteObj) return;
    var midi = noteToMidi(noteObj.note, noteObj.octave);
    var freq = midiToFreq(midi);
    var vel = (noteObj.velocity || 100) / 127;
    try {
      var ctx = typeof ensureAudioContext === 'function' ? ensureAudioContext() : null;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vel * 0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  }

  // ─────────────────────────────────────────────
  // EXPOSE MELODY STATE FOR MIDI EXPORT
  // ─────────────────────────────────────────────
  window.ubGetMelodySteps = function() { return melodySteps; };
  window.ubSetMelodySteps = function(steps) {
    melodySteps = steps || new Array(16).fill(null);
    renderMelodyRow();
  };

  // ─────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────
  function boot() {
    injectStyles();
    injectPianoRollModal();

    var observer = new MutationObserver(function() {
      var panel = document.getElementById('panel-midi');
      if (panel && panel.classList.contains('active')) {
        var grid = document.getElementById('midiGrid');
        if (grid && grid.children.length > 0) {
          injectMelodyRow();
          patchMelodyPlayback();
        }
      }
    });

    var workspace = document.querySelector('.workspace');
    if (workspace) {
      observer.observe(workspace, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    // Poll fallback
    var attempts = 0;
    var timer = setInterval(function() {
      attempts++;
      var panel = document.getElementById('panel-midi');
      var grid = document.getElementById('midiGrid');
      if (panel && panel.classList.contains('active') && grid && grid.children.length > 0) {
        injectMelodyRow();
        patchMelodyPlayback();
      }
      if (attempts > 80) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 600);
  setTimeout(boot, 1800);

})();
