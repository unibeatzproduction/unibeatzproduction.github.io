import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const ADMIN_EMAILS = ['syncere862@gmail.com','unibeatzproduction@gmail.com'];
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();
let radioAssets = [];
let built = false;

function isAdmin(){
  const email = auth.currentUser?.email || '';
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function note(msg,color='#40D0FF'){
  const box=document.getElementById('radioWorkflowNotice')||document.getElementById('stationNotice');
  if(box){box.textContent=msg;box.style.color=color;}
}
function getTypeLabel(type){
  if(type==='podcast') return 'Podcast';
  if(type==='voiceover') return 'Voiceover';
  if(type==='station_drop') return 'Station Drop';
  if(type==='dj_set') return 'DJ Set';
  return 'Radio Asset';
}
function buildPanel(){
  if(built) return;
  const app=document.getElementById('adminApp');
  if(!app) return;
  app.insertAdjacentHTML('beforeend', `
    <section class="panel" id="radioWorkflowPanel" style="margin-top:16px">
      <h2>DJ Workflow / Upload Panel</h2>
      <p class="small">Upload podcasts, voiceovers, station drops, and DJ set files. Use the move buttons to build the station order.</p>
      <div class="grid" style="grid-template-columns:360px 1fr;margin-top:14px">
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">Upload Radio Asset</h2>
          <div class="form">
            <label class="small">Asset Type</label>
            <select id="radioAssetType" class="input">
              <option value="voiceover">Voiceover</option>
              <option value="station_drop">Station Drop</option>
              <option value="podcast">Podcast</option>
              <option value="dj_set">DJ Set</option>
            </select>
            <label class="small">Title</label>
            <input id="radioAssetTitle" class="input" placeholder="Example: Built From Pressure Radio Drop" />
            <label class="small">Genre / Show</label>
            <input id="radioAssetGenre" class="input" placeholder="Example: Hip-Hop, Podcast, Empire Rotation" />
            <label class="small">Audio File</label>
            <input id="radioAssetFile" class="input" type="file" accept="audio/*" />
            <button id="uploadRadioAsset" class="btn btn-gold" type="button">Upload To Radio Workflow</button>
            <button id="refreshRadioAssets" class="btn btn-blue" type="button">Refresh Workflow</button>
            <div id="radioWorkflowNotice" class="notice"></div>
          </div>
        </div>
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">DJ Rotation Order</h2>
          <p class="small">Active assets can be used for station drops, podcast episodes, transitions, and DJ equipment workflow later.</p>
          <div id="radioAssetList" class="track-list" style="margin-top:10px"><div class="empty">Loading radio workflow assets...</div></div>
        </div>
      </div>
    </section>
  `);
  document.getElementById('uploadRadioAsset').addEventListener('click', uploadAsset);
  document.getElementById('refreshRadioAssets').addEventListener('click', loadAssets);
  document.getElementById('radioAssetList').addEventListener('click', handleAssetAction);
  built = true;
  loadAssets();
}
async function uploadAsset(){
  if(!isAdmin()){note('Google admin sign-in required before uploading.','#ff7474');return;}
  const type=document.getElementById('radioAssetType').value;
  const title=document.getElementById('radioAssetTitle').value.trim();
  const genre=document.getElementById('radioAssetGenre').value.trim();
  const file=document.getElementById('radioAssetFile').files[0];
  if(!title){note('Add a title first.','#ff7474');return;}
  if(!file){note('Choose an audio file first.','#ff7474');return;}
  if(file.size > 100 * 1024 * 1024){note('File too large. Keep radio assets under 100MB for now.','#ff7474');return;}
  try{
    note('Uploading radio asset...');
    const safeName=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_')}`;
    const fileRef=ref(storage, `radio-assets/${type}/${safeName}`);
    await uploadBytes(fileRef,file,{contentType:file.type||'audio/mpeg'});
    const audioUrl=await getDownloadURL(fileRef);
    const maxOrder=radioAssets.reduce((m,a)=>Math.max(m,Number(a.sortOrder||0)),0);
    await addDoc(collection(db,'radio_assets'),{
      type,
      title,
      genre,
      audioUrl,
      fileName:file.name,
      fileType:file.type||'audio/mpeg',
      storagePath:fileRef.fullPath,
      active:true,
      sortOrder:maxOrder+10,
      createdBy:auth.currentUser?.email||'',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    document.getElementById('radioAssetTitle').value='';
    document.getElementById('radioAssetGenre').value='';
    document.getElementById('radioAssetFile').value='';
    note('Uploaded to DJ workflow.','#5dff9e');
    await loadAssets();
  }catch(error){
    console.error(error);
    note('Upload failed: '+(error.message||error),'#ff7474');
  }
}
async function loadAssets(){
  const list=document.getElementById('radioAssetList');
  if(!list) return;
  list.innerHTML='<div class="empty">Loading radio workflow assets...</div>';
  try{
    const snap=await getDocs(collection(db,'radio_assets'));
    radioAssets=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
    renderAssets();
  }catch(error){
    console.error(error);
    list.innerHTML='<div class="empty">Could not load radio assets: '+esc(error.message||error)+'</div>';
  }
}
function renderAssets(){
  const list=document.getElementById('radioAssetList');
  if(!list) return;
  if(!radioAssets.length){list.innerHTML='<div class="empty">No podcasts, voiceovers, station drops, or DJ sets uploaded yet.</div>';return;}
  list.innerHTML=radioAssets.map((a,i)=>`
    <article class="track">
      <div class="track-title">${esc(a.title||'Untitled')}</div>
      <div class="track-meta">${esc(getTypeLabel(a.type))} · ${esc(a.genre||'Radio')} · Order ${Number(a.sortOrder||0)}</div>
      <div><span class="badge ${a.active?'approved':'rejected'}">${a.active?'active':'inactive'}</span></div>
      <audio class="player" controls preload="metadata" src="${esc(a.audioUrl||'')}"></audio>
      <div class="actions">
        <button class="btn btn-blue btn-small" data-asset-action="up" data-id="${a.id}">Move Up</button>
        <button class="btn btn-blue btn-small" data-asset-action="down" data-id="${a.id}">Move Down</button>
        <button class="btn btn-gold btn-small" data-asset-action="toggle" data-id="${a.id}">${a.active?'Deactivate':'Activate'}</button>
        <button class="btn btn-red btn-small" data-asset-action="delete" data-id="${a.id}">Delete</button>
      </div>
    </article>
  `).join('');
}
async function handleAssetAction(e){
  const btn=e.target.closest('[data-asset-action]');
  if(!btn) return;
  e.preventDefault();
  if(!isAdmin()){note('Google admin sign-in required.','#ff7474');return;}
  const action=btn.dataset.assetAction;
  const id=btn.dataset.id;
  const index=radioAssets.findIndex(a=>a.id===id);
  if(index<0) return;
  try{
    if(action==='toggle'){
      const a=radioAssets[index];
      await updateDoc(doc(db,'radio_assets',id),{active:!a.active,updatedAt:serverTimestamp()});
    }
    if(action==='delete'){
      if(!confirm('Delete this radio workflow asset?')) return;
      await deleteDoc(doc(db,'radio_assets',id));
    }
    if(action==='up' && index>0){
      const a=radioAssets[index], b=radioAssets[index-1];
      await updateDoc(doc(db,'radio_assets',a.id),{sortOrder:Number(b.sortOrder||0),updatedAt:serverTimestamp()});
      await updateDoc(doc(db,'radio_assets',b.id),{sortOrder:Number(a.sortOrder||0),updatedAt:serverTimestamp()});
    }
    if(action==='down' && index<radioAssets.length-1){
      const a=radioAssets[index], b=radioAssets[index+1];
      await updateDoc(doc(db,'radio_assets',a.id),{sortOrder:Number(b.sortOrder||0),updatedAt:serverTimestamp()});
      await updateDoc(doc(db,'radio_assets',b.id),{sortOrder:Number(a.sortOrder||0),updatedAt:serverTimestamp()});
    }
    note('DJ workflow updated.','#5dff9e');
    await loadAssets();
  }catch(error){
    console.error(error);
    note('Workflow update failed: '+(error.message||error),'#ff7474');
  }
}

function boot(){
  if(document.getElementById('adminApp')) buildPanel();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();
window.addEventListener('ub-firebase-ready',boot);
