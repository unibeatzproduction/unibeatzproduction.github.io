import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const ADMIN_EMAILS = ['syncere862@gmail.com','unibeatzproduction@gmail.com'];
const auth = getAuth();
const db = getFirestore();
let items = [];
let built = false;

function isAdmin(){return ADMIN_EMAILS.includes(String(auth.currentUser?.email || '').toLowerCase());}
function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function note(msg,color='#40D0FF'){const box=document.getElementById('radioAutomationNotice')||document.getElementById('stationNotice'); if(box){box.textContent=msg;box.style.color=color;}}
function labelType(x){
  if(x.kind==='track') return 'Approved Track';
  if(x.type==='voiceover') return 'Voiceover';
  if(x.type==='station_drop') return 'Station Drop';
  if(x.type==='podcast') return 'Podcast';
  if(x.type==='dj_set') return 'DJ Set';
  return 'Radio Asset';
}
function titleOf(x){return x.trackTitle || x.title || 'Untitled';}
function laneOf(x){return x.djLane || (['Country','Lo-Fi','Podcast','Instrumentals','Live DJ Sets'].includes(x.genre) ? 'open_format' : 'culture');}
function laneLabel(lane){return lane==='open_format'?'DJ 2: Open Format / Shows':'DJ 1: Culture / Streets';}
function orderOf(x){return Number(x.autoOrder ?? x.sortOrder ?? 9999);}
function rulesOf(x){return x.autoRules || {};}

function buildPanel(){
  if(built) return;
  const app=document.getElementById('adminApp');
  if(!app) return;
  app.insertAdjacentHTML('beforeend', `
    <section class="panel" id="radioAutomationPanel" style="margin-top:16px">
      <div class="eyebrow">AUTO RADIO PROGRAMMING</div>
      <h2>Queue Builder / Airtime Rules</h2>
      <p class="small">Rearrange approved tracks, voiceovers, drops, podcasts, and DJ sets. Set how long each plays when no DJ is live.</p>
      <div class="actions">
        <button id="refreshAutomationQueue" class="btn btn-blue" type="button">Refresh Queue</button>
        <button id="saveAutomationQueue" class="btn btn-gold" type="button">Save Auto Rotation</button>
        <button id="enableAutoRadio" class="btn btn-green" type="button">Auto Radio ON</button>
        <button id="disableAutoRadio" class="btn btn-red" type="button">Auto Radio OFF</button>
      </div>
      <div id="radioAutomationNotice" class="notice"></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">DJ 1 Culture / Streets</h2>
          <p class="small">Hip-Hop, Boom Bap, Trap, Drill, R&B, Afrobeats, Freestyle, Producer Showcase.</p>
          <div id="cultureAutoQueue" class="track-list" style="margin-top:10px"></div>
        </div>
        <div class="panel" style="box-shadow:none">
          <h2 style="font-size:1.5rem">DJ 2 Open Format / Shows</h2>
          <p class="small">Country, Lo-Fi, Podcast, Instrumentals, Live DJ Sets, General Station.</p>
          <div id="openAutoQueue" class="track-list" style="margin-top:10px"></div>
        </div>
      </div>
    </section>
  `);
  document.getElementById('refreshAutomationQueue').addEventListener('click', loadAutomationQueue);
  document.getElementById('saveAutomationQueue').addEventListener('click', saveRotationDoc);
  document.getElementById('enableAutoRadio').addEventListener('click', ()=>setAutoMode(true));
  document.getElementById('disableAutoRadio').addEventListener('click', ()=>setAutoMode(false));
  document.getElementById('cultureAutoQueue').addEventListener('click', handleQueueAction);
  document.getElementById('openAutoQueue').addEventListener('click', handleQueueAction);
  document.getElementById('cultureAutoQueue').addEventListener('change', handleRuleChange);
  document.getElementById('openAutoQueue').addEventListener('change', handleRuleChange);
  built=true;
  loadAutomationQueue();
}

