import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
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
const genreFilters = document.getElementById('genreFilters');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const nowPlayingMeta = document.getElementById('nowPlayingMeta');
const nowPlayingBadge = document.getElementById('nowPlayingBadge');
const playPauseBtn = document.getElementById('playPause');
const nextTrackBtn = document.getElementById('nextTrack');
const prevTrackBtn = document.getElementById('prevTrack');
const trackCountLabel = document.getElementById('trackCountLabel');

let allApprovedTracks = [];
let currentGenre = 'All';
let currentTrackIndex = 0;
let lastAccountText = '';

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setAccountText(text){
  if(!accountBtn) return;
  if(lastAccountText === text) return;
  lastAccountText = text;
  accountBtn.textContent = text;
}
function labelForUser(user, profile){
  if(!user || user.isAnonymous) return 'Sign In';
  return profile?.username || user.displayName || user.email || 'Account';
}
function filteredTracks(){
  return currentGenre === 'All' ? allApprovedTracks : allApprovedTracks.filter(t=>t.genre===currentGenre);
}
function setPlayButton(){
  if(!playPauseBtn) return;
  playPauseBtn.textContent = radioPlayer && !radioPlayer.paused ? '⏸ Pause' : '▶ Play';
}
function setTrackCount(){
  if(trackCountLabel) trackCountLabel.textContent = `${allApprovedTracks.length} approved track${allApprovedTracks.length===1?'':'s'}`;
}

accountBtn.addEventListener('click', () => {
  if (window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else if (window.UniBeatzAuth?.showLogin) window.UniBeatzAuth.showLogin();
});

window.addEventListener('ub-auth-ready', (e) => {
  const user = e.detail?.user;
  const profile = e.detail?.profile;
  setAccountText(labelForUser(user, profile));
});

onAuthStateChanged(auth, (user) => {
  setAccountText(labelForUser(user));
});
setAccountText('Sign In');

document.getElementById('openSubmit').addEventListener('click', ()=> modal.classList.add('open'));
document.getElementById('closeSubmit').addEventListener('click', ()=> modal.classList.remove('open'));
modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.textContent = 'Uploading track for moderation...';
  notice.style.color = '#40D0FF';
  const formData = new FormData(form);
  const file = formData.get('audioFile');

  if (!file || !file.size) {
    notice.textContent = 'Please choose an audio file.';
    notice.style.color = '#ff3c3c';
    return;
  }

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
      artistName: formData.get('artistName') || '',
      email: formData.get('email') || '',
      trackTitle: formData.get('trackTitle') || '',
      artistLink: formData.get('artistLink') || '',
      producerCredits: formData.get('producerCredits') || '',
      genre: formData.get('genre') || '',
      copyrightDeclaration: formData.get('copyrightDeclaration') || '',
      rightsConfirm: !!formData.get('rightsConfirm'),
      audioUrl: downloadURL,
      fileType: file.type || 'audio/mpeg',
      fileName: file.name || safeName,
      storagePath: fileRef.fullPath,
      status: 'pending',
      featured: false,
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
    notice.textContent = 'Submission failed: ' + (error.message || 'Verify Firebase config and rules.');
    notice.style.color = '#ff3c3c';
  }
});

function updateNowPlaying(track){
  nowPlayingTitle.textContent = `Now Playing: ${track.trackTitle || 'Untitled'}`;
  nowPlayingMeta.textContent = `${track.artistName || 'Unknown Artist'} • ${track.genre || 'Radio'}`;
  nowPlayingBadge.textContent = track.featured ? 'FEATURED ROTATION' : 'APPROVED ROTATION';
}

async function resolveTrackUrl(track){
  if (track.audioUrl) return track.audioUrl;
  if (track.storagePath) {
    const url = await getDownloadURL(ref(storage, track.storagePath));
    track.audioUrl = url;
    if (track.id) updateDoc(doc(db, 'radio_submissions', track.id), { audioUrl: url }).catch(console.warn);
    return url;
  }
  throw new Error('Track is missing audioUrl and storagePath.');
}

