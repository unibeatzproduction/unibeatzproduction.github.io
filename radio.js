import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
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

// ── Global state ──
let allApprovedTracks = [];
let allRadioAssets = [];
let playbackQueue = [];        // full rotation: songs + voiceovers + drops + podcasts
let currentTrackIndex = 0;    // index into playbackQueue
let currentGenre = 'All';
let lastAccountText = '';
let reactionCounts = {};
let currentUserReaction = '';

// ── Helpers ──
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function labelForUser(user, profile){ return (!user || user.isAnonymous) ? 'Sign In' : (profile?.username || user.displayName || user.email || 'Account'); }
function setAccountText(text){ if(accountBtn && lastAccountText !== text){ lastAccountText = text; accountBtn.textContent = text; } }
function getListenerId(){ let id = localStorage.getItem('ub_radio_listener_id'); if(!id){ id = 'listener_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); localStorage.setItem('ub_radio_listener_id', id); } return id; }
function isAnnouncement(t){ return ['voiceover','station_drop','podcast','dj_set'].includes(t?.type); }
function titleOf(t){ return t.trackTitle || t.title || 'Untitled'; }
function artistOf(t){ return t.artistName || t.djLaneLabel || (isAnnouncement(t) ? 'UniBeatz Radio' : 'Unknown Artist'); }
function rule(t, k, def){ return t?.autoRules && t.autoRules[k] !== undefined ? t.autoRules[k] : def; }
function setPlayButton(){ if(playPauseBtn) playPauseBtn.textContent = radioPlayer && !radioPlayer.paused ? '⏸ Pause' : '▶ Play'; }
function setTrackCount(){ if(trackCountLabel) trackCountLabel.textContent = `${allApprovedTracks.length} songs · ${allRadioAssets.length} announcements`; }

// ── Build rotation queue ──
// Songs + voiceovers/drops interleaved + podcasts/dj_sets at end
// All item types rotate continuously — station never stops
function buildPlaybackQueue(){
  const songs = [...allApprovedTracks].sort((a,b) =>
    Number(a.autoOrder ?? a.sortOrder ?? 9999) - Number(b.autoOrder ?? b.sortOrder ?? 9999)
  );
  const assets = [...allRadioAssets]
    .filter(a => rule(a, 'enabled', true))
    .sort((a,b) => Number(a.autoOrder ?? a.sortOrder ?? 9999) - Number(b.autoOrder ?? b.sortOrder ?? 9999));

  const inserts = assets.filter(a => ['voiceover','station_drop'].includes(a.type));
  const shows   = assets.filter(a => ['podcast','dj_set'].includes(a.type));

  const queue = [];
  let songCount = 0;

  songs.forEach(song => {
    queue.push(song);
    songCount++;
    // Interleave voiceovers/drops based on their insertEverySongs rule
    const due = inserts.filter(a => {
      const every = Number(rule(a, 'insertEverySongs', a.type === 'station_drop' ? 3 : 4));
      return every > 0 && songCount % every === 0;
    });
    if(due.length) queue.push(due[(songCount + due.length) % due.length]);
  });

  // If no songs at all, still queue assets so station plays something
  if(!queue.length && inserts.length) queue.push(...inserts);

  // Podcasts and DJ sets go at end — they rotate back into the top when looping
  if(shows.length) queue.push(...shows);

  // Always have something
  if(!queue.length && songs.length) queue.push(...songs);

  playbackQueue = queue;
}

// ── Genre filter (applies on top of full queue) ──
function filteredTracks(){
  if(currentGenre === 'All') return playbackQueue;
  return playbackQueue.filter(t => t.genre === currentGenre || isAnnouncement(t));
}

// ── NOW PLAYING ──
function updateNowPlaying(track){
  nowPlayingTitle.textContent = `Now Playing: ${titleOf(track)}`;
  nowPlayingMeta.textContent  = `${artistOf(track)} • ${track.genre || (isAnnouncement(track) ? 'Announcement' : 'Radio')}`;
  nowPlayingBadge.textContent = isAnnouncement(track)
    ? 'STATION ANNOUNCEMENT'
    : (track.featured ? 'FEATURED ROTATION' : 'APPROVED ROTATION');
}

// ── Resolve audio URL (handles storagePath fallback) ──
async function resolveTrackUrl(track){
  if(track.audioUrl) return track.audioUrl;
  if(track.storagePath){
    const url = await getDownloadURL(ref(storage, track.storagePath));
    track.audioUrl = url;
    if(track.id && track.collectionName)
      updateDoc(doc(db, track.collectionName, track.id), { audioUrl: url }).catch(console.warn);
    return url;
  }
  throw new Error('Track is missing audioUrl and storagePath.');
}

// ══════════════════════════════════════════════
// CORE: playTrack(index)
// Single entry point for ALL playback.
// Handles looping: last item → back to first.
// Station never stops unless user pauses.
// ══════════════════════════════════════════════
async function playTrack(index){
  const tracks = filteredTracks();
  if(!tracks.length) return;

  // Loop: past end → back to 0, before start → go to last
  if(index >= tracks.length) index = 0;
  if(index < 0) index = tracks.length - 1;

  currentTrackIndex = index;
  const track = tracks[currentTrackIndex];

  try{
    const url = await resolveTrackUrl(track);
    radioPlayer.pause();
    radioPlayer.src = url;
    radioPlayer.load();
    updateNowPlaying(track);
    renderApprovedTracks();
    await loadReactionsForTrack(track);
    await radioPlayer.play();
    setPlayButton();
  } catch(err){
    console.error('RADIO PLAY ERROR', err, track);
    if(nowPlayingBadge) nowPlayingBadge.textContent = 'PLAY ERROR — SKIPPING';
    // Skip broken track and keep rotating
    setTimeout(() => playTrack(currentTrackIndex + 1), 1500);
  }
}

// ── Auto-advance: fires on every 'ended' event ──
// This is what keeps the station running continuously
radioPlayer?.addEventListener('ended', () => {
  if(!filteredTracks().length) return;
  // Advance — wraps to 0 automatically in playTrack()
  playTrack(currentTrackIndex + 1).catch(console.error);
});

// ── Player controls ──
playPauseBtn?.addEventListener('click', async () => {
  try{
    if(!radioPlayer.src || radioPlayer.src === window.location.href){
      await playTrack(currentTrackIndex);
      return;
    }
    if(radioPlayer.paused) await radioPlayer.play();
    else radioPlayer.pause();
    setPlayButton();
  } catch(err){
    console.error('RADIO PLAY ERROR', err);
    if(nowPlayingBadge) nowPlayingBadge.textContent = 'PLAY ERROR — TAP A TRACK';
  }
});

nextTrackBtn?.addEventListener('click', () => playTrack(currentTrackIndex + 1).catch(console.error));
prevTrackBtn?.addEventListener('click', () => playTrack(currentTrackIndex - 1).catch(console.error));
radioPlayer?.addEventListener('play',  setPlayButton);
radioPlayer?.addEventListener('pause', setPlayButton);

// ── Reactions ──
function injectReactionButtons(){
  if(document.getElementById('radioReactionBar')) return;
  const controls = document.querySelector('.radio-controls');
  if(!controls) return;
  const bar = document.createElement('div');
  bar.id = 'radioReactionBar';
  bar.className = 'radio-reaction-bar';
  bar.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;';
  bar.innerHTML = `<button id="likeTrack" class="btn btn-blue" type="button">👍 Like <span id="likeCount">0</span></button><button id="dislikeTrack" class="btn btn-blue" type="button">👎 Dislike <span id="dislikeCount">0</span></button>`;
  controls.insertAdjacentElement('afterend', bar);
  document.getElementById('likeTrack').addEventListener('click', () => saveReaction('like'));
  document.getElementById('dislikeTrack').addEventListener('click', () => saveReaction('dislike'));
}

function updateReactionButtons(track){
  injectReactionButtons();
  const id = track?.id || '';
  const counts = reactionCounts[id] || { likes:0, dislikes:0 };
  const likeCount    = document.getElementById('likeCount');
  const dislikeCount = document.getElementById('dislikeCount');
  const likeBtn      = document.getElementById('likeTrack');
  const dislikeBtn   = document.getElementById('dislikeTrack');
  if(likeCount)    likeCount.textContent    = counts.likes    || 0;
  if(dislikeCount) dislikeCount.textContent = counts.dislikes || 0;
  if(likeBtn)    likeBtn.className    = 'btn ' + (currentUserReaction === 'like'    ? 'btn-gold' : 'btn-blue');
  if(dislikeBtn) dislikeBtn.className = 'btn ' + (currentUserReaction === 'dislike' ? 'btn-gold' : 'btn-blue');
}

async function loadReactionsForTrack(track){
  if(!track?.id) return;
  const listenerId = getListenerId();
  try{
    const q = query(collection(db, 'radio_reactions'), where('trackId', '==', track.id));
    const snap = await getDocs(q);
    let likes = 0, dislikes = 0, mine = '';
    snap.forEach(d => {
      const data = d.data() || {};
      if(data.reaction === 'like')    likes++;
      if(data.reaction === 'dislike') dislikes++;
      if(data.listenerId === listenerId) mine = data.reaction || '';
    });
    reactionCounts[track.id] = { likes, dislikes };
    const ct = filteredTracks()[currentTrackIndex];
    if(ct?.id === track.id){ currentUserReaction = mine; updateReactionButtons(track); }
  } catch(err){ console.warn('REACTION LOAD ERROR', err); }
}

async function loadAllReactionCounts(){
  await Promise.all(playbackQueue.map(t => loadReactionsForTrack(t)));
  renderApprovedTracks();
}

async function saveReaction(reaction){
  const track = filteredTracks()[currentTrackIndex];
  if(!track?.id){ if(nowPlayingBadge) nowPlayingBadge.textContent = 'PLAY A TRACK FIRST'; return; }
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const listenerId = getListenerId();
    const reactionId = `${track.id}_${listenerId}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    await setDoc(doc(db, 'radio_reactions', reactionId), {
      trackId: track.id, trackTitle: titleOf(track), artistName: artistOf(track),
      listenerId, reaction, uid: auth.currentUser?.uid || null,
      isAnonymous: !!auth.currentUser?.isAnonymous,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp()
    }, { merge: true });
    currentUserReaction = reaction;
    await loadReactionsForTrack(track);
    renderApprovedTracks();
    if(nowPlayingBadge) nowPlayingBadge.textContent = reaction === 'like' ? 'THANKS FOR THE LIKE' : 'FEEDBACK SAVED';
  } catch(err){
    console.error('REACTION SAVE ERROR', err);
    if(nowPlayingBadge) nowPlayingBadge.textContent = 'REACTION ERROR — CHECK FIREBASE RULES';
  }
}

// ── Genre filters ──
function renderGenreFilters(){
  if(!genreFilters) return;
  const genres = ['All', ...new Set(allApprovedTracks.map(t => t.genre).filter(Boolean))];
  genreFilters.innerHTML = '';
  genres.forEach(genre => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (genre === currentGenre ? 'btn-gold' : 'btn-blue');
    btn.style.margin = '4px';
    btn.textContent = genre;
    btn.addEventListener('click', () => {
      currentGenre = genre;
      currentTrackIndex = 0;
      buildPlaybackQueue();
      renderApprovedTracks();
      renderGenreFilters();
      loadReactionsForTrack(filteredTracks()[0]).catch(console.warn);
    });
    genreFilters.appendChild(btn);
  });
}

// ── Track list render ──
function renderApprovedTracks(){
  if(!approvedList) return;
  const filtered = filteredTracks();
  if(!filtered.length){
    approvedList.innerHTML = '<div class="channel">No approved tracks in this category yet.</div>';
    return;
  }
  approvedList.innerHTML = '';
  filtered.forEach((track, index) => {
    const counts = reactionCounts[track.id] || { likes:0, dislikes:0 };
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'track' + (index === currentTrackIndex ? ' active' : '');
    el.innerHTML = `
      <div class="name">${esc(titleOf(track))}</div>
      <div class="desc">${esc(artistOf(track))} · ${esc(track.genre || (isAnnouncement(track) ? 'Announcement' : 'Radio'))}</div>
      <div class="badge" style="margin-top:8px">${isAnnouncement(track) ? 'ANNOUNCEMENT' : (track.featured ? 'FEATURED' : 'APPROVED')}</div>
      <div class="desc" style="margin-top:7px">👍 ${counts.likes || 0} · 👎 ${counts.dislikes || 0}</div>
    `;
    el.addEventListener('click', async () => {
      try{ await playTrack(index); }
      catch(err){ console.error('RADIO PLAY ERROR', err, track); if(nowPlayingBadge) nowPlayingBadge.textContent = 'PLAY ERROR — CHECK FILE URL/RULES'; }
    });
    approvedList.appendChild(el);
  });
}

// ── Auth ──
accountBtn?.addEventListener('click', () => {
  if(window.UniBeatzAuth?.getUser?.()) window.UniBeatzAuth.showAccount();
  else if(window.UniBeatzAuth?.showLogin) window.UniBeatzAuth.showLogin();
});
window.addEventListener('ub-auth-ready', (e) => setAccountText(labelForUser(e.detail?.user, e.detail?.profile)));
onAuthStateChanged(auth, (user) => setAccountText(labelForUser(user)));
setAccountText('Sign In');
injectReactionButtons();

// ── Submission modal ──
document.getElementById('openSubmit')?.addEventListener('click',  () => modal.classList.add('open'));
document.getElementById('closeSubmit')?.addEventListener('click', () => modal.classList.remove('open'));
modal?.addEventListener('click', (e) => { if(e.target === modal) modal.classList.remove('open'); });

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.textContent = 'Uploading track for moderation...';
  notice.style.color = '#40D0FF';
  const formData = new FormData(form);
  const file = formData.get('audioFile');
  if(!file || !file.size){ notice.textContent = 'Please choose an audio file.'; notice.style.color = '#ff3c3c'; return; }
  if(file.size > 100*1024*1024){ notice.textContent = 'File too large. Max 100MB (MP3 or WAV).'; notice.style.color = '#ff3c3c'; return; }
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    const ext = file.name.split('.').pop().toLowerCase();
    const contentType = ext === 'wav' ? 'audio/wav' : (file.type || 'audio/mpeg');
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const fileRef = ref(storage, `radio-submissions/${safeName}`);
    await uploadBytes(fileRef, file, { contentType });
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
      fileType: file.type || (file.name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
      fileName: file.name || safeName,
      storagePath: fileRef.fullPath,
      status: 'pending', featured: false, reviewNotes: '',
      approvedFor: [],
      submittedByUid: auth.currentUser?.uid || null,
      submittedByEmail: auth.currentUser?.email || formData.get('email'),
      isAnonymousSubmission: !!auth.currentUser?.isAnonymous,
      createdAt: serverTimestamp(), reviewedAt: null
    });
    form.reset();
    modal.classList.remove('open');
    notice.textContent = 'Submitted. Your track is pending admin review.';
    notice.style.color = '#00cc66';
  } catch(err){
    console.error(err);
    notice.textContent = 'Submission failed: ' + (err.message || 'Verify Firebase config and rules.');
    notice.style.color = '#ff3c3c';
  }
});

// ══════════════════════════════════════════════
// LOAD APPROVED — fires on page load + refresh
// After loading, auto-starts rotation from track 0
// ══════════════════════════════════════════════
async function loadApproved(){
  if(approvedList) approvedList.innerHTML = '<div class="channel">Loading radio rotation...</div>';
  try{
    const tracksQ = query(collection(db, 'radio_submissions'), where('status', '==', 'approved'));
    const assetsQ = query(collection(db, 'radio_assets'), where('active', '==', true));
    const [trackSnap, assetSnap] = await Promise.all([
      getDocs(tracksQ),
      getDocs(assetsQ).catch(() => ({ empty: true, docs: [] }))
    ]);

    allApprovedTracks = trackSnap.docs
      .map(d => ({ id: d.id, collectionName: 'radio_submissions', kind: 'track', ...d.data() }))
      .sort((a, b) => {
        const ao = Number(a.autoOrder ?? a.sortOrder ?? 9999);
        const bo = Number(b.autoOrder ?? b.sortOrder ?? 9999);
        if(ao !== bo) return ao - bo;
        const featured = Number(!!b.featured) - Number(!!a.featured);
        if(featured) return featured;
        const ad = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bd = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bd - ad;
      });

    allRadioAssets = assetSnap.docs
      .map(d => ({ id: d.id, collectionName: 'radio_assets', kind: 'asset', ...d.data() }))
      .filter(a => a.audioUrl || a.storagePath)
      .sort((a, b) => Number(a.autoOrder ?? a.sortOrder ?? 9999) - Number(b.autoOrder ?? b.sortOrder ?? 9999));

    // Build the full rotation queue
    buildPlaybackQueue();

    reactionCounts = {};
    currentUserReaction = '';
    currentTrackIndex = 0;

    setTrackCount();
    renderGenreFilters();
    renderApprovedTracks();
    await loadAllReactionCounts();

    // ── AUTO-START: station begins playing track 0 immediately ──
    if(filteredTracks().length){
      // Pre-load first track URL, update now-playing display
      const first = filteredTracks()[0];
      updateNowPlaying(first);
      await loadReactionsForTrack(first);
      // Load src so user can tap play without waiting
      resolveTrackUrl(first).then(url => {
        radioPlayer.src = url;
        radioPlayer.load();
        setPlayButton();
      }).catch(console.warn);
      // Station starts — playTrack(0) begins rotation
      // Autoplay may be blocked on mobile until user taps; that's expected browser behavior
      playTrack(0).catch(() => {
        // Autoplay blocked — player is preloaded and ready for first tap
        setPlayButton();
      });
    } else {
      if(approvedList) approvedList.innerHTML = '<div class="channel">No approved songs or announcements yet.</div>';
    }

  } catch(err){
    console.error('LOAD RADIO ERROR', err);
    if(approvedList) approvedList.innerHTML = '<div class="channel">Could not load radio rotation: ' + esc(err.message || String(err)) + '</div>';
  }
}

document.getElementById('refreshApproved')?.addEventListener('click', loadApproved);
loadApproved();
