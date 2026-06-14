import './admin-radio-automation.js';
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
function getLaneLabel(lane){
  return lane === 'open_format' ? 'DJ 2: Open Format / Shows' : 'DJ 1: Culture / Streets';
}
function buildPanel(){
  if(built) return;
  const app=document.getElementById('adminApp');
  if(!app) return;
  app.insertAdjacentHTML('beforeend', `
    <section class="panel" id="radioWorkflowPanel" style="margin-top:16px">
      <h2>DJ Workflow / Upload Panel</h2>
      <p class="small">Upload podcasts, voiceovers, station drops, and DJ set files into the correct DJ lane. This keeps the culture drops separate while still only needing 2 DJs.</p>
      <div class="grid" style="grid-template-columns:360px 1fr;margin-top:14px">
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">Upload Radio Asset</h2>
          <div class="form">
            <label class="small">DJ Lane</label>
            <select id="radioDjLane" class="input">
              <option value="culture">DJ 1: Culture / Streets — Hip-Hop, Boom Bap, Trap, Drill, R&B, Afrobeats</option>
              <option value="open_format">DJ 2: Open Format / Shows — Country, Lo-Fi, Podcast, Instrumentals, Live DJ Sets</option>
            </select>
            <label class="small">Asset Type</label>
            <select id="radioAssetType" class="input">
              <option value="voiceover">Voiceover</option>
              <option value="station_drop">Station Drop</option>
              <option value="podcast">Podcast</option>
              <option value="dj_set">DJ Set</option>
            </select>
            <label class="small">Genre / Show Catalog</label>
            <select id="radioAssetGenre" class="input">
              <option>Hip-Hop</option><option>Boom Bap</option><option>Trap</option><option>Drill</option><option>R&B</option><option>Afrobeats</option><option>Freestyle Sessions</option><option>Producer Showcase</option>
              <option>Country</option><option>Lo-Fi</option><option>Podcast</option><option>Instrumentals</option><option>Live DJ Sets</option><option>General Station</option>
            </select>
            <label class="small">Title</label>
            <input id="radioAssetTitle" class="input" placeholder="Example: Built From Pressure Hip-Hop Drop" />
            <label class="small">Audio File</label>
            <input id="radioAssetFile" class="input" type="file" accept="audio/*" />
            <button id="uploadRadioAsset" class="btn btn-gold" type="button">Upload To Radio Workflow</button>
            <button id="refreshRadioAssets" class="btn btn-blue" type="button">Refresh Workflow</button>
            <div id="radioWorkflowNotice" class="notice"></div>
          </div>
        </div>
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">2-DJ Catalog Split</h2>
          <p class="small"><b>DJ 1 Culture/Streets:</b> Hip-Hop, Boom Bap, Trap, Drill, R&B, Afrobeats, Freestyle, Producer Showcase.</p>
          <p class="small"><b>DJ 2 Open Format/Shows:</b> Country, Lo-Fi, Podcast, Instrumentals, Live DJ Sets, General Station.</p>
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
  const lane=document.getElementById('radioDjLane').value;
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
    const fileRef=ref(storage, `radio-assets/${lane}/${type}/${safeName}`);
    await uploadBytes(fileRef,file,{contentType:file.type||'audio/mpeg'});
    const audioUrl=await getDownloadURL(fileRef);
    const maxOrder=radioAssets.filter(a=>(a.djLane||'culture')===lane).reduce((m,a)=>Math.max(m,Number(a.sortOrder||0)),0);
    await addDoc(collection(db,'radio_assets'),{
      djLane: lane,
      djLaneLabel: getLaneLabel(lane),
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
    document.getElementById('radioAssetFile').value='';
    note('Uploaded to '+getLaneLabel(lane)+'.','#5dff9e');
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
    radioAssets=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const laneA=(a.djLane||'culture'); const laneB=(b.djLane||'culture');
      if(laneA!==laneB) return laneA.localeCompare(laneB);
      return Number(a.sortOrder||0)-Number(b.sortOrder||0);
    });
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
  list.innerHTML=radioAssets.map((a)=>`
    <article class="track">
      <div class="track-title">${esc(a.title||'Untitled')}</div>
      <div class="track-meta">${esc(getLaneLabel(a.djLane||'culture'))} · ${esc(getTypeLabel(a.type))} · ${esc(a.genre||'Radio')} · Order ${Number(a.sortOrder||0)}</div>
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
    if((action==='up' || action==='down')){
      const a=radioAssets[index];
      const laneAssets=radioAssets.filter(x=>(x.djLane||'culture')===(a.djLane||'culture'));
      const laneIndex=laneAssets.findIndex(x=>x.id===id);
      const swap=action==='up'?laneAssets[laneIndex-1]:laneAssets[laneIndex+1];
      if(swap){
        await updateDoc(doc(db,'radio_assets',a.id),{sortOrder:Number(swap.sortOrder||0),updatedAt:serverTimestamp()});
        await updateDoc(doc(db,'radio_assets',swap.id),{sortOrder:Number(a.sortOrder||0),updatedAt:serverTimestamp()});
      }
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
