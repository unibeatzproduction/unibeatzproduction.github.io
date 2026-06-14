const DEFAULT_ARTWORK = '/unibeatz-radio-cover-v2.svg?v=2';

let booted = false;
let listenerStartedAudio = false;
let shouldResumeAudio = false;
let userPausedAudio = false;
let lastResumeAttempt = 0;
let lastManualPauseAt = 0;

function text(id, fallback = '') {
  return document.getElementById(id)?.textContent?.trim() || fallback;
}

function cleanTitle(value) {
  return String(value || 'UniBeatz Radio')
    .replace(/^Now Playing:\s*/i, '')
    .replace(/^Featured Station:\s*/i, '')
    .trim() || 'UniBeatz Radio';
}

function cleanArtist(value) {
  const raw = String(value || 'UniBeatzProduction');
  return raw.split('•')[0]?.trim() || 'UniBeatzProduction';
}

function player() {
  return document.getElementById('radioPlayer');
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;

  const audio = player();
  const title = cleanTitle(text('nowPlayingTitle', 'UniBeatz Radio'));
  const artist = cleanArtist(text('nowPlayingMeta', 'UniBeatzProduction'));

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'UniBeatz Radio',
      artwork: [{ src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }]
    });

    navigator.mediaSession.playbackState = audio && !audio.paused ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession && audio && Number.isFinite(audio.duration)) {
      navigator.mediaSession.setPositionState({
        duration: audio.duration || 0,
        playbackRate: audio.playbackRate || 1,
        position: audio.currentTime || 0
      });
    }
  } catch (error) {
    console.warn('[radio media session]', error);
  }
}

async function tryResumeAudio(reason = 'resume') {
  const audio = player();
  if (!audio || !listenerStartedAudio || userPausedAudio || !shouldResumeAudio || !audio.src) return;

  const now = Date.now();
  if (now - lastResumeAttempt < 700) return;
  lastResumeAttempt = now;

  try {
    await audio.play();
    shouldResumeAudio = true;
    userPausedAudio = false;
    updateMediaSession();
  } catch (error) {
    console.warn(`[radio background ${reason}]`, error);
  }
}

function markManualPause() {
  userPausedAudio = true;
  shouldResumeAudio = false;
  lastManualPauseAt = Date.now();
  updateMediaSession();
}

function markKeepPlaying() {
  listenerStartedAudio = true;
  shouldResumeAudio = true;
  userPausedAudio = false;
  updateMediaSession();
}

function setupMediaControls() {
  if (!('mediaSession' in navigator)) return;

  try {
    navigator.mediaSession.setActionHandler('play', async () => {
      markKeepPlaying();
      try { await player()?.play(); } catch (e) {}
      updateMediaSession();
    });

    // Android can fire Media Session pause during notification/lockscreen transitions.
    // Do not let that kill the station. Use the page button to manually pause.
    navigator.mediaSession.setActionHandler('pause', () => {
      markKeepPlaying();
      setTimeout(() => tryResumeAudio('notification-pause-ignored'), 100);
      setTimeout(() => tryResumeAudio('notification-pause-ignored-late'), 900);
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      markKeepPlaying();
      document.getElementById('prevTrack')?.click();
      setTimeout(updateMediaSession, 300);
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      markKeepPlaying();
      document.getElementById('nextTrack')?.click();
      setTimeout(updateMediaSession, 300);
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const audio = player();
      if (!audio) return;
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      updateMediaSession();
    });

    navigator.mediaSession.setActionHandler('seekforward', () => {
      const audio = player();
      if (!audio || !Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
      updateMediaSession();
    });
  } catch (error) {
    console.warn('[radio media controls]', error);
  }
}

function setupMobilePersistence() {
  const audio = player();
  if (!audio) return;

  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.preload = 'auto';

  document.getElementById('playPause')?.addEventListener('click', () => {
    setTimeout(() => {
      const a = player();
      listenerStartedAudio = true;
      if (a && a.paused) markManualPause();
      else markKeepPlaying();
    }, 180);
  }, { passive: true });

  audio.addEventListener('play', () => {
    markKeepPlaying();
  });

  audio.addEventListener('pause', () => {
    const justManual = Date.now() - lastManualPauseAt < 900;
    if (!justManual && listenerStartedAudio) {
      shouldResumeAudio = true;
      userPausedAudio = false;
      setTimeout(() => tryResumeAudio('audio-pause-interruption'), 160);
      setTimeout(() => tryResumeAudio('audio-pause-interruption-late'), 1000);
      setTimeout(() => tryResumeAudio('audio-pause-interruption-last'), 2400);
    }
    updateMediaSession();
  });

  audio.addEventListener('stalled', () => tryResumeAudio('stalled'));
  audio.addEventListener('suspend', () => updateMediaSession());
  audio.addEventListener('waiting', () => updateMediaSession());
  audio.addEventListener('canplay', () => tryResumeAudio('canplay'));

  document.addEventListener('visibilitychange', () => {
    updateMediaSession();
    if (listenerStartedAudio && !userPausedAudio) shouldResumeAudio = true;
    setTimeout(() => tryResumeAudio(document.hidden ? 'hidden' : 'visible'), 180);
    setTimeout(() => tryResumeAudio('visibility-late'), 1100);
    setTimeout(() => tryResumeAudio('visibility-last'), 2500);
  });

  window.addEventListener('focus', () => tryResumeAudio('focus'));
  window.addEventListener('pageshow', () => tryResumeAudio('pageshow'));
  window.addEventListener('resume', () => tryResumeAudio('resume'));
  window.addEventListener('online', () => tryResumeAudio('online'));

  document.addEventListener('freeze', () => {
    shouldResumeAudio = listenerStartedAudio && !userPausedAudio;
    updateMediaSession();
  });
}

function boot() {
  if (booted) return;
  booted = true;

  setupMediaControls();
  setupMobilePersistence();
  updateMediaSession();

  const audio = player();
  audio?.addEventListener('play', updateMediaSession);
  audio?.addEventListener('pause', updateMediaSession);
  audio?.addEventListener('loadedmetadata', updateMediaSession);
  audio?.addEventListener('durationchange', updateMediaSession);
  audio?.addEventListener('timeupdate', () => {
    if (Math.floor(audio.currentTime) % 15 === 0) updateMediaSession();
  });
  audio?.addEventListener('ended', updateMediaSession);

  const title = document.getElementById('nowPlayingTitle');
  const meta = document.getElementById('nowPlayingMeta');
  const observer = new MutationObserver(updateMediaSession);

  if (title) observer.observe(title, { childList: true, subtree: true, characterData: true });
  if (meta) observer.observe(meta, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.addEventListener('ub-firebase-ready', boot);
