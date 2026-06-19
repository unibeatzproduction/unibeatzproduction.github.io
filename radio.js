// radio.js — UniBeatz Radio Station
// PURPOSE: Artist submission form + Firebase setup + Live365 bridge

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
getFirestore,
collection,
addDoc,
serverTimestamp,
query,
where,
getDocs,
doc,
setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
getStorage,
ref,
uploadBytesResumable,
getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const firebaseConfig = {
apiKey: 'AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4',
authDomain: 'unibeatzproduction-7ae31.firebaseapp.com',
projectId: 'unibeatzproduction-7ae31',
storageBucket: 'unibeatzproduction-7ae31.appspot.com',
messagingSenderId: '70667820609',
appId: '1:70667820609:web:57762df5510e6b4000b0c0'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

window.UB_FIREBASE = { app, auth, db, storage, onAuthStateChanged, ready: true };
window.dispatchEvent(new CustomEvent('ub-firebase-ready'));

const LIVE365_PAGE = 'https://live365.com/station/UniBeatz-Radio-a01878';

const form = document.getElementById('artistForm');
const submitModal = document.getElementById('submitModal');
const openSubmitBtn = document.getElementById('openSubmit');
const closeSubmitBtn = document.getElementById('closeSubmit');
const accountBtn = document.getElementById('radioAccountBtn');

let selectedFile = null;
let submitting = false;

function setAccountText(text) {
if (accountBtn) accountBtn.textContent = text;
}

function showSubmitModal() {
if (submitModal) submitModal.classList.add('open');
}

function hideSubmitModal() {
if (submitModal) submitModal.classList.remove('open');
}

function setNotice(msg, color = '#40D0FF') {
const notice = document.getElementById('formNotice');
if (!notice) return;
notice.textContent = msg || '';
notice.style.color = color;
}

function ensureProgressBar() {
if (document.getElementById('ubRadioProgress')) return;

const notice = document.getElementById('formNotice');
if (!notice) return;

const bar = document.createElement('div');
bar.id = 'ubRadioProgress';
bar.style.cssText =
'display:none;margin:10px 0 8px;border-radius:999px;height:9px;background:rgba(255,255,255,.12);overflow:hidden;';

bar.innerHTML =
'<div id="ubRadioProgressFill" style="height:100%;width:0%;background:linear-gradient(90deg,#C9A84C,#F0C040);border-radius:999px;transition:width .25s;"></div>';

notice.insertAdjacentElement('beforebegin', bar);
}

function setProgress(pct) {
const bar = document.getElementById('ubRadioProgress');
const fill = document.getElementById('ubRadioProgressFill');
if (!bar || !fill) return;

const safePct = Math.max(0, Math.min(100, Number(pct) || 0));

if (safePct <= 0) {
bar.style.display = 'none';
fill.style.width = '0%';
return;
}

bar.style.display = 'block';
fill.style.width = safePct + '%';
}

function setSubmitLocked(locked, label) {
const btn =
document.getElementById('radioSubmitBtn') ||
form?.querySelector('button[type="submit"]') ||
form?.querySelector('button[type="button"]');

if (!btn) return;

btn.disabled = locked;
btn.textContent = label || 'Submit for Review';
btn.style.opacity = locked ? '0.6' : '1';
}

function resetSubmitState() {
submitting = false;
setSubmitLocked(false, 'Submit for Review');
}

function field(name) {
return (form?.querySelector(`[name="${name}"]`)?.value || '').trim();
}

function cleanFileName(name) {
return String(name || 'track.mp3').replace(/[^a-zA-Z0-9.-*]/g, '*');
}

function isAudioFile(file) {
return !!file &&
(
String(file.type || '').startsWith('audio/') ||
/.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name || '')
);
}

function fileSizeMB(file) {
return (file.size / (1024 * 1024)).toFixed(1);
}

function errorMessage(err) {
const code = err?.code || '';
const msg = err?.message || '';

if (code === 'auth/operation-not-allowed') {
return '❌ Anonymous sign-in is not enabled in Firebase Authentication.';
}

if (code === 'storage/unauthorized') {
return '❌ Upload blocked by Storage rules.';
}

if (code === 'storage/quota-exceeded') {
return '❌ Firebase Storage is full.';
}

if (code === 'storage/retry-limit-exceeded') {
return '❌ Upload timed out. Try Wi-Fi or a smaller MP3.';
}

if (code === 'storage/canceled') {
return '❌ Upload stalled and was stopped. Try Wi-Fi or a smaller MP3.';
}

if (code === 'permission-denied') {
return '❌ Database permission blocked by Firestore rules.';
}

if (/stalled/i.test(msg)) {
return '❌ Upload stalled. Try Wi-Fi or a smaller MP3.';
}

if (/network|offline|internet/i.test(msg)) {
return '❌ Network issue. Try again on Wi-Fi.';
}

return '❌ Upload failed: ' + (code || msg || 'Please try again.');
}

