// admin-radio.js — UniBeatz Radio Admin
// FIXED: auth race condition + infinite Google sign-in loop removed
// Flow: Admin Code → Show Sign In Button → Click → Validate → Load Panel

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4',
  authDomain: 'unibeatzproduction-7ae31.firebaseapp.com',
  projectId: 'unibeatzproduction-7ae31',
  storageBucket: 'unibeatzproduction-7ae31.firebasestorage.app',
  messagingSenderId: '70667820609',
  appId: '1:70667820609:web:57762df5510e6b4000b0c0'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.UB_FIREBASE = { ...(window.UB_FIREBASE || {}), app, auth, db, ready: true };
window.dispatchEvent(new CustomEvent('ub-firebase-ready'));

const ADMIN_CODE = '2345';
const ADMIN_EMAILS = ['syncere862@gmail.com', 'unibeatzproduction@gmail.com'];

// ── DOM refs ──
const lockScreen = document.getElementById('lockScreen');
const adminApp   = document.getElementById('adminApp');
const list       = document.getElementById('adminList');

let submissions   = [];
let currentFilter = 'pending';
let loadingNow    = false;
let loadedOnce    = false;
// FIX: these are set ONLY by onAuthStateChanged, never by currentUser polling
let authReady     = false;
let authUser      = null;

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(v){ try{ if(v?.toDate) return v.toDate().toLocaleString(); if(v) return new Date(v).toLocaleString(); }catch(e){} return 'No date'; }
function unlocked(){ return localStorage.getItem('ub_radio_admin_unlocked') === 'yes'; }
function isAdminEmail(email){ return ADMIN_EMAILS.includes(String(email || '').toLowerCase()); }
function setNotice(msg, color = '#40D0FF'){ const n = document.getElementById('stationNotice'); if(n){ n.textContent = msg; n.style.color = color; } }
function setLockNotice(msg, color = '#40D0FF'){ const n = document.getElementById('lockNotice'); if(n){ n.textContent = msg; n.style.color = color; } }

// ── Google Sign In button — only shown after code unlock ──
function renderGoogleBtn(container){
  if(document.getElementById('adminGoogleSignInBtn')) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:16px;display:flex;flex-direction:column;gap:10px;align-items:center;';

  const btn = document.createElement('button');
  btn.id = 'adminGoogleSignInBtn';
  btn.className = 'btn btn-gold';
  btn.textContent = 'Sign In With Google';
  btn.onclick = doGoogleSignIn;

  const status = document.createElement('div');
  status.id = 'adminGoogleStatus';
  status.style.cssText = 'font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:2px;color:#40D0FF;';
  status.textContent = 'Use syncere862@gmail.com or unibeatzproduction@gmail.com';

  wrap.appendChild(btn);
  wrap.appendChild(status);
  container.appendChild(wrap);
}

function updateGoogleStatus(){
  const status = document.getElementById('adminGoogleStatus');
  const btn    = document.getElementById('adminGoogleSignInBtn');
  if(!status || !btn) return;

  if(authUser && isAdminEmail(authUser.email)){
    status.textContent = '✅ Signed in: ' + authUser.email;
    status.style.color = '#5dff9e';
    btn.textContent    = 'Sign Out';
    btn.onclick        = doSignOut;
  } else if(authUser && !isAdminEmail(authUser.email)){
    status.textContent = '❌ Wrong account: ' + authUser.email + ' — sign out and try again';
    status.style.color = '#ff7474';
    btn.textContent    = 'Sign Out & Switch';
    btn.onclick        = doSignOut;
  } else {
    status.textContent = 'Use syncere862@gmail.com or unibeatzproduction@gmail.com';
    status.style.color = '#40D0FF';
    btn.textContent    = 'Sign In With Google';
    btn.onclick        = doGoogleSignIn;
  }
}

