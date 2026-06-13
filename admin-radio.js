import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
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
const lockScreen = document.getElementById('lockScreen');
const adminApp = document.getElementById('adminApp');
const lockNotice = document.getElementById('lockNotice');
const list = document.getElementById('adminList');
let submissions = [];
let currentFilter = 'pending';
let loadingNow = false;
let loadedOnce = false;

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(v){try{if(v&&v.toDate)return v.toDate().toLocaleString();if(v)return new Date(v).toLocaleString();}catch(e){}return 'No date';}
function unlocked(){return localStorage.getItem('ub_radio_admin_unlocked')==='yes';}
function showAdmin(){lockScreen.classList.add('hidden');adminApp.classList.remove('hidden');if(!loadedOnce)loadSubmissions(true);}
function showLock(){adminApp.classList.add('hidden');lockScreen.classList.remove('hidden');}
function lock(){localStorage.removeItem('ub_radio_admin_unlocked');location.reload();}
function boot(){if(unlocked())showAdmin();else showLock();}

document.getElementById('unlockBtn').onclick=()=>{
  const code=document.getElementById('adminCode').value.trim();
  if(code===ADMIN_CODE){localStorage.setItem('ub_radio_admin_unlocked','yes');showAdmin();}
  else{lockNotice.textContent='Wrong admin code.';lockNotice.style.color='#ff7474';}
};
document.getElementById('lockBtn').onclick=lock;

async function ensureAdmin(){
  if(!unlocked()) throw new Error('Admin code required.');
  if(!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
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
function renderList(){
  const data=filtered();
  if(!data.length){list.innerHTML=`<div class="empty">No ${currentFilter} submissions.</div>`;return;}
  list.innerHTML=data.map(t=>`<article class="track">
    <div><div class="track-title">${esc(t.trackTitle||'Untitled')}</div>
    <div class="track-meta">${esc(t.artistName||'Unknown Artist')} · ${esc(t.genre||'No genre')} · ${fmtDate(t.createdAt)}</div>
    <div><span class="badge ${statusClass(t.status)}">${esc(t.status||'pending')}</span>${t.featured?'<span class="badge approved">featured</span>':''}</div></div>
    ${mediaTag(t)}
    <div class="small" style="margin-top:7px"><b>Email:</b> ${esc(t.email||'No email')}<br><b>Producer/Credits:</b> ${esc(t.producerCredits||'Not saved')}<br><b>Rights:</b> ${esc(t.copyrightDeclaration||'No rights note')}<br>${t.artistLink?'<b>Link:</b> <span class="link">'+esc(t.artistLink)+'</span>':''}</div>
    <div class="actions"><button class="btn btn-green btn-small" onclick="radioAdmin.approve('${t.id}')">Approve</button><button class="btn btn-gold btn-small" onclick="radioAdmin.feature('${t.id}')">${t.featured?'Unfeature':'Feature'}</button><button class="btn btn-blue btn-small" onclick="radioAdmin.now('${t.id}')">Set Now Playing</button><button class="btn btn-red btn-small" onclick="radioAdmin.reject('${t.id}')">Reject</button><button class="btn btn-red btn-small" onclick="radioAdmin.remove('${t.id}')">Delete</button></div>
  </article>`).join('');
}
async function loadSubmissions(force=false){
  if(loadingNow) return;
  if(loadedOnce && !force) return;
  loadingNow = true;
  if(!loadedOnce) list.innerHTML='<div class="empty">Loading submissions...</div>';
  try{
    await ensureAdmin();
    const snap = await getDocs(collection(db,'radio_submissions'));
    submissions=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const ad=a.createdAt?.toMillis?a.createdAt.toMillis():0;
      const bd=b.createdAt?.toMillis?b.createdAt.toMillis():0;
      return bd-ad;
    });
    loadedOnce = true;
    updateStats();renderList();
  }catch(e){
    console.error(e);
    list.innerHTML='<div class="empty">Admin error: '+esc(e.code || '')+' '+esc(e.message || e)+'</div>';
  } finally {
    loadingNow = false;
  }
}
async function updateSubmission(id,patch){await ensureAdmin();await updateDoc(doc(db,'radio_submissions',id),{...patch,reviewedAt:serverTimestamp()});loadedOnce=false;await loadSubmissions(true);}
async function approve(id){await updateSubmission(id,{status:'approved',featured:false});}
async function reject(id){await updateSubmission(id,{status:'rejected',featured:false});}
async function feature(id){const t=submissions.find(x=>x.id===id);await updateSubmission(id,{status:'approved',featured:!t?.featured});}
async function remove(id){if(!confirm('Delete this radio submission?'))return;await ensureAdmin();await deleteDoc(doc(db,'radio_submissions',id));loadedOnce=false;await loadSubmissions(true);}
async function setNow(id){
  const t=submissions.find(x=>x.id===id); if(!t)return;
  await ensureAdmin();
  await setDoc(doc(db,'radio_station','main'),{nowPlayingId:id,trackTitle:t.trackTitle||'',artistName:t.artistName||'',genre:t.genre||'',audioUrl:t.audioUrl||'',featured:!!t.featured,updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Now Playing updated.';
}

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;renderList();});
document.getElementById('reloadBtn').onclick=()=>{loadedOnce=false;loadSubmissions(true);};
document.getElementById('saveStationBtn').onclick=async()=>{
  await ensureAdmin();
  await setDoc(doc(db,'radio_station','main'),{title:document.getElementById('stationTitle').value.trim()||'Empire Rotation',message:document.getElementById('stationMessage').value.trim(),dj:document.getElementById('stationDj').value.trim()||'UniBeatz Radio',updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Station saved.';
};
document.getElementById('clearNowBtn').onclick=async()=>{
  await ensureAdmin();
  await setDoc(doc(db,'radio_station','main'),{nowPlayingId:'',trackTitle:'',artistName:'',genre:'',audioUrl:'',updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Now Playing cleared.';
};
window.radioAdmin={approve,reject,feature,remove,now:setNow,reload:()=>{loadedOnce=false;loadSubmissions(true);}};
boot();
