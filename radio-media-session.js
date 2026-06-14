const DEFAULT_ARTWORK = '/unibeatz-radio-cover-v2.svg?v=2';

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

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;

  const title = cleanTitle(text('nowPlayingTitle', 'UniBeatz Radio'));
  const artist = cleanArtist(text('nowPlayingMeta', 'UniBeatzProduction'));
  const player = document.getElementById('radioPlayer');

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'UniBeatz Radio',
      artwork: [
        { src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }
      ]
    });

    navigator.mediaSession.playbackState = player && !player.paused ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession && player && Number.isFinite(player.duration)) {
      navigator.mediaSession.setPositionState({
        duration: player.duration || 0,
        playbackRate: player.playbackRate || 1,
        position: player.currentTime || 0
      });
    }
  } catch (error) {
    console.warn('[radio media session]', error);
  }
}

function setupMediaControls() {
  if (!('mediaSession' in navigator)) return;

  const player = document.getElementById('radioPlayer');

  try {
    navigator.mediaSession.setActionHandler('play', async () => {
      try { await player?.play(); } catch (e) {}
      updateMediaSession();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      player?.pause();
      updateMediaSession();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      document.getElementById('prevTrack')?.click();
      setTimeout(updateMediaSession, 300);
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      document.getElementById('nextTrack')?.click();
      setTimeout(updateMediaSession, 300);
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (!player) return;
      player.currentTime = Math.max(0, player.currentTime - 10);
      updateMediaSession();
    });

    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (!player || !Number.isFinite(player.duration)) return;
      player.currentTime = Math.min(player.duration, player.currentTime + 10);
      updateMediaSession();
    });
  } catch (error) {
    console.warn('[radio media controls]', error);
  }
}

function boot() {
  const player = document.getElementById('radioPlayer');

  setupMediaControls();
  updateMediaSession();

  player?.addEventListener('play', updateMediaSession);
  player?.addEventListener('pause', updateMediaSession);
  player?.addEventListener('loadedmetadata', updateMediaSession);
  player?.addEventListener('durationchange', updateMediaSession);
  player?.addEventListener('timeupdate', () => {
    if (Math.floor(player.currentTime) % 10 === 0) updateMediaSession();
  });
  player?.addEventListener('ended', updateMediaSession);

  const title = document.getElementById('nowPlayingTitle');
  const meta = document.getElementById('nowPlayingMeta');
  const observer = new MutationObserver(updateMediaSession);

  if (title) observer.observe(title, { childList: true, subtree: true, characterData: true });
  if (meta) observer.observe(meta, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.addEventListener('ub-firebase-ready', boot);