async function doGoogleSignIn(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  setLockNotice('Opening Google account picker...');
  try{
    // FIX: signInWithPopup only — NEVER auto-called on load
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will fire and call renderAuthState
  } catch(e){
    if(e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
    setLockNotice('Google sign-in failed: ' + (e?.message || e), '#ff7474');
  }
}

async function doSignOut(){
  await signOut(auth);
  setNotice('Signed out. Sign in with admin Google account.');
  list.innerHTML = '<div class="empty">Signed out. Sign in to access submissions.</div>';
}

// ── Show/hide screens ──
function showAdmin(){ lockScreen.classList.add('hidden'); adminApp.classList.remove('hidden'); }
function showLock(){  adminApp.classList.add('hidden');   lockScreen.classList.remove('hidden'); }

function renderAuthState(){
  if(!unlocked()){ showLock(); return; }

  // Show admin panel shell immediately so it's not blank
  showAdmin();

  // FIX: Wait for onAuthStateChanged to set authReady before checking user
  if(!authReady){
    setNotice('Checking Google session...');
    // Inject sign-in button into hero area while waiting
    const hero = adminApp.querySelector('.hero');
    if(hero) renderGoogleBtn(hero);
    return;
  }

  // Auth is ready — update button state
  const hero = adminApp.querySelector('.hero');
  if(hero) renderGoogleBtn(hero);
  updateGoogleStatus();

  if(authUser && isAdminEmail(authUser.email)){
    setNotice('Signed in as ' + authUser.email, '#5dff9e');
    if(!loadedOnce) loadSubmissions(true);
  } else {
    setNotice('Tap "Sign In With Google" above to load submissions.');
    if(!loadedOnce) list.innerHTML = '<div class="empty">Google admin sign-in required. Use the button above.</div>';
  }
}

// ── Unlock with code ──
document.getElementById('unlockBtn').onclick = () => {
  const code = document.getElementById('adminCode').value.trim();
  if(code === ADMIN_CODE){
    localStorage.setItem('ub_radio_admin_unlocked', 'yes');
    renderAuthState();
  } else {
    setLockNotice('Wrong admin code.', '#ff7474');
  }
};

document.getElementById('lockBtn').onclick = () => {
  localStorage.removeItem('ub_radio_admin_unlocked');
  location.reload();
};

// ── FIX: onAuthStateChanged is the ONLY place authUser is set ──
// Never call auth.currentUser during startup
onAuthStateChanged(auth, user => {
  authReady = true;
  authUser  = user;
  // Only update UI if already unlocked — don't flash the admin panel for locked users
  if(unlocked()) renderAuthState();
});

// Initial render on page load
renderAuthState();

// ── Submission loading ──
async function requireAdmin(){
  if(!unlocked()) throw new Error('Admin code required.');
  if(!authReady)  throw new Error('Auth still loading. Wait a moment.');
  if(!authUser || !isAdminEmail(authUser.email)){
    throw new Error('Sign in with admin Google account first.');
  }
  return authUser;
}

function statusClass(s){ s = String(s || 'pending').toLowerCase(); return s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending'; }

function updateStats(){
  const total    = submissions.length;
  const pending  = submissions.filter(x => (x.status || 'pending') === 'pending').length;
  const approved = submissions.filter(x => x.status === 'approved').length;
  const featured = submissions.filter(x => !!x.featured).length;
  const rejected = submissions.filter(x => x.status === 'rejected').length;
  ['statTotal','statPending','statApproved','statFeatured','statRejected'].forEach((id, i) => {
    const el = document.getElementById(id);
    if(el) el.textContent = [total, pending, approved, featured, rejected][i];
  });
}

function filtered(){
  if(currentFilter === 'all')      return submissions;
  if(currentFilter === 'featured') return submissions.filter(x => !!x.featured);
  return submissions.filter(x => (x.status || 'pending') === currentFilter);
}

function mediaTag(t){
  const url  = String(t.audioUrl || '');
  const type = String(t.fileType || t.contentType || '').toLowerCase();
  if(type.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url))
    return `<video class="player" controls preload="metadata" src="${esc(url)}"></video>`;
  return `<audio class="player" controls preload="metadata" src="${esc(url)}"></audio>`;
}

function btn(action, id, label, cls){ return `<button type="button" class="btn ${cls} btn-small" data-action="${action}" data-id="${esc(id)}">${label}</button>`; }

function renderList(){
  const data = filtered();
  if(!data.length){ list.innerHTML = `<div class="empty">No ${currentFilter} submissions.</div>`; return; }
  list.innerHTML = data.map(t => `<article class="track">
    <div class="track-title">${esc(t.trackTitle || 'Untitled')}</div>
    <div class="track-meta">${esc(t.artistName || 'Unknown')} · ${esc(t.genre || 'No genre')} · ${fmtDate(t.createdAt)}</div>
    <div><span class="badge ${statusClass(t.status)}">${esc(t.status || 'pending')}</span>${t.featured ? '<span class="badge approved">featured</span>' : ''}</div>
    ${mediaTag(t)}
    <div class="small" style="margin-top:7px">
      <b>Email:</b> ${esc(t.email || '—')}<br>
      <b>Producer:</b> ${esc(t.producerCredits || '—')}<br>
      <b>Rights:</b> ${esc(t.copyrightDeclaration || '—')}
      ${t.artistLink ? '<br><b>Link:</b> <span class="link">' + esc(t.artistLink) + '</span>' : ''}
    </div>
    <div class="actions">
      ${btn('approve', t.id, 'Approve', 'btn-green')}
      ${btn('feature', t.id, t.featured ? 'Unfeature' : 'Feature', 'btn-gold')}
      ${btn('now',     t.id, 'Set Now Playing', 'btn-blue')}
      ${btn('reject',  t.id, 'Reject', 'btn-red')}
      ${btn('remove',  t.id, 'Delete', 'btn-red')}
      <a class="btn btn-blue btn-small" href="${esc(t.audioUrl||'')}" download="${esc((t.trackTitle||'track').replace(/[^a-zA-Z0-9 _-]/g,'_'))}.${(t.fileType||'').includes('wav')?'wav':'mp3'}" target="_blank" rel="noopener">⬇ Download for Live365</a>\n    </div>
  </article>`).join('');
}

async function loadSubmissions(force = false){
  if(loadingNow) return;
  if(loadedOnce && !force) return;
  loadingNow = true;
  list.innerHTML = '<div class="empty">Loading submissions...</div>';
  try{
    await requireAdmin();
    const snap = await getDocs(collection(db, 'radio_submissions'));
    submissions = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const ad = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bd = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bd - ad;
    });
    loadedOnce = true;
    updateStats();
    renderList();
    setNotice('Loaded ' + submissions.length + ' submissions.', '#5dff9e');
  } catch(e){
    console.error(e);
    list.innerHTML = '<div class="empty">Error: ' + esc(e.message || String(e)) + '</div>';
    setNotice(e.message || String(e), '#ff7474');
  } finally {
    loadingNow = false;
  }
}

