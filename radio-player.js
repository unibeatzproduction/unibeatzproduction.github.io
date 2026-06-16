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

  audio.addEventListener('play', markKeepPlaying);

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

  // iOS keep-alive — silent AudioContext keeps audio session open after screen lock
  document.addEventListener('click', function onFirstTap(){
    if(!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    try{
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // near-silent — iOS requires non-zero to keep session
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      console.log('[radio] iOS audio session locked in');
    } catch(e){}
    document.removeEventListener('click', onFirstTap);
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
