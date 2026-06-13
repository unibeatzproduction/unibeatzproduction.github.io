import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
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
try { await getRedirectResult(auth); } catch(e) { console.warn('[radio admin] redirect result', e); }

const ADMIN_CODE = '2345';
const ADMIN_EMAILS = ['syncere862@gmail.com','unibeatzproduction@gmail.com'];
const lockScreen = document.getElementById('lockScreen');
const adminApp = document.getElementById('adminApp');
const lockNotice = document.getElementById('lockNotice');
const list = document.getElementById('adminList');
let submissions = [];
let currentFilter = 'pending';
let loadingNow = false;
let loadedOnce = false;
let authReady = false;
let authUser = null;

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(v){try{if(v&&v.toDate)return v.toDate().toLocaleString();if(v)return new Date(v).toLocaleString();}catch(e){}return 'No date';}
function unlocked(){return localStorage.getItem('ub_radio_admin_unlocked')==='yes';}
function isAdminEmail(email){return ADMIN_EMAILS.includes(String(email||'').toLowerCase());}
function showAdmin(){lockScreen.classList.add('hidden');adminApp.classList.remove('hidden');}
function showLock(){adminApp.classList.add('hidden');lockScreen.classList.remove('hidden');}
function lock(){localStorage.removeItem('ub_radio_admin_unlocked');location.reload();}
function setNotice(msg,color='#40D0FF'){const n=document.getElementById('stationNotice')||lockNotice;if(n){n.textContent=msg;n.style.color=color;}}
function setLockNotice(msg,color='#40D0FF'){if(lockNotice){lockNotice.textContent=msg;lockNotice.style.color=color;}}
function renderAuthState(){
  if(!unlocked()){showLock();return;}
  showAdmin();
  if(!authReady){setNotice('Checking Google admin session...');return;}
  if(authUser && isAdminEmail(authUser.email)){
    setNotice('Signed in as '+authUser.email,'#5dff9e');
    if(!loadedOnce) loadSubmissions(true);
  }else{
    setNotice('Tap Reload or any action to sign in with your admin Google account.');
    if(!loadedOnce) list.innerHTML='<div class="empty">Admin unlocked. Google admin sign-in required before moderation.</div>';
  }
}

document.getElementById('unlockBtn').onclick=()=>{
  const code=document.getElementById('adminCode').value.trim();
  if(code===ADMIN_CODE){localStorage.setItem('ub_radio_admin_unlocked','yes');renderAuthState();}
  else{setLockNotice('Wrong admin code.','#ff7474');}
};
document.getElementById('lockBtn').onclick=lock;

async function googleAdminSignIn(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try{
    await signInWithPopup(auth, provider);
  }catch(e){
    if(e && (e.code==='auth/popup-blocked' || e.code==='auth/cancelled-popup-request')){
      await signInWithRedirect(auth, provider);
    }else{
      throw e;
    }
  }
}

async function ensureAdmin(){
  if(!unlocked()) throw new Error('Admin code required.');
  if(!authReady) throw new Error('Google auth still loading. Wait one second and try again.');
  let user = auth.currentUser;
  if(!user || user.isAnonymous || !isAdminEmail(user.email)){
    setNotice('Opening Google admin sign-in...');
    await googleAdminSignIn();
    user = auth.currentUser;
  }
  if(!user || !isAdminEmail(user.email)){
    throw new Error('Not approved admin email. Use syncere862@gmail.com or unibeatzproduction@gmail.com.');
  }
  return user;
}

