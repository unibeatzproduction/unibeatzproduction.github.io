// radio-player.js — UniBeatz Radio
// Background play persistence + Media Session (lock screen controls)
// Targets: #channelAudio (genre channels) + Live365 iframe stream
// Does NOT inject any UI panels

const DEFAULT_ARTWORK = '/unibeatz-radio-cover-v2.svg';
let booted = false;
let listenerStartedAudio = false;
let shouldResumeAudio    = false;
let userPausedAudio      = false;
let lastManualPauseAt    = 0;
let lastResumeAttempt    = 0;

// Target the genre channel audio element
function player(){ return document.getElementById('channelAudio'); }

function updateMediaSession(){
  if(!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const audio   = player();
  const title   = document.getElementById('channelBarTitle')?.textContent?.trim()  || 'UniBeatz Radio';
  const artist  = document.getElementById('channelBarArtist')?.textContent?.trim() || 'UniBeatzProduction';
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist, album: 'UniBeatz Radio',
      artwork: [{ src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.playbackState = audio && !audio.paused ? 'playing' : 'paused';
    if('setPositionState' in navigator.mediaSession && audio && Number.isFinite(audio.duration) && audio.duration > 0){
      navigator.mediaSession.setPositionState({
        duration: audio.duration, playbackRate: 1, position: Math.min(audio.currentTime, audio.duration)
      });
    }
  } catch(e){}
}

function markKeepPlaying(){ listenerStartedAudio = true; shouldResumeAudio = true; userPausedAudio = false; updateMediaSession(); }
function markManualPause(){ userPausedAudio = true; shouldResumeAudio = false; lastManualPauseAt = Date.now(); updateMediaSession(); }

async function tryResumeAudio(){
  const audio = player();
  if(!audio || !audio.src || audio.src === window.location.href) return;
  if(!listenerStartedAudio || userPausedAudio || !shouldResumeAudio) return;
  const now = Date.now();
  if(now - lastResumeAttempt < 700) return;
  lastResumeAttempt = now;
  try{ await audio.play(); markKeepPlaying(); } catch(e){}
}

function setupMediaControls(){
  if(!('mediaSession' in navigator)) return;
  try{
    navigator.mediaSession.setActionHandler('play', async () => {
      markKeepPlaying();
      try{ await player()?.play(); } catch(e){}
      updateMediaSession();
    });
    // Don't kill station on notification pause — resume immediately
    navigator.mediaSession.setActionHandler('pause', () => {
      markKeepPlaying();
      setTimeout(tryResumeAudio, 100);
      setTimeout(tryResumeAudio, 900);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      markKeepPlaying();
      document.getElementById('chPrev')?.click();
      setTimeout(updateMediaSession, 300);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      markKeepPlaying();
      document.getElementById('chNext')?.click();
      setTimeout(updateMediaSession, 300);
    });
    try{
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        const a = player(); if(a) a.currentTime = Math.max(0, a.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        const a = player(); if(a && Number.isFinite(a.duration)) a.currentTime = Math.min(a.duration, a.currentTime + 10);
      });
    } catch(e){}
  } catch(e){ console.warn('[media controls]', e); }
}

function setupMobilePersistence(){
  const audio = player();
  if(!audio) return;

  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.setAttribute('x-webkit-airplay', 'allow');
  audio.preload = 'auto';

  // Track play/pause button state
  document.getElementById('chPlay')?.addEventListener('click', () => {
    setTimeout(() => {
      const a = player();
      listenerStartedAudio = true;
      if(a?.paused) markManualPause(); else markKeepPlaying();
    }, 180);
  }, { passive: true });

  audio.addEventListener('play', () => {
    markKeepPlaying();
    // Android Chrome needs explicit playbackState to keep session alive through lock
    if('mediaSession' in navigator){
      navigator.mediaSession.playbackState = 'playing';
    }
  });

  audio.addEventListener('pause', () => {
    const justManual = Date.now() - lastManualPauseAt < 900;
    if(!justManual && listenerStartedAudio){
      shouldResumeAudio = true;
      userPausedAudio   = false;
      setTimeout(tryResumeAudio, 160);
      setTimeout(tryResumeAudio, 1000);
      setTimeout(tryResumeAudio, 2400);
    }
    updateMediaSession();
  });

  audio.addEventListener('stalled', tryResumeAudio);
  audio.addEventListener('canplay', tryResumeAudio);
  audio.addEventListener('play',    updateMediaSession);
  audio.addEventListener('pause',   updateMediaSession);
  audio.addEventListener('loadedmetadata', updateMediaSession);
  audio.addEventListener('ended',   updateMediaSession);
  audio.addEventListener('timeupdate', () => {
    if(Math.floor(audio.currentTime) % 15 === 0) updateMediaSession();
  });

  // Resume on visibility change (switching apps, lock screen)
  document.addEventListener('visibilitychange', () => {
    updateMediaSession();
    if(listenerStartedAudio && !userPausedAudio) shouldResumeAudio = true;
    setTimeout(tryResumeAudio, 180);
    setTimeout(tryResumeAudio, 1100);
    setTimeout(tryResumeAudio, 2500);
  });

  window.addEventListener('focus',    tryResumeAudio);
  window.addEventListener('pageshow', tryResumeAudio);
  window.addEventListener('online',   tryResumeAudio);
  window.addEventListener('resume',   tryResumeAudio);

  // iOS + Android keep-alive
  // A one-time silent buffer loop keeps the audio session alive through lock screen
  // Must be triggered by a user gesture first
  let _keepAliveCtx = null;
  let _keepAliveNode = null;

  function startKeepAlive(){
    if(_keepAliveCtx) return;
    try{
      _keepAliveCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Create a looping silent buffer — 1 second of silence, loops forever
      // This is the key: a looping BufferSource keeps iOS audio session alive
      // through screen lock, unlike a one-shot oscillator
      const bufferSize = _keepAliveCtx.sampleRate;
      const silentBuffer = _keepAliveCtx.createBuffer(1, bufferSize, _keepAliveCtx.sampleRate);
      // Buffer is already zeroed (silence)
      const gain = _keepAliveCtx.createGain();
      gain.gain.value = 0.001; // near-silent but non-zero
      gain.connect(_keepAliveCtx.destination);

      function loopSilence(){
        _keepAliveNode = _keepAliveCtx.createBufferSource();
        _keepAliveNode.buffer = silentBuffer;
        _keepAliveNode.connect(gain);
        _keepAliveNode.onended = () => {
          if(_keepAliveCtx) loopSilence(); // keep looping
        };
        _keepAliveNode.start(0);
      }
      loopSilence();
      console.log('[radio] Keep-alive audio loop started');
    } catch(e){ console.warn('[radio] Keep-alive failed:', e); }
  }

  // Also request Wake Lock to prevent screen from sleeping on Android
  async function requestWakeLock(){
    if(!('wakeLock' in navigator)) return;
    try{
      await navigator.wakeLock.request('screen');
      console.log('[radio] Wake lock active');
    } catch(e){}
  }

  // Release and re-request wake lock when page becomes visible again
  document.addEventListener('visibilitychange', async () => {
    if(document.visibilityState === 'visible' && listenerStartedAudio){
      requestWakeLock();
      // Resume keep-alive context if it got suspended
      if(_keepAliveCtx && _keepAliveCtx.state === 'suspended'){
        try{ await _keepAliveCtx.resume(); } catch(e){}
      }
    }
  });

  // Start everything on first user tap
  document.addEventListener('click', async function onFirstTap(){
    startKeepAlive();
    await requestWakeLock();
    document.removeEventListener('click', onFirstTap);
  }, { once: true });

  // Also start on first play
  audio.addEventListener('play', async () => {
    startKeepAlive();
    await requestWakeLock();
    // Resume keep-alive if suspended
    if(_keepAliveCtx && _keepAliveCtx.state === 'suspended'){
      try{ await _keepAliveCtx.resume(); } catch(e){}
    }
  }, { once: true });
}

// Watch channelBarTitle for changes to update lock screen metadata
function watchNowPlaying(){
  const title  = document.getElementById('channelBarTitle');
  const artist = document.getElementById('channelBarArtist');
  const obs = new MutationObserver(updateMediaSession);
  if(title)  obs.observe(title,  { childList: true, subtree: true, characterData: true });
  if(artist) obs.observe(artist, { childList: true, subtree: true, characterData: true });
}

function boot(){
  if(booted) return;
  booted = true;
  setupMediaControls();
  // Wait for channelAudio to exist (injected by radio.html inline script)
  const tryBoot = () => {
    if(document.getElementById('channelAudio')){
      setupMobilePersistence();
      watchNowPlaying();
      updateMediaSession();
    } else {
      setTimeout(tryBoot, 300);
    }
  };
  tryBoot();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
