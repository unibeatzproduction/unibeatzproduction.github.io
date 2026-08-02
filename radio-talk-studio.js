// radio-talk-studio.js
// DJ Control — Talk Studio main logic

import { Room, RoomEvent, Track, createLocalAudioTrack, LocalAudioTrack } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.7/dist/livekit-client.esm.mjs';
import { attachTrack, detachTrack, setHostVolume, muteHost } from './radio-talk-audio.js';
import { initRecordingBus, startRecording, stopRecording, isRecording, connectToRecording } from './radio-talk-recording.js';
import { createSession, endSession, watchSession, sendMessage, watchChat, getLiveKitToken } from './radio-talk-firebase.js';

const LIVEKIT_URL = 'wss://uni-freestyle-battle-i951nakn.livekit.cloud';
const MAX_HOSTS = 3;

let _room = null;
let _sessionId = null;
let _djMicTrack = null;
let _djMicEnabled = false;
let _hosts = {}; // identity -> { name, muted, vol, speaking, participant }
let _audioCtx = null;
let _recBus = null;
let _unsubSession = null;
let _unsubChat = null;
let _chatMsgs = [];

// ── Helpers ──
function gen(len){ return Math.random().toString(36).slice(2, 2+len).toUpperCase(); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function status(msg, color='#9aa3b8'){
  const el = document.getElementById('tsStatusMsg');
  if(el){ el.textContent = msg; el.style.color = color; }
}
function note(msg){ status(msg, '#40D0FF'); }

function getCtx(){
  if(!_audioCtx || _audioCtx.state === 'closed'){
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  }
  if(_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

// ── Session ──
window.tsStartSession = async function(){
  const btn = document.getElementById('tsStartBtn');
  btn.disabled = true;
  btn.textContent = 'STARTING...';

  _sessionId = 'talk-' + gen(4) + '-' + gen(4);
  const djName = (window.currentUser && window.currentUser.name) ? window.currentUser.name : 'DJ UniBeatz';
  const identity = 'dj-' + _sessionId;

  try{
    await createSession(_sessionId, djName);
    const token = await getLiveKitToken(_sessionId, identity, true);

    _room = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    _room.on(RoomEvent.ParticipantConnected, onParticipantJoined);
    _room.on(RoomEvent.ParticipantDisconnected, onParticipantLeft);
    _room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    _room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    _room.on(RoomEvent.ActiveSpeakersChanged, onSpeakersChanged);
    _room.on(RoomEvent.Disconnected, onDisconnected);

    await _room.connect(LIVEKIT_URL, token);

    // Init audio context and recording bus
    const ctx = getCtx();
    _recBus = initRecordingBus(ctx);

    // Show live state
    document.getElementById('tsLiveBadge').style.display = 'flex';
    document.getElementById('tsOfflineLabel').style.display = 'none';
    document.getElementById('tsStartBtn').style.display = 'none';
    document.getElementById('tsEndBtn').style.display = 'inline-flex';
    document.getElementById('tsSessionIdDisplay').textContent = _sessionId;
    document.getElementById('tsInviteLink').textContent = window.location.origin + '/radio-talk-host.html?session=' + _sessionId;
    document.getElementById('tsInviteSection').style.display = 'block';

    // Watch chat
    _unsubChat = watchChat(_sessionId, msgs => { _chatMsgs = msgs; renderChat(); });

    note('Session live — share invite link to add hosts');

  } catch(err){
    status('Start failed: ' + err.message, '#ff7474');
    btn.disabled = false;
    btn.textContent = 'START SESSION';
  }
};

window.tsEndSession = async function(){
  if(!confirm('End the session for everyone?')) return;
  if(_room){ await _room.disconnect(); _room = null; }
  if(_djMicTrack){ _djMicTrack.stop(); _djMicTrack = null; }
  if(_sessionId) await endSession(_sessionId);
  if(_unsubChat) _unsubChat();
  if(_unsubSession) _unsubSession();
  _hosts = {};
  _sessionId = null;
  _djMicEnabled = false;

  document.getElementById('tsLiveBadge').style.display = 'none';
  document.getElementById('tsOfflineLabel').style.display = 'inline';
  document.getElementById('tsStartBtn').style.display = 'inline-flex';
  document.getElementById('tsEndBtn').style.display = 'none';
  document.getElementById('tsInviteSection').style.display = 'none';
  document.getElementById('tsHostGrid').innerHTML = '<div class="ts-empty-hosts">No hosts connected yet.</div>';
  updateMicUI();
  note('Session ended');
};

// ── DJ Mic ──
window.tsToggleMic = async function(){
  if(!_room){ status('Start session first', '#ff7474'); return; }
  const ctx = getCtx();

  if(!_djMicEnabled){
    try{
      _djMicTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });
      await _room.localParticipant.publishTrack(_djMicTrack);

      // Route DJ mic into recording bus
      const stream = new MediaStream([_djMicTrack.mediaStreamTrack]);
      const src = ctx.createMediaStreamSource(stream);
      connectToRecording(src);

      _djMicEnabled = true;
      note('DJ mic ON');
    } catch(err){
      status('Mic error: ' + err.message, '#ff7474');
      return;
    }
  } else {
    if(_djMicTrack){
      const muting = !_djMicTrack.isMuted;
      muting ? await _djMicTrack.mute() : await _djMicTrack.unmute();
      _djMicEnabled = !muting;
    }
  }
  updateMicUI();
};

function updateMicUI(){
  const icon  = document.getElementById('tsMicIcon');
  const label = document.getElementById('tsMicStatus');
  if(!icon || !label) return;
  if(_djMicEnabled && _djMicTrack && !_djMicTrack.isMuted){
    icon.className = 'ts-mic-big active';
    label.textContent = 'MIC LIVE';
    label.className = 'ts-mic-status on';
  } else if(_djMicEnabled && _djMicTrack && _djMicTrack.isMuted){
    icon.className = 'ts-mic-big muted';
    label.textContent = 'MUTED';
    label.className = 'ts-mic-status muted-label';
  } else {
    icon.className = 'ts-mic-big';
    label.textContent = 'MIC OFF';
    label.className = 'ts-mic-status';
  }
}

// ── Participants ──
function onParticipantJoined(participant){
  let meta = {};
  try{ meta = JSON.parse(participant.metadata || '{}'); }catch(e){}
  const name = meta.name || participant.identity;
  const role = meta.role || 'host';
  if(role === 'dj') return;
  if(Object.keys(_hosts).length >= MAX_HOSTS){ participant.setVolume(0); return; }
  _hosts[participant.identity] = { name, muted:false, vol:1, speaking:false, participant };
  renderHosts();
  note(name + ' joined');
}

function onParticipantLeft(participant){
  if(_hosts[participant.identity]){
    detachTrack(participant.identity);
    delete _hosts[participant.identity];
    renderHosts();
    note(_hosts[participant.identity]?.name || 'A host' + ' left');
  }
}

function onTrackSubscribed(track, pub, participant){
  if(track.kind !== Track.Kind.Audio) return;
  const ctx = getCtx();
  attachTrack(participant.identity, track.mediaStreamTrack, onSpeakingChange);

  // Also route host audio into recording bus
  const stream = new MediaStream([track.mediaStreamTrack]);
  const src = ctx.createMediaStreamSource(stream);
  connectToRecording(src);
}

function onTrackUnsubscribed(track, pub, participant){
  if(track.kind === Track.Kind.Audio) detachTrack(participant.identity);
}

function onSpeakersChanged(speakers){
  Object.keys(_hosts).forEach(id => {
    _hosts[id].speaking = speakers.some(s => s.identity === id);
  });
  renderHosts();
}

function onSpeakingChange(identity, speaking){
  if(_hosts[identity]){
    _hosts[identity].speaking = speaking;
    const row = document.getElementById('tsHostRow-' + identity.replace(/[^a-z0-9]/gi,'_'));
    if(row){
      row.classList.toggle('speaking', speaking);
      const dot = row.querySelector('.ts-speaking-indicator');
      if(dot) dot.classList.toggle('on', speaking);
    }
  }
}

function onDisconnected(){
  status('Disconnected', '#ff7474');
}

// ── Host Controls ──
window.tsMuteHost = function(identity){
  if(!_hosts[identity]) return;
  const h = _hosts[identity];
  h.muted = !h.muted;
  muteHost(identity, h.muted);
  renderHosts();
};

window.tsRemoveHost = function(identity){
  const h = _hosts[identity];
  if(!h) return;
  if(!confirm('Remove ' + h.name + '?')) return;
  try{ h.participant.setVolume(0); }catch(e){}
  detachTrack(identity);
  delete _hosts[identity];
  renderHosts();
  note(h.name + ' removed');
};

window.tsSetHostVol = function(identity, val){
  if(!_hosts[identity]) return;
  _hosts[identity].vol = val / 100;
  setHostVolume(identity, _hosts[identity].vol);
};

function renderHosts(){
  const grid = document.getElementById('tsHostGrid');
  if(!grid) return;
  const keys = Object.keys(_hosts);
  if(!keys.length){
    grid.innerHTML = '<div class="ts-empty-hosts">No hosts connected yet.</div>';
    return;
  }
  grid.innerHTML = keys.map(id => {
    const h = _hosts[id];
    const safeId = id.replace(/[^a-z0-9]/gi,'_');
    return `
    <div class="ts-host-row${h.speaking?' speaking':''}" id="tsHostRow-${safeId}">
      <div class="ts-host-avatar${h.speaking?' speaking-ring':''}">🎙️</div>
      <div class="ts-host-info">
        <div class="ts-host-name">${esc(h.name)}</div>
        <div class="ts-host-role">HOST ${keys.indexOf(id)+2}</div>
      </div>
      <div class="ts-host-controls">
        <div class="ts-speaking-indicator${h.speaking?' on':''}"></div>
        <input type="range" class="ts-vol-slider" min="0" max="100" value="${Math.round(h.vol*100)}"
          onchange="tsSetHostVol('${id}', this.value)" title="Volume"/>
        <button class="ts-host-btn" onclick="tsMuteHost('${id}')" title="${h.muted?'Unmute':'Mute'}">
          ${h.muted ? '🔇' : '🎙️'}
        </button>
        <button class="ts-host-btn danger" onclick="tsRemoveHost('${id}')" title="Remove">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Invite ──
window.tsCopyInvite = function(){
  const link = document.getElementById('tsInviteLink').textContent;
  navigator.clipboard.writeText(link).then(() => note('Link copied!')).catch(() => {
    const el = document.getElementById('tsInviteLink');
    el.select && el.select();
    document.execCommand('copy');
    note('Link copied!');
  });
};

window.tsShareInvite = function(){
  const link = document.getElementById('tsInviteLink').textContent;
  if(navigator.share){
    navigator.share({ title:'UniBeatz Radio Talk Studio', url: link });
  } else {
    tsCopyInvite();
  }
};

// ── Recording ──
window.tsStartRec = async function(){
  if(!_recBus){ status('Start session first', '#ff7474'); return; }
  const ctx = getCtx();
  if(!_recBus) return;
  startRecording(t => {
    const el = document.getElementById('tsRecTimer');
    if(el){ el.style.display='block'; el.textContent=t; }
  });
  document.getElementById('tsRecStartBtn').disabled = true;
  document.getElementById('tsRecStopBtn').disabled = false;
  note('Recording started');
};

window.tsStopRec = async function(){
  const result = await stopRecording();
  document.getElementById('tsRecTimer').style.display = 'none';
  document.getElementById('tsRecStartBtn').disabled = false;
  document.getElementById('tsRecStopBtn').disabled = true;
  if(!result){ status('No recording to save', '#ff7474'); return; }

  const list = document.getElementById('tsRecDownloads');
  const item = document.createElement('div');
  item.className = 'ts-dl-item';
  item.innerHTML = `
    <div class="ts-dl-name">${esc(result.name)}</div>
    <a class="ts-dl-link" href="${result.url}" download="${result.name}">⬇ Download</a>`;
  list.prepend(item);
  note('Recording saved — download above');
};

// ── Chat ──
window.tsSendChat = async function(){
  const input = document.getElementById('tsChatInput');
  const text = (input?.value||'').trim();
  if(!text || !_sessionId) return;
  input.value = '';
  const djName = (window.currentUser && window.currentUser.name) ? window.currentUser.name : 'DJ';
  await sendMessage(_sessionId, { sender: djName, role: 'dj', text });
};

function renderChat(){
  const el = document.getElementById('tsChatMsgs');
  if(!el) return;
  el.innerHTML = _chatMsgs.slice(-50).map(m => `
    <div class="ts-chat-msg">
      <div class="ts-chat-who${m.role==='dj'?' dj-label':''}">${esc(m.sender||'?')}${m.role==='dj'?' · DJ':''}</div>
      <div class="ts-chat-text">${esc(m.text)}</div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Collapsible sections ──
window.tsToggleSection = function(id){
  const body = document.getElementById(id);
  const chevron = document.getElementById(id + '-chevron');
  if(!body) return;
  const collapsed = body.classList.toggle('collapsed');
  if(chevron) chevron.classList.toggle('open', !collapsed);
};

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  // All sections open by default except chat on desktop
  document.getElementById('tsChatBody')?.classList.add('collapsed');
});
