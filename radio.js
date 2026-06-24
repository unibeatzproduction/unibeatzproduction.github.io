import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
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

// Account button
const accountBtn = document.getElementById('radioAccountBtn');
accountBtn?.addEventListener('click', () => {
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else window.UniBeatzAuth?.showLogin?.();
});
onAuthStateChanged(auth, user => {
  if(accountBtn) accountBtn.textContent = (!user || user.isAnonymous) ? 'Sign In' : (user.displayName || user.email || 'Account');
});

// Submit modal
const modal  = document.getElementById('submitModal');
const form   = document.getElementById('artistForm');
// notice is INSIDE the modal
const notice = document.getElementById('modalNotice');
const progressWrap = document.getElementById('ubRadioProgress');
const progressFill = document.getElementById('ubRadioProgressFill');

document.getElementById('openSubmit')?.addEventListener('click',  () => modal?.classList.add('open'));
document.getElementById('closeSubmit')?.addEventListener('click', () => modal?.classList.remove('open'));
modal?.addEventListener('click', e => { if(e.target === modal) modal.classList.remove('open'); });

form?.addEventListener('submit', async e => {
  e.preventDefault();
  const submitBtn = form.querySelector('button[type="submit"]');
  if(submitBtn) submitBtn.disabled = true;

  setNotice('Uploading track for moderation...', '#40D0FF');
  showProgress(0);

  const fd   = new FormData(form);
  const file = fd.get('audioFile');

  if(!file?.size){
    setNotice('Choose an audio file.', '#ff3c3c');
    if(submitBtn) submitBtn.disabled = false;
    return;
  }
  if(file.size > 100 * 1024 * 1024){
    setNotice('Max 100MB (MP3 or WAV).', '#ff3c3c');
    if(submitBtn) submitBtn.disabled = false;
    return;
  }

  try{
    if(!auth.currentUser) await signInAnonymously(auth);

    const ext         = file.name.split('.').pop().toLowerCase();
    const contentType = ext === 'wav' ? 'audio/wav' : (file.type || 'audio/mpeg');
    const safeName    = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef     = ref(storage, 'radio-submissions/' + auth.currentUser.uid + '/' + safeName);

    showProgress(20);

    // Upload with progress tracking
    const { uploadBytesResumable } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js');
    const task = uploadBytesResumable(fileRef, file, { contentType });

    await new Promise((resolve, reject) => {
      task.on('state_changed',
        snap => showProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 70) + 20),
        reject,
        resolve
      );
    });

    showProgress(90);
    const audioUrl = await getDownloadURL(fileRef);

    await addDoc(collection(db, 'radio_submissions'), {
      artistName:           fd.get('artistName')           || '',
      email:                fd.get('email')                || '',
      trackTitle:           fd.get('trackTitle')           || '',
      artistLink:           fd.get('artistLink')           || '',
      producerCredits:      fd.get('producerCredits')      || '',
      genre:                fd.get('genre')                || '',
      copyrightDeclaration: fd.get('copyrightDeclaration') || '',
      rightsConfirm:        !!fd.get('rightsConfirm'),
      audioUrl,
      fileType:             contentType,
      fileName:             file.name || safeName,
      storagePath:          fileRef.fullPath,
      status:               'pending',
      featured:             false,
      reviewNotes:          '',
      approvedFor:          [],
      submittedByUid:       auth.currentUser?.uid   || null,
      submittedByEmail:     auth.currentUser?.email || fd.get('email'),
      isAnonymousSubmission:!!auth.currentUser?.isAnonymous,
      createdAt:            serverTimestamp(),
      reviewedAt:           null
    });

    showProgress(100);
    form.reset();
    setNotice('✅ Submitted! Pending admin review.', '#00cc66');
    if(submitBtn) submitBtn.disabled = false;
    setTimeout(() => modal?.classList.remove('open'), 2000);

  } catch(err){
    console.error('[radio submit]', err);
    setNotice('Submission failed: ' + (err.message || 'Check connection and try again.'), '#ff3c3c');
    if(submitBtn) submitBtn.disabled = false;
    hideProgress();
  }
});

function setNotice(msg, color){
  if(notice){ notice.textContent = msg; notice.style.color = color; }
}
function showProgress(pct){
  if(progressWrap) progressWrap.style.display = 'block';
  if(progressFill) progressFill.style.width = pct + '%';
}
function hideProgress(){
  if(progressWrap) progressWrap.style.display = 'none';
  if(progressFill) progressFill.style.width = '0%';
}

// Track count
async function loadTrackCount(){
  try{
    const snap = await getDocs(query(collection(db, 'radio_submissions'), where('status', '==', 'approved')));
    const label = document.getElementById('trackCountLabel');
    if(label && snap.docs.length) label.textContent = snap.docs.length + ' approved tracks · 24/7 Live365';
  } catch(e){ console.warn('[radio] count:', e); }
}
loadTrackCount();
