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
  if(modal) modal.classList.add('open');
}
function hideSubmitModal(){
  if(modal) modal.classList.remove('open');
}
function failSubmit(msg){
  _submitting = false;
  setNotice(msg, '#ff3c3c');
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
const modal = document.getElementById('submitModal');
const form  = document.getElementById('artistForm');

// Track selected file directly from input — more reliable on mobile than FormData
let _selectedFile = null;
let _filePickerActive = false;
let _submitting = false;

// Wire up file input directly
function wireFileInput(){
  const fileInput = document.getElementById('audioFileInput') || form?.querySelector('input[type="file"]');
  if(!fileInput || fileInput.dataset.ubRadioWired === 'yes') return;
  fileInput.dataset.ubRadioWired = 'yes';

  fileInput.addEventListener('click', () => {
    _filePickerActive = true;
    sessionStorage.setItem('ub_radio_submit_open', 'yes');
    showSubmitModal();
  });

  fileInput.addEventListener('change', e => {
    _filePickerActive = false;
    sessionStorage.setItem('ub_radio_submit_open', 'yes');
    showSubmitModal();

    const files = e.target.files;
    if(files && files.length > 0){
      _selectedFile = files[0];
      const name = _selectedFile.name || 'Unknown';
      const sizeMB = (_selectedFile.size / (1024*1024)).toFixed(1);
      setNotice('📎 ' + name + ' (' + sizeMB + 'MB) — ready to submit', '#5dff9e');
    } else {
      _selectedFile = null;
      setNotice('No file selected yet.', '#ffcc66');
    }
  });
}

// Mobile file pickers can blur/focus the page and accidentally leave the modal closed.
// Restore it after the picker closes if the user was in submission mode.
window.addEventListener('focus', () => {
  if(_filePickerActive || sessionStorage.getItem('ub_radio_submit_open') === 'yes'){
    setTimeout(() => { showSubmitModal(); wireFileInput(); }, 120);
  }
});
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && (_filePickerActive || sessionStorage.getItem('ub_radio_submit_open') === 'yes')){
    setTimeout(() => { showSubmitModal(); wireFileInput(); }, 120);
  }
});

document.getElementById('openSubmit')?.addEventListener('click', () => {
  sessionStorage.setItem('ub_radio_submit_open', 'yes');
  showSubmitModal();
  setTimeout(wireFileInput, 100);
});
document.getElementById('closeSubmit')?.addEventListener('click', () => {
  hideSubmitModal();
  _selectedFile = null;
  _filePickerActive = false;
  sessionStorage.removeItem('ub_radio_submit_open');
});

// Do NOT close the modal from backdrop taps on mobile. The file picker can trigger a backdrop click.
modal?.addEventListener('click', e => {
  if(e.target === modal){
    e.preventDefault();
    e.stopPropagation();
    showSubmitModal();
  }
});

// Wire on DOMContentLoaded too in case modal is already open
document.addEventListener('DOMContentLoaded', wireFileInput);

