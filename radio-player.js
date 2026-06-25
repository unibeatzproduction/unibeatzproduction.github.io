// radio-player.js — UniBeatz Radio
// Background play + Media Session for BOTH:
// #mainStationAudio (Live365 direct stream, mobile)
// #channelAudio (genre channel player)

const DEFAULT_ARTWORK = '/unibeatz-radio-cover-v2.svg';
let booted            = false;
let listenerStarted   = false;
let shouldResume      = false;
let userPaused        = false;
let lastManualPause   = 0;
let lastResume        = 0;
let _keepAliveCtx     = null;
let _wakeLock         = null;

// Set true before intentionally pausing one player (genre switch / station switch)
// Prevents radio-player from fighting back and resuming the paused player
window.ubRadioIntentionalPause = false;

// Returns whichever player is currently active
function activePlayer(){
  const main    = document.getElementById('mainStationAudio');
  const channel = document.getElementById('channelAudio');
  if(main    && !main.paused    && main.src)    return main;
  if(channel && !channel.paused && channel.src) return channel;
  if(main?.src    && main.src    !== window.location.href) return main;
  if(channel?.src && channel.src !== window.location.href) return channel;
  return channel;
}

function allPlayers(){
  return [
    document.getElementById('mainStationAudio'),
    document.getElementById('channelAudio')
  ].filter(Boolean);
}

