import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const ADMIN_CODE = '2345';
const lockScreen = document.getElementById('lockScreen');
const adminApp = document.getElementById('adminApp');
const lockNotice = document.getElementById('lockNotice');
const list = document.getElementById('adminList');
let submissions = [];
let currentFilter = 'pending';

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(v){try{if(v&&v.toDate)return v.toDate().toLocaleString();if(v)return new Date(v).toLocaleString();}catch(e){}return 'No date';}
function getFb(){return window.UB_FIREBASE || null;}
async function waitForFb(){
  let fb = getFb();
  if(fb && fb.app) return fb;
  return new Promise(resolve=>{
    window.addEventListener('ub-firebase-ready',()=>resolve(getFb()),{once:true});
    setTimeout(()=>resolve(getFb()),2500);
  });
}
function unlocked(){return localStorage.getItem('ub_radio_admin_unlocked')==='yes';}
function showAdmin(){lockScreen.classList.add('hidden');adminApp.classList.remove('hidden');loadSubmissions();}
function lock(){localStorage.removeItem('ub_radio_admin_unlocked');location.reload();}

document.getElementById('unlockBtn').onclick=()=>{
  const code=document.getElementById('adminCode').value.trim();
  if(code===ADMIN_CODE){localStorage.setItem('ub_radio_admin_unlocked','yes');showAdmin();}
  else{lockNotice.textContent='Wrong admin code.';lockNotice.style.color='#ff7474';}
};
document.getElementById('lockBtn').onclick=lock;
if(unlocked()) showAdmin();

async function ensureAuth(){
  const fb = await waitForFb();
  if(!fb || !fb.app) throw new Error('Firebase not ready');
  const auth = fb.auth || getAuth(fb.app);
  let user = auth.currentUser;

if (!user || user.isAnonymous || ![
  'syncere862@gmail.com',
  'unibeatzproduction@gmail.com'
].includes(user.email)) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  user = result.user;
}

if (![
  'syncere862@gmail.com',
  'unibeatzproduction@gmail.com'
].includes(user.email)) {
  throw new Error('Not an approved radio admin.');
}
  return { fb, auth, db: fb.db || getFirestore(fb.app) };
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
function renderList(){
  const data=filtered();
  if(!data.length){list.innerHTML=`<div class="empty">No ${currentFilter} submissions.</div>`;return;}
  list.innerHTML=data.map(t=>`<article class="track">
    <div><div class="track-title">${esc(t.trackTitle||'Untitled')}</div>
    <div class="track-meta">${esc(t.artistName||'Unknown Artist')} · ${esc(t.genre||'No genre')} · ${fmtDate(t.createdAt)}</div>
    <div><span class="badge ${statusClass(t.status)}">${esc(t.status||'pending')}</span>${t.featured?'<span class="badge approved">featured</span>':''}</div></div>
    <audio class="player" controls src="${esc(t.audioUrl||'')}"></audio>
    <div class="small" style="margin-top:7px"><b>Email:</b> ${esc(t.email||'No email')}<br><b>Producer/Credits:</b> ${esc(t.producerCredits||'Not saved')}<br><b>Rights:</b> ${esc(t.copyrightDeclaration||'No rights note')}<br>${t.artistLink?'<b>Link:</b> <span class="link">'+esc(t.artistLink)+'</span>':''}</div>
    <div class="actions"><button class="btn btn-green btn-small" onclick="radioAdmin.approve('${t.id}')">Approve</button><button class="btn btn-gold btn-small" onclick="radioAdmin.feature('${t.id}')">${t.featured?'Unfeature':'Feature'}</button><button class="btn btn-blue btn-small" onclick="radioAdmin.now('${t.id}')">Set Now Playing</button><button class="btn btn-red btn-small" onclick="radioAdmin.reject('${t.id}')">Reject</button><button class="btn btn-red btn-small" onclick="radioAdmin.remove('${t.id}')">Delete</button></div>
  </article>`).join('');
}
async function loadSubmissions(){
  list.innerHTML='<div class="empty">Loading submissions...</div>';
  try{
    const { db } = await ensureAuth();
    const snap = await getDocs(collection(db,'radio_submissions'));
    submissions=snap.docs.map(d=>({id:d.id,...d.data()}));
    updateStats();renderList();
  }catch(e){console.error(e);list.innerHTML='<div class="empty">Could not load submissions. Check Firebase rules/index or make sure unibeatz-notifications initializes Firebase.</div>';}
}
async function updateSubmission(id,patch){
  const { db } = await ensureAuth();
  await updateDoc(doc(db,'radio_submissions',id),{...patch,reviewedAt:serverTimestamp()});
  await loadSubmissions();
}
async function approve(id){await updateSubmission(id,{status:'approved',featured:false});}
async function reject(id){await updateSubmission(id,{status:'rejected',featured:false});}
async function feature(id){const t=submissions.find(x=>x.id===id);await updateSubmission(id,{status:'approved',featured:!t?.featured});}
async function remove(id){if(!confirm('Delete this radio submission?'))return;const { db } = await ensureAuth();await deleteDoc(doc(db,'radio_submissions',id));await loadSubmissions();}
async function setNow(id){
  const t=submissions.find(x=>x.id===id); if(!t)return;
  const { db } = await ensureAuth();
  await setDoc(doc(db,'radio_station','main'),{nowPlayingId:id,trackTitle:t.trackTitle||'',artistName:t.artistName||'',genre:t.genre||'',audioUrl:t.audioUrl||'',featured:!!t.featured,updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Now Playing updated.';
}

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;renderList();});
document.getElementById('reloadBtn').onclick=loadSubmissions;
document.getElementById('saveStationBtn').onclick=async()=>{
  const { db } = await ensureAuth();
  await setDoc(doc(db,'radio_station','main'),{title:document.getElementById('stationTitle').value.trim()||'Empire Rotation',message:document.getElementById('stationMessage').value.trim(),dj:document.getElementById('stationDj').value.trim()||'UniBeatz Radio',updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Station saved.';
};
document.getElementById('clearNowBtn').onclick=async()=>{
  const { db } = await ensureAuth();
  await setDoc(doc(db,'radio_station','main'),{nowPlayingId:'',trackTitle:'',artistName:'',genre:'',audioUrl:'',updatedAt:serverTimestamp()},{merge:true});
  document.getElementById('stationNotice').textContent='Now Playing cleared.';
};
window.radioAdmin={approve,reject,feature,remove,now:setNow,reload:loadSubmissions};
