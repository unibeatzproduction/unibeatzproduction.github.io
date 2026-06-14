import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, addDoc, setDoc, doc, serverTimestamp, onSnapshot, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const auth = getAuth();
const db = getFirestore();
let listenerId = localStorage.getItem('ub_radio_listener_id');
if(!listenerId){listenerId='listener_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);localStorage.setItem('ub_radio_listener_id',listenerId);}
let currentTrackId = '';
let currentTrackTitle = '';
let built = false;

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function ensureUser(){if(!auth.currentUser) await signInAnonymously(auth);return auth.currentUser;}
function currentTrackFromDom(){
  const title = document.getElementById('nowPlayingTitle')?.textContent || '';
  const cleaned = title.replace(/^Now Playing:\s*/i,'').replace(/^Featured Station:\s*/i,'').trim();
  return cleaned || 'UniBeatz Radio';
}
function build(){
  if(built) return;
  const main = document.querySelector('main.wrap');
  if(!main) return;
  main.insertAdjacentHTML('beforeend', `
    <section class="grid" id="radioLiveFeatureGrid" style="margin-top:18px">
      <article class="panel" id="radioQueuePanel">
        <div class="eyebrow">LIVE STATION</div>
        <h2 class="section-title" style="margin-top:2px">Now Playing Queue</h2>
        <p class="sub">Approved tracks plus active radio assets from admin workflow.</p>
        <div id="radioListenerCount" class="badge" style="margin-top:10px">🎧 0 listeners</div>
        <div id="radioQueueList" class="track-list" style="margin-top:12px"><div class="channel">Loading queue...</div></div>
      </article>
      <article class="panel" id="radioEngagementPanel">
        <div class="eyebrow">LISTENER TOOLS</div>
        <h2 class="section-title" style="margin-top:2px">Radio Reactions</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
          <button id="favoriteTrackBtn" class="btn btn-gold" type="button">❤️ Favorite Track</button>
          <button id="requestReplayBtn" class="btn btn-blue" type="button">🔁 Request Replay</button>
        </div>
        <div id="radioLiveNotice" class="notice"></div>
        <h2 class="section-title" style="font-size:1.5rem">Live Radio Chat</h2>
        <div id="radioChatBox" class="track-list" style="max-height:260px;overflow:auto"><div class="channel">Loading chat...</div></div>
        <div class="form" style="margin-top:10px">
          <input id="radioChatName" class="input" placeholder="Display name" />
          <textarea id="radioChatInput" placeholder="Say something to the station..."></textarea>
          <button id="sendRadioChat" class="btn btn-gold" type="button">Send Chat</button>
        </div>
      </article>
    </section>
  `);
  document.getElementById('favoriteTrackBtn')?.addEventListener('click',favoriteTrack);
  document.getElementById('requestReplayBtn')?.addEventListener('click',requestReplay);
  document.getElementById('sendRadioChat')?.addEventListener('click',sendChat);
  built=true;
  bootLive();
}
function notice(msg,color='#40D0FF'){const box=document.getElementById('radioLiveNotice');if(box){box.textContent=msg;box.style.color=color;}}
async function favoriteTrack(){
  try{
    const user=await ensureUser();
    const title=currentTrackFromDom();
    await setDoc(doc(db,'radio_favorites',`${listenerId}_${title}`.replace(/[^a-zA-Z0-9_\-]/g,'_')),{
      listenerId,uid:user.uid||'',email:user.email||'',trackTitle:title,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    },{merge:true});
    notice('Favorite saved.','#5dff9e');
  }catch(e){console.error(e);notice('Favorite failed: '+(e.message||e),'#ff7474');}
}
async function requestReplay(){
  try{
    const user=await ensureUser();
    const title=currentTrackFromDom();
    await addDoc(collection(db,'radio_replay_requests'),{
      listenerId,uid:user.uid||'',email:user.email||'',trackTitle:title,status:'requested',createdAt:serverTimestamp()
    });
    notice('Replay request sent.','#5dff9e');
  }catch(e){console.error(e);notice('Replay request failed: '+(e.message||e),'#ff7474');}
}
async function sendChat(){
  const input=document.getElementById('radioChatInput');
  const nameEl=document.getElementById('radioChatName');
  const message=(input?.value||'').trim();
  const displayName=(nameEl?.value||'Listener').trim().slice(0,40);
  if(!message){notice('Write a chat message first.','#ff7474');return;}
  try{
    const user=await ensureUser();
    await addDoc(collection(db,'radio_chat'),{
      listenerId,uid:user.uid||'',email:user.email||'',displayName,message:message.slice(0,300),createdAt:serverTimestamp()
    });
    input.value='';
    notice('Chat sent.','#5dff9e');
  }catch(e){console.error(e);notice('Chat failed: '+(e.message||e),'#ff7474');}
}
function watchChat(){
  const box=document.getElementById('radioChatBox');
  if(!box) return;
  try{
    const q=query(collection(db,'radio_chat'),orderBy('createdAt','desc'),limit(30));
    onSnapshot(q,(snap)=>{
      const rows=[];
      snap.forEach(d=>rows.push(d.data()));
      if(!rows.length){box.innerHTML='<div class="channel">No chat yet. Be first.</div>';return;}
      box.innerHTML=rows.reverse().map(m=>`<div class="channel"><h4>${esc(m.displayName||'Listener')}</h4><p>${esc(m.message||'')}</p></div>`).join('');
      box.scrollTop=box.scrollHeight;
    },(e)=>{box.innerHTML='<div class="channel">Chat needs Firebase rules/index.</div>';console.warn(e);});
  }catch(e){box.innerHTML='<div class="channel">Chat unavailable.</div>';}
}
function updatePresence(){
  ensureUser().then(user=>setDoc(doc(db,'radio_listeners',listenerId),{
    listenerId,uid:user.uid||'',email:user.email||'',active:true,lastSeen:serverTimestamp(),page:'radio'
  },{merge:true})).catch(console.warn);
}
function watchListenerCount(){
  const label=document.getElementById('radioListenerCount');
  try{
    onSnapshot(collection(db,'radio_listeners'),(snap)=>{
      let count=0;
      const now=Date.now();
      snap.forEach(d=>{
        const data=d.data();
        const ts=data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
        if(data.active && (!ts || now-ts<120000)) count++;
      });
      if(label) label.textContent=`🎧 ${count} listener${count===1?'':'s'} live`;
    },console.warn);
  }catch(e){console.warn(e);}
}
async function loadQueue(){
  const box=document.getElementById('radioQueueList');
  if(!box) return;
  try{
    const approvedQ=query(collection(db,'radio_submissions'),where('status','==','approved'));
    const assetsQ=query(collection(db,'radio_assets'),where('active','==',true));
    const [tracksSnap, assetsSnap]=await Promise.all([getDocs(approvedQ),getDocs(assetsQ).catch(()=>({docs:[]}))]);
    const tracks=tracksSnap.docs.map(d=>({type:'Track',id:d.id,...d.data()}));
    const assets=assetsSnap.docs.map(d=>({type:d.data().type||'Asset',id:d.id,...d.data()}));
    const queue=[...tracks,...assets].sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
    if(!queue.length){box.innerHTML='<div class="channel">No queue items yet.</div>';return;}
    box.innerHTML=queue.slice(0,30).map((item,i)=>`<button class="track" type="button"><div class="name">${i+1}. ${esc(item.trackTitle||item.title||'Untitled')}</div><div class="desc">${esc(item.artistName||item.genre||item.type||'Radio')} · ${esc(item.type||'Track')}</div></button>`).join('');
  }catch(e){console.error(e);box.innerHTML='<div class="channel">Queue needs Firebase rules.</div>';}
}
function bootLive(){
  updatePresence();
  setInterval(updatePresence,30000);
  window.addEventListener('beforeunload',()=>{setDoc(doc(db,'radio_listeners',listenerId),{active:false,lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});});
  watchListenerCount();
  watchChat();
  loadQueue();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',build);
else build();
window.addEventListener('ub-firebase-ready',build);
onAuthStateChanged(auth,()=>{});