function statusClass(s){s=String(s||'pending').toLowerCase();return s==='approved'?'approved':s==='rejected'?'rejected':'pending';}
function updateStats(){
  const total=submissions.length;
  const pending=submissions.filter(x=>(x.status||'pending')==='pending').length;
  const approved=submissions.filter(x=>x.status==='approved').length;
  const featured=submissions.filter(x=>!!x.featured).length;
  const rejected=submissions.filter(x=>x.status==='rejected').length;
  document.getElementById('statTotal').textContent=total;
  document.getElementById('statPending').textContent=pending;
  document.getElementById('statApproved').textContent=approved;
  document.getElementById('statFeatured').textContent=featured;
  document.getElementById('statRejected').textContent=rejected;
}
function filtered(){
  if(currentFilter==='all') return submissions;
  if(currentFilter==='featured') return submissions.filter(x=>!!x.featured);
  return submissions.filter(x=>(x.status||'pending')===currentFilter);
}
function mediaTag(t){
  const url=String(t.audioUrl||'');
  const type=String(t.fileType||t.contentType||'').toLowerCase();
  if(type.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return `<video class="player" controls preload="metadata" src="${esc(url)}"></video>`;
  return `<audio class="player" controls preload="metadata" src="${esc(url)}"></audio>`;
}
function button(action,id,label,cls){return `<button type="button" class="btn ${cls} btn-small" data-action="${action}" data-id="${esc(id)}">${label}</button>`;}
function renderList(){
  const data=filtered();
  if(!data.length){list.innerHTML=`<div class="empty">No ${currentFilter} submissions.</div>`;return;}
  list.innerHTML=data.map(t=>`<article class="track">
    <div><div class="track-title">${esc(t.trackTitle||'Untitled')}</div>
    <div class="track-meta">${esc(t.artistName||'Unknown Artist')} · ${esc(t.genre||'No genre')} · ${fmtDate(t.createdAt)}</div>
    <div><span class="badge ${statusClass(t.status)}">${esc(t.status||'pending')}</span>${t.featured?'<span class="badge approved">featured</span>':''}</div></div>
    ${mediaTag(t)}
    <div class="small" style="margin-top:7px"><b>Email:</b> ${esc(t.email||'No email')}<br><b>Producer/Credits:</b> ${esc(t.producerCredits||'Not saved')}<br><b>Rights:</b> ${esc(t.copyrightDeclaration||'No rights note')}<br>${t.artistLink?'<b>Link:</b> <span class="link">'+esc(t.artistLink)+'</span>':''}</div>
    <div class="actions">
      ${button('approve',t.id,'Approve','btn-green')}
      ${button('feature',t.id,t.featured?'Unfeature':'Feature','btn-gold')}
      ${button('now',t.id,'Set Now Playing','btn-blue')}
      ${button('reject',t.id,'Reject','btn-red')}
      ${button('remove',t.id,'Delete','btn-red')}
    </div>
  </article>`).join('');
}
async function loadSubmissions(force=false){
  if(loadingNow) return;
  if(loadedOnce && !force) return;
  loadingNow = true;
  if(!loadedOnce) list.innerHTML='<div class="empty">Loading submissions...</div>';
  try{
    const user = await ensureAdmin();
    const snap = await getDocs(collection(db,'radio_submissions'));
    submissions=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const ad=a.createdAt?.toMillis?a.createdAt.toMillis():0;
      const bd=b.createdAt?.toMillis?b.createdAt.toMillis():0;
      return bd-ad;
    });
    loadedOnce = true;
    setNotice('Signed in as '+user.email,'#5dff9e');
    updateStats();renderList();
  }catch(e){
    console.error(e);
    list.innerHTML='<div class="empty">Admin error: '+esc(e.code || '')+' '+esc(e.message || e)+'</div>';
  } finally {
    loadingNow = false;
  }
}
async function updateSubmission(id,patch){
  setNotice('Saving...');
  await ensureAdmin();
  await updateDoc(doc(db,'radio_submissions',id),{...patch,reviewedAt:serverTimestamp()});
  loadedOnce=false;
  await loadSubmissions(true);
  setNotice('Saved.','#5dff9e');
}
async function approve(id){await updateSubmission(id,{status:'approved',featured:false});}
async function reject(id){await updateSubmission(id,{status:'rejected',featured:false});}
async function feature(id){const t=submissions.find(x=>x.id===id);await updateSubmission(id,{status:'approved',featured:!t?.featured});}
async function remove(id){if(!confirm('Delete this radio submission?'))return;setNotice('Deleting...');await ensureAdmin();await deleteDoc(doc(db,'radio_submissions',id));loadedOnce=false;await loadSubmissions(true);setNotice('Deleted.','#5dff9e');}
async function setNow(id){
  const t=submissions.find(x=>x.id===id); if(!t)return;
  setNotice('Updating Now Playing...');
  await ensureAdmin();
  await setDoc(doc(db,'radio_station','main'),{nowPlayingId:id,trackTitle:t.trackTitle||'',artistName:t.artistName||'',genre:t.genre||'',audioUrl:t.audioUrl||'',featured:!!t.featured,updatedAt:serverTimestamp()},{merge:true});
  setNotice('Now Playing updated.','#5dff9e');
}
async function runAction(action,id){
  try{
    if(action==='approve') return await approve(id);
    if(action==='reject') return await reject(id);
    if(action==='feature') return await feature(id);
    if(action==='now') return await setNow(id);
    if(action==='remove') return await remove(id);
  }catch(e){
    console.error(e);
    setNotice('Action failed: '+(e.code||'')+' '+(e.message||e),'#ff7474');
  }
}

let touchHandledAt=0;
list.addEventListener('click',(e)=>{
  if(Date.now()-touchHandledAt<700) return;
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  e.preventDefault(); e.stopPropagation();
  runAction(btn.dataset.action,btn.dataset.id);
});
list.addEventListener('touchend',(e)=>{
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  touchHandledAt=Date.now();
  e.preventDefault(); e.stopPropagation();
  runAction(btn.dataset.action,btn.dataset.id);
},{passive:false});

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;renderList();});
document.getElementById('reloadBtn').onclick=()=>{loadedOnce=false;loadSubmissions(true);};
document.getElementById('saveStationBtn').onclick=async()=>{
  try{
    setNotice('Saving station...');
    await ensureAdmin();
    await setDoc(doc(db,'radio_station','main'),{title:document.getElementById('stationTitle').value.trim()||'Empire Rotation',message:document.getElementById('stationMessage').value.trim(),dj:document.getElementById('stationDj').value.trim()||'UniBeatz Radio',updatedAt:serverTimestamp()},{merge:true});
    setNotice('Station saved.','#5dff9e');
  }catch(e){setNotice('Station save failed: '+(e.message||e),'#ff7474');}
};
document.getElementById('clearNowBtn').onclick=async()=>{
  try{
    setNotice('Clearing Now Playing...');
    await ensureAdmin();
    await setDoc(doc(db,'radio_station','main'),{nowPlayingId:'',trackTitle:'',artistName:'',genre:'',audioUrl:'',updatedAt:serverTimestamp()},{merge:true});
    setNotice('Now Playing cleared.','#5dff9e');
  }catch(e){setNotice('Clear failed: '+(e.message||e),'#ff7474');}
};
window.radioAdmin={approve,reject,feature,remove,now:setNow,reload:()=>{loadedOnce=false;loadSubmissions(true);}};

onAuthStateChanged(auth,(user)=>{
  authReady=true;
  authUser=user;
  renderAuthState();
});
renderAuthState();