async function loadAutomationQueue(){
  const c=document.getElementById('cultureAutoQueue'), o=document.getElementById('openAutoQueue');
  if(!c || !o) return;
  c.innerHTML='<div class="empty">Loading...</div>'; o.innerHTML='<div class="empty">Loading...</div>';
  try{
    const [tracksSnap, assetsSnap] = await Promise.all([
      getDocs(collection(db,'radio_submissions')),
      getDocs(collection(db,'radio_assets')).catch(()=>({docs:[]}))
    ]);
    const tracks=tracksSnap.docs.map(d=>({id:d.id, docPath:'radio_submissions', kind:'track', ...d.data()})).filter(x=>x.status==='approved');
    const assets=assetsSnap.docs.map(d=>({id:d.id, docPath:'radio_assets', kind:'asset', ...d.data()})).filter(x=>x.active!==false);
    items=[...tracks,...assets].map((x,i)=>({
      ...x,
      djLane: laneOf(x),
      autoOrder: Number(x.autoOrder ?? x.sortOrder ?? (i+1)*10),
      autoRules: {
        enabled: x.autoRules?.enabled ?? true,
        playSeconds: Number(x.autoRules?.playSeconds ?? defaultPlaySeconds(x)),
        insertEverySongs: Number(x.autoRules?.insertEverySongs ?? defaultEverySongs(x)),
        maxPlaysPerDay: Number(x.autoRules?.maxPlaysPerDay ?? defaultMaxPlays(x)),
        mode: x.autoRules?.mode || defaultMode(x)
      }
    })).sort((a,b)=>{
      if(a.djLane!==b.djLane) return a.djLane.localeCompare(b.djLane);
      return orderOf(a)-orderOf(b);
    });
    renderQueues();
    note('Automation queue loaded.','#5dff9e');
  }catch(e){
    console.error(e);
    c.innerHTML='<div class="empty">Could not load automation queue.</div>'; o.innerHTML='';
    note('Queue load failed: '+(e.message||e),'#ff7474');
  }
}
function defaultMode(x){
  if(x.type==='voiceover' || x.type==='station_drop') return 'between_songs';
  if(x.type==='podcast') return 'scheduled_block';
  return 'normal_rotation';
}
function defaultEverySongs(x){
  if(x.type==='voiceover') return 4;
  if(x.type==='station_drop') return 3;
  if(x.type==='podcast') return 12;
  return 0;
}
function defaultPlaySeconds(x){
  if(x.type==='voiceover' || x.type==='station_drop') return 20;
  if(x.type==='podcast') return 1800;
  if(x.type==='dj_set') return 3600;
  return 210;
}
function defaultMaxPlays(x){
  if(x.type==='voiceover' || x.type==='station_drop') return 48;
  if(x.type==='podcast') return 4;
  return 12;
}
function renderQueues(){
  renderLane('culture',document.getElementById('cultureAutoQueue'));
  renderLane('open_format',document.getElementById('openAutoQueue'));
}
function renderLane(lane, box){
  const laneItems=items.filter(x=>x.djLane===lane).sort((a,b)=>orderOf(a)-orderOf(b));
  if(!laneItems.length){box.innerHTML='<div class="empty">No queue items in this lane yet.</div>';return;}
  box.innerHTML=laneItems.map((x,idx)=>{
    const r=rulesOf(x);
    return `<article class="track" data-id="${esc(x.id)}" data-path="${esc(x.docPath)}">
      <div class="track-title">${idx+1}. ${esc(titleOf(x))}</div>
      <div class="track-meta">${esc(labelType(x))} · ${esc(x.genre || 'Radio')} · ${esc(laneLabel(x.djLane))}</div>
      <div><span class="badge ${r.enabled?'approved':'rejected'}">${r.enabled?'auto on':'auto off'}</span><span class="badge">${esc(r.mode)}</span></div>
      <div class="form" style="margin-top:10px">
        <label class="small">Auto Mode</label>
        <select class="input" data-rule="mode"><option value="normal_rotation" ${r.mode==='normal_rotation'?'selected':''}>Normal Rotation</option><option value="between_songs" ${r.mode==='between_songs'?'selected':''}>Between Songs</option><option value="top_of_hour" ${r.mode==='top_of_hour'?'selected':''}>Top Of Hour</option><option value="scheduled_block" ${r.mode==='scheduled_block'?'selected':''}>Scheduled Block</option></select>
        <div class="two">
          <label class="small">Play Limit Seconds<input class="input" type="number" min="5" max="7200" data-rule="playSeconds" value="${Number(r.playSeconds||0)}"></label>
          <label class="small">Insert Every Songs<input class="input" type="number" min="0" max="50" data-rule="insertEverySongs" value="${Number(r.insertEverySongs||0)}"></label>
        </div>
        <div class="two">
          <label class="small">Max Plays / Day<input class="input" type="number" min="0" max="999" data-rule="maxPlaysPerDay" value="${Number(r.maxPlaysPerDay||0)}"></label>
          <label class="small">Auto Enabled<select class="input" data-rule="enabled"><option value="true" ${r.enabled?'selected':''}>Yes</option><option value="false" ${!r.enabled?'selected':''}>No</option></select></label>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-blue btn-small" data-auto-action="top">Move To Top</button>
        <button class="btn btn-blue btn-small" data-auto-action="up">Move Up</button>
        <button class="btn btn-blue btn-small" data-auto-action="down">Move Down</button>
        <button class="btn btn-gold btn-small" data-auto-action="next">Move To Next Play</button>
        <button class="btn btn-red btn-small" data-auto-action="toggle">${r.enabled?'Disable':'Enable'}</button>
      </div>
    </article>`;
  }).join('');
}
function findItemFromElement(el){
  const card=el.closest('[data-id][data-path]');
  if(!card) return null;
  return items.find(x=>x.id===card.dataset.id && x.docPath===card.dataset.path) || null;
}
async function handleRuleChange(e){
  const input=e.target.closest('[data-rule]');
  if(!input) return;
  const item=findItemFromElement(input);
  if(!item) return;
  const key=input.dataset.rule;
  let val=input.value;
  if(['playSeconds','insertEverySongs','maxPlaysPerDay'].includes(key)) val=Number(val||0);
  if(key==='enabled') val=val==='true';
  item.autoRules={...(item.autoRules||{}),[key]:val};
  try{ await saveItem(item); note('Rule saved.','#5dff9e'); }
  catch(err){ note('Rule save failed: '+(err.message||err),'#ff7474'); }
}
async function handleQueueAction(e){
  const btn=e.target.closest('[data-auto-action]');
  if(!btn) return;
  e.preventDefault();
  if(!isAdmin()){note('Google admin sign-in required.','#ff7474');return;}
  const item=findItemFromElement(btn);
  if(!item) return;
  const action=btn.dataset.autoAction;
  const laneItems=items.filter(x=>x.djLane===item.djLane).sort((a,b)=>orderOf(a)-orderOf(b));
  const idx=laneItems.findIndex(x=>x.id===item.id && x.docPath===item.docPath);
  try{
    if(action==='toggle'){
      item.autoRules={...(item.autoRules||{}), enabled: !item.autoRules.enabled};
      await saveItem(item);
    }
    if(action==='top'){
      item.autoOrder=1;
      await saveItem(item);
      await renumberLane(item.djLane);
    }
    if(action==='next'){
      item.autoOrder=0;
      await saveItem(item);
      await renumberLane(item.djLane);
    }
    if(action==='up' && idx>0){
      const swap=laneItems[idx-1];
      const old=item.autoOrder; item.autoOrder=swap.autoOrder; swap.autoOrder=old;
      await saveItem(item); await saveItem(swap);
    }
    if(action==='down' && idx<laneItems.length-1){
      const swap=laneItems[idx+1];
      const old=item.autoOrder; item.autoOrder=swap.autoOrder; swap.autoOrder=old;
      await saveItem(item); await saveItem(swap);
    }
    await loadAutomationQueue();
    note('Queue updated.','#5dff9e');
  }catch(err){console.error(err);note('Queue update failed: '+(err.message||err),'#ff7474');}
}
async function renumberLane(lane){
  const laneItems=items.filter(x=>x.djLane===lane).sort((a,b)=>orderOf(a)-orderOf(b));
  for(let i=0;i<laneItems.length;i++){
    laneItems[i].autoOrder=(i+1)*10;
    await saveItem(laneItems[i]);
  }
}
async function saveItem(item){
  await updateDoc(doc(db,item.docPath,item.id),{
    djLane:item.djLane,
    autoOrder:Number(item.autoOrder ?? 9999),
    autoRules:item.autoRules || {},
    updatedAt:serverTimestamp()
  });
}
async function saveRotationDoc(){
  if(!isAdmin()){note('Google admin sign-in required.','#ff7474');return;}
  try{
    const culture=items.filter(x=>x.djLane==='culture').sort((a,b)=>orderOf(a)-orderOf(b));
    const open=items.filter(x=>x.djLane==='open_format').sort((a,b)=>orderOf(a)-orderOf(b));
    await setDoc(doc(db,'radio_automation','main'),{
      autoEnabled:true,
      liveOverride:false,
      updatedAt:serverTimestamp(),
      lanes:{
        culture:culture.map(packRotationItem),
        open_format:open.map(packRotationItem)
      }
    },{merge:true});
    note('Auto rotation saved.','#5dff9e');
  }catch(err){note('Save failed: '+(err.message||err),'#ff7474');}
}
function packRotationItem(x){return {id:x.id, docPath:x.docPath, title:titleOf(x), kind:x.kind, type:x.type||'track', genre:x.genre||'', audioUrl:x.audioUrl||'', djLane:x.djLane, autoOrder:orderOf(x), autoRules:x.autoRules||{}};}
async function setAutoMode(enabled){
  if(!isAdmin()){note('Google admin sign-in required.','#ff7474');return;}
  await setDoc(doc(db,'radio_automation','main'),{autoEnabled:enabled, updatedAt:serverTimestamp()},{merge:true});
  note(enabled?'Auto Radio is ON.':'Auto Radio is OFF.','#5dff9e');
}
function boot(){if(document.getElementById('adminApp')) buildPanel();}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
window.addEventListener('ub-firebase-ready',boot);
