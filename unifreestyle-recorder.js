// unifreestyle-recorder.js
// UniBeatz Production — Video recording system
// Records live streams + battles via MediaRecorder, uploads to Firebase Storage
// Live stream recordings: visible on profile for 7 days, then hidden (file kept)
// Battle recordings: saved by DJ/Artist/Admin only

(function(){
  'use strict';

  // ── Helpers ──
  function clean(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
  function read(k,f){ try{ return JSON.parse(localStorage.getItem(k)||f); }catch(e){ return JSON.parse(f||'null'); } }
  function write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function toast(m){ if(window.showToast) window.showToast(m); else console.log('[rec]',m); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function getCurrent(){
    return read('ub_current_user',null)||read('ub_user',null)||null;
  }
  function myName(){ var u=getCurrent(); return clean((u&&(u.username||u.name))||''); }
  function myRole(){ var u=getCurrent(); return String((u&&u.role)||'viewer').toLowerCase(); }

  function canRecord(type){
    var role=myRole();
    var name=myName();
    if(type==='livestream'){
      // Only the host can record their own live stream
      return role==='admin'||role==='dj'||role==='artist';
    }
    if(type==='battle'){
      // DJ, artist, admin can record battles — viewers cannot
      return role==='admin'||role==='dj'||role==='artist';
    }
    return false;
  }

  function getFb(){
    var fb=window.UB_FIREBASE||{};
    return (fb.db&&fb.storage&&fb.ref&&fb.uploadBytes)?fb:null;
  }

  // ── Recorder state ──
  var recSt = {
    recorder: null,
    chunks: [],
    stream: null,
    type: null,      // 'livestream' | 'battle'
    roomName: null,
    startedAt: null,
    btn: null
  };

  // ── CSS ──
  function injectCss(){
    if(document.getElementById('ubRecCss')) return;
    var s=document.createElement('style'); s.id='ubRecCss';
    s.textContent=[
      '.ub-rec-btn{border:0;border-radius:10px;padding:9px 14px;font-family:Orbitron,sans-serif;font-size:.48rem;font-weight:900;letter-spacing:1.2px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .2s;}',
      '.ub-rec-btn.idle{background:rgba(255,51,51,.14);color:#ff6b6b;border:1px solid rgba(255,51,51,.4);}',
      '.ub-rec-btn.recording{background:rgba(255,51,51,.85);color:#fff;animation:ubRecPulse 1.2s infinite;}',
      '.ub-rec-btn.uploading{background:rgba(240,192,64,.18);color:#F0C040;border:1px solid rgba(240,192,64,.4);}',
      '@keyframes ubRecPulse{0%,100%{opacity:1;}50%{opacity:.6;}}',
      // Saved videos panel
      '#ubSavedVideos{margin:10px 0;border:1px solid rgba(201,168,76,.22);border-radius:14px;background:rgba(0,0,0,.22);padding:12px;}',
      '.ub-video-card{border:1px solid rgba(64,208,255,.18);border-radius:12px;background:rgba(255,255,255,.04);padding:10px;margin-bottom:8px;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;}',
      '.ub-video-thumb{width:72px;height:48px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;overflow:hidden;cursor:pointer;flex-shrink:0;}',
      '.ub-video-thumb video{width:100%;height:100%;object-fit:cover;}',
      '.ub-video-title{font-family:Bebas Neue,Arial,sans-serif;font-size:1rem;letter-spacing:1px;color:#F0C040;}',
      '.ub-video-meta{font-family:Orbitron,sans-serif;font-size:.38rem;color:rgba(64,208,255,.7);margin-top:3px;}',
      '.ub-video-actions{display:flex;gap:6px;flex-wrap:wrap;}',
      '.ub-video-actions button{border:0;border-radius:8px;padding:7px 10px;font-family:Orbitron,sans-serif;font-size:.42rem;font-weight:900;cursor:pointer;}',
      '.ub-vid-play{background:rgba(64,208,255,.15);color:#40D0FF;border:1px solid rgba(64,208,255,.3)!important;}',
      '.ub-vid-share{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;}',
      '.ub-vid-delete{background:rgba(255,51,51,.13);color:#ff6b6b;border:1px solid rgba(255,51,51,.3)!important;}',
      '.ub-vid-expired{opacity:.45;font-style:italic;color:rgba(240,237,232,.4);font-size:.75rem;}',
      // Video player overlay
      '#ubVideoPlayer{position:fixed;inset:0;background:rgba(0,0,0,.96);z-index:999999;display:none;flex-direction:column;align-items:center;justify-content:center;}',
      '#ubVideoPlayer video{max-width:100%;max-height:80vh;border-radius:12px;}',
      '#ubVideoPlayer .ub-vp-close{position:absolute;top:16px;right:18px;border:0;background:transparent;color:#F0C040;font-size:1.8rem;cursor:pointer;line-height:1;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Get stream to record ──
  // Tries to capture from visible video elements in the battle/live area
  function getRecordableStream(type){
    // Try to capture from the main video element on screen
    var vid = null;
    if(type==='livestream'){
      vid = document.getElementById('ubHostVideoBox') &&
            document.querySelector('#ubHostVideoBox video');
    }
    if(type==='battle'){
      // Capture first visible video in battle area
      vid = document.querySelector('#page-livebattle video, #page-battle-live video, .ub-battle-tile video');
    }
    if(vid && vid.captureStream){
      try{
        var s=vid.captureStream();
        if(s && s.getTracks().length>0) return s;
      }catch(e){ console.warn('[rec] captureStream failed:',e); }
    }
    // Fallback: getUserMedia (records local cam/mic)
    return null;
  }

  // ── Start recording ──
  async function startRecording(type, roomName, btnEl){
    if(!canRecord(type)) return toast('⚠️ Only DJs, artists, and admins can record');
    if(recSt.recorder && recSt.recorder.state==='recording') return toast('Already recording');

    injectCss();
    recSt.type=type; recSt.roomName=roomName||'session'; recSt.chunks=[];
    recSt.startedAt=Date.now(); recSt.btn=btnEl||null;

    // Get stream
    var stream = getRecordableStream(type);
    if(!stream){
      // Fallback to screen + mic capture
      try{
        stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      }catch(e){
        return toast('⚠️ Could not access camera/mic: '+e.message);
      }
    }
    recSt.stream=stream;

    // Pick best supported format
    var mime='video/webm;codecs=vp9,opus';
    if(!MediaRecorder.isTypeSupported(mime)) mime='video/webm;codecs=vp8,opus';
    if(!MediaRecorder.isTypeSupported(mime)) mime='video/webm';
    if(!MediaRecorder.isTypeSupported(mime)) mime='video/mp4';

    try{
      recSt.recorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:1500000 });
    }catch(e){
      recSt.recorder = new MediaRecorder(stream);
    }

    recSt.recorder.ondataavailable=function(e){
      if(e.data && e.data.size>0) recSt.chunks.push(e.data);
    };

    recSt.recorder.onstop=function(){
      uploadRecording();
    };

    recSt.recorder.start(1000); // collect chunks every second
    updateBtn('recording');
    toast('🔴 Recording started');
  }

  // ── Stop recording ──
  function stopRecording(){
    if(!recSt.recorder || recSt.recorder.state==='inactive') return toast('Not recording');
    recSt.recorder.stop();
    if(recSt.stream) recSt.stream.getTracks().forEach(function(t){ t.stop(); });
    updateBtn('uploading');
    toast('⏳ Uploading recording...');
  }

  // ── Upload to Firebase Storage ──
  async function uploadRecording(){
    var fb=getFb();
    if(!fb){
      // Save locally as blob URL fallback
      saveLocal(); return;
    }
    var mime=recSt.recorder.mimeType||'video/webm';
    var ext=mime.indexOf('mp4')>-1?'mp4':'webm';
    var blob=new Blob(recSt.chunks,{type:mime});
    if(blob.size===0){ toast('⚠️ Recording was empty'); updateBtn('idle'); return; }

    var name=myName();
    var ts=Date.now();
    var path=(recSt.type==='battle'?'battle_recordings':'livestream_recordings')+
             '/'+name+'/'+ts+'.'+ext;

    try{
      var storageRef=fb.ref(fb.storage, path);
      var snap=await fb.uploadBytes(storageRef, blob, { contentType:mime });
      var url=await fb.getDownloadURL(snap.ref);

      // Save metadata to Firestore
      var meta={
        username: name,
        type: recSt.type,
        roomName: recSt.roomName,
        url: url,
        path: path,
        mime: mime,
        size: blob.size,
        recordedAt: ts,
        expiresAt: recSt.type==='livestream' ? ts+(7*24*60*60*1000) : null, // 7 days for livestream
        role: myRole()
      };

      await fb.setDoc(fb.doc(fb.db,'recordings',name+'_'+ts), meta);

      // Also save to localStorage for quick access
      saveToLocalMeta(meta, url);

      updateBtn('idle');
      toast('✅ Recording saved!');
      // Refresh saved videos panel if on profile page
      renderSavedVideos();

    }catch(e){
      console.error('[rec] upload failed:',e);
      toast('⚠️ Upload failed: '+e.message+' — saving locally');
      saveLocal();
    }
  }

  // ── Local fallback — offer download ──
  function saveLocal(){
    var mime=recSt.recorder&&recSt.recorder.mimeType||'video/webm';
    var ext=mime.indexOf('mp4')>-1?'mp4':'webm';
    var blob=new Blob(recSt.chunks,{type:mime});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='unibeatz-recording-'+Date.now()+'.'+ext;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },2000);
    updateBtn('idle');
    toast('💾 Recording downloaded to your device');
  }

  // ── Local metadata cache ──
  function saveToLocalMeta(meta, url){
    var saved=read('ub_recordings','[]')||[];
    saved.unshift(Object.assign({},meta,{url:url}));
    if(saved.length>50) saved=saved.slice(0,50);
    write('ub_recordings',saved);
  }

  function getLocalMeta(){ return read('ub_recordings','[]')||[]; }

  // ── Update record button ──
  function updateBtn(state){
    var btn=recSt.btn||document.getElementById('ubRecordBtn');
    if(!btn) return;
    btn.className='ub-rec-btn '+state;
    if(state==='recording') btn.innerHTML='⏹ STOP REC';
    else if(state==='uploading') btn.innerHTML='⏳ SAVING...';
    else btn.innerHTML='⏺ RECORD';
    btn.onclick = state==='recording'
      ? function(){ stopRecording(); }
      : function(){ startRecording(recSt.type||'battle', recSt.roomName, btn); };
  }

  // ── Inject record button ──
  function injectRecordBtn(type, roomName, container){
    injectCss();
    if(!canRecord(type)) return; // viewers see nothing
    var btn=document.getElementById('ubRecordBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='ubRecordBtn';
      btn.className='ub-rec-btn idle';
      btn.innerHTML='⏺ RECORD';
      if(container) container.appendChild(btn);
      else{
        // Default inject into battle controls or profile page
        var target=document.querySelector('.battle-controls, #page-livebattle .page-body, #page-profile .page-body');
        if(target) target.insertAdjacentElement('afterbegin',btn);
        else document.body.appendChild(btn);
      }
    }
    recSt.type=type; recSt.roomName=roomName;
    btn.onclick=function(){ startRecording(type,roomName,btn); };
  }

  // ── Render saved videos panel on profile ──
  function renderSavedVideos(){
    var page=document.getElementById('page-profile'); if(!page) return;
    if(!canRecord('livestream')&&!canRecord('battle')) return; // viewers see nothing

    var panel=document.getElementById('ubSavedVideos');
    if(!panel){
      panel=document.createElement('div'); panel.id='ubSavedVideos';
      var body=page.querySelector('.page-body'); if(!body) return;
      // Insert after clean profile card
      var card=document.getElementById('ubCleanProfile');
      if(card) card.insertAdjacentElement('afterend',panel);
      else body.appendChild(panel);
    }

    var now=Date.now();
    var fb=getFb();

    // Load from Firestore + local cache
    var locals=getLocalMeta();

    function render(recordings){
      var mine=recordings.filter(function(r){ return r.username===myName(); });
      if(!mine.length){
        panel.innerHTML='<div style="font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#F0C040;margin-bottom:8px;">MY RECORDINGS</div><div style="color:rgba(240,237,232,.4);font-size:.8rem;">No recordings yet. Go live or join a battle and hit ⏺ RECORD.</div>';
        return;
      }
      panel.innerHTML='<div style="font-family:Orbitron,sans-serif;font-size:.48rem;letter-spacing:2px;color:#F0C040;margin-bottom:10px;">MY RECORDINGS</div>';
      mine.forEach(function(r){
        var expired=r.expiresAt&&now>r.expiresAt;
        var daysLeft=r.expiresAt?Math.max(0,Math.ceil((r.expiresAt-now)/(24*60*60*1000))):null;
        var card=document.createElement('div');
        card.className='ub-video-card';
        var label=r.type==='battle'?'⚔️ Battle':'🔴 Live Stream';
        var meta=label+' · '+new Date(r.recordedAt).toLocaleDateString();
        if(daysLeft!==null) meta+=' · '+(expired?'<span class="ub-vid-expired">Expired</span>':daysLeft+'d left');
        card.innerHTML=[
          '<div class="ub-video-thumb" onclick="ubRecorder.play(\''+esc(r.url)+'\')">',
            expired?'<span>🎬</span>':'<span>▶</span>',
          '</div>',
          '<div>',
            '<div class="ub-video-title">'+esc(r.roomName||'Session')+(expired?' <span class="ub-vid-expired">(expired)</span>':'')+'</div>',
            '<div class="ub-video-meta">'+meta+'</div>',
          '</div>',
          '<div class="ub-video-actions">',
            (!expired?'<button class="ub-vid-play" onclick="ubRecorder.play(\''+esc(r.url)+'\')">▶ PLAY</button>':''),
            '<button class="ub-vid-share" onclick="ubRecorder.share(\''+esc(r.url)+'\',\''+esc(r.roomName||'UniBeatz Session')+'\')">↗ SHARE</button>',
            '<button class="ub-vid-delete" onclick="ubRecorder.deleteRec(\''+esc(r.username+'_'+r.recordedAt)+'\')">🗑</button>',
          '</div>'
        ].join('');
        panel.appendChild(card);
      });
    }

    // Try Firestore first, fall back to local
    if(fb){
      fb.getDocs(fb.query(
        fb.collection(fb.db,'recordings'),
        fb.where('username','==',myName())
      )).then(function(snap){
        var recs=[];
        snap.forEach(function(doc){ recs.push(doc.data()); });
        recs.sort(function(a,b){ return b.recordedAt-a.recordedAt; });
        render(recs.length?recs:locals);
      }).catch(function(){ render(locals); });
    } else {
      render(locals);
    }
  }

  // ── Video player overlay ──
  function ensurePlayer(){
    var p=document.getElementById('ubVideoPlayer'); if(p) return p;
    p=document.createElement('div'); p.id='ubVideoPlayer';
    p.innerHTML='<button class="ub-vp-close">×</button><video controls playsinline></video>';
    document.body.appendChild(p);
    p.querySelector('.ub-vp-close').onclick=function(){
      p.style.display='none';
      var v=p.querySelector('video'); v.pause(); v.src='';
    };
    return p;
  }

  function playVideo(url){
    injectCss();
    var p=ensurePlayer(); p.style.display='flex';
    var v=p.querySelector('video');
    v.src=url; v.play().catch(function(){});
  }

  // ── Share ──
  function shareVideo(url, title){
    var text='Watch this on UniBeatz Production! 🎤🔥';
    if(navigator.share){
      navigator.share({ title:title||'UniBeatz Recording', text:text, url:url })
        .catch(function(e){ if(e.name!=='AbortError') copyLink(url); });
    } else {
      copyLink(url);
    }
  }

  function copyLink(url){
    try{
      navigator.clipboard.writeText(url);
      toast('🔗 Link copied — paste anywhere to share');
    }catch(e){
      var ta=document.createElement('textarea');
      ta.value=url; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      toast('🔗 Link copied');
    }
  }

  // ── Delete recording ──
  async function deleteRecording(docId){
    if(!confirm('Remove this recording?')) return;
    var fb=getFb();
    if(fb){
      try{ await fb.deleteDoc(fb.doc(fb.db,'recordings',docId)); }catch(e){}
    }
    // Remove from local cache
    var saved=(read('ub_recordings','[]')||[]).filter(function(r){
      return (r.username+'_'+r.recordedAt)!==docId;
    });
    write('ub_recordings',saved);
    toast('Recording removed');
    renderSavedVideos();
  }

  // ── Public API ──
  window.ubRecorder = {
    start: startRecording,
    stop: stopRecording,
    injectBtn: injectRecordBtn,
    renderSaved: renderSavedVideos,
    play: playVideo,
    share: shareVideo,
    deleteRec: deleteRecording,
    canRecord: canRecord
  };

  // Auto-render saved videos on profile page load
  function boot(){
    injectCss();
    renderSavedVideos();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
  setTimeout(boot,1200);

})();
