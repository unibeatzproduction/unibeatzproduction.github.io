// radio.js — UniBeatz Radio Station
// PURPOSE: Artist submission form + Firebase setup + Live365 bridge + reactions

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

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

// ── Live365 bridge ──
const LIVE365_PAGE = 'https://live365.com/station/UniBeatz-Radio-a01878';

(function setupLive365(){
  const refresh = document.getElementById('refreshApproved');
  if(refresh){
    refresh.textContent = 'Open Station ↗';
    refresh.onclick = e => { e.preventDefault(); window.open(LIVE365_PAGE, '_blank', 'noopener'); };
  }
  loadTrackCount();
  window.UniBeatzLive365 = { stationId: 'a01878', stationUrl: LIVE365_PAGE };
})();

async function loadTrackCount(){
  try{
    const [tracksSnap, assetsSnap] = await Promise.all([
      getDocs(query(collection(db, 'radio_submissions'), where('status', '==', 'approved'))),
      getDocs(query(collection(db, 'radio_assets'), where('active', '==', true))).catch(() => ({ docs: [] }))
    ]);
    const label = document.getElementById('trackCountLabel');
    if(label) label.textContent = tracksSnap.docs.length + ' songs · ' + assetsSnap.docs.length + ' announcements';
  } catch(e){ console.warn('[radio] count load:', e); }
}