async function ensureSignedIn() {
if (auth.currentUser) return auth.currentUser;
const cred = await signInAnonymously(auth);
return cred.user;
}

(function setupLive365() {
const refresh = document.getElementById('refreshApproved');

if (refresh) {
refresh.textContent = 'Open Station ↗';
refresh.onclick = e => {
e.preventDefault();
window.open(LIVE365_PAGE, '_blank', 'noopener');
};
}

loadTrackCount();
window.UniBeatzLive365 = { stationId: 'a01878', stationUrl: LIVE365_PAGE };
})();

async function loadTrackCount() {
try {
const [tracksSnap, assetsSnap] = await Promise.all([
getDocs(query(collection(db, 'radio_submissions'), where('status', '==', 'approved'))),
getDocs(query(collection(db, 'radio_assets'), where('active', '==', true))).catch(() => ({ docs: [] }))
]);

```
const label = document.getElementById('trackCountLabel');
if (label) {
  label.textContent = tracksSnap.docs.length + ' songs · ' + assetsSnap.docs.length + ' announcements';
}
```

} catch (e) {
console.warn('[radio] count load:', e);
}
}

accountBtn?.addEventListener('click', () => {
if (window.UniBeatzAuth?.getUser?.()) {
window.UniBeatzAuth.showAccount();
} else if (window.UniBeatzAuth?.showLogin) {
window.UniBeatzAuth.showLogin();
}
});

window.addEventListener('ub-auth-ready', e => {
const user = e.detail?.user;
const profile = e.detail?.profile;

setAccountText(
(!user || user.isAnonymous)
? 'Sign In'
: (profile?.username || user.email || 'Account')
);
});

onAuthStateChanged(auth, user => {
setAccountText(!user || user.isAnonymous ? 'Sign In' : (user.displayName || user.email || 'Account'));
});

function wireSubmissionForm() {
if (!form || form.dataset.ubSubmitWired === 'yes') return;
form.dataset.ubSubmitWired = 'yes';

const fileInput = form.querySelector('input[type="file"]');
const submitBtn =
form.querySelector('#radioSubmitBtn') ||
form.querySelector('button[type="submit"]') ||
form.querySelector('button[type="button"]');

if (submitBtn) {
submitBtn.id = 'radioSubmitBtn';
submitBtn.type = 'button';
}

fileInput?.addEventListener('change', () => {
const file = fileInput.files && fileInput.files[0];
selectedFile = file || null;

```
if (!file) {
  setNotice('No file selected.', '#ffcc66');
  return;
}

if (!isAudioFile(file)) {
  selectedFile = null;
  fileInput.value = '';
  setNotice('❌ Please choose an audio file only.', '#ff3c3c');
  return;
}

if (file.size > 100 * 1024 * 1024) {
  selectedFile = null;
  fileInput.value = '';
  setNotice('❌ Max file size is 100MB. Please send a smaller MP3.', '#ff3c3c');
  return;
}

setNotice('✅ ' + file.name + ' (' + fileSizeMB(file) + 'MB) selected. Tap Submit.', '#5dff9e');
```

});

form.addEventListener('submit', async e => {
e.preventDefault();
e.stopPropagation();
await submitArtistTrack();
});

submitBtn?.addEventListener('click', async e => {
e.preventDefault();
e.stopPropagation();
await submitArtistTrack();
});
}

async function uploadFileWithProgress(fileRef, file, contentType) {
const uploadTask = uploadBytesResumable(fileRef, file, { contentType });

await new Promise((resolve, reject) => {
let lastBytes = 0;
let stuckTimer = null;

```
function startStuckTimer(snapshot) {
  clearTimeout(stuckTimer);

  if (snapshot?.bytesTransferred > lastBytes) {
    lastBytes = snapshot.bytesTransferred;
  }

  stuckTimer = setTimeout(() => {
    try {
      uploadTask.cancel();
    } catch (e) {}

    reject(new Error('Upload stalled'));
  }, 60000);
}

uploadTask.on(
  'state_changed',
  snapshot => {
    startStuckTimer(snapshot);

    const pct = snapshot.totalBytes
      ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
      : 20;

    setProgress(pct);
    setNotice(
      'Uploading ' + fileSizeMB(file) + 'MB (' + pct + '%) — keep this screen open...',
      '#40D0FF'
    );
  },
  error => {
    clearTimeout(stuckTimer);
    reject(error);
  },
  () => {
    clearTimeout(stuckTimer);
    setProgress(100);
    resolve();
  }
);
```

});

return uploadTask.snapshot.ref;
}