function renderGenreFilters(){
  const genres=['All', ...new Set(allApprovedTracks.map(t=>t.genre).filter(Boolean))];
  genreFilters.innerHTML='';
  genres.forEach((genre)=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn ' + (genre===currentGenre ? 'btn-gold' : 'btn-blue');
    btn.style.margin='4px';
    btn.textContent=genre;
    btn.addEventListener('click', ()=>{
      currentGenre=genre;
      currentTrackIndex = 0;
      renderApprovedTracks();
      renderGenreFilters();
    });
    genreFilters.appendChild(btn);
  });
}

async function playTrack(index){
  const tracks = filteredTracks();
  if(!tracks.length) return;
  if(index < 0) index = tracks.length - 1;
  if(index >= tracks.length) index = 0;
  currentTrackIndex = index;
  const track = tracks[currentTrackIndex];
  const url = await resolveTrackUrl(track);
  radioPlayer.pause();
  radioPlayer.src = url;
  radioPlayer.load();
  updateNowPlaying(track);
  renderApprovedTracks();
  await radioPlayer.play();
  setPlayButton();
}

function renderApprovedTracks(){
  const filtered = filteredTracks();

  if(!filtered.length){
    approvedList.innerHTML='<div class="channel">No approved tracks in this category yet.</div>';
    return;
  }

  approvedList.innerHTML='';

  filtered.forEach((track, index)=>{
    const el=document.createElement('button');
    el.type='button';
    el.className='track' + (index === currentTrackIndex ? ' active' : '');
    el.innerHTML=`<div class="name">${esc(track.trackTitle || 'Untitled')}</div><div class="desc">${esc(track.artistName || 'Unknown Artist')} · ${esc(track.genre || 'Radio')}</div><div class="badge" style="margin-top:8px">${track.featured ? 'FEATURED' : 'APPROVED'}</div>`;
    el.addEventListener('click', async ()=>{
      try { await playTrack(index); }
      catch (err) { console.error('RADIO PLAY ERROR', err, track); nowPlayingBadge.textContent = 'PLAY ERROR — CHECK FILE URL/RULES'; }
    });
    approvedList.appendChild(el);
  });
}

playPauseBtn?.addEventListener('click', async ()=>{
  try{
    if(!radioPlayer.src){ await playTrack(currentTrackIndex); return; }
    if(radioPlayer.paused){ await radioPlayer.play(); }
    else{ radioPlayer.pause(); }
    setPlayButton();
  }catch(err){ console.error('RADIO PLAY ERROR', err); nowPlayingBadge.textContent='PLAY ERROR — TAP A TRACK'; }
});
nextTrackBtn?.addEventListener('click', ()=>playTrack(currentTrackIndex + 1).catch(console.error));
prevTrackBtn?.addEventListener('click', ()=>playTrack(currentTrackIndex - 1).catch(console.error));
radioPlayer?.addEventListener('play', setPlayButton);
radioPlayer?.addEventListener('pause', setPlayButton);
radioPlayer?.addEventListener('ended', ()=>playTrack(currentTrackIndex + 1).catch(console.error));

async function loadApproved() {
  approvedList.innerHTML = '<div class="channel">Loading approved tracks...</div>';
  try {
    const q = query(collection(db, 'radio_submissions'), where('status', '==', 'approved'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      allApprovedTracks = [];
      setTrackCount();
      approvedList.innerHTML = '<div class="channel">No approved tracks yet.</div>';
      return;
    }

    allApprovedTracks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b)=> {
        const featured = Number(!!b.featured) - Number(!!a.featured);
        if(featured) return featured;
        const ad=a.createdAt?.toMillis?a.createdAt.toMillis():0;
        const bd=b.createdAt?.toMillis?b.createdAt.toMillis():0;
        return bd-ad;
      });

    currentTrackIndex = 0;
    setTrackCount();
    renderGenreFilters();
    renderApprovedTracks();

    const firstTrack = filteredTracks()[0];
    if(firstTrack){
      updateNowPlaying(firstTrack);
      resolveTrackUrl(firstTrack).then(url=>{ radioPlayer.src=url; radioPlayer.load(); setPlayButton(); }).catch(console.warn);
    }
  } catch (error) {
    console.error('LOAD APPROVED ERROR', error);
    approvedList.innerHTML = '<div class="channel">Could not load approved tracks: '+esc(error.message || error)+'</div>';
  }
}

document.getElementById('refreshApproved').addEventListener('click', loadApproved);
loadApproved();