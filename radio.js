// radio.js — UniBeatz Radio Station
// PURPOSE: Artist submission form + Firebase setup + Live365 bridge

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, where, getDocs, doc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4',
  authDomain: 'unibeatzproduction-7ae31.firebaseapp.com',
  projectId: 'unibeatzproduction-7ae31',
  storageBucket: 'unibeatzproduction-7ae31.firebasestorage.app',
  messagingSenderId: '70667820609',
  appId: '1:70667820609:web:57762df5510e6b4000b0c0'
};

const app     = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);
const auth    = getAuth(app);

window.UB_FIREBASE = { app, auth, db, storage, onAuthStateChanged, ready: true };
window.dispatchEvent(new CustomEvent('ub-firebase-ready'));

const LIVE365_PAGE = 'https://live365.com/station/UniBeatz-Radio-a01878';

const form         = document.getElementById('artistForm');
const submitModal  = document.getElementById('submitModal');
const accountBtn   = document.getElementById('radioAccountBtn');

let selectedFile = null;
let submitting   = false;

// ── UI helpers ──
function setAccountText(text){ if(accountBtn) accountBtn.textContent = text; }
function showModal(){ if(submitModal) submitModal.classList.add('open'); }
function hideModal(){ if(submitModal) submitModal.classList.remove('open'); }
function setNotice(msg, color){
  const el = document.getElementById('formNotice');
  if(!el) return;
  el.textContent = msg || '';
  el.style.color = color || '#40D0FF';
}
function setProgress(pct){
  const bar  = document.getElementById('ubRadioProgress');
  const fill = document.getElementById('ubRadioProgressFill');
  if(!bar||!fill) return;
  const p = Math.max(0, Math.min(100, Number(pct)||0));
  bar.style.display  = p <= 0 ? 'none' : 'block';
  fill.style.width   = p + '%';
}
function setSubmitLocked(locked, label){
  const btn = document.getElementById('radioSubmitBtn');
  if(!btn) return;
  btn.disabled     = locked;
  btn.textContent  = label || 'Submit for Review';
  btn.style.opacity = locked ? '0.6' : '1';
}
function resetState(){
  submitting = false;
  setSubmitLocked(false, 'Submit for Review');
  setProgress(0);
}
function ensureProgressBar(){
  if(document.getElementById('ubRadioProgress')) return;
  const notice = document.getElementById('formNotice');
  if(!notice) return;
  const bar = document.createElement('div');
  bar.id = 'ubRadioProgress';
  bar.style.cssText = 'display:none;margin:10px 0 8px;border-radius:999px;height:9px;background:rgba(255,255,255,.12);overflow:hidden;';
  bar.innerHTML = '<div id="ubRadioProgressFill" style="height:100%;width:0%;background:linear-gradient(90deg,#C9A84C,#F0C040);border-radius:999px;transition:width .25s;"></div>';
  notice.insertAdjacentElement('beforebegin', bar);
}
function field(name){ return (form?.querySelector('[name="'+name+'"]')?.value||'').trim(); }
function fileSizeMB(file){ return (file.size/(1024*1024)).toFixed(1); }
function isAudio(file){
  return !!(file && (String(file.type||'').startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name||'')));
}
function errorMsg(err){
  const code = err?.code||'', msg = err?.message||'';
  if(code==='auth/operation-not-allowed') return '❌ Anonymous sign-in not enabled. Contact admin.';
  if(code==='storage/unauthorized')       return '❌ Upload blocked by storage rules.';
  if(code==='storage/quota-exceeded')     return '❌ Storage full. Contact admin.';
  if(code==='storage/retry-limit-exceeded'||code==='storage/canceled'||/stalled/i.test(msg))
    return '❌ Upload stalled. Try Wi-Fi or a smaller MP3.';
  if(code==='permission-denied')          return '❌ Database permission denied.';
  if(/network|offline|internet/i.test(msg)) return '❌ Network issue. Try again on Wi-Fi.';
  return '❌ Upload failed: '+(code||msg||'Please try again.');
}

