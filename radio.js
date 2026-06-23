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

// Account button — just updates text, no floating button
const accountBtn = document.getElementById('radioAccountBtn');
accountBtn?.addEventListener('click', () => {
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else window.UniBeatzAuth?.showLogin?.();
});
onAuthStateChanged(auth, user => {
  if(accountBtn) accountBtn.textContent = (!user || user.isAnonymous) ? 'Sign In' : (user.displayName || user.email || 'Account');
});

// Submit modal
const modal   = document.getElementById('submitModal');
const form    = document.getElementById('artistForm');
const notice  = document.getElementById('formNotice');

document.getElementById('openSubmit')?.addEventListener('click',  () => modal?.classList.add('open'));
document.getElementById('closeSubmit')?.addEventListener('click', () => modal?.classList.remove('open'));
modal?.addEventListener('click', e => { if(e.target === modal) modal.classList.remove('open'); });

form?.addEventListener('submit', async e => {
  e.preventDefault();
  if(!notice) return;
  notice.textContent = 'Uploading track for moderation...';
  notice.style.color = '#40D0FF';
  const fd   = new FormData(form);
  const file = fd.get('audioFile');
  if(!file?.size){ notice.textContent = 'Choose an audio file.'; notice.style.color = '#ff3c3c'; return; }
  if(file.size > 100 * 1024 * 1024){ notice.textContent = 'Max 100MB (MP3 or WAV).'; notice.style.color = '#ff3c3c'; return; }
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const ext         = file.name.split('.').pop().toLowerCase();
    const contentType = ext === 'wav' ? 'audio/wav' : (file.type || 'audio/mpeg');
    const safeName    = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef     = ref(storage, 'radio-submissions/' + safeName);
    await uploadBytes(fileRef, file, { contentType });
    const audioUrl = await getDownloadURL(fileRef);
    await addDoc(collection(db, 'radio_submissions'), {
      artistName: fd.get('artistName') || '', email: fd.get('email') || '',
      trackTitle: fd.get('trackTitle') || '', artistLink: fd.get('artistLink') || '',
      producerCredits: fd.get('producerCredits') || '', genre: fd.get('genre') || '',
      copyrightDeclaration: fd.get('copyrightDeclaration') || '',
      rightsConfirm: !!fd.get('rightsConfirm'),
      audioUrl, fileType: contentType, fileName: file.name || safeName,
      storagePath: fileRef.fullPath, status: 'pending', featured: false,
      reviewNotes: '', approvedFor: [],
      submittedByUid: auth.currentUser?.uid || null,
      submittedByEmail: auth.currentUser?.email || fd.get('email'),
      isAnonymousSubmission: !!auth.currentUser?.isAnonymous,
      createdAt: serverTimestamp(), reviewedAt: null
    });
    form.reset();
    modal?.classList.remove('open');
    notice.textContent = 'Submitted! Pending admin review.';
    notice.style.color = '#00cc66';
  } catch(err){
    console.error(err);
    notice.textContent = 'Submission failed: ' + (err.message || 'Check Firebase config.');
    notice.style.color = '#ff3c3c';
  }
});

// Track count label
async function loadTrackCount(){
  try{
    const snap = await getDocs(query(collection(db, 'radio_submissions'), where('status', '==', 'approved')));
    const label = document.getElementById('trackCountLabel');
    if(label && snap.docs.length) label.textContent = snap.docs.length + ' approved tracks · 24/7 Live365';
  } catch(e){ console.warn('[radio] count:', e); }
}
loadTrackCount();
