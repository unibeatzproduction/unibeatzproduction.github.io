const DEFAULT_ARTWORK = '/unibeatz-radio-cover.svg';

function text(id, fallback=''){
  return document.getElementById(id)?.textContent?.trim() || fallback;
}

function cleanTitle(value){
  return String(value || 'UniBeatz Radio').replace(/^Now Playing:\s*/i,'').replace(/^Featured Station:\s*/i,'').trim() || 'UniBeatz Radio';
}

function cleanArtist(value){
  const raw = String(value || 'UniBeatzProduction');
  return raw.split('•')[0]?.trim() || 'UniBeatzProduction';
}

function updateMediaSession(){
  if(!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const title = cleanTitle(text('nowPlayingTitle','UniBeatz Radio'));
  const artist = cleanArtist(text('nowPlayingMeta','UniBeatzProduction'));
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'UniBeatz Radio · Built From Pressure',
      artwork: [
        { src: DEFAULT_ARTWORK, sizes: '96x96', type: 'image/svg+xml' },
        { src: DEFAULT_ARTWORK, sizes: '128x128', type: 'image/svg+xml' },
        { src: DEFAULT_ARTWORK, sizes: '192x192', type: 'image/svg+xml' },
        { src: DEFAULT_ARTWORK, sizes: '256x256', type: 'image/svg+xml' },
        { src: DEFAULT_ARTWORK, sizes: '384x384', type: 'image/svg+xml' },
        { src: DEFAULT_ARTWORK, sizes: '512x512', type: 'image/svg+xml' }
      ]
    });
    navigator.mediaSession.playbackState = document.getElementById('radioPlayer')?.paused ? 'paused' : 'playing';
  }catch(error){
    console.warn('[radio media session]', error);
  }
}

function setupMediaControls(){
  if(!('mediaSession' in navigator)) return;
  const player = document.getElementById('radioPlayer');
  try{
    navigator.mediaSession.setActionHandler('play', async ()=>{
      try{ await player?.play(); }catch(e){}
      updateMediaSession();
    });
    navigator.mediaSession.setActionHandler('pause', ()=>{
      player?.pause();
      updateMediaSession();
    });
    navigator.mediaSession.setActionHandler('previoustrack', ()=> document.getElementById('prevTrack')?.click());
    navigator.mediaSession.setActionHandler('nexttrack', ()=> document.getElementById('nextTrack')?.click());
  }catch(error){
    console.warn('[radio media controls]', error);
  }
}

function boot(){
  const player = document.getElementById('radioPlayer');
  setupMediaControls();
  updateMediaSession();
  player?.addEventListener('play', updateMediaSession);
  player?.addEventListener('pause', updateMediaSession);
  player?.addEventListener('loadedmetadata', updateMediaSession);
  player?.addEventListener('ended', updateMediaSession);
  const title = document.getElementById('nowPlayingTitle');
  const meta = document.getElementById('nowPlayingMeta');
  const observer = new MutationObserver(updateMediaSession);
  if(title) observer.observe(title,{childList:true,subtree:true,characterData:true});
  if(meta) observer.observe(meta,{childList:true,subtree:true,characterData:true});
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
window.addEventListener('ub-firebase-ready', boot);
