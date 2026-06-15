// UniBeatz Radio · Live365 stream bridge
// Station ID: a01878

(function(){
  'use strict';

  const LIVE365_STREAM_URL = 'https://streaming.live365.com/a01878';
  const LIVE365_STATION_URL = 'https://live365.com/station/UniBeatz-Radio-a01878';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  ready(() => {
    const player = document.getElementById('radioPlayer');
    const refresh = document.getElementById('refreshApproved');
    const playPause = document.getElementById('playPause');
    const next = document.getElementById('nextTrack');
    const prev = document.getElementById('prevTrack');

    setText('nowPlayingTitle', 'Live Now: UniBeatz Radio');
    setText('nowPlayingMeta', 'Live365 broadcast · Empire Rotation · Independent artists · DJ sets · Built From Pressure.');
    setText('nowPlayingBadge', 'LIVE365 STREAM CONNECTED');
    setText('trackCountLabel', '24/7 Live365 rotation');

    if(player){
      player.src = LIVE365_STREAM_URL;
      player.preload = 'none';
      player.controls = true;
      player.loop = false;
      player.setAttribute('playsinline', '');
      player.setAttribute('data-live365', 'true');

      player.addEventListener('play', () => setText('nowPlayingBadge', 'LIVE365 PLAYING'));
      player.addEventListener('pause', () => setText('nowPlayingBadge', 'LIVE365 PAUSED'));
      player.addEventListener('error', () => setText('nowPlayingBadge', 'STREAM ERROR — OPEN LIVE365'));
    }

    [playPause, next, prev].forEach(btn => {
      if(btn) btn.style.display = 'none';
    });

    if(refresh){
      refresh.textContent = 'Open Live365';
      refresh.onclick = (e) => {
        e.preventDefault();
        window.open(LIVE365_STATION_URL, '_blank', 'noopener');
      };
    }

    window.UniBeatzLive365 = {
      stationId: 'a01878',
      streamUrl: LIVE365_STREAM_URL,
      stationUrl: LIVE365_STATION_URL
    };
  });
})();