// ── Helpers ──
function setAccountText(text){
  const btn = document.getElementById('radioAccountBtn');
  if(btn) btn.textContent = text;
}
function getListenerId(){
  let id = localStorage.getItem('ub_radio_listener_id');
  if(!id){ id = 'listener_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); localStorage.setItem('ub_radio_listener_id', id); }
  return id;
}

function setNotice(msg, color){
  const notice = document.getElementById('formNotice');
  if(notice){ notice.textContent = msg; notice.style.color = color || '#40D0FF'; }
}

function showSubmitModal(){
  const modal = document.getElementById('submitModal');
  if(modal) modal.classList.add('open');
}
function hideSubmitModal(){
  const modal = document.getElementById('submitModal');
  if(modal) modal.classList.remove('open');
}

// ── Progress bar (inject once) ──
function ensureProgressBar(){
  if(document.getElementById('ubRadioProgress')) return;
  const bar = document.createElement('div');
  bar.id = 'ubRadioProgress';
  bar.style.cssText = 'display:none;margin:10px 0 4px;border-radius:999px;height:8px;background:rgba(255,255,255,.1);overflow:hidden;';
  bar.innerHTML = '<div id="ubRadioProgressFill" style="height:100%;width:0%;background:linear-gradient(90deg,#C9A84C,#F0C040);border-radius:999px;transition:width .3s;"></div>';
  const notice = document.getElementById('formNotice');
  if(notice) notice.insertAdjacentElement('beforebegin', bar);
}

function setProgress(pct){
  const bar = document.getElementById('ubRadioProgress');
  const fill = document.getElementById('ubRadioProgressFill');
  if(!bar || !fill) return;
  if(pct <= 0){ bar.style.display = 'none'; fill.style.width = '0%'; return; }
  bar.style.display = 'block';
  fill.style.width = Math.min(100, pct) + '%';
}

// ── Lock submit button during upload ──
function setSubmitLocked(locked, label){
  const btn = document.getElementById('radioSubmitBtn');
  if(!btn) return;
  btn.disabled = locked;
  btn.textContent = label || 'Submit for Review';
  btn.style.opacity = locked ? '0.6' : '1';
}

// ── Account button ──
document.getElementById('radioAccountBtn')?.addEventListener('click', () => {
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else if(window.UniBeatzAuth?.showLogin) window.UniBeatzAuth.showLogin();
});
window.addEventListener('ub-auth-ready', e => setAccountText(
  (!e.detail?.user || e.detail?.user?.isAnonymous) ? 'Sign In' : (e.detail?.profile?.username || e.detail?.user?.email || 'Account')
));
onAuthStateChanged(auth, user => setAccountText(!user || user.isAnonymous ? 'Sign In' : (user.displayName || user.email || 'Account')));

// ── Submit modal ──
const form = document.getElementById('artistForm');
let _selectedFile = null;
let _submitting = false;

// Open / close
document.getElementById('openSubmit')?.addEventListener('click', () => {
  showSubmitModal();
  ensureProgressBar();
});
document.getElementById('closeSubmit')?.addEventListener('click', () => {
  if(_submitting) return; // don't let them close during upload
  hideSubmitModal();
  _selectedFile = null;
  _submitting = false;
  setNotice('');
  setProgress(0);
  setSubmitLocked(false);
});

// ── File input — read ArrayBuffer immediately on selection ──
const fileInput = form?.querySelector('input[type="file"]');
if(fileInput){
  fileInput.addEventListener('change', function(){
    const file = this.files && this.files[0];
    if(!file){ _selectedFile = null; setNotice('No file selected.', '#ffcc66'); return; }

    setNotice('Reading file...', '#40D0FF');

    const reader = new FileReader();
    reader.onload = function(ev){
      _selectedFile = {
        buffer: ev.target.result,
        name: file.name,
        size: file.size,
        type: file.type
      };
      const sizeMB = (file.size / (1024*1024)).toFixed(1);
      setNotice('✅ ' + file.name + ' (' + sizeMB + 'MB) — tap Submit to upload', '#5dff9e');
    };
    reader.onerror = function(){
      _selectedFile = null;
      setNotice('❌ Could not read file. Please try again.', '#ff3c3c');
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Submit button ──
document.getElementById('radioSubmitBtn')?.addEventListener('click', function(){
  if(_submitting) return;
  doSubmit();
});

async function doSubmit(){
  if(_submitting) return;
  _submitting = true;
  ensureProgressBar();
  showSubmitModal(); // keep modal open
  setSubmitLocked(true, '⏳ Uploading...');
  setProgress(5);
  setNotice('Starting upload...', '#40D0FF');

  const f = form;
  const val = name => (f.querySelector('[name="' + name + '"]')?.value || '').trim();
  const artistName      = val('artistName');
  const email           = val('email');
  const trackTitle      = val('trackTitle');
  const artistLink      = val('artistLink');
  const producerCredits = val('producerCredits');
  const genre           = val('genre');
  const copyrightDecl   = val('copyrightDeclaration');
  const rightsConfirm   = !!f.querySelector('[name="rightsConfirm"]')?.checked;

  // Validate
  if(!artistName){      setNotice('❌ Artist name is required.', '#ff3c3c'); reset(); return; }
  if(!trackTitle){      setNotice('❌ Track title is required.', '#ff3c3c'); reset(); return; }
  if(!genre){           setNotice('❌ Please select a genre.', '#ff3c3c'); reset(); return; }
  if(!rightsConfirm){   setNotice('❌ Please confirm your rights.', '#ff3c3c'); reset(); return; }
  if(!_selectedFile){   setNotice('❌ Please select an audio file first.', '#ff3c3c'); reset(); return; }
  if(_selectedFile.size > 100 * 1024 * 1024){ setNotice('❌ Max file size is 100MB.', '#ff3c3c'); reset(); return; }

  try{
    const ext = (_selectedFile.name || '').split('.').pop().toLowerCase();
    const contentType = ext === 'wav'  ? 'audio/wav'
                      : ext === 'mp3'  ? 'audio/mpeg'
                      : (_selectedFile.type && _selectedFile.type.startsWith('audio/')) ? _selectedFile.type
                      : 'audio/mpeg';

    const sizeMB = (_selectedFile.size / (1024*1024)).toFixed(1);

    // Auth
    setProgress(15);
    setNotice('Authenticating...', '#40D0FF');
    if(!auth.currentUser) await signInAnonymously(auth);

    // Upload
    setProgress(25);
    setNotice('Uploading ' + sizeMB + 'MB — keep this screen open...', '#40D0FF');

    const safeName = Date.now() + '-' + (_selectedFile.name || 'track').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef  = ref(storage, 'radio-submissions/' + safeName);
    const uint8    = new Uint8Array(_selectedFile.buffer);

    // Simulate progress while uploading (real progress needs XMLHttpRequest)
    let fakePct = 25;
    const fakeTimer = setInterval(() => {
      fakePct = Math.min(fakePct + 5, 85);
      setProgress(fakePct);
      setNotice('Uploading ' + sizeMB + 'MB (' + Math.round(fakePct) + '%) — keep this screen open...', '#40D0FF');
    }, 800);

    await uploadBytes(fileRef, uint8, { contentType });
    clearInterval(fakeTimer);

    setProgress(90);
    setNotice('Saving your submission...', '#40D0FF');
    const audioUrl = await getDownloadURL(fileRef);

    await addDoc(collection(db, 'radio_submissions'), {
      artistName, email, trackTitle, artistLink,
      producerCredits, genre,
      copyrightDeclaration: copyrightDecl,
      rightsConfirm, audioUrl,
      fileType: contentType,
      fileName: _selectedFile.name || safeName,
      fileSizeBytes: _selectedFile.size,
      storagePath: fileRef.fullPath,
      status: 'pending', featured: false,
      reviewNotes: '', approvedFor: [],
      submittedByUid: auth.currentUser?.uid || null,
      submittedByEmail: auth.currentUser?.email || email,
      isAnonymousSubmission: !!auth.currentUser?.isAnonymous,
      submittedFrom: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      createdAt: serverTimestamp(), reviewedAt: null
    });

    // Success
    setProgress(100);
    setNotice('✅ Submitted! We will review your track soon.', '#00cc66');
    setSubmitLocked(false, 'Submit for Review');
    form.reset();
    _selectedFile = null;
    _submitting = false;
    setTimeout(() => { setProgress(0); hideSubmitModal(); }, 2500);

  } catch(err){
    console.error('[radio submit]', err);
    clearInterval(window._radioFakeTimer);
    let msg = '❌ Upload failed. Please try again.';
    if(err.code === 'storage/unauthorized')              msg = '❌ Upload blocked — contact admin.';
    else if(err.code === 'storage/quota-exceeded')       msg = '❌ Storage full — contact admin.';
    else if(err.code === 'storage/retry-limit-exceeded') msg = '❌ Upload timed out. Check your connection.';
    else if(err.message?.includes('network'))            msg = '❌ Network error. Check connection and try again.';
    setNotice(msg, '#ff3c3c');
    setProgress(0);
    reset();
  }
}

function reset(){
  _submitting = false;
  setSubmitLocked(false, 'Submit for Review');
  setProgress(0);
}

// ── Reactions ──
window.ubRadioReaction = async function(trackId, reaction){
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const listenerId = getListenerId();
    const reactionId = (trackId + '_' + listenerId).replace(/[^a-zA-Z0-9_-]/g, '_');
    await setDoc(doc(db, 'radio_reactions', reactionId), {
      trackId, listenerId, reaction,
      uid: auth.currentUser?.uid || null,
      isAnonymous: !!auth.currentUser?.isAnonymous,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp()
    }, { merge: true });
  } catch(e){ console.warn('[reaction]', e); }
};