// ── Auth ──
async function ensureSignedIn(){
  if(auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// ── Live365 ──
(function setupLive365(){
  const refresh = document.getElementById('refreshApproved');
  if(refresh){
    refresh.textContent = 'Open Station ↗';
    refresh.onclick = e => { e.preventDefault(); window.open(LIVE365_PAGE,'_blank','noopener'); };
  }
  loadTrackCount();
  window.UniBeatzLive365 = { stationId:'a01878', stationUrl:LIVE365_PAGE };
})();

async function loadTrackCount(){
  try{
    const [tracksSnap, assetsSnap] = await Promise.all([
      getDocs(query(collection(db,'radio_submissions'), where('status','==','approved'))),
      getDocs(query(collection(db,'radio_assets'), where('active','==',true))).catch(()=>({docs:[]}))
    ]);
    const label = document.getElementById('trackCountLabel');
    if(label) label.textContent = tracksSnap.docs.length+' songs · '+assetsSnap.docs.length+' announcements';
  } catch(e){ console.warn('[radio] count load:',e); }
}

// ── Account button ──
accountBtn?.addEventListener('click', ()=>{
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else if(window.UniBeatzAuth?.showLogin) window.UniBeatzAuth.showLogin();
});
window.addEventListener('ub-auth-ready', e=>{
  const u=e.detail?.user, p=e.detail?.profile;
  setAccountText((!u||u.isAnonymous)?'Sign In':(p?.username||u.email||'Account'));
});
onAuthStateChanged(auth, u=>setAccountText(!u||u.isAnonymous?'Sign In':(u.displayName||u.email||'Account')));

// ── Wire form — runs once ──
function wireForm(){
  if(!form||form.dataset.wired==='yes') return;
  form.dataset.wired = 'yes';

  const fileInput = form.querySelector('input[type="file"]');
  const submitBtn = document.getElementById('radioSubmitBtn');

  // File picker
  fileInput?.addEventListener('change', function(){
    const file = this.files&&this.files[0];
    selectedFile = null;
    if(!file){ setNotice('No file selected.','#ffcc66'); return; }
    if(!isAudio(file)){ this.value=''; setNotice('❌ Please choose an audio file.','#ff3c3c'); return; }
    if(file.size>100*1024*1024){ this.value=''; setNotice('❌ Max file size is 100MB.','#ff3c3c'); return; }
    selectedFile = file;
    setNotice('✅ '+file.name+' ('+fileSizeMB(file)+'MB) — tap Submit to upload','#5dff9e');
  });

  // Submit button
  submitBtn?.addEventListener('click', e=>{ e.preventDefault(); doSubmit(); });
  form.addEventListener('submit', e=>{ e.preventDefault(); doSubmit(); });
}

// ── Upload with real progress ──
async function uploadWithProgress(fileRef, file, contentType){
  const task = uploadBytesResumable(fileRef, file, { contentType });
  await new Promise((resolve, reject)=>{
    let stuckTimer = null;
    let lastBytes  = 0;
    function resetStuck(bytes){
      clearTimeout(stuckTimer);
      if(bytes>lastBytes) lastBytes=bytes;
      stuckTimer = setTimeout(()=>{ try{ task.cancel(); }catch(e){} reject(new Error('Upload stalled')); }, 60000);
    }
    task.on('state_changed',
      snap=>{
        resetStuck(snap.bytesTransferred);
        const pct = snap.totalBytes ? Math.round(snap.bytesTransferred/snap.totalBytes*100) : 20;
        setProgress(pct);
        setNotice('Uploading '+fileSizeMB(file)+'MB ('+pct+'%) — keep this screen open...','#40D0FF');
      },
      err=>{ clearTimeout(stuckTimer); reject(err); },
      ()=>{ clearTimeout(stuckTimer); setProgress(100); resolve(); }
    );
    resetStuck(0);
  });
  return task.snapshot.ref;
}

// ── Core submit ──
async function doSubmit(){
  if(submitting||!form) return;
  submitting = true;
  ensureProgressBar();
  showModal();
  setSubmitLocked(true,'⏳ Uploading...');
  setProgress(4);
  setNotice('Starting submission...','#40D0FF');

  const artistName       = field('artistName');
  const email            = field('email');
  const trackTitle       = field('trackTitle');
  const artistLink       = field('artistLink');
  const producerCredits  = field('producerCredits');
  const genre            = field('genre');
  const copyrightDecl    = field('copyrightDeclaration');
  const rightsConfirm    = !!form.querySelector('[name="rightsConfirm"]')?.checked;
  const fileInput        = form.querySelector('input[type="file"]');
  const file             = selectedFile || (fileInput?.files&&fileInput.files[0]);

  // Validate
  if(!artistName)      { setNotice('❌ Artist name is required.','#ff3c3c');        resetState(); return; }
  if(!email)           { setNotice('❌ Email is required.','#ff3c3c');              resetState(); return; }
  if(!trackTitle)      { setNotice('❌ Track title is required.','#ff3c3c');        resetState(); return; }
  if(!genre)           { setNotice('❌ Please select a genre.','#ff3c3c');          resetState(); return; }
  if(!producerCredits) { setNotice('❌ Producer credits are required.','#ff3c3c'); resetState(); return; }
  if(!rightsConfirm)   { setNotice('❌ Please confirm your rights.','#ff3c3c');    resetState(); return; }
  if(!file)            { setNotice('❌ Please choose an audio file.','#ff3c3c');    resetState(); return; }
  if(!isAudio(file))   { setNotice('❌ Please choose an audio file only.','#ff3c3c'); resetState(); return; }
  if(file.size>100*1024*1024){ setNotice('❌ Max file size is 100MB.','#ff3c3c'); resetState(); return; }

  try{
    setProgress(10);
    setNotice('Authenticating...','#40D0FF');
    const user = await ensureSignedIn();

    const ext = (file.name.split('.').pop()||'mp3').toLowerCase();
    const contentType = file.type || (ext==='wav'?'audio/wav':ext==='m4a'?'audio/mp4':'audio/mpeg');

    // Storage path matches rules: radio-submissions/{uid}/{filename}
    const safeName = Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const fileRef  = ref(storage, 'radio-submissions/'+user.uid+'/'+safeName);

    setProgress(15);
    setNotice('Uploading '+fileSizeMB(file)+'MB — keep this screen open...','#40D0FF');

    const uploadedRef = await uploadWithProgress(fileRef, file, contentType);

    setProgress(100);
    setNotice('Saving submission...','#40D0FF');
    const audioUrl = await getDownloadURL(uploadedRef);

    await addDoc(collection(db,'radio_submissions'), {
      artistName, email, trackTitle, artistLink,
      producerCredits, genre,
      copyrightDeclaration: copyrightDecl,
      rightsConfirm, audioUrl,
      fileType: contentType,
      fileName: file.name||safeName,
      fileSizeBytes: file.size,
      storagePath: uploadedRef.fullPath,
      status: 'pending', featured: false,
      reviewNotes: '', approvedFor: [],
      submittedByUid: user.uid,
      submittedByEmail: user.email||email,
      isAnonymousSubmission: !!user.isAnonymous,
      submittedFrom: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)?'mobile':'desktop',
      createdAt: serverTimestamp(), reviewedAt: null
    });

    setNotice('✅ Submitted! UniBeatz Radio will review your track soon.','#00cc66');
    form.reset();
    selectedFile = null;
    submitting   = false;
    setSubmitLocked(false,'Submit for Review');
    loadTrackCount();
    setTimeout(()=>{ setProgress(0); hideModal(); }, 2400);

  } catch(err){
    console.error('[radio submit]',err);
    setNotice(errorMsg(err),'#ff3c3c');
    setProgress(0);
    resetState();
  }
}

// ── Modal open/close ──
document.getElementById('openSubmit')?.addEventListener('click', ()=>{
  if(!submitting){ setProgress(0); setNotice(''); setSubmitLocked(false,'Submit for Review'); }
  ensureProgressBar();
  showModal();
  wireForm();
});
document.getElementById('closeSubmit')?.addEventListener('click', ()=>{
  if(submitting) return;
  hideModal(); setNotice(''); setProgress(0);
});
submitModal?.addEventListener('click', e=>{ if(e.target===submitModal&&!submitting) hideModal(); });

wireForm();

// ── Reactions ──
window.ubRadioReaction = async function(trackId, reaction){
  try{
    const user = await ensureSignedIn();
    let listenerId = localStorage.getItem('ub_radio_listener_id');
    if(!listenerId){ listenerId='listener_'+Date.now()+'_'+Math.random().toString(36).slice(2,10); localStorage.setItem('ub_radio_listener_id',listenerId); }
    const reactionId = (trackId+'_'+listenerId).replace(/[^a-zA-Z0-9_-]/g,'_');
    await setDoc(doc(db,'radio_reactions',reactionId),{
      trackId, listenerId, reaction,
      uid: user.uid, isAnonymous: !!user.isAnonymous,
      updatedAt: serverTimestamp()
    },{merge:true});
  } catch(e){ console.warn('[radio reaction]',e); }
};
