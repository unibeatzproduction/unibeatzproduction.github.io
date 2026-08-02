// unibeatz-midi-engine.js
// UniBeatz Plug-and-Play MIDI Engine
// Auto-detects controller, loads profile from Firestore, falls back to calibration wizard
// Shared by radio.unibeatzproduction.com and battle.unibeatzproduction.com

(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const FIRESTORE_COLLECTION = 'midi_profiles';
  const LOCAL_STORAGE_KEY = 'ub_midi_profiles_cache';
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // ── Action → UniBeatz deck function mapping ──
  const ACTION_MAP = {
    deck1_play:    (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('playA', v),
    deck1_cue:     (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('cueA', v),
    deck1_sync:    (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('syncA', v),
    deck1_loop_in: (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('loop4A', v),
    deck1_loop_out:(v) => v > 0 && window.ubDeckAction && window.ubDeckAction('loopOffA', v),
    deck1_shift:   (v) => { _shift.A = v > 0; },
    deck1_vinyl:   (v) => v > 0 && toggleScratch(),
    deck1_jog:     (v) => window.ubDeckAction && window.ubDeckAction('jogA', v),
    deck1_pitch:   (v) => window.ubDeckAction && window.ubDeckAction('pitchA', v),
    deck1_volume:  (v) => window.ubDeckAction && window.ubDeckAction('volumeA', v),
    deck1_eq_high: (v) => window.ubDeckAction && window.ubDeckAction('eqHighA', v),
    deck1_eq_mid:  (v) => window.ubDeckAction && window.ubDeckAction('eqMidA', v),
    deck1_eq_low:  (v) => window.ubDeckAction && window.ubDeckAction('eqLowA', v),
    deck1_filter:  (v) => window.ubDeckAction && window.ubDeckAction('filterA', v),
    deck1_pad0:    (v) => v > 0 && handlePad('A', 0),
    deck1_pad1:    (v) => v > 0 && handlePad('A', 1),
    deck1_pad2:    (v) => v > 0 && handlePad('A', 2),
    deck1_pad3:    (v) => v > 0 && handlePad('A', 3),
    deck1_pad4:    (v) => v > 0 && handlePad('A', 4),
    deck1_pad5:    (v) => v > 0 && handlePad('A', 5),
    deck1_pad6:    (v) => v > 0 && handlePad('A', 6),
    deck1_pad7:    (v) => v > 0 && handlePad('A', 7),
    deck2_play:    (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('playB', v),
    deck2_cue:     (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('cueB', v),
    deck2_sync:    (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('syncB', v),
    deck2_loop_in: (v) => v > 0 && window.ubDeckAction && window.ubDeckAction('loop4B', v),
    deck2_loop_out:(v) => v > 0 && window.ubDeckAction && window.ubDeckAction('loopOffB', v),
    deck2_shift:   (v) => { _shift.B = v > 0; },
    deck2_vinyl:   (v) => v > 0 && toggleScratch(),
    deck2_jog:     (v) => window.ubDeckAction && window.ubDeckAction('jogB', v),
    deck2_pitch:   (v) => window.ubDeckAction && window.ubDeckAction('pitchB', v),
    deck2_volume:  (v) => window.ubDeckAction && window.ubDeckAction('volumeB', v),
    deck2_eq_high: (v) => window.ubDeckAction && window.ubDeckAction('eqHighB', v),
    deck2_eq_mid:  (v) => window.ubDeckAction && window.ubDeckAction('eqMidB', v),
    deck2_eq_low:  (v) => window.ubDeckAction && window.ubDeckAction('eqLowB', v),
    deck2_filter:  (v) => window.ubDeckAction && window.ubDeckAction('filterB', v),
    deck2_pad0:    (v) => v > 0 && handlePad('B', 0),
    deck2_pad1:    (v) => v > 0 && handlePad('B', 1),
    deck2_pad2:    (v) => v > 0 && handlePad('B', 2),
    deck2_pad3:    (v) => v > 0 && handlePad('B', 3),
    deck2_pad4:    (v) => v > 0 && handlePad('B', 4),
    deck2_pad5:    (v) => v > 0 && handlePad('B', 5),
    deck2_pad6:    (v) => v > 0 && handlePad('B', 6),
    deck2_pad7:    (v) => v > 0 && handlePad('B', 7),
    crossfader:    (v) => window.ubDeckAction && window.ubDeckAction('crossfader', v),
    pitch_wheel:   (v, lsb, msb) => handlePitchWheel(lsb, msb)
  };

  const PAD_ACTIONS = {
    A: { 0:'loop4A', 1:'loop2A', 2:'loop1A', 3:'loopHA', 4:'fxBassA', 5:'fxFilterA', 6:'fxReverbA', 7:'fxStutterA' },
    B: { 0:'loop4B', 1:'loop2B', 2:'loop1B', 3:'loopHB', 4:'fxBassB', 5:'fxFilterB', 6:'fxReverbB', 7:'fxStutterB' }
  };

  let _state = {
    midiAccess: null,
    activeProfile: null,
    deviceName: null,
    lookupTable: null, // fast signal → action map
    calibrating: false,
    calibrationStep: null,
    calibrationMappings: {},
    connected: false
  };

  let _shift = { A: false, B: false };
  let _scratchMode = true;
  let _jogResetTimers = {};

  // ── Pad handler ──
  function handlePad(deck, padNum) {
    const actions = PAD_ACTIONS[deck];
    const action = _shift[deck]
      ? { 0:'fxBassA', 1:'fxFilterA', 2:'fxReverbA', 3:'fxStutterA',
          4:'fxBassB', 5:'fxFilterB', 6:'fxReverbB', 7:'fxStutterB' }[padNum + (deck === 'B' ? 4 : 0)]
      : actions[padNum];
    if (action && window.ubDeckAction) window.ubDeckAction(action, 127);
  }

  function toggleScratch() {
    _scratchMode = !_scratchMode;
    notify('Scratch mode ' + (_scratchMode ? 'ON' : 'OFF'));
  }

  function handlePitchWheel(lsb, msb) {
    const raw = ((msb & 0x7F) << 7) | (lsb & 0x7F);
    const centered = raw - 8192;
    const normalized = centered / 8192;
    if (window.ubDeckAction) window.ubDeckAction('scratch', normalized);
  }

  // ── Notify UI ──
  function notify(msg, color) {
    const el = document.getElementById('ubMidiStatus') ||
               document.getElementById('lastMidiSignal') ||
               document.getElementById('midiStatus');
    if (el) { el.textContent = msg; if (color) el.style.color = color; }
    console.log('[MIDI Engine]', msg);
    window.dispatchEvent(new CustomEvent('ub-midi-status', { detail: { msg, color } }));
  }

  // ── Build lookup table from profile ──
  function buildLookupTable(profile) {
    const table = {};
    const mappings = profile.mappings || {};
    Object.entries(mappings).forEach(([action, mapping]) => {
      const key = mapping.status + '_' + (mapping.note !== undefined ? mapping.note : mapping.control);
      if (!table[key]) table[key] = [];
      table[key].push({ action, mapping });
    });
    return table;
  }

  // ── Profile matching ──
  function matchProfile(deviceName, profiles) {
    const lower = deviceName.toLowerCase();
    return profiles.find(p => {
      if (lower.includes(p.device_name.toLowerCase())) return true;
      return (p.aliases || []).some(a => lower.includes(a.toLowerCase()));
    }) || null;
  }

  // ── Load profiles ──
  async function loadProfiles() {
    // 1. Try Firestore
    try {
      const fb = window.UB_FIREBASE;
      if (fb && fb.db) {
        const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
        const snap = await getDocs(collection(fb.db, FIRESTORE_COLLECTION));
        if (!snap.empty) {
          const profiles = [];
          snap.forEach(d => profiles.push(d.data()));
          // Cache locally
          try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ profiles, ts: Date.now() })); } catch(e) {}
          return profiles;
        }
      }
    } catch (e) { console.warn('[MIDI] Firestore load failed:', e.message); }

    // 2. Try local cache
    try {
      const cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || 'null');
      if (cached && cached.profiles && Date.now() - cached.ts < CACHE_TTL) return cached.profiles;
    } catch(e) {}

    // 3. Fall back to bundled JSON
    try {
      const resp = await fetch('/unibeatz-midi-profiles.json');
      if (resp.ok) {
        const data = await resp.json();
        return data.profiles || [];
      }
    } catch(e) {}

    return [];
  }

  // ── Save new profile to Firestore ──
  async function saveProfileToFirestore(profile) {
    try {
      const fb = window.UB_FIREBASE;
      if (!fb || !fb.db) return;
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      const id = profile.device_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await setDoc(doc(fb.db, FIRESTORE_COLLECTION, id), {
        ...profile,
        submittedAt: Date.now(),
        approved: true // auto-publish
      });
      notify('✅ Controller profile saved & shared with community!', '#00e676');
    } catch(e) {
      console.warn('[MIDI] Profile save failed:', e.message);
    }
  }

  // ── MIDI Message Handler ──
  function onMidiMessage(e) {
    const data = [...e.data];
    const status = data[0], note = data[1], val = data[2] || 0;

    // Update signal display
    const sigEl = document.getElementById('lastMidiSignal');
    if (sigEl) sigEl.textContent = status + '-' + note + ' val ' + val;

    // Calibration mode
    if (_state.calibrating) {
      handleCalibrationSignal(status, note, val);
      return;
    }

    if (!_state.lookupTable) return;

    // Pitch bend
    if ((status & 0xF0) === 0xE0) {
      handlePitchWheel(note, val);
      return;
    }

    // Look up action
    const key = status + '_' + note;
    const matches = _state.lookupTable[key];
    if (!matches) return;

    matches.forEach(({ action }) => {
      const fn = ACTION_MAP[action];
      if (fn) fn(val, note, val);
    });

    // Dispatch event for other listeners
    window.dispatchEvent(new CustomEvent('ub-dj-action', {
      detail: { action: midiActionToUbAction(matches[0]?.action, val), signal: { value: val } }
    }));
  }

  function midiActionToUbAction(action, val) {
    // Convert deck1_play → playA etc for legacy listeners
    return action
      .replace('deck1_', '').replace('deck2_', '')
      .replace('play', val > 0 ? 'playA' : '')
      .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  // ── Connect ──
  async function connect() {
    if (!navigator.requestMIDIAccess) {
      notify('⚠️ Web MIDI not supported. Use Chrome or Edge on desktop.', '#ff7474');
      return false;
    }

    try {
      _state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch(e) {
      notify('⚠️ MIDI access denied: ' + e.message, '#ff7474');
      return false;
    }

    // Load profiles
    notify('Loading controller profiles...', '#F0C040');
    const profiles = await loadProfiles();

    // Attach to all inputs
    let found = false;
    _state.midiAccess.inputs.forEach(input => {
      input.onmidimessage = onMidiMessage;
      updateDeviceUI(input.name, true);

      if (!found) {
        const profile = matchProfile(input.name, profiles);
        if (profile) {
          _state.activeProfile = profile;
          _state.deviceName = input.name;
          _state.lookupTable = buildLookupTable(profile);
          found = true;
          notify('✅ ' + profile.device_name + ' detected — ready!', '#00e676');
          updateDeviceUI(input.name, true, profile.device_name);
        } else {
          notify('⚠️ Unknown controller: ' + input.name + ' — starting calibration...', '#F0C040');
          _state.deviceName = input.name;
          setTimeout(() => startCalibration(input.name), 800);
        }
      }
    });

    if (_state.midiAccess.inputs.size === 0) {
      notify('No MIDI device detected. Plug in your controller and try again.', '#ff7474');
      return false;
    }

    // Hot-plug
    _state.midiAccess.onstatechange = (e) => {
      if (e.port.type === 'input') {
        if (e.port.state === 'connected') {
          e.port.onmidimessage = onMidiMessage;
          notify('🎛️ ' + e.port.name + ' connected', '#00e676');
          loadProfiles().then(profiles => {
            const profile = matchProfile(e.port.name, profiles);
            if (profile) {
              _state.activeProfile = profile;
              _state.lookupTable = buildLookupTable(profile);
              notify('✅ ' + profile.device_name + ' loaded', '#00e676');
            }
          });
        } else {
          notify('⚡ Controller disconnected', '#ff7474');
          updateDeviceUI(e.port.name, false);
        }
      }
    };

    _state.connected = true;
    return true;
  }

  // ── Update device UI ──
  function updateDeviceUI(rawName, connected, profileName) {
    const el = document.getElementById('midiDevices') || document.getElementById('ubMidiDevice');
    if (el) el.textContent = connected ? (profileName || rawName) : 'None detected';
  }

  // ─────────────────────────────────────────
  // CALIBRATION WIZARD
  // ─────────────────────────────────────────

  const CALIBRATION_STEPS = [
    { id: 'deck1_play',    label: 'Press PLAY button on Deck 1' },
    { id: 'deck1_cue',     label: 'Press CUE button on Deck 1' },
    { id: 'deck1_sync',    label: 'Press SYNC button on Deck 1' },
    { id: 'deck1_jog',     label: 'Spin the JOG WHEEL on Deck 1' },
    { id: 'deck1_volume',  label: 'Move the VOLUME FADER on Deck 1' },
    { id: 'deck1_pitch',   label: 'Move the PITCH/TEMPO FADER on Deck 1' },
    { id: 'deck1_eq_high', label: 'Turn the HIGH EQ KNOB on Deck 1' },
    { id: 'deck1_eq_low',  label: 'Turn the LOW EQ KNOB on Deck 1' },
    { id: 'crossfader',    label: 'Move the CROSSFADER' },
    { id: 'deck2_play',    label: 'Press PLAY button on Deck 2' },
    { id: 'deck2_cue',     label: 'Press CUE button on Deck 2' },
    { id: 'deck2_jog',     label: 'Spin the JOG WHEEL on Deck 2' },
    { id: 'deck2_volume',  label: 'Move the VOLUME FADER on Deck 2' },
    { id: 'deck2_pitch',   label: 'Move the PITCH/TEMPO FADER on Deck 2' }
  ];

  let _calStepIndex = 0;
  let _calSkipTimer = null;

  function startCalibration(deviceName) {
    _state.calibrating = true;
    _calStepIndex = 0;
    _state.calibrationMappings = {};

    showCalibrationUI(deviceName);
    nextCalibrationStep();
  }

  function showCalibrationUI(deviceName) {
    // Remove existing
    document.getElementById('ubCalibrationOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ubCalibrationOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(7,7,9,.97);
      display:flex;align-items:center;justify-content:center;flex-direction:column;
      gap:20px;padding:24px;font-family:'Orbitron',sans-serif;
    `;
    overlay.innerHTML = `
      <div style="font-size:2.5rem;font-family:'Bebas Neue',sans-serif;letter-spacing:4px;color:#F0C040;">CONTROLLER SETUP</div>
      <div style="font-size:.5rem;letter-spacing:3px;color:#9aa3b8;text-align:center;">
        ${deviceName || 'Unknown Controller'} · UniBeatz will learn your controller in ${CALIBRATION_STEPS.length} steps
      </div>
      <div style="width:100%;max-width:420px;background:#0f0f14;border:1px solid rgba(201,168,76,.3);border-radius:12px;padding:24px;text-align:center;">
        <div id="ubCalStep" style="font-size:.42rem;letter-spacing:2px;color:#6b7280;margin-bottom:12px;">STEP 1 / ${CALIBRATION_STEPS.length}</div>
        <div id="ubCalInstruction" style="font-size:1.1rem;color:#f0ede8;line-height:1.5;margin-bottom:20px;">Initializing...</div>
        <div id="ubCalSignal" style="font-family:'Share Tech Mono',monospace;font-size:.75rem;color:#40D0FF;min-height:20px;"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
          <button id="ubCalSkip" onclick="window.ubMidi.skipCalStep()"
            style="padding:8px 16px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:#1c1c28;color:#9aa3b8;cursor:pointer;font-family:inherit;font-size:.38rem;letter-spacing:1px;">
            SKIP
          </button>
          <button id="ubCalCancel" onclick="window.ubMidi.cancelCalibration()"
            style="padding:8px 16px;border-radius:7px;border:1px solid rgba(255,60,60,.3);background:rgba(255,60,60,.08);color:#ff7474;cursor:pointer;font-family:inherit;font-size:.38rem;letter-spacing:1px;">
            CANCEL
          </button>
        </div>
      </div>
      <div id="ubCalProgress" style="width:100%;max-width:420px;height:4px;background:#1c1c28;border-radius:2px;overflow:hidden;">
        <div id="ubCalProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#C9A84C,#F0C040);transition:width .3s;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function nextCalibrationStep() {
    if (_calStepIndex >= CALIBRATION_STEPS.length) {
      finishCalibration();
      return;
    }

    const step = CALIBRATION_STEPS[_calStepIndex];
    _state.calibrationStep = step.id;

    const instrEl = document.getElementById('ubCalInstruction');
    const stepEl  = document.getElementById('ubCalStep');
    const sigEl   = document.getElementById('ubCalSignal');
    const bar     = document.getElementById('ubCalProgressBar');

    if (instrEl) instrEl.textContent = step.label;
    if (stepEl)  stepEl.textContent  = 'STEP ' + (_calStepIndex + 1) + ' / ' + CALIBRATION_STEPS.length;
    if (sigEl)   sigEl.textContent   = 'Waiting for input...';
    if (bar)     bar.style.width     = Math.round((_calStepIndex / CALIBRATION_STEPS.length) * 100) + '%';

    clearTimeout(_calSkipTimer);
    _calSkipTimer = setTimeout(() => skipCalStep(), 15000);
  }

  function handleCalibrationSignal(status, note, val) {
    if (!_state.calibrationStep) return;
    // Ignore note-off (val=0 for buttons)
    const type = guessType(_state.calibrationStep);
    if (type === 'button' && val === 0) return;
    if (val === 0 && type !== 'fader' && type !== 'knob' && type !== 'jog') return;

    const sigEl = document.getElementById('ubCalSignal');
    if (sigEl) sigEl.textContent = '✅ Captured: ' + status + '-' + note + ' (val ' + val + ')';

    _state.calibrationMappings[_state.calibrationStep] = {
      status, note: (status & 0xF0) === 0xB0 ? undefined : note,
      control: (status & 0xF0) === 0xB0 ? note : undefined,
      channel: status & 0x0F,
      type: guessType(_state.calibrationStep)
    };

    // Clean up undefined
    const m = _state.calibrationMappings[_state.calibrationStep];
    if (m.note === undefined) delete m.note;
    if (m.control === undefined) delete m.control;

    _calStepIndex++;
    clearTimeout(_calSkipTimer);
    setTimeout(() => nextCalibrationStep(), 600);
  }

  function guessType(actionId) {
    if (actionId.includes('jog'))      return 'jog';
    if (actionId.includes('pitch') || actionId.includes('volume') || actionId === 'crossfader') return 'fader';
    if (actionId.includes('eq') || actionId.includes('filter') || actionId.includes('gain')) return 'knob';
    if (actionId.includes('pad'))      return 'pad';
    return 'button';
  }

  function skipCalStep() {
    clearTimeout(_calSkipTimer);
    _calStepIndex++;
    nextCalibrationStep();
  }

  function cancelCalibration() {
    clearTimeout(_calSkipTimer);
    _state.calibrating = false;
    _state.calibrationStep = null;
    document.getElementById('ubCalibrationOverlay')?.remove();
    notify('Calibration cancelled. Using manual MIDI learn instead.', '#F0C040');
  }

  async function finishCalibration() {
    clearTimeout(_calSkipTimer);
    _state.calibrating = false;
    _state.calibrationStep = null;

    const overlay = document.getElementById('ubCalibrationOverlay');
    if (overlay) {
      overlay.innerHTML = `
        <div style="font-family:'Bebas Neue',sans-serif;font-size:2.5rem;letter-spacing:4px;color:#00e676;text-align:center;">CALIBRATION COMPLETE!</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:.45rem;letter-spacing:2px;color:#9aa3b8;text-align:center;">
          Saving your controller profile...<br>
          Other UniBeatz DJs with the same controller will auto-load this.
        </div>`;
    }

    // Build and save profile
    const profile = {
      device_name: _state.deviceName,
      aliases: [_state.deviceName.toLowerCase()],
      manufacturer: 'Custom',
      mappings: _state.calibrationMappings,
      calibrated: true,
      version: VERSION
    };

    _state.activeProfile = profile;
    _state.lookupTable = buildLookupTable(profile);

    // Save to Firestore — auto-publish
    await saveProfileToFirestore(profile);

    // Save locally too
    try {
      const cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{"profiles":[]}');
      cached.profiles = cached.profiles.filter(p => p.device_name !== profile.device_name);
      cached.profiles.push(profile);
      cached.ts = Date.now();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cached));
    } catch(e) {}

    setTimeout(() => {
      document.getElementById('ubCalibrationOverlay')?.remove();
      notify('✅ Controller calibrated and saved!', '#00e676');
    }, 2000);
  }

  // ── Public API ──
  global.ubMidi = {
    connect,
    disconnect: () => {
      if (_state.midiAccess) {
        _state.midiAccess.inputs.forEach(i => { i.onmidimessage = null; });
      }
      _state.connected = false;
      notify('MIDI disconnected');
    },
    skipCalStep,
    cancelCalibration,
    finishCalibration,
    getProfile: () => _state.activeProfile,
    getDeviceName: () => _state.deviceName,
    isConnected: () => _state.connected,
    loadProfiles,
    saveProfile: saveProfileToFirestore,
    version: VERSION
  };

  // Auto-wire Connect MIDI buttons
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('connectMidi') || document.getElementById('ubConnectMidi');
    if (btn && !btn._ubMidiWired) {
      btn._ubMidiWired = true;
      btn.onclick = () => global.ubMidi.connect();
    }
  });

  console.log('[UniBeatz MIDI Engine] v' + VERSION + ' loaded');

})(window);
