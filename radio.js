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
document.getElementById('openSubmit')?.addEventListener('click', () => showSubmitModal());
document.getElementById('closeSubmit')?.addEventListener('click', () => {
  hideSubmitModal();
  _selectedFile = null;
  _submitting = false;
  setNotice('');
});

// Track file selection — read ArrayBuffer immediately on mobile before anything else
const fileInput = form?.querySelector('input[type="file"]');
if(fileInput){
  fileInput.addEventListener('change', function(){
    const file = this.files && this.files[0];
    if(!file){ _selectedFile = null; return; }
    // Read into ArrayBuffer immediately — mobile browsers invalidate File object after picker closes
    const reader = new FileReader();
    reader.onload = function(ev){
      _selectedFile = {
        buffer: ev.target.result,
        name: file.name,
        size: file.size,
        type: file.type
      };
      const sizeMB = (file.size / (1024*1024)).toFixed(1);
      setNotice('📎 ' + file.name + ' (' + sizeMB + 'MB) ready', '#5dff9e');
    };
    reader.onerror = function(){
      _selectedFile = null;
      setNotice('Could not read file. Try again.', '#ff3c3c');
    };
    reader.readAsArrayBuffer(file);
  });
}

// Submit button — type="button" with guard
document.getElementById('radioSubmitBtn')?.addEventListener('click', function(){
  if(_submitting) return;
  doSubmit();
});

async function doSubmit(){
  if(_submitting) return;
  _submitting = true;
  setNotice('Preparing upload...', '#40D0FF');

  // Read all fields by name attribute
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

  // Validate text fields
  if(!artistName){ setNotice('Artist name is required.', '#ff3c3c'); _submitting = false; return; }
  if(!trackTitle){ setNotice('Track title is required.', '#ff3c3c'); _submitting = false; return; }
  if(!genre){ setNotice('Please select a genre.', '#ff3c3c'); _submitting = false; return; }
  if(!rightsConfirm){ setNotice('Please confirm your rights.', '#ff3c3c'); _submitting = false; return; }
  if(!_selectedFile){ setNotice('Please select an audio file first.', '#ff3c3c'); _submitting = false; return; }
  if(_selectedFile.size > 100 * 1024 * 1024){ setNotice('Max file size is 100MB.', '#ff3c3c'); _submitting = false; return; }

  try{
    const ext = (_selectedFile.name || '').split('.').pop().toLowerCase();
    const contentType = ext === 'wav' ? 'audio/wav'
                      : ext === 'mp3' ? 'audio/mpeg'
                      : (_selectedFile.type && _selectedFile.type.startsWith('audio/')) ? _selectedFile.type
                      : 'audio/mpeg';

    const sizeMB = (_selectedFile.size / (1024*1024)).toFixed(1);
    setNotice('Uploading ' + sizeMB + 'MB...', '#40D0FF');

    // Sign in anonymously if needed
    if(!auth.currentUser){
      setNotice('Authenticating...', '#40D0FF');
      await signInAnonymously(auth);
    }

    const safeName = Date.now() + '-' + (_selectedFile.name || 'track').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef  = ref(storage, 'radio-submissions/' + safeName);

    // Upload from the ArrayBuffer we captured at file pick time
    const uint8 = new Uint8Array(_selectedFile.buffer);
    await uploadBytes(fileRef, uint8, { contentType });
    const audioUrl = await getDownloadURL(fileRef);

    setNotice('Saving submission...', '#40D0FF');

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
    form.reset();
    _selectedFile = null;
    _submitting = false;
    setNotice('✅ Submitted! Pending admin review.', '#00cc66');
    setTimeout(() => hideSubmitModal(), 1500);

  } catch(err){
    console.error('[radio submit]', err);
    _submitting = false;
    let msg = 'Submission failed.';
    if(err.code === 'storage/unauthorized')             msg = 'Upload blocked — storage permissions error.';
    else if(err.code === 'storage/quota-exceeded')      msg = 'Storage full. Contact admin.';
    else if(err.code === 'storage/retry-limit-exceeded') msg = 'Upload timed out. Check connection and try again.';
    else if(err.message?.includes('network'))           msg = 'Network error. Check connection and try again.';
    else                                                msg = 'Error: ' + (err.message || 'Unknown error');
    setNotice(msg, '#ff3c3c');
  }
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
