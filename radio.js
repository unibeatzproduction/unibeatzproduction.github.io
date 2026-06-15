// radio.js — UniBeatz Radio Station
// Handles: Firebase submissions, Live365 stream bridge, artist form, reactions
// Live365 Station: a01878 | Stream: https://streaming.live365.com/a01878

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db  = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

window.UB_FIREBASE = { app, auth, db, storage, onAuthStateChanged, ready: true };
window.dispatchEvent(new CustomEvent('ub-firebase-ready'));

// ── Live365 Stream Bridge (merged from radio-live365.js) ──
const LIVE365_STREAM = 'https://streaming.live365.com/a01878';
const LIVE365_PAGE   = 'https://live365.com/station/UniBeatz-Radio-a01878';

(function setupLive365(){
  const player  = document.getElementById('radioPlayer');
  const refresh = document.getElementById('refreshApproved');

  if(player){
    player.src     = LIVE365_STREAM;
    player.preload = 'none';
    player.setAttribute('playsinline', '');
    player.setAttribute('webkit-playsinline', '');
    player.setAttribute('data-live365', 'true');
    player.addEventListener('play',  () => setBadge('LIVE365 PLAYING ●'));
    player.addEventListener('pause', () => setBadge('LIVE365 PAUSED'));
    player.addEventListener('error', () => setBadge('STREAM ERROR — OPEN LIVE365 ↗'));
  }

  if(refresh){
    refresh.textContent = 'Open Live365 ↗';
    refresh.onclick = e => { e.preventDefault(); window.open(LIVE365_PAGE, '_blank', 'noopener'); };
  }

  window.UniBeatzLive365 = { stationId: 'a01878', streamUrl: LIVE365_STREAM, stationUrl: LIVE365_PAGE };
})();

// ── Helpers ──
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setBadge(text){ const el = document.getElementById('nowPlayingBadge'); if(el) el.textContent = text; }
function setAccountText(text){
  const btn = document.getElementById('radioAccountBtn');
  if(btn) btn.textContent = text;
}
function getListenerId(){
  let id = localStorage.getItem('ub_radio_listener_id');
  if(!id){ id = 'listener_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); localStorage.setItem('ub_radio_listener_id', id); }
  return id;
}

// ── Account button ──
const accountBtn = document.getElementById('radioAccountBtn');
accountBtn?.addEventListener('click', () => {
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else if(window.UniBeatzAuth?.showLogin) window.UniBeatzAuth.showLogin();
});
window.addEventListener('ub-auth-ready', e => setAccountText(
  (!e.detail?.user || e.detail?.user?.isAnonymous) ? 'Sign In' : (e.detail?.profile?.username || e.detail?.user?.email || 'Account')
));
onAuthStateChanged(auth, user => setAccountText(!user || user.isAnonymous ? 'Sign In' : (user.displayName || user.email || 'Account')));

// ── Submission modal ──
const modal  = document.getElementById('submitModal');
const form   = document.getElementById('artistForm');
const notice = document.getElementById('formNotice');

document.getElementById('openSubmit')?.addEventListener('click',  () => modal.classList.add('open'));
document.getElementById('closeSubmit')?.addEventListener('click', () => modal.classList.remove('open'));
modal?.addEventListener('click', e => { if(e.target === modal) modal.classList.remove('open'); });

form?.addEventListener('submit', async e => {
  e.preventDefault();
  notice.textContent = 'Uploading track for moderation...';
  notice.style.color = '#40D0FF';
  const fd   = new FormData(form);
  const file = fd.get('audioFile');
  if(!file?.size){ notice.textContent = 'Choose an audio file.'; notice.style.color = '#ff3c3c'; return; }
  if(file.size > 25 * 1024 * 1024){ notice.textContent = 'Max 25MB.'; notice.style.color = '#ff3c3c'; return; }
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const safeName = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef  = ref(storage, 'radio-submissions/' + safeName);
    await uploadBytes(fileRef, file, { contentType: file.type || 'audio/mpeg' });
    const audioUrl = await getDownloadURL(fileRef);
    await addDoc(collection(db, 'radio_submissions'), {
      artistName: fd.get('artistName') || '', email: fd.get('email') || '',
      trackTitle: fd.get('trackTitle') || '', artistLink: fd.get('artistLink') || '',
      producerCredits: fd.get('producerCredits') || '', genre: fd.get('genre') || '',
      copyrightDeclaration: fd.get('copyrightDeclaration') || '',
      rightsConfirm: !!fd.get('rightsConfirm'),
      audioUrl, fileType: file.type || 'audio/mpeg',
      fileName: file.name || safeName, storagePath: fileRef.fullPath,
      status: 'pending', featured: false, reviewNotes: '', approvedFor: [],
      submittedByUid: auth.currentUser?.uid || null,
      submittedByEmail: auth.currentUser?.email || fd.get('email'),
      isAnonymousSubmission: !!auth.currentUser?.isAnonymous,
      createdAt: serverTimestamp(), reviewedAt: null
    });
    form.reset();
    modal.classList.remove('open');
    notice.textContent = 'Submitted! Pending admin review.';
    notice.style.color = '#00cc66';
  } catch(err){
    console.error(err);
    notice.textContent = 'Submission failed: ' + (err.message || 'Check Firebase config.');
    notice.style.color = '#ff3c3c';
  }
});