// Wire submit button — guarded to prevent double submission
document.getElementById('radioSubmitBtn')?.addEventListener('click', () => {
  if(_submitting) return;
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

form?.addEventListener('submit', async e => {
  e.preventDefault();
  if(_submitting) return;
  _submitting = true;
  setTimeout(() => { _submitting = false; }, 30000); // safety reset
  setNotice('Preparing upload...', '#40D0FF');
  showSubmitModal();

  // Get form values directly from DOM — more reliable on mobile than FormData
  const artistName        = document.getElementById('artistName')?.value?.trim()        || form.querySelector('[name="artistName"]')?.value?.trim()        || '';
  const email             = document.getElementById('artistEmail')?.value?.trim()        || form.querySelector('[name="email"]')?.value?.trim()              || '';
  const trackTitle        = document.getElementById('trackTitle')?.value?.trim()         || form.querySelector('[name="trackTitle"]')?.value?.trim()         || '';
  const artistLink        = document.getElementById('artistLink')?.value?.trim()         || form.querySelector('[name="artistLink"]')?.value?.trim()         || '';
  const producerCredits   = document.getElementById('producerCredits')?.value?.trim()    || form.querySelector('[name="producerCredits"]')?.value?.trim()    || '';
  const genre             = document.getElementById('genreSelect')?.value               || form.querySelector('[name="genre"]')?.value                       || '';
  const copyrightDecl     = form.querySelector('[name="copyrightDeclaration"]')?.value   || '';
  const rightsConfirm     = !!form.querySelector('[name="rightsConfirm"]')?.checked;

  // Get file — prefer directly tracked file, fall back to FormData, fall back to input
  let file = _selectedFile;
  if(!file){
    const fileInput = form.querySelector('input[type="file"]');
    if(fileInput && fileInput.files && fileInput.files.length > 0){
      file = fileInput.files[0];
    }
  }
  if(!file){
    try{
      const fd = new FormData(form);
      const fdFile = fd.get('audioFile');
      if(fdFile instanceof File && fdFile.size > 0) file = fdFile;
    } catch(err){ console.warn('[radio] FormData fallback failed:', err); }
  }

  // Validate
  if(!artistName){ failSubmit('Artist name is required.'); return; }
  if(!trackTitle){ failSubmit('Track title is required.'); return; }
  if(!file){ failSubmit('Please select an audio file (MP3 or WAV).'); return; }
  if(file.size === 0){ failSubmit('File appears empty. Try selecting it again.'); return; }
  if(file.size > 100 * 1024 * 1024){ failSubmit('Max file size is 100MB.'); return; }

  const ext         = (file.name || '').split('.').pop().toLowerCase();
  const contentType = ext === 'wav' ? 'audio/wav'
                    : ext === 'mp3' ? 'audio/mpeg'
                    : (file.type && file.type.startsWith('audio/')) ? file.type
                    : 'audio/mpeg';

  const sizeMB = (file.size / (1024*1024)).toFixed(1);
  setNotice('Uploading ' + sizeMB + 'MB — please wait...', '#40D0FF');

  try{
    // Read file BEFORE auth/network calls — fixes mobile browsers invalidating File after picker close.
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = ev => resolve(ev.target.result);
      reader.onerror = () => reject(new Error('Could not read file. Try again.'));
      reader.readAsArrayBuffer(file);
    });

    // Sign in anonymously if needed
    if(!auth.currentUser){
      setNotice('Authenticating...', '#40D0FF');
      await signInAnonymously(auth);
    }

    const safeName = Date.now() + '-' + (file.name || 'track').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef  = ref(storage, 'radio-submissions/' + safeName);

    setNotice('Uploading audio (' + sizeMB + 'MB)...', '#40D0FF');

    const uint8 = new Uint8Array(arrayBuffer);
    await uploadBytes(fileRef, uint8, { contentType });
    const audioUrl = await getDownloadURL(fileRef);

    setNotice('Saving submission...', '#40D0FF');

    await addDoc(collection(db, 'radio_submissions'), {
      artistName, email, trackTitle, artistLink,
      producerCredits, genre, copyrightDeclaration: copyrightDecl,
      rightsConfirm, audioUrl,
      fileType: contentType,
      fileName: file.name || safeName,
      fileSizeBytes: file.size,
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
    form.reset();
    _selectedFile = null;
    _filePickerActive = false;
    _submitting = false;
    sessionStorage.removeItem('ub_radio_submit_open');
    setNotice('✅ Submitted! Pending admin review.', '#00cc66');
    setTimeout(() => hideSubmitModal(), 900);

  } catch(err){
    console.error('[radio submit]', err);
    // Show specific errors so user knows what happened
    let msg = 'Submission failed.';
    if(err.code === 'storage/unauthorized')        msg = 'Upload blocked — storage permissions error. Contact admin.';
    else if(err.code === 'storage/quota-exceeded') msg = 'Storage full. Contact admin.';
    else if(err.code === 'storage/retry-limit-exceeded') msg = 'Upload timed out. Check your connection and try again.';
    else if(err.message?.includes('network'))      msg = 'Network error. Check your connection and try again.';
    else if(err.message?.includes('read'))         msg = 'Could not read file. Try selecting it again.';
    else msg = 'Error: ' + (err.message || 'Unknown error');
    _submitting = false;
    setNotice(msg, '#ff3c3c');
    showSubmitModal();
  }
});

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