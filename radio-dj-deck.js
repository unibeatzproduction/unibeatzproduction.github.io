<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Uni Radio DJ Deck</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;700&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet"/>
<style>
:root{--gold:#C9A84C;--gold-light:#F0C040;--blue:#00AAFF;--blue-bright:#40D0FF;--white:#F0EDE8;--gray:#9aa3b8;--green:#00cc66;--red:#ff3c3c}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:radial-gradient(circle at 18% 10%,rgba(0,170,255,.20),transparent 30%),radial-gradient(circle at 80% 20%,rgba(201,168,76,.16),transparent 32%),linear-gradient(145deg,#030305,#0a0a14,#030305);color:var(--white);font-family:Rajdhani,sans-serif}
.nav{position:sticky;top:0;z-index:20;background:rgba(5,8,14,.94);border-bottom:1px solid rgba(201,168,76,.55)}
.nav-inner{max-width:1260px;margin:auto;padding:14px 18px;display:flex;justify-content:space-between;gap:12px;align-items:center}
.brand{font-family:Bebas Neue,sans-serif;letter-spacing:2px;font-size:1.55rem;color:var(--gold-light);text-decoration:none}
.links{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.links a{font-family:Orbitron,sans-serif;font-size:.56rem;letter-spacing:2px;text-transform:uppercase;color:#dce3f3;text-decoration:none}
.wrap{max-width:1260px;margin:auto;padding:24px 18px 50px}
.hero,.panel{border:1px solid rgba(201,168,76,.34);border-radius:18px;background:linear-gradient(145deg,rgba(4,6,12,.88),rgba(0,0,0,.72));box-shadow:0 24px 70px rgba(0,0,0,.52);padding:18px}
.eyebrow{font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:3px;color:var(--blue-bright);text-transform:uppercase}
.h1{font-family:Bebas Neue,sans-serif;font-size:clamp(3rem,8vw,5.8rem);line-height:.85;letter-spacing:3px;margin:10px 0}
.h1 span{color:var(--gold-light)}
.sub{max-width:760px;color:#cbd3e4;line-height:1.5}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.deck-grid{display:grid;grid-template-columns:1fr 260px 1fr;gap:14px;margin-top:16px}
.btn{border:0;border-radius:10px;padding:11px 13px;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:1.6px;text-transform:uppercase;font-weight:900;cursor:pointer}
.btn-gold{background:linear-gradient(135deg,#8B6914,var(--gold),var(--gold-light));color:#05050a}
.btn-blue{background:rgba(0,170,255,.10);border:1px solid var(--blue);color:var(--blue-bright)}
.btn-red{background:rgba(255,60,60,.11);border:1px solid rgba(255,60,60,.55);color:#ff7474}
.btn-green{background:rgba(0,204,102,.12);border:1px solid rgba(0,204,102,.55);color:#5dff9e}
.btn-rec{background:rgba(255,60,60,.85);border:1px solid #ff3c3c;color:#fff}
.btn-rec.recording{background:#ff3c3c;animation:recPulse 1s infinite}
.btn-sm{padding:6px 10px;font-size:.44rem;border-radius:7px}
@keyframes recPulse{0%,100%{opacity:1}50%{opacity:.6}}
.input,select{width:100%;padding:11px;border-radius:10px;border:1px solid rgba(201,168,76,.25);background:#090d18;color:var(--white);font-family:Rajdhani,sans-serif}

/* Deck queue — inside each deck panel */
.deck-queue{margin-top:12px;max-height:260px;overflow-y:auto;display:grid;gap:6px}
.deck-queue::-webkit-scrollbar{width:4px}
.deck-queue::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:4px}
.dq-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.03);cursor:pointer;transition:border-color .15s}
.dq-item:hover{border-color:rgba(201,168,76,.4);background:rgba(201,168,76,.05)}
.dq-item.loaded{border-color:var(--gold);background:rgba(201,168,76,.08)}
.dq-num{font-family:Orbitron,sans-serif;font-size:.38rem;color:var(--gray);min-width:18px;text-align:right}
.dq-info{flex:1;min-width:0}
.dq-name{font-family:Bebas Neue,sans-serif;font-size:1rem;letter-spacing:1.2px;color:var(--gold-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dq-meta{font-size:.78rem;color:var(--gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dq-load{flex-shrink:0}

.track-list{display:grid;gap:9px;max-height:300px;overflow:auto}
.track{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);padding:11px;text-align:left;color:var(--white);cursor:pointer}
.track .name{font-family:Bebas Neue,sans-serif;letter-spacing:1.4px;font-size:1.3rem;color:var(--gold-light)}
.track .desc{color:#aeb8cb}
.turntable{border-radius:16px;border:1px solid rgba(64,208,255,.25);background:radial-gradient(circle,#151b2d,#05060a 58%,#000);min-height:180px;display:grid;place-items:center;text-align:center}
.disc{width:130px;height:130px;border-radius:50%;border:8px solid rgba(201,168,76,.35);background:radial-gradient(circle,#050505 0 20%,#141414 21% 50%,#050505 51%);display:grid;place-items:center;color:var(--blue-bright);font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:2px;text-align:center;padding:10px}
.range{width:100%}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.notice{min-height:22px;margin-top:10px;color:var(--blue-bright)}
.hardware-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px}
.mapping-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.stream-pad-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.stream-pad{min-height:70px}
#recordPanel{margin-top:16px;border:2px solid rgba(255,60,60,.45);border-radius:18px;background:linear-gradient(145deg,rgba(20,4,4,.88),rgba(0,0,0,.72));padding:18px}
#recordPanel .eyebrow{color:#ff7474}
#recTimer{font-family:Bebas Neue,sans-serif;font-size:2.5rem;letter-spacing:4px;color:#ff3c3c;margin:8px 0}
#recSavedList{display:grid;gap:9px;margin-top:12px;max-height:300px;overflow:auto}
.rec-item{border:1px solid rgba(255,60,60,.3);border-radius:12px;background:rgba(255,60,60,.06);padding:11px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px}
.rec-item .name{font-family:Bebas Neue,sans-serif;letter-spacing:1.4px;font-size:1.1rem;color:var(--gold-light)}
.rec-item .desc{color:#aeb8cb;font-size:.85rem}
#lockOverlay{position:fixed;inset:0;z-index:9999;background:#030305;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
@media(max-width:980px){.deck-grid,.grid,.hardware-grid{grid-template-columns:1fr}.nav-inner{flex-direction:column;align-items:flex-start}.stream-pad-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div id="lockOverlay">
  <div style="font-family:Bebas Neue,sans-serif;font-size:3rem;letter-spacing:3px;color:#F0C040;">DJ DECK</div>
  <input id="lockInput" type="password" placeholder="Admin code" style="padding:11px 14px;border-radius:10px;border:1px solid rgba(201,168,76,.4);background:#090d18;color:#fff;font-family:Rajdhani,sans-serif;font-size:1rem;width:260px;"/>
  <button onclick="if(document.getElementById('lockInput').value==='empire2026'){document.getElementById('lockOverlay').style.display='none'}else{document.getElementById('lockInput').value='';document.getElementById('lockInput').placeholder='Wrong code';}" style="border:0;border-radius:10px;padding:11px 24px;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:1.6px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#05050a;">UNLOCK</button>
</div>

<nav class="nav"><div class="nav-inner"><a class="brand" href="radio.html">⚡ UNI RADIO DJ DECK</a><div class="links"><a href="radio.html">Radio</a><a href="radio-dj-apply.html">Apply To DJ</a><a href="admin-radio.html">Admin</a><button onclick="document.getElementById('lockOverlay').style.display='flex';document.getElementById('lockInput').value='';" style="font-family:Orbitron,sans-serif;font-size:.56rem;letter-spacing:2px;text-transform:uppercase;color:#ff7474;background:transparent;border:1px solid rgba(255,60,60,.4);border-radius:8px;padding:6px 10px;cursor:pointer;">🔒 Lock</button></div></div></nav>

<main class="wrap">

<section class="hero">
  <div class="eyebrow">Virtual Broadcast Control Room</div>
  <h1 class="h1">DJ <span>Deck</span></h1>
  <p class="sub">Live broadcast, crossfader, queue, mic, MIDI, Stream Deck, and mix recorder — all in one panel.</p>
  <div class="actions">
    <button id="startBroadcast" class="btn btn-green">🔴 Start Live Broadcast</button>
    <button id="endBroadcast" class="btn btn-red" disabled>⏹ End Broadcast</button>
    <button id="micToggle" class="btn btn-blue">🎙 Mic Off</button>

  </div>
  <div id="deckNotice" class="notice"></div>
  <p class="sub" id="broadcastStatus" style="margin-top:8px;font-family:Orbitron,sans-serif;font-size:.46rem;letter-spacing:1.5px;color:var(--gray);">Offline. Start live mode when ready.</p>
</section>

<section class="deck-grid">

  <!-- DECK A -->
  <article class="panel">
    <div class="eyebrow">Deck A</div>
    <div class="turntable"><div class="disc" id="deckALabel">LOAD A</div></div>
    <audio id="deckA" controls style="width:100%;margin-top:10px"></audio>
    <div class="actions">
      <button id="playA" class="btn btn-gold">▶ Play</button>
      <button id="stopA" class="btn btn-blue">⏹ Stop</button>
      <button id="cueA" class="btn btn-blue">⏮ Cue</button>
    </div>
    <!-- Queue directly in Deck A -->
    <div style="margin-top:14px;">
      <div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:var(--gold);margin-bottom:8px;">QUEUE — TAP TO LOAD</div>
      <div id="deckAQueue" class="deck-queue"><div class="dq-item"><div class="dq-info"><div class="dq-name" style="color:var(--gray);">Loading tracks...</div></div></div></div>
    </div>
  </article>

  <!-- MIXER -->
  <article class="panel">
    <div class="eyebrow">Mixer</div>
    <p class="sub" style="margin-bottom:6px;">Crossfader</p>
    <input id="crossfader" class="range" type="range" min="0" max="100" value="50"/>
    <div style="display:flex;justify-content:space-between;font-family:Orbitron,sans-serif;font-size:.38rem;color:var(--gray);margin-bottom:10px;"><span>A</span><span>B</span></div>
    <h2 style="font-family:Bebas Neue;color:var(--gold-light);margin-top:8px;font-size:1.4rem;">Trigger Pads</h2>
    <p style="font-size:.8rem;color:var(--gray);margin-bottom:6px;">Station drops, voiceovers, podcasts</p>
    <div id="triggerPads" class="track-list"></div>
  </article>

  <!-- DECK B -->
  <article class="panel">
    <div class="eyebrow">Deck B</div>
    <div class="turntable"><div class="disc" id="deckBLabel">LOAD B</div></div>
    <audio id="deckB" controls style="width:100%;margin-top:10px"></audio>
    <div class="actions">
      <button id="playB" class="btn btn-gold">▶ Play</button>
      <button id="stopB" class="btn btn-blue">⏹ Stop</button>
      <button id="cueB" class="btn btn-blue">⏮ Cue</button>
    </div>
    <!-- Queue directly in Deck B -->
    <div style="margin-top:14px;">
      <div style="font-family:Orbitron,sans-serif;font-size:.44rem;letter-spacing:2px;color:var(--gold);margin-bottom:8px;">QUEUE — TAP TO LOAD</div>
      <div id="deckBQueue" class="deck-queue"><div class="dq-item"><div class="dq-info"><div class="dq-name" style="color:var(--gray);">Loading tracks...</div></div></div></div>
    </div>
  </article>

</section>

<!-- RECORD PANEL -->
<section id="recordPanel">
  <div class="eyebrow">🔴 Mix Recorder</div>
  <h2 style="font-family:Bebas Neue;color:#ff7474;font-size:2rem;letter-spacing:2px;">RECORD YOUR MIX</h2>
  <p class="sub" style="margin-bottom:12px;">Records everything playing through the decks. Download to upload to Live365.</p>
  <div class="actions">
    <button id="recStart" class="btn btn-rec">⏺ Start Recording</button>
    <button id="recStop" class="btn btn-blue" disabled>⏹ Stop & Save</button>
  </div>
  <div id="recTimer" style="display:none;">0:00</div>
  <div id="recNotice" class="notice"></div>
  <div id="recSavedList"></div>
</section>

<!-- FULL QUEUE BROWSER -->
<section class="panel" style="margin-top:16px">
  <div class="eyebrow">Track Browser</div>
  <h2 style="font-family:Bebas Neue;color:var(--gold-light);font-size:2rem;">FULL QUEUE</h2>
  <p class="sub" style="margin-bottom:10px;">Browse all approved tracks. Stage to a deck queue above, or load directly.</p>
  <div class="actions" style="margin-bottom:10px;">
    <button id="reloadQueue" class="btn btn-blue">↻ Reload Tracks</button>
    <button id="saveQueue" class="btn btn-gold">💾 Save Queue</button>
  </div>
  <div id="queueList" class="track-list"></div>
</section>

<!-- HARDWARE / MIDI / STREAM DECK -->
<section class="panel" style="margin-top:16px" id="hardwareManager">
  <div class="eyebrow">DJ Hardware Manager</div>
  <h2 style="font-family:Bebas Neue;color:var(--gold-light);font-size:2rem">MIDI / Equipment / Stream Deck</h2>
  <p class="sub">Connect MIDI controllers — FLKey, Akai, DDJ-style, or Stream Deck hotkeys.</p>
  <div class="actions">
    <button id="connectMidi" class="btn btn-gold">Connect MIDI Equipment</button>
    <button id="startMidiLearn" class="btn btn-blue">Start MIDI Learn</button>
    <button id="stopMidiLearn" class="btn btn-red">Stop MIDI Learn</button>
  </div>
  <div id="midiStatus" class="notice">No MIDI device connected yet.</div>
  <div class="hardware-grid">
    <article class="track"><div class="name">Connected Devices</div><div id="midiDevices" class="desc">None detected.</div></article>
    <article class="track"><div class="name">Last MIDI Signal</div><div id="lastMidiSignal" class="desc">Waiting...</div></article>
    <article class="track"><div class="name">MIDI Learn Target</div>
      <select id="midiTarget" class="input">
        <option value="playA">Play Deck A</option>
        <option value="playB">Play Deck B</option>
        <option value="stopA">Stop Deck A</option>
        <option value="stopB">Stop Deck B</option>
        <option value="crossfader">Crossfader</option>
        <option value="micToggle">Mic On/Off</option>
        <option value="nextTrigger">Trigger Next Drop</option>
        <option value="startBroadcast">Go Live</option>
        <option value="endBroadcast">End Live</option>
        <option value="startRecording">Start Recording</option>
        <option value="stopRecording">Stop Recording</option>
      </select>
    </article>
  </div>
  <h2 style="font-family:Bebas Neue;color:var(--gold-light);font-size:1.6rem;margin-top:14px">Saved Mappings</h2>
  <div id="midiMappings" class="track-list"></div>
  <h2 style="font-family:Bebas Neue;color:var(--gold-light);font-size:1.6rem;margin-top:14px">Stream Deck Pads</h2>
  <div class="stream-pad-grid">
    <button class="btn btn-green stream-pad" data-stream-action="startBroadcast">🔴 GO LIVE</button>
    <button class="btn btn-blue stream-pad" data-stream-action="micToggle">🎤 MIC</button>
    <button class="btn btn-gold stream-pad" data-stream-action="nextTrigger">📻 DROP</button>
    <button class="btn btn-blue stream-pad" data-stream-action="playA">▶ DECK A</button>
    <button class="btn btn-blue stream-pad" data-stream-action="playB">▶ DECK B</button>
    <button class="btn btn-rec stream-pad" data-stream-action="startRecording">⏺ RECORD</button>
  </div>
</section>

</main>
<script type="module" src="radio-dj-deck.js"></script>
<script>document.getElementById('lockInput').addEventListener('keydown',function(e){if(e.key==='Enter')e.target.nextElementSibling.click();});</script>
</body>
</html>