// ── Reactions ──
let reactionCounts = {};
let currentUserReaction = '';
let currentTrackId = '';

function injectReactionBar(){
  if(document.getElementById('radioReactionBar')) return;
  const controls = document.querySelector('.radio-controls');
  if(!controls) return;
  const bar = document.createElement('div');
  bar.id = 'radioReactionBar';
  bar.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;';
  bar.innerHTML = '<button id="likeTrack" class="btn btn-blue" type="button">👍 Like <span id="likeCount">0</span></button><button id="dislikeTrack" class="btn btn-blue" type="button">👎 Dislike <span id="dislikeCount">0</span></button>';
  controls.insertAdjacentElement('afterend', bar);
  document.getElementById('likeTrack').onclick  = () => saveReaction('like');
  document.getElementById('dislikeTrack').onclick = () => saveReaction('dislike');
}

async function saveReaction(reaction){
  if(!currentTrackId){ setBadge('PLAY A TRACK FIRST'); return; }
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const listenerId  = getListenerId();
    const reactionId  = (currentTrackId + '_' + listenerId).replace(/[^a-zA-Z0-9_-]/g, '_');
    await setDoc(doc(db, 'radio_reactions', reactionId), {
      trackId: currentTrackId, listenerId, reaction,
      uid: auth.currentUser?.uid || null,
      isAnonymous: !!auth.currentUser?.isAnonymous,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp()
    }, { merge: true });
    currentUserReaction = reaction;
    updateReactionUI();
    setBadge(reaction === 'like' ? 'THANKS FOR THE LIKE' : 'FEEDBACK SAVED');
  } catch(err){ console.error('REACTION ERROR', err); }
}

function updateReactionUI(){
  injectReactionBar();
  const counts = reactionCounts[currentTrackId] || { likes: 0, dislikes: 0 };
  const lc = document.getElementById('likeCount');
  const dc = document.getElementById('dislikeCount');
  const lb = document.getElementById('likeTrack');
  const db2 = document.getElementById('dislikeTrack');
  if(lc)  lc.textContent  = counts.likes || 0;
  if(dc)  dc.textContent  = counts.dislikes || 0;
  if(lb)  lb.className    = 'btn ' + (currentUserReaction === 'like'    ? 'btn-gold' : 'btn-blue');
  if(db2) db2.className   = 'btn ' + (currentUserReaction === 'dislike' ? 'btn-gold' : 'btn-blue');
}

// Listen for track changes from radio-player.js
window.addEventListener('ub-radio-now-playing', async e => {
  const track = e.detail?.track;
  if(!track?.id) return;
  currentTrackId = track.id;
  currentUserReaction = '';
  try{
    const listenerId = getListenerId();
    const q = query(collection(db, 'radio_reactions'), where('trackId', '==', track.id));
    const snap = await getDocs(q);
    let likes = 0, dislikes = 0, mine = '';
    snap.forEach(d => {
      const data = d.data();
      if(data.reaction === 'like')    likes++;
      if(data.reaction === 'dislike') dislikes++;
      if(data.listenerId === listenerId) mine = data.reaction || '';
    });
    reactionCounts[track.id] = { likes, dislikes };
    currentUserReaction = mine;
    updateReactionUI();
  } catch(e){ console.warn('Reaction load:', e); }
});

injectReactionBar();
