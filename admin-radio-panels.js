// admin-radio-panels.js — UniBeatz Radio Admin
// Merged: admin-radio-workflow.js + admin-radio-workflow-panel.js + admin-radio-automation.js
// Handles: DJ workflow uploader, radio asset management, queue builder, auto-rotation rules

import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

const ADMIN_EMAILS = ['syncere862@gmail.com', 'unibeatzproduction@gmail.com'];
const auth    = getAuth();
const db      = getFirestore();
const storage = getStorage();

let radioAssets = [];
let queueItems  = [];
let panelsBuilt = false;

function isAdmin(){ return ADMIN_EMAILS.includes(String(auth.currentUser?.email || '').toLowerCase()); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function note(msg, color = '#40D0FF'){
  const box = document.getElementById('adminPanelsNotice') || document.getElementById('stationNotice');
  if(box){ box.textContent = msg; box.style.color = color; }
}

function getLaneLabel(lane){ return lane === 'open_format' ? 'DJ 2: Open Format / Shows' : 'DJ 1: Culture / Streets'; }
function getTypeLabel(type){
  if(type === 'podcast')      return 'Podcast';
  if(type === 'voiceover')    return 'Voiceover';
  if(type === 'station_drop') return 'Station Drop';
  if(type === 'dj_set')       return 'DJ Set';
  return 'Radio Asset';
}

function buildPanels(){
  if(panelsBuilt) return;
  const adminApp = document.getElementById('adminApp');
  if(!adminApp) return;
  panelsBuilt = true;

  adminApp.insertAdjacentHTML('beforeend', `
    <!-- ── DJ Workflow Upload Panel ── -->
    <section class="panel" id="radioWorkflowPanel" style="margin-top:16px">
      <h2>DJ Workflow · Upload Radio Assets</h2>
      <p class="small">Upload podcasts, voiceovers, station drops, and DJ sets. Two lanes keep culture and general content clean.</p>
      <div class="grid" style="grid-template-columns:320px 1fr;margin-top:14px">
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">Upload Asset</h2>
          <div class="form">
            <label class="small">DJ Lane</label>
            <select id="radioDjLane" class="input">
              <option value="culture">DJ 1: Culture / Streets</option>
              <option value="open_format">DJ 2: Open Format / Shows</option>
            </select>
            <label class="small">Asset Type</label>
            <select id="radioAssetType" class="input">
              <option value="voiceover">Voiceover</option>
              <option value="station_drop">Station Drop</option>
              <option value="podcast">Podcast</option>
              <option value="dj_set">DJ Set</option>
            </select>
            <label class="small">Genre</label>
            <select id="radioAssetGenre" class="input">
              <option>Hip-Hop</option><option>Boom Bap</option><option>Trap</option><option>Drill</option><option>R&B</option><option>Afrobeats</option><option>Freestyle Sessions</option><option>Producer Showcase</option><option>Country</option><option>Lo-Fi</option><option>Podcast</option><option>Instrumentals</option><option>Live DJ Sets</option><option>General Station</option>
            </select>
            <label class="small">Title</label>
            <input id="radioAssetTitle" class="input" placeholder="Station Drop — Built From Pressure"/>
            <label class="small">Audio File</label>
            <input id="radioAssetFile" class="input" type="file" accept="audio/*"/>
            <button id="uploadRadioAsset"  class="btn btn-gold" type="button">Upload Asset</button>
            <button id="refreshRadioAssets" class="btn btn-blue" type="button">Refresh List</button>
            <div id="adminPanelsNotice" class="notice"></div>
          </div>
        </div>
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">2-DJ Catalog</h2>
          <p class="small"><b>DJ 1 Culture:</b> Hip-Hop, Boom Bap, Trap, Drill, R&B, Afrobeats, Freestyle, Producer Showcase.</p>
          <p class="small"><b>DJ 2 Open Format:</b> Country, Lo-Fi, Podcast, Instrumentals, Live DJ Sets, General Station.</p>
          <div id="radioAssetList" class="track-list" style="margin-top:10px"><div class="empty">Loading...</div></div>
        </div>
      </div>
    </section>

    <!-- ── Auto Queue Builder ── -->
    <section class="panel" id="radioAutomationPanel" style="margin-top:16px">
      <div class="eyebrow">AUTO RADIO PROGRAMMING</div>
      <h2>Queue Builder / Auto Rotation</h2>
      <p class="small">Set insertion rules for voiceovers and drops. Control how often they appear between songs.</p>
      <div class="actions" style="margin-top:10px">
        <button id="refreshAutoQueue" class="btn btn-blue" type="button">Refresh Queue</button>
        <button id="saveAutoQueue"    class="btn btn-gold" type="button">Save Rotation</button>
        <button id="autoRadioOn"      class="btn btn-green" type="button">Auto Radio ON</button>
        <button id="autoRadioOff"     class="btn btn-red"   type="button">Auto Radio OFF</button>
      </div>
      <div id="autoQueueList" class="track-list" style="margin-top:14px"><div class="empty">Click Refresh Queue to load.</div></div>
    </section>

    <!-- ── DJ Tools Link ── -->
    <section class="panel" style="margin-top:16px">
      <div class="eyebrow">ADMIN DJ CONTROL ROOM</div>
      <h2>DJ Deck Tools</h2>
      <p class="small">MIDI equipment, Stream Deck pads, crossfader, queue management, mic toggle, station drops, voiceovers, podcasts, live broadcast mode.</p>
      <div class="actions">
        <a class="btn btn-gold" href="radio-dj-deck.html">Open Admin DJ Deck</a>
        <a class="btn btn-blue" href="radio-dj-apply.html">DJ Application Page</a>
      </div>
    </section>
  `);

  document.getElementById('uploadRadioAsset')?.addEventListener('click',  uploadAsset);
  document.getElementById('refreshRadioAssets')?.addEventListener('click', loadAssets);
  document.getElementById('radioAssetList')?.addEventListener('click',     handleAssetAction);
  document.getElementById('refreshAutoQueue')?.addEventListener('click',   loadAutoQueue);
  document.getElementById('saveAutoQueue')?.addEventListener('click',      saveRotation);
  document.getElementById('autoRadioOn')?.addEventListener('click',        () => setAutoMode(true));
  document.getElementById('autoRadioOff')?.addEventListener('click',       () => setAutoMode(false));

  loadAssets();
}

// ── Upload ──
async function uploadAsset(){
  if(!isAdmin()){ note('Google admin sign-in required.', '#ff7474'); return; }
  const lane  = document.getElementById('radioDjLane').value;
  const type  = document.getElementById('radioAssetType').value;
  const title = document.getElementById('radioAssetTitle').value.trim();
  const genre = document.getElementById('radioAssetGenre').value;
  const file  = document.getElementById('radioAssetFile').files[0];
  if(!title){ note('Add a title first.', '#ff7474'); return; }
  if(!file){  note('Choose an audio file.', '#ff7474'); return; }
  if(file.size > 100 * 1024 * 1024){ note('Max 100MB.', '#ff7474'); return; }
  try{
    note('Uploading...');
    const safeName = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileRef  = ref(storage, 'radio-assets/' + lane + '/' + type + '/' + safeName);
    await uploadBytes(fileRef, file, { contentType: file.type || 'audio/mpeg' });
    const audioUrl = await getDownloadURL(fileRef);
    const maxOrder = radioAssets.filter(a => (a.djLane || 'culture') === lane).reduce((m, a) => Math.max(m, Number(a.sortOrder || 0)), 0);
    await addDoc(collection(db, 'radio_assets'), {
      djLane: lane, djLaneLabel: getLaneLabel(lane), type, title, genre,
      audioUrl, fileName: file.name, fileType: file.type || 'audio/mpeg',
      storagePath: fileRef.fullPath, active: true, sortOrder: maxOrder + 10,
      createdBy: auth.currentUser?.email || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    document.getElementById('radioAssetTitle').value = '';
    document.getElementById('radioAssetFile').value  = '';
    note('Uploaded to ' + getLaneLabel(lane) + '.', '#5dff9e');
    await loadAssets();
  } catch(e){ note('Upload failed: ' + (e.message || e), '#ff7474'); }
}

async function loadAssets(){
  const listEl = document.getElementById('radioAssetList'); if(!listEl) return;
  listEl.innerHTML = '<div class="empty">Loading...</div>';
  try{
    const snap = await getDocs(collection(db, 'radio_assets'));
    radioAssets = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      if((a.djLane || 'culture') !== (b.djLane || 'culture')) return (a.djLane || 'culture').localeCompare(b.djLane || 'culture');
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    });
    if(!radioAssets.length){ listEl.innerHTML = '<div class="empty">No assets yet.</div>'; return; }
    listEl.innerHTML = radioAssets.map(a => `
      <article class="track">
        <div class="track-title">${esc(a.title || 'Untitled')}</div>
        <div class="track-meta">${esc(getLaneLabel(a.djLane || 'culture'))} · ${esc(getTypeLabel(a.type))} · ${esc(a.genre || '')} · Order ${Number(a.sortOrder || 0)}</div>
        <div><span class="badge ${a.active ? 'approved' : 'rejected'}">${a.active ? 'active' : 'inactive'}</span></div>
        <audio class="player" controls preload="metadata" src="${esc(a.audioUrl || '')}"></audio>
        <div class="actions">
          <button class="btn btn-blue btn-small"  data-asset="up"     data-id="${a.id}">↑ Up</button>
          <button class="btn btn-blue btn-small"  data-asset="down"   data-id="${a.id}">↓ Down</button>
          <button class="btn btn-gold btn-small"  data-asset="toggle" data-id="${a.id}">${a.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-red btn-small"   data-asset="delete" data-id="${a.id}">Delete</button>
        </div>
      </article>`).join('');
  } catch(e){ listEl.innerHTML = '<div class="empty">Load failed: ' + esc(e.message) + '</div>'; }
}

async function handleAssetAction(e){
  const btn = e.target.closest('[data-asset]'); if(!btn) return;
  e.preventDefault();
  if(!isAdmin()){ note('Admin sign-in required.', '#ff7474'); return; }
  const action = btn.dataset.asset;
  const id     = btn.dataset.id;
  const idx    = radioAssets.findIndex(a => a.id === id);
  if(idx < 0) return;
  try{
    if(action === 'toggle')  await updateDoc(doc(db, 'radio_assets', id), { active: !radioAssets[idx].active, updatedAt: serverTimestamp() });
    if(action === 'delete'){ if(!confirm('Delete this asset?')) return; await deleteDoc(doc(db, 'radio_assets', id)); }
    if(action === 'up' || action === 'down'){
      const a = radioAssets[idx];
      const laneItems = radioAssets.filter(x => (x.djLane || 'culture') === (a.djLane || 'culture'));
      const li = laneItems.findIndex(x => x.id === id);
      const swap = action === 'up' ? laneItems[li - 1] : laneItems[li + 1];
      if(swap){
        await updateDoc(doc(db, 'radio_assets', a.id),    { sortOrder: Number(swap.sortOrder || 0), updatedAt: serverTimestamp() });
        await updateDoc(doc(db, 'radio_assets', swap.id), { sortOrder: Number(a.sortOrder || 0),    updatedAt: serverTimestamp() });
      }
    }
    note('Updated.', '#5dff9e');
    await loadAssets();
  } catch(e){ note('Update failed: ' + (e.message || e), '#ff7474'); }
}

// ── Auto Queue ──
async function loadAutoQueue(){
  const box = document.getElementById('autoQueueList'); if(!box) return;
  box.innerHTML = '<div class="empty">Loading...</div>';
  try{
    const [tracksSnap, assetsSnap] = await Promise.all([getDocs(collection(db, 'radio_submissions')), getDocs(collection(db, 'radio_assets')).catch(() => ({ docs: [] }))]);
    const tracks = tracksSnap.docs.map(d => ({ id: d.id, docPath: 'radio_submissions', kind: 'track',  ...d.data() })).filter(x => x.status === 'approved');
    const assets = assetsSnap.docs.map(d => ({ id: d.id, docPath: 'radio_assets',      kind: 'asset',  ...d.data() })).filter(x => x.active !== false);
    queueItems = [...tracks, ...assets].sort((a, b) => Number(a.autoOrder || a.sortOrder || 9999) - Number(b.autoOrder || b.sortOrder || 9999));
    if(!queueItems.length){ box.innerHTML = '<div class="empty">No approved tracks or active assets.</div>'; return; }
    box.innerHTML = queueItems.map((x, i) => {
      const r = x.autoRules || {};
      return `<article class="track" data-id="${esc(x.id)}" data-path="${esc(x.docPath)}">
        <div class="track-title">${i+1}. ${esc(x.trackTitle || x.title || 'Untitled')}</div>
        <div class="track-meta">${esc(x.kind === 'track' ? 'Approved Track' : getTypeLabel(x.type))} · ${esc(x.genre || '')} · Order ${Number(x.autoOrder || x.sortOrder || 9999)}</div>
        <div class="form" style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label class="small">Insert every N songs<input class="input" type="number" min="0" max="50" data-rule="insertEverySongs" value="${Number(r.insertEverySongs || 0)}" style="margin-top:4px;padding:6px;"></label>
          <label class="small">Enabled<select class="input" data-rule="enabled" style="margin-top:4px;padding:6px;"><option value="true" ${r.enabled !== false ? 'selected' : ''}>Yes</option><option value="false" ${r.enabled === false ? 'selected' : ''}>No</option></select></label>
        </div>
        <div class="actions">
          <button class="btn btn-blue btn-small" data-queue="up">↑ Up</button>
          <button class="btn btn-blue btn-small" data-queue="down">↓ Down</button>
          <button class="btn btn-gold btn-small" data-queue="save">Save Rules</button>
        </div>
      </article>`;
    }).join('');

    // Wire rule saves
    box.addEventListener('click', async ev => {
      const btn2 = ev.target.closest('[data-queue]'); if(!btn2) return;
      const card = btn2.closest('[data-id]'); if(!card) return;
      const item = queueItems.find(x => x.id === card.dataset.id && x.docPath === card.dataset.path); if(!item) return;
      const action = btn2.dataset.queue;
      if(action === 'save'){
        const enabled = card.querySelector('[data-rule="enabled"]')?.value === 'true';
        const every   = Number(card.querySelector('[data-rule="insertEverySongs"]')?.value || 0);
        try{
          await updateDoc(doc(db, item.docPath, item.id), { autoRules: { enabled, insertEverySongs: every }, updatedAt: serverTimestamp() });
          note('Rules saved.', '#5dff9e');
        } catch(e){ note('Save failed: ' + e.message, '#ff7474'); }
      }
      if(action === 'up' || action === 'down'){
        const idx2 = queueItems.indexOf(item);
        const swap2 = action === 'up' ? queueItems[idx2 - 1] : queueItems[idx2 + 1];
        if(!swap2) return;
        const oldOrder = item.autoOrder || item.sortOrder || (idx2 + 1) * 10;
        const swpOrder = swap2.autoOrder || swap2.sortOrder || ((action === 'up' ? idx2 : idx2 + 2)) * 10;
        try{
          await updateDoc(doc(db, item.docPath,  item.id),  { autoOrder: swpOrder, updatedAt: serverTimestamp() });
          await updateDoc(doc(db, swap2.docPath, swap2.id), { autoOrder: oldOrder, updatedAt: serverTimestamp() });
          await loadAutoQueue();
        } catch(e){ note('Reorder failed: ' + e.message, '#ff7474'); }
      }
    });
  } catch(e){ box.innerHTML = '<div class="empty">Failed: ' + esc(e.message) + '</div>'; }
}

async function saveRotation(){
  if(!isAdmin()){ note('Admin sign-in required.', '#ff7474'); return; }
  try{
    await setDoc(doc(db, 'radio_automation', 'main'), {
      autoEnabled: true, liveOverride: false, updatedAt: serverTimestamp(),
      items: queueItems.map((x, i) => ({ id: x.id, docPath: x.docPath, title: x.trackTitle || x.title || '', kind: x.kind, type: x.type || 'track', genre: x.genre || '', audioUrl: x.audioUrl || '', autoOrder: i * 10, autoRules: x.autoRules || {} }))
    }, { merge: true });
    note('Auto rotation saved.', '#5dff9e');
  } catch(e){ note('Save failed: ' + (e.message || e), '#ff7474'); }
}

async function setAutoMode(enabled){
  if(!isAdmin()){ note('Admin sign-in required.', '#ff7474'); return; }
  await setDoc(doc(db, 'radio_automation', 'main'), { autoEnabled: enabled, updatedAt: serverTimestamp() }, { merge: true });
  note(enabled ? 'Auto Radio is ON.' : 'Auto Radio is OFF.', '#5dff9e');
}

// ── Boot ──
function boot(){ if(document.getElementById('adminApp')) buildPanels(); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
window.addEventListener('ub-firebase-ready', boot);
