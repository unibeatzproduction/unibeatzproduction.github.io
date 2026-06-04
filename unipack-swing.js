// unipack-swing.js — v4
// NO switchSection patch — uses MutationObserver instead

(function () {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;

  function injectStyles() {
    if (document.getElementById('ub-swing-style')) return;
    var s = document.createElement('style');
    s.id = 'ub-swing-style';
    s.textContent = '.swing-wrap{display:flex;align-items:center;gap:8px;background:rgba(155,48,255,.08);border:1px solid rgba(155,48,255,.25);border-radius:8px;padding:6px 12px;margin-left:8px;}.swing-label{font-family:"Orbitron",sans-serif;font-size:.44rem;letter-spacing:2px;color:rgba(240,237,232,.6);white-space:nowrap;}.swing-slider{-webkit-appearance:none;appearance:none;width:90px;height:4px;border-radius:2px;background:linear-gradient(90deg,rgba(155,48,255,.4),rgba(155,48,255,.8));outline:none;cursor:pointer;}.swing-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#9B30FF;box-shadow:0 0 6px rgba(155,48,255,.7);cursor:pointer;}.swing-display{font-family:"Orbitron",sans-serif;font-size:.5rem;font-weight:700;color:#9B30FF;min-width:32px;text-align:right;}.swing-groove-row{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:rgba(155,48,255,.04);border:1px solid rgba(155,48,255,.15);border-radius:8px;margin:6px 0;}.groove-btn{padding:5px 10px;border-radius:6px;border:1px solid rgba(155,48,255,.3);background:rgba(155,48,255,.08);color:rgba(240,237,232,.7);font-family:"Orbitron",sans-serif;font-size:.42rem;letter-spacing:1.5px;cursor:pointer;transition:all .2s;}.groove-btn:hover,.groove-btn.active{background:rgba(155,48,255,.25);border-color:#9B30FF;color:#fff;}';
    document.head.appendChild(s);
  }

  window._ubSwingAmount = 0;

  window.ubUpdateSwing = function (val) {
    window._ubSwingAmount = parseInt(val);
    var d = document.getElementById('ubSwingDisplay');
    if (d) d.textContent = val + '%';
    document.querySelectorAll('.groove-btn').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.swing) === window._ubSwingAmount);
    });
  };

  window.ubSetGroove = function (val, btn) {
    window._ubSwingAmount = val;
    var sl = document.getElementById('ubSwingSlider');
    var d = document.getElementById('ubSwingDisplay');
    if (sl) sl.value = val;
    if (d) d.textContent = val + '%';
    document.querySelectorAll('.groove-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var names = {0:'Straight',25:'Light swing',50:'Shuffle',67:'Triplet',85:'Heavy groove'};
    if (typeof showToast === 'function') showToast('🎵 ' + (names[val] || val + '% swing'));
  };

  function injectSwingUI() {
    if (document.getElementById('ubSwingWrap')) return;
    var transport = document.querySelector('.midi-transport');
    if (!transport) return;

    var wrap = document.createElement('div');
    wrap.className = 'swing-wrap';
    wrap.id = 'ubSwingWrap';
    wrap.innerHTML = '<span class="swing-label">🎵 Swing</span><input type="range" class="swing-slider" id="ubSwingSlider" min="0" max="100" value="0" step="1" oninput="window.ubUpdateSwing(this.value)"/><span class="swing-display" id="ubSwingDisplay">0%</span>';
    transport.appendChild(wrap);

    var grooveRow = document.createElement('div');
    grooveRow.className = 'swing-groove-row';
    grooveRow.id = 'ubGrooveRow';
    grooveRow.innerHTML = '<span style="font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;color:rgba(240,237,232,.5);align-self:center;margin-right:4px;">Groove:</span><button class="groove-btn active" data-swing="0" onclick="window.ubSetGroove(0,this)">Straight</button><button class="groove-btn" data-swing="25" onclick="window.ubSetGroove(25,this)">Light</button><button class="groove-btn" data-swing="50" onclick="window.ubSetGroove(50,this)">Shuffle</button><button class="groove-btn" data-swing="67" onclick="window.ubSetGroove(67,this)">Triplet</button><button class="groove-btn" data-swing="85" onclick="window.ubSetGroove(85,this)">Heavy</button>';
    transport.parentNode.insertBefore(grooveRow, transport.nextSibling);

    patchMidiPlay();
  }

  function patchMidiPlay() {
    if (window._ubSwingPatched) return;
    if (typeof window.startMidiPlay !== 'function') return;
    window._ubSwingPatched = true;
    window.startMidiPlay = function () {
      if (typeof ensureAudioContext === 'function') {
        var ctx = ensureAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      }
      if (typeof midiState === 'undefined') return;
      midiState.playing = true;
      midiState.currentStep = -1;
      if (midiState.playTimer) { clearTimeout(midiState.playTimer); midiState.playTimer = null; }
      var btn = document.getElementById('midiPlayBtn');
      if (btn) { btn.textContent = '⏹ Stop'; btn.classList.add('playing'); }
      var tick = function () {
        if (!midiState.playing) return;
        midiState.currentStep = (midiState.currentStep + 1) % 16;
        if (typeof MIDI_TRACKS !== 'undefined') {
          MIDI_TRACKS.forEach(function (t) {
            if (midiState.steps[t.id] && midiState.steps[t.id][midiState.currentStep]) {
              if (typeof playMidiHit === 'function') playMidiHit(t.id);
            }
          });
        }
        document.querySelectorAll('.midi-step.playhead').forEach(function (el) { el.classList.remove('playhead'); });
        document.querySelectorAll('.midi-step[data-step="' + midiState.currentStep + '"]').forEach(function (el) { el.classList.add('playhead'); });
        var bpm = midiState.tempo || 140;
        var base = (60 / bpm) * 1000 / 4;
        var sw = (window._ubSwingAmount || 0) / 100;
        var off = (midiState.currentStep % 2 === 1);
        var stepMs = sw === 0 ? base : (off ? base * (1 + sw * 0.5) : base * (1 - sw * 0.25));
        midiState.playTimer = setTimeout(tick, Math.max(10, stepMs));
      };
      tick();
    };
  }

  function boot() {
    injectStyles();

    // Watch for MIDI panel becoming active via class change
    var observer = new MutationObserver(function () {
      var panel = document.getElementById('panel-midi');
      if (panel && panel.classList.contains('active')) {
        injectSwingUI();
      }
    });

    var workspace = document.querySelector('.workspace');
    if (workspace) {
      observer.observe(workspace, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    // Also poll as fallback
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      var panel = document.getElementById('panel-midi');
      if (panel && panel.classList.contains('active')) injectSwingUI();
      if (typeof window.startMidiPlay === 'function' && !window._ubSwingPatched) patchMidiPlay();
      if (attempts > 80) clearInterval(timer);
    }, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);

})();