async function submitArtistTrack() {
if (submitting || !form) return;

submitting = true;
ensureProgressBar();
showSubmitModal();
setSubmitLocked(true, '⏳ Uploading...');
setProgress(4);
setNotice('Starting submission...', '#40D0FF');

const artistName = field('artistName');
const email = field('email');
const trackTitle = field('trackTitle');
const artistLink = field('artistLink');
const producerCredits = field('producerCredits');
const genre = field('genre');
const copyrightDeclaration = field('copyrightDeclaration');
const rightsConfirm = !!form.querySelector('[name="rightsConfirm"]')?.checked;
const fileInput = form.querySelector('input[type="file"]');
const file = selectedFile || (fileInput?.files && fileInput.files[0]);

if (!artistName) {
setNotice('❌ Artist name is required.', '#ff3c3c');
resetSubmitState();
return;
}

if (!email) {
setNotice('❌ Email is required.', '#ff3c3c');
resetSubmitState();
return;
}

if (!trackTitle) {
setNotice('❌ Track title is required.', '#ff3c3c');
resetSubmitState();
return;
}

if (!genre) {
setNotice('❌ Please select a genre.', '#ff3c3c');
resetSubmitState();
return;
}

if (!producerCredits) {
setNotice('❌ Producer / beat credits are required.', '#ff3c3c');
resetSubmitState();
return;
}

if (!copyrightDeclaration) {
setNotice('❌ Rights confirmation text is required.', '#ff3c3c');
resetSubmitState();
return;
}

if (!rightsConfirm) {
setNotice('❌ Please check the rights confirmation box.', '#ff3c3c');
resetSubmitState();
return;
}

if (!file) {
setNotice('❌ Please choose an audio file.', '#ff3c3c');
resetSubmitState();
return;
}

if (!isAudioFile(file)) {
setNotice('❌ Please choose an audio file only.', '#ff3c3c');
resetSubmitState();
return;
}

if (file.size > 100 * 1024 * 1024) {
setNotice('❌ Max file size is 100MB. Please send a smaller MP3.', '#ff3c3c');
resetSubmitState();
return;
}

try {
setProgress(10);
setNotice('Authenticating listener...', '#40D0FF');

```
const user = await ensureSignedIn();

const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
const contentType =
  file.type ||
  (ext === 'wav'
    ? 'audio/wav'
    : ext === 'm4a'
      ? 'audio/mp4'
      : 'audio/mpeg');

const safeName = `${Date.now()}-${user.uid}-${cleanFileName(file.name)}`;
const fileRef = ref(storage, `radio-submissions/${user.uid}/${safeName}`);

setProgress(15);
setNotice('Uploading ' + fileSizeMB(file) + 'MB — keep this screen open...', '#40D0FF');

const uploadedRef = await uploadFileWithProgress(fileRef, file, contentType);

setProgress(100);
setNotice('Saving submission...', '#40D0FF');

const audioUrl = await getDownloadURL(uploadedRef);

await addDoc(collection(db, 'radio_submissions'), {
  artistName,
  email,
  trackTitle,
  artistLink,
  producerCredits,
  genre,
  copyrightDeclaration,
  rightsConfirm,
  audioUrl,
  fileType: contentType,
  fileName: file.name || safeName,
  fileSizeBytes: file.size,
  storagePath: uploadedRef.fullPath,
  status: 'pending',
  featured: false,
  reviewNotes: '',
  approvedFor: [],
  submittedByUid: user.uid,
  submittedByEmail: user.email || email,
  isAnonymousSubmission: !!user.isAnonymous,
  submittedFrom: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
  createdAt: serverTimestamp(),
  reviewedAt: null
});

setProgress(100);
setNotice('✅ Submitted! UniBeatz Radio will review your track soon.', '#00cc66');

form.reset();
selectedFile = null;
submitting = false;
setSubmitLocked(false, 'Submit for Review');

loadTrackCount();

setTimeout(() => {
  setProgress(0);
  hideSubmitModal();
}, 2400);
```

} catch (err) {
console.error('[radio submit]', err);
setNotice(errorMessage(err), '#ff3c3c');
setProgress(0);
resetSubmitState();
}
}

openSubmitBtn?.addEventListener('click', () => {
if (!submitting) {
setProgress(0);
setNotice('');
setSubmitLocked(false, 'Submit for Review');
}

ensureProgressBar();
showSubmitModal();
});

closeSubmitBtn?.addEventListener('click', () => {
if (submitting) return;
hideSubmitModal();
setNotice('');
setProgress(0);
});

submitModal?.addEventListener('click', e => {
if (e.target === submitModal && !submitting) {
hideSubmitModal();
}
});

wireSubmissionForm();

window.ubRadioReaction = async function(trackId, reaction) {
try {
const user = await ensureSignedIn();

```
const listenerId =
  localStorage.getItem('ub_radio_listener_id') ||
  ('listener_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));

localStorage.setItem('ub_radio_listener_id', listenerId);

const reactionId = (trackId + '_' + listenerId).replace(/[^a-zA-Z0-9_-]/g, '_');

await setDoc(doc(db, 'radio_reactions', reactionId), {
  trackId,
  listenerId,
  reaction,
  uid: user.uid,
  isAnonymous: !!user.isAnonymous,
  updatedAt: serverTimestamp()
}, { merge: true });
```

} catch (e) {
console.warn('[radio reaction]', e);
}
};
