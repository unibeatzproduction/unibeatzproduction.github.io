import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

window.UB_FIREBASE = { app, auth, db, storage, onAuthStateChanged, ready: true };
window.dispatchEvent(new CustomEvent('ub-firebase-ready'));

const form = document.getElementById('artistForm');
const notice = document.getElementById('formNotice');
const approvedList = document.getElementById('approvedList');
const radioPlayer = document.getElementById('radioPlayer');
const modal = document.getElementById('submitModal');
const accountBtn = document.getElementById('radioAccountBtn');

accountBtn.addEventListener('click', () => {
  if (window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else window.UniBeatzAuth?.showLogin?.();
});

window.addEventListener('ub-auth-ready', (e) => {
  const user = e.detail?.user;
  const profile = e.detail?.profile;
  accountBtn.textContent = user ? (profile?.username || user.email || 'Account') : 'Sign In';
});

onAuthStateChanged(auth, (user) => {
  accountBtn.textContent = user && !user.isAnonymous ? (user.displayName || user.email || 'Account') : 'Sign In';
});

document.getElementById('openSubmit').addEventListener('click', ()=> modal.classList.add('open'));
document.getElementById('closeSubmit').addEventListener('click', ()=> modal.classList.remove('open'));
modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.textContent = 'Uploading track for moderation...';
  notice.style.color = '#40D0FF';
  const formData = new FormData(form);
  const file = formData.get('audioFile');

  if (file.size > 25 * 1024 * 1024) {
    notice.textContent = 'File too large. Max upload size is 25MB.';
    notice.style.color = '#ff3c3c';
    return;
  }

  try {
    if (!auth.currentUser) await signInAnonymously(auth);

    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_')}`;
    const fileRef = ref(storage, `radio-submissions/${safeName}`);
    await uploadBytes(fileRef, file, { contentType: file.type || 'audio/mpeg' });
    const downloadURL = await getDownloadURL(fileRef);

    await addDoc(collection(db, 'radio_submissions'), {
      artistName: formData.get('artistName'),
      email: formData.get('email'),
      trackTitle: formData.get('trackTitle'),
      genre: formData.get('genre'),
      copyrightDeclaration: formData.get('copyrightDeclaration'),
      audioUrl: downloadURL,
      storagePath: fileRef.fullPath,
      status: 'pending',
      reviewNotes: '',
      approvedFor: [],
      submittedByUid: auth.currentUser?.uid || null,
      submittedByEmail: auth.currentUser?.email || formData.get('email'),
      isAnonymousSubmission: !!auth.currentUser?.isAnonymous,
      createdAt: serverTimestamp(),
      reviewedAt: null
    });

    form.reset();
    modal.classList.remove('open');
    notice.textContent = 'Submitted. Your track is pending admin review.';
    notice.style.color = '#00cc66';
  } catch (error) {
    console.error(error);
    notice.textContent = 'Submission failed. Verify Firebase config and rules.';
    notice.style.color = '#ff3c3c';
  }
});

async function loadApproved() {
  approvedList.innerHTML = '<div class="channel">Loading approved tracks...</div>';
  const q = query(collection(db, 'radio_submissions'), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    approvedList.innerHTML = '<div class="channel">No approved tracks yet.</div>';
    return;
  }

  approvedList.innerHTML = '';
  snapshot.forEach((doc) => {
    const track = doc.data();
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'track';
    el.innerHTML = `<div class="name">${track.trackTitle}</div><div class="desc">${track.artistName} · ${track.genre}</div><div class="badge" style="margin-top:8px">APPROVED</div>`;
    el.addEventListener('click', () => {
      radioPlayer.src = track.audioUrl;
      radioPlayer.play();
    });
    approvedList.appendChild(el);
  });
}

document.getElementById('refreshApproved').addEventListener('click', loadApproved);
loadApproved();