async function updateSub(id, patch){
  setNotice('Saving...');
  await requireAdmin();
  await updateDoc(doc(db, 'radio_submissions', id), { ...patch, reviewedAt: serverTimestamp() });
  loadedOnce = false;
  await loadSubmissions(true);
  setNotice('Saved.', '#5dff9e');
}

async function runAction(action, id){
  try{
    if(action === 'approve') return await updateSub(id, { status: 'approved', featured: false });
    if(action === 'reject')  return await updateSub(id, { status: 'rejected', featured: false });
    if(action === 'feature'){
      const t = submissions.find(x => x.id === id);
      return await updateSub(id, { status: 'approved', featured: !t?.featured });
    }
    if(action === 'now'){
      const t = submissions.find(x => x.id === id); if(!t) return;
      setNotice('Updating Now Playing...');
      await requireAdmin();
      await setDoc(doc(db, 'radio_station', 'main'), {
        nowPlayingId: id, trackTitle: t.trackTitle || '', artistName: t.artistName || '',
        genre: t.genre || '', audioUrl: t.audioUrl || '', featured: !!t.featured,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setNotice('Now Playing updated.', '#5dff9e');
    }
    if(action === 'remove'){
      if(!confirm('Delete this submission?')) return;
      setNotice('Deleting...');
      await requireAdmin();
      await deleteDoc(doc(db, 'radio_submissions', id));
      loadedOnce = false;
      await loadSubmissions(true);
      setNotice('Deleted.', '#5dff9e');
    }
  } catch(e){
    console.error(e);
    setNotice('Action failed: ' + (e.message || String(e)), '#ff7474');
  }
}

// Event delegation for action buttons
let touchAt = 0;
list.addEventListener('click', e => {
  if(Date.now() - touchAt < 700) return;
  const b = e.target.closest('[data-action]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  runAction(b.dataset.action, b.dataset.id);
});
list.addEventListener('touchend', e => {
  const b = e.target.closest('[data-action]'); if(!b) return;
  touchAt = Date.now();
  e.preventDefault(); e.stopPropagation();
  runAction(b.dataset.action, b.dataset.id);
}, { passive: false });

// Filter tabs
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { currentFilter = b.dataset.filter; renderList(); });
document.getElementById('reloadBtn').onclick = () => { loadedOnce = false; loadSubmissions(true); };

// Station controls
document.getElementById('saveStationBtn').onclick = async () => {
  try{
    setNotice('Saving station...');
    await requireAdmin();
    await setDoc(doc(db, 'radio_station', 'main'), {
      title:   (document.getElementById('stationTitle')?.value   || '').trim() || 'Empire Rotation',
      message: (document.getElementById('stationMessage')?.value || '').trim(),
      dj:      (document.getElementById('stationDj')?.value      || '').trim() || 'UniBeatz Radio',
      updatedAt: serverTimestamp()
    }, { merge: true });
    setNotice('Station saved.', '#5dff9e');
  } catch(e){ setNotice('Save failed: ' + (e.message || e), '#ff7474'); }
};

document.getElementById('clearNowBtn').onclick = async () => {
  try{
    setNotice('Clearing Now Playing...');
    await requireAdmin();
    await setDoc(doc(db, 'radio_station', 'main'), {
      nowPlayingId: '', trackTitle: '', artistName: '', genre: '', audioUrl: '',
      updatedAt: serverTimestamp()
    }, { merge: true });
    setNotice('Now Playing cleared.', '#5dff9e');
  } catch(e){ setNotice('Clear failed: ' + (e.message || e), '#ff7474'); }
};

window.radioAdmin = {
  reload: () => { loadedOnce = false; loadSubmissions(true); }
};
