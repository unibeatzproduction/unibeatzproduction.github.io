// js/dj-midi-controller.js
// UniBeatz Universal DJ Controller Engine
// Shared by UniBeatz Radio + UniFreestyle Battle
// Supports: Web MIDI, WebHID discovery, hot-plug reconnect, Learn Mode,
// saved per-device mappings, generic unknown-controller fallback, and deck actions.

(function () {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'ub_universal_dj_controller_v1';

  const state = {
    midiAccess: null,
    midiInputs: new Map(),
    midiOutputs: new Map(),
    hidDevices: new Map(),
    selectedInputId: null,
    selectedOutputId: null,
    selectedHidKey: null,
    learnAction: null,
    connected: false,
    profiles: {},
    lastSignal: null,
    platform: detectPlatform()
  };

  function detectPlatform() {
    const meta = document.querySelector('meta[name="ub-platform"]')?.content;
    if (meta) return String(meta).toLowerCase();
    if (location.hostname.includes('radio')) return 'radio';
    if (location.hostname.includes('battle')) return 'battle';
    return 'generic';
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.profiles = parsed.profiles || {};
      state.selectedInputId = parsed.selectedInputId || null;
      state.selectedOutputId = parsed.selectedOutputId || null;
    } catch (_) {
      state.profiles = {};
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profiles: state.profiles,
      selectedInputId: state.selectedInputId,
      selectedOutputId: state.selectedOutputId
    }));
  }

  function safe(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }

  function notify(message, color = '#40D0FF') {
    const ids = ['djControllerNotice', 'deckNotice', 'midiStatus', 'liveError'];
    let shown = false;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = message;
        el.style.color = color;
        shown = true;
      }
    }
    if (!shown && typeof window.showToast === 'function') window.showToast(message);
    console.log('[UniBeatz DJ]', message);
  }

  function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function deviceKey(port) {
    return [
      port.manufacturer || 'unknown',
      port.name || 'controller',
      port.type || 'midi'
    ].join('::').toLowerCase();
  }

  function hidKey(device) {
    return `hid::${device.vendorId || 0}::${device.productId || 0}::${device.productName || 'controller'}`.toLowerCase();
  }

  function ensureProfile(key, label) {
    if (!state.profiles[key]) {
      state.profiles[key] = {
        label: label || key,
        mappings: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    return state.profiles[key];
  }

  function signalKey(source, data) {
    if (source === 'hid') {
      return `hid:${data.reportId}:${Array.from(data.bytes || []).join('.')}`;
    }

    const bytes = Array.from(data || []);
    const status = bytes[0] || 0;
    const type = status & 0xF0;
    const channel = status & 0x0F;

    if (type === 0xE0) return `midi:pitch:${channel}`;
    return `midi:${type}:${channel}:${bytes[1] || 0}`;
  }

  function normalizeMidi(data) {
    const b = Array.from(data || []);
    const status = b[0] || 0;
    const type = status & 0xF0;
    const channel = status & 0x0F;
    const number = b[1] || 0;
    const value = b[2] || 0;

    return {
      raw: b,
      status,
      type,
      channel,
      number,
      value,
      isNoteOn: type === 0x90 && value > 0,
      isNoteOff: type === 0x80 || (type === 0x90 && value === 0),
      isCC: type === 0xB0,
      isPitch: type === 0xE0,
      pitch14: type === 0xE0 ? ((value << 7) | number) : null,
      normalized: type === 0xE0 ? (((value << 7) | number) / 16383) : value / 127
    };
  }

  function relativeDelta(value) {
    if (value === 64 || value === 0) return 0;
    if (value < 64) return value;
    return value - 128;
  }

  function deckAudio(deck) {
    if (state.platform === 'radio') {
      return document.getElementById(deck === 'A' ? 'deckA' : 'deckB');
    }
    return document.getElementById('battleBeatAudio');
  }

  function clickFirst(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.click();
        return true;
      }
    }
    return false;
  }

  function setRange(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    el.value = min + (max - min) * Math.max(0, Math.min(1, value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function adjustAudioTime(audio, deltaSeconds) {
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + deltaSeconds));
  }

  function runAction(action, signal) {
    const value = signal?.normalized ?? 1;
    const pressed = signal?.isNoteOn ?? true;
    const delta = signal?.isCC ? relativeDelta(signal.value) : 0;

    // Transport
    if (action === 'playA' || action === 'playB') {
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      if (!pressed || !audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return;
    }

    if (action === 'cueA' || action === 'cueB') {
      if (!pressed) return;
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }

    if (action === 'stopA' || action === 'stopB') {
      if (!pressed) return;
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }

    // Mixer
    if (action === 'crossfader') {
      setRange('crossfader', value);
      return;
    }

    if (action === 'volumeA' || action === 'volumeB') {
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      if (audio) audio.volume = Math.max(0, Math.min(1, value));
      setRange(deck === 'A' ? 'gainA' : 'gainB', value);
      return;
    }

    if (action === 'pitchA' || action === 'pitchB') {
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      const pct = (value * 16) - 8;
      if (audio) audio.playbackRate = 1 + pct / 100;
      const slider = document.getElementById(deck === 'A' ? 'pitchA' : 'pitchB');
      if (slider) {
        slider.value = pct;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    // Jog wheels: supports absolute and common relative encodings
    if (action === 'jogA' || action === 'jogB') {
      const deck = action.endsWith('A') ? 'A' : 'B';
      const audio = deckAudio(deck);
      if (!audio) return;
      const d = signal.isCC ? relativeDelta(signal.value) : ((value - .5) * 8);
      adjustAudioTime(audio, d * 0.035);
      return;
    }

    // Radio-specific
    if (action === 'mic') {
      if (!pressed) return;
      if (!clickFirst(['micToggle'])) {
        if (typeof window.toggleMic === 'function') window.toggleMic();
      }
      return;
    }

    if (action === 'broadcast') {
      if (!pressed) return;
      clickFirst(['startBroadcast']);
      return;
    }

    if (action === 'drop') {
      if (!pressed) return;
      if (typeof window.triggerNextDrop === 'function') window.triggerNextDrop();
      else document.querySelector('[data-pad]')?.click();
      return;
    }

    // Battle-specific
    if (action === 'battleMic') {
      if (!pressed) return;
      if (typeof window.toggleLiveMic === 'function') window.toggleLiveMic();
      else if (window.ubBattle?.toggleMic) window.ubBattle.toggleMic();
      return;
    }

    if (action === 'battleCamera') {
      if (!pressed) return;
      if (typeof window.toggleLiveCamera === 'function') window.toggleLiveCamera();
      else if (window.ubBattle?.toggleCam) window.ubBattle.toggleCam();
      return;
    }

    if (action === 'joinArtist') {
      if (!pressed) return;
      if (typeof window.joinLiveBattleAs === 'function') window.joinLiveBattleAs('artist');
      return;
    }

    if (action === 'joinDJ') {
      if (!pressed) return;
      if (typeof window.joinLiveBattleAs === 'function') window.joinLiveBattleAs('dj');
      return;
    }

    if (action === 'nextBeat') {
      if (!pressed) return;
      const buttons = [...document.querySelectorAll('#djBeatList button')];
      if (buttons.length) buttons[0].click();
      return;
    }

    // Generic clickable target: element ID or CSS selector
    if (action.startsWith('click:') && pressed) {
      const selector = action.slice(6);
      document.querySelector(selector)?.click();
      return;
    }

    dispatch('ub-dj-action', { action, signal, platform: state.platform });
  }

  function autoGuessAction(port, signal) {
    // Known common DJ mappings. These are only defaults; Learn Mode overrides them.
    const name = `${port?.manufacturer || ''} ${port?.name || ''}`.toLowerCase();
    const n = signal.number;
    const t = signal.type;
    const ch = signal.channel;
    const deck = ch % 2 === 0 ? 'A' : 'B';

    // Hercules Inpulse family common mapping
    if (name.includes('hercules') || name.includes('djcontrol') || name.includes('inpulse')) {
      if (t === 0x90) {
        if (n === 0x0B) return `play${deck}`;
        if (n === 0x0C) return `cue${deck}`;
        if (n === 0x15) return `sync${deck}`;
        if (n === 0x10) return `shift${deck}`;   // Shift button
        if (n === 0x17) return `vinyl${deck}`;   // Vinyl/scratch mode
        if (n === 0x14) return `loop4${deck}`;   // Loop IN → 4 bar
        if (n === 0x13) return `loopOff${deck}`; // Loop OUT → off
        // Pads
        if (n === 0x00) return `pad0${deck}`;
        if (n === 0x01) return `pad1${deck}`;
        if (n === 0x02) return `pad2${deck}`;
        if (n === 0x03) return `pad3${deck}`;
      }
      if (t === 0xB0) {
        if (n === 0x00) return `pitch${deck}`;
        if (n === 0x05) return `eqHigh${deck}`;
        if (n === 0x06) return `eqLow${deck}`;
        if (n === 0x07) return 'crossfader';
        if (n === 0x08) return `volume${deck}`;
        if (n === 0x46) return `filter${deck}`;
        if (n === 0x60) return `jog${deck}`;
      }
    }

    // Generic MIDI convention fallbacks
    if (t === 0x90 && n === 0) return `play${deck}`;
    if (t === 0x90 && n === 1) return `cue${deck}`;
    if (t === 0xB0 && n === 7) return 'crossfader';
    return null;
  }

  function handleMidiMessage(event) {
    const port = event.currentTarget || event.target;
    const signal = normalizeMidi(event.data);
    const key = signalKey('midi', event.data);
    const profileKey = deviceKey(port);
    const profile = ensureProfile(profileKey, port.name);
    state.lastSignal = { source: 'midi', key, signal, device: profileKey };

    updateSignalUI(`${port.name || 'MIDI'} · ${key} · ${signal.value}`);

    if (state.learnAction) {
      profile.mappings[key] = state.learnAction;
      profile.updatedAt = Date.now();
      saveStore();
      notify(`Mapped ${port.name || 'controller'} to ${state.learnAction}`, '#5dff9e');
      renderPanel();
      state.learnAction = null;
      return;
    }

    const action = profile.mappings[key] || autoGuessAction(port, signal);
    if (action) runAction(action, signal);

    dispatch('ub-dj-midi', { port, signal, key, action });
  }

  function attachMidiPorts() {
    if (!state.midiAccess) return;

    state.midiInputs.clear();
    state.midiOutputs.clear();

    for (const input of state.midiAccess.inputs.values()) {
      state.midiInputs.set(input.id, input);
      input.onmidimessage = handleMidiMessage;
    }

    for (const output of state.midiAccess.outputs.values()) {
      state.midiOutputs.set(output.id, output);
    }

    if (!state.selectedInputId || !state.midiInputs.has(state.selectedInputId)) {
      state.selectedInputId = state.midiInputs.keys().next().value || null;
    }
    if (!state.selectedOutputId || !state.midiOutputs.has(state.selectedOutputId)) {
      state.selectedOutputId = state.midiOutputs.keys().next().value || null;
    }

    state.connected = state.midiInputs.size > 0 || state.hidDevices.size > 0;
    saveStore();
    renderPanel();

    const names = [...state.midiInputs.values()].map(x => x.name).join(', ');
    notify(
      state.midiInputs.size
        ? `DJ equipment connected: ${names}`
        : 'MIDI is ready, but no MIDI input is exposed by the controller.',
      state.midiInputs.size ? '#5dff9e' : '#F0C040'
    );
  }

  async function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      notify('Web MIDI is unavailable. Use Chrome or Edge desktop over HTTPS.', '#ff7474');
      return false;
    }

    try {
      state.midiAccess = await navigator.requestMIDIAccess({ sysex: true }).catch(
        () => navigator.requestMIDIAccess({ sysex: false })
      );
      state.midiAccess.onstatechange = attachMidiPorts;
      attachMidiPorts();
      return true;
    } catch (error) {
      notify(`MIDI connection failed: ${error.message || error}`, '#ff7474');
      return false;
    }
  }

  function handleHidReport(event) {
    const device = event.device;
    const bytes = new Uint8Array(event.data.buffer);
    const key = signalKey('hid', { reportId: event.reportId, bytes });
    const profileKey = hidKey(device);
    const profile = ensureProfile(profileKey, device.productName);
    const signal = {
      reportId: event.reportId,
      bytes,
      normalized: bytes.length ? bytes[bytes.length - 1] / 255 : 1,
      value: bytes.length ? bytes[bytes.length - 1] : 0,
      isNoteOn: true,
      isCC: false
    };

    state.lastSignal = { source: 'hid', key, signal, device: profileKey };
    updateSignalUI(`${device.productName || 'HID'} · report ${event.reportId} · ${Array.from(bytes).join(',')}`);

    if (state.learnAction) {
      profile.mappings[key] = state.learnAction;
      profile.updatedAt = Date.now();
      saveStore();
      notify(`Mapped ${device.productName || 'HID controller'} to ${state.learnAction}`, '#5dff9e');
      renderPanel();
      state.learnAction = null;
      return;
    }

    const action = profile.mappings[key];
    if (action) runAction(action, signal);
    dispatch('ub-dj-hid', { device, signal, key, action });
  }

  async function openGrantedHidDevices() {
    if (!navigator.hid) return;
    const devices = await navigator.hid.getDevices();
    for (const device of devices) {
      try {
        if (!device.opened) await device.open();
        device.oninputreport = handleHidReport;
        state.hidDevices.set(hidKey(device), device);
      } catch (error) {
        console.warn('[UniBeatz DJ] HID open failed:', error);
      }
    }
    renderPanel();
  }

  async function connectHid() {
    if (!navigator.hid) {
      notify('WebHID is unavailable in this browser. Use current Chrome or Edge desktop.', '#ff7474');
      return false;
    }

    try {
      const devices = await navigator.hid.requestDevice({ filters: [] });
      for (const device of devices) {
        if (!device.opened) await device.open();
        device.oninputreport = handleHidReport;
        state.hidDevices.set(hidKey(device), device);
      }
      state.connected = state.midiInputs.size > 0 || state.hidDevices.size > 0;
      renderPanel();
      notify(
        devices.length
          ? `HID controller connected: ${devices.map(d => d.productName).join(', ')}`
          : 'No HID controller selected.',
        devices.length ? '#5dff9e' : '#F0C040'
      );
      return devices.length > 0;
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        notify(`HID connection failed: ${error.message || error}`, '#ff7474');
      }
      return false;
    }
  }

  function sendMidi(bytes, outputId = state.selectedOutputId) {
    const output = state.midiOutputs.get(outputId);
    if (!output) return false;
    try {
      output.send(bytes);
      return true;
    } catch (error) {
      console.warn('[UniBeatz DJ] MIDI output failed:', error);
      return false;
    }
  }

  const ACTIONS = [
    ['playA', 'Deck A Play/Pause'],
    ['cueA', 'Deck A Cue'],
    ['stopA', 'Deck A Stop'],
    ['jogA', 'Deck A Jog'],
    ['pitchA', 'Deck A Pitch'],
    ['volumeA', 'Deck A Volume'],
    ['playB', 'Deck B Play/Pause'],
    ['cueB', 'Deck B Cue'],
    ['stopB', 'Deck B Stop'],
    ['jogB', 'Deck B Jog'],
    ['pitchB', 'Deck B Pitch'],
    ['volumeB', 'Deck B Volume'],
    ['crossfader', 'Crossfader'],
    ['mic', 'Radio Mic'],
    ['broadcast', 'Start Radio Broadcast'],
    ['drop', 'Trigger Station Drop'],
    ['battleMic', 'Battle Mic'],
    ['battleCamera', 'Battle Camera'],
    ['joinArtist', 'Join Battle as Artist'],
    ['joinDJ', 'Join Battle as DJ'],
    ['nextBeat', 'Select/Trigger Next Beat']
  ];

  function updateSignalUI(text) {
    const el = document.getElementById('ubDjLastSignal') || document.getElementById('lastMidiSignal');
    if (el) el.textContent = text;
  }

  function buildPanel() {
    if (document.getElementById('ubDjControllerPanel')) return;

    const host =
      document.getElementById('midiPanel') ||
      document.getElementById('djBeatSelectorCard') ||
      document.getElementById('page-livebattle') ||
      document.querySelector('.djapp') ||
      document.body;

    const panel = document.createElement('section');
    panel.id = 'ubDjControllerPanel';
    panel.innerHTML = `
      <style>
        #ubDjControllerPanel{margin:14px;padding:14px;border:1px solid rgba(64,208,255,.35);border-radius:12px;background:linear-gradient(135deg,#0a0a14,#050508);color:#f0ede8;font-family:Rajdhani,sans-serif}
        #ubDjControllerPanel .ubdj-title{font-family:Bebas Neue,sans-serif;font-size:1.45rem;letter-spacing:2px;color:#F0C040}
        #ubDjControllerPanel .ubdj-sub{font-size:.82rem;color:#9aa3b8;margin:3px 0 12px}
        #ubDjControllerPanel .ubdj-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
        #ubDjControllerPanel button,#ubDjControllerPanel select{border-radius:7px;padding:9px 11px;border:1px solid rgba(64,208,255,.4);background:#111118;color:#f0ede8;font-family:Orbitron,sans-serif;font-size:.45rem;letter-spacing:1px}
        #ubDjControllerPanel button{cursor:pointer}
        #ubDjControllerPanel .gold{border-color:rgba(240,192,64,.55);color:#F0C040}
        #ubDjControllerPanel .ubdj-device{font-size:.72rem;color:#40D0FF;line-height:1.5}
        #ubDjControllerPanel .ubdj-signal{font-family:monospace;font-size:.66rem;color:#9aa3b8;overflow-wrap:anywhere}
        #ubDjControllerPanel .ubdj-map{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)}
      </style>
      <div class="ubdj-title">Universal DJ Controller</div>
      <div class="ubdj-sub">MIDI + HID detection · hot-plug reconnect · Learn Mode for unknown controllers</div>
      <div class="ubdj-row">
        <button id="ubDjConnectMidi" class="gold" type="button">CONNECT MIDI</button>
        <button id="ubDjConnectHid" type="button">CONNECT HID</button>
        <button id="ubDjRescan" type="button">RESCAN</button>
      </div>
      <div id="ubDjDevices" class="ubdj-device">No controller connected.</div>
      <div class="ubdj-row">
        <select id="ubDjLearnAction">
          ${ACTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select>
        <button id="ubDjLearn" class="gold" type="button">LEARN NEXT CONTROL</button>
        <button id="ubDjCancelLearn" type="button">CANCEL LEARN</button>
      </div>
      <div id="ubDjControllerNotice" class="ubdj-device"></div>
      <div>Last signal:</div>
      <div id="ubDjLastSignal" class="ubdj-signal">None</div>
      <div id="ubDjMappings" style="margin-top:10px"></div>
    `;

    host.appendChild(panel);

    panel.querySelector('#ubDjConnectMidi').addEventListener('click', async e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      await connectMidi();
    }, true);

    panel.querySelector('#ubDjConnectHid').addEventListener('click', connectHid);
    panel.querySelector('#ubDjRescan').addEventListener('click', async () => {
      if (state.midiAccess) attachMidiPorts();
      await openGrantedHidDevices();
      renderPanel();
    });

    panel.querySelector('#ubDjLearn').addEventListener('click', () => {
      state.learnAction = panel.querySelector('#ubDjLearnAction').value;
      notify(`Learn Mode: move the control for ${state.learnAction}`, '#F0C040');
    });

    panel.querySelector('#ubDjCancelLearn').addEventListener('click', () => {
      state.learnAction = null;
      notify('Learn Mode cancelled.');
    });

    panel.querySelector('#ubDjMappings').addEventListener('click', event => {
      const button = event.target.closest('[data-delete-map]');
      if (!button) return;
      const [profileKey, signalKeyValue] = JSON.parse(decodeURIComponent(button.dataset.deleteMap));
      if (state.profiles[profileKey]) {
        delete state.profiles[profileKey].mappings[signalKeyValue];
        saveStore();
        renderPanel();
      }
    });

    // Reuse an existing Radio "Connect MIDI" button, but route it through this engine.
    const oldConnect = document.getElementById('connectMidi');
    if (oldConnect && !oldConnect.dataset.ubUniversalBound) {
      oldConnect.dataset.ubUniversalBound = '1';
      oldConnect.addEventListener('click', async event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        await connectMidi();
      }, true);
    }
  }

  function renderPanel() {
    buildPanel();
    const devicesEl = document.getElementById('ubDjDevices');
    const mappingsEl = document.getElementById('ubDjMappings');
    if (!devicesEl || !mappingsEl) return;

    const midiNames = [...state.midiInputs.values()].map(x => `MIDI: ${x.manufacturer || ''} ${x.name || ''}`.trim());
    const hidNames = [...state.hidDevices.values()].map(x => `HID: ${x.productName || 'Controller'} (${x.vendorId}:${x.productId})`);
    devicesEl.innerHTML = [...midiNames, ...hidNames].length
      ? [...midiNames, ...hidNames].map(safe).join('<br>')
      : 'No controller connected. Try MIDI first, then HID.';

    const rows = [];
    for (const [profileKey, profile] of Object.entries(state.profiles)) {
      for (const [key, action] of Object.entries(profile.mappings || {})) {
        rows.push(`
          <div class="ubdj-map">
            <div><strong>${safe(profile.label)}</strong><br><span class="ubdj-signal">${safe(key)} → ${safe(action)}</span></div>
            <button type="button" data-delete-map="${encodeURIComponent(JSON.stringify([profileKey, key]))}">CLEAR</button>
          </div>
        `);
      }
    }
    mappingsEl.innerHTML = rows.length ? rows.join('') : '<div class="ubdj-signal">No learned mappings yet.</div>';
  }

  function init() {
    loadStore();
    buildPanel();
    renderPanel();
    openGrantedHidDevices();

    if (navigator.hid) {
      navigator.hid.addEventListener('connect', openGrantedHidDevices);
      navigator.hid.addEventListener('disconnect', event => {
        state.hidDevices.delete(hidKey(event.device));
        renderPanel();
      });
    }

    // Do not silently prompt. Auto-open already granted MIDI permission only where possible.
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'midi', sysex: true }).then(result => {
        if (result.state === 'granted') connectMidi();
      }).catch(() => {});
    }

    console.log(`[UniBeatz DJ] Universal controller engine v${VERSION} loaded for ${state.platform}`);
  }

  window.UniBeatzDJController = {
    version: VERSION,
    state,
    connectMidi,
    connectHid,
    sendMidi,
    runAction,
    startLearn(action) {
      state.learnAction = action;
      notify(`Learn Mode: move the control for ${action}`, '#F0C040');
    },
    cancelLearn() {
      state.learnAction = null;
    },
    getMappings() {
      return JSON.parse(JSON.stringify(state.profiles));
    },
    clearAllMappings() {
      state.profiles = {};
      saveStore();
      renderPanel();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