// ── Media Session ──
function updateMediaSession(){
  if(!('mediaSession' in navigator)) return;
  const audio = activePlayer();
  const title  = document.getElementById('channelBarTitle')?.textContent?.trim() || 'UniBeatz Radio';
  const artist = document.getElementById('channelBarArtist')?.textContent?.trim() || 'UniBeatzProduction';
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist, album: 'UniBeatz Radio',
      artwork: [{ src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.playbackState = (audio && !audio.paused) ? 'playing' : 'paused';
    if('setPositionState' in navigator.mediaSession && audio && Number.isFinite(audio.duration) && audio.duration > 0){
      navigator.mediaSession.setPositionState({
        duration: audio.duration, playbackRate: 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    }
  } catch(e){}
}

function setupMediaControls(){
  if(!('mediaSession' in navigator)) return;
  try{
    navigator.mediaSession.setActionHandler('play', async () => {
      listenerStarted = true; shouldResume = true; userPaused = false;
      const a = activePlayer();
      try{ await a?.play(); } catch(e){}
      updateMediaSession();
    });
    // Android fires pause from notification — only resume if not an intentional switch
    navigator.mediaSession.setActionHandler('pause', () => {
      if(window.ubRadioIntentionalPause){ window.ubRadioIntentionalPause = false; return; }
      setTimeout(tryResume, 150);
      setTimeout(tryResume, 1000);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      document.getElementById('chPrev')?.click();
      setTimeout(updateMediaSession, 300);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      document.getElementById('chNext')?.click();
      setTimeout(updateMediaSession, 300);
    });
    try{
      navigator.mediaSession.setActionHandler('seekbackward', () => { const a=activePlayer(); if(a) a.currentTime=Math.max(0,a.currentTime-10); });
      navigator.mediaSession.setActionHandler('seekforward',  () => { const a=activePlayer(); if(a&&Number.isFinite(a.duration)) a.currentTime=Math.min(a.duration,a.currentTime+10); });
    }catch(e){}
  } catch(e){ console.warn('[media controls]', e); }
}

// ── Resume ──
async function tryResume(){
  if(!listenerStarted || userPaused || !shouldResume) return;
  if(window.ubRadioIntentionalPause) return;
  const now = Date.now();
  if(now - lastResume < 300) return;
  lastResume = now;
  // Don't resume if another player is already playing
  if(allPlayers().some(a => a && !a.paused)) return;
  for(const audio of allPlayers()){
    if(!audio.src || audio.src === window.location.href) continue;
    if(!audio.paused) return;
    try{
      await audio.play();
      navigator.mediaSession && (navigator.mediaSession.playbackState = 'playing');
      updateMediaSession();
      break;
    } catch(e){
      if(e.name === 'NotAllowedError') setTimeout(tryResume, 800);
    }
  }
}

// ── Wake Lock (Android) ──
async function requestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try{
    if(_wakeLock) return;
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch(e){}
}

// ── Silent keep-alive loop (iOS) ──
function startKeepAlive(){
  if(_keepAliveCtx) return;
  try{
    _keepAliveCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = _keepAliveCtx.sampleRate;
    const buf  = _keepAliveCtx.createBuffer(1, bufferSize, _keepAliveCtx.sampleRate);
    const gain = _keepAliveCtx.createGain();
    gain.gain.value = 0.001;
    gain.connect(_keepAliveCtx.destination);
    function loop(){
      const src = _keepAliveCtx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.onended = () => { if(_keepAliveCtx) loop(); };
      src.start(0);
    }
    loop();
  } catch(e){}
}

// ── Attach listeners to an audio element ──
function attachToAudio(audio){
  if(!audio || audio._ubAttached) return;
  audio._ubAttached = true;

  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.setAttribute('x-webkit-airplay', 'allow');
  if(!audio.preload || audio.preload === 'none') audio.preload = 'auto';

  audio.addEventListener('play', async () => {
    listenerStarted = true; shouldResume = true; userPaused = false;
    navigator.mediaSession && (navigator.mediaSession.playbackState = 'playing');
    updateMediaSession();
    startKeepAlive();
    await requestWakeLock();
    if(_keepAliveCtx?.state === 'suspended') _keepAliveCtx.resume().catch(()=>{});
  });

  audio.addEventListener('pause', () => {
    const justManual = Date.now() - lastManualPause < 900;
    if(justManual){ updateMediaSession(); return; }
    if(!listenerStarted){ updateMediaSession(); return; }
    // Check if this was an intentional switch (genre → main or main → genre)
    if(window.ubRadioIntentionalPause){
      window.ubRadioIntentionalPause = false;
      updateMediaSession();
      return;
    }
    // Notification or system interrupted — fight back
    shouldResume = true; userPaused = false;
    setTimeout(tryResume, 100);
    setTimeout(tryResume, 500);
    setTimeout(tryResume, 1200);
    setTimeout(tryResume, 2500);
    updateMediaSession();
  });

  audio.addEventListener('waiting', () => {
    if(listenerStarted && !userPaused && !window.ubRadioIntentionalPause) setTimeout(tryResume, 300);
  });

  audio.addEventListener('stalled', () => {
    if(!window.ubRadioIntentionalPause) tryResume();
  });
  audio.addEventListener('canplay', () => { if(shouldResume && !userPaused && !window.ubRadioIntentionalPause) tryResume(); });
  audio.addEventListener('loadedmetadata', updateMediaSession);
  audio.addEventListener('ended', updateMediaSession);
  audio.addEventListener('timeupdate', () => { if(Math.floor(audio.currentTime)%15===0) updateMediaSession(); });
}

// ── Visibility / focus events ──
function setupWindowEvents(){
  document.addEventListener('visibilitychange', async () => {
    updateMediaSession();
    if(document.visibilityState === 'visible'){
      if(listenerStarted && !userPaused) shouldResume = true;
      if(!window.ubRadioIntentionalPause){
        setTimeout(tryResume, 200);
        setTimeout(tryResume, 1200);
        setTimeout(tryResume, 2600);
      }
      await requestWakeLock();
      if(_keepAliveCtx?.state === 'suspended') _keepAliveCtx.resume().catch(()=>{});
    }
  });
  window.addEventListener('focus',    () => { if(shouldResume && !window.ubRadioIntentionalPause) tryResume(); });
  window.addEventListener('pageshow', () => { if(shouldResume && !window.ubRadioIntentionalPause) tryResume(); });
  window.addEventListener('online',   () => { if(shouldResume && !window.ubRadioIntentionalPause) tryResume(); });
  window.addEventListener('resume',   () => { if(shouldResume && !window.ubRadioIntentionalPause) tryResume(); });

  // Track manual pause from our buttons
  ['chPlay', 'mainStationPlay'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      setTimeout(() => {
        listenerStarted = true;
        const a = activePlayer();
        if(a?.paused){ userPaused = true; shouldResume = false; lastManualPause = Date.now(); }
        else { userPaused = false; shouldResume = true; }
      }, 200);
    }, { passive: true });
  });
}

// ── Watch now-playing text for lock screen updates ──
function watchNowPlaying(){
  const obs = new MutationObserver(updateMediaSession);
  ['channelBarTitle','channelBarArtist'].forEach(id => {
    const el = document.getElementById(id);
    if(el) obs.observe(el, { childList:true, subtree:true, characterData:true });
  });
}

// ── Boot ──
function boot(){
  if(booted) return;
  booted = true;
  setupMediaControls();
  setupWindowEvents();
  watchNowPlaying();

  function tryAttach(){
    const attached = allPlayers().filter(a => a._ubAttached).length;
    allPlayers().forEach(attachToAudio);
    if(attached < 2) setTimeout(tryAttach, 500);
  }
  tryAttach();
  updateMediaSession();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
