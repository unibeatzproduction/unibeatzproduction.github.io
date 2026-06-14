import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig={apiKey:'AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4',authDomain:'unibeatzproduction-7ae31.firebaseapp.com',projectId:'unibeatzproduction-7ae31',storageBucket:'unibeatzproduction-7ae31.firebasestorage.app',messagingSenderId:'70667820609',appId:'1:70667820609:web:57762df5510e6b4000b0c0'};
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
const deckA=document.getElementById('deckA'), deckB=document.getElementById('deckB');
const deckALabel=document.getElementById('deckALabel'), deckBLabel=document.getElementById('deckBLabel');
const qList=document.getElementById('queueList'), pads=document.getElementById('triggerPads'), notice=document.getElementById('deckNotice');
let queue=[], assets=[], micOn=false, live=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function note(m,c='#40D0FF'){notice.textContent=m;notice.style.color=c;}
async function ensure(){if(!auth.currentUser) await signInAnonymously(auth);return auth.currentUser;}
function itemName(x){return x.trackTitle||x.title||'Untitled';}
function itemUrl(x){return x.audioUrl||'';}
function setVolumes(){const v=Number(document.getElementById('crossfader').value);deckA.volume=(100-v)/100;deckB.volume=v/100;}
function loadTo(deck,item){if(!itemUrl(item)){note('This item has no audio URL.','#ff7474');return;} if(deck==='A'){deckA.src=itemUrl(item);deckALabel.textContent='A: '+itemName(item).slice(0,20);}else{deckB.src=itemUrl(item);deckBLabel.textContent='B: '+itemName(item).slice(0,20);} note('Loaded '+itemName(item)+' to Deck '+deck,'#5dff9e');}
async function loadQueue(){qList.innerHTML='<div class="track">Loading queue...</div>';try{const [tracksSnap,assetsSnap]=await Promise.all([getDocs(collection(db,'radio_submissions')),getDocs(collection(db,'radio_assets')).catch(()=>({docs:[]}))]);queue=tracksSnap.docs.map(d=>({id:d.id,kind:'track',...d.data()})).filter(x=>x.status==='approved');assets=assetsSnap.docs.map(d=>({id:d.id,kind:'asset',...d.data()})).filter(x=>x.active!==false);queue=[...queue,...assets].sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));renderQueue();renderPads();}catch(e){console.error(e);qList.innerHTML='<div class="track">Queue failed. Check rules.</div>';}}
function renderQueue(){if(!queue.length){qList.innerHTML='<div class="track">No queue items yet.</div>';return;}qList.innerHTML=queue.map((x,i)=>`<div class="track"><div class="name">${i+1}. ${esc(itemName(x))}</div><div class="desc">${esc(x.artistName||x.genre||x.type||'Radio')}</div><div class="actions"><button class="btn btn-blue" data-load="A" data-i="${i}">Load A</button><button class="btn btn-blue" data-load="B" data-i="${i}">Load B</button><button class="btn btn-gold" data-trigger="${i}">Trigger</button></div></div>`).join('');}
function renderPads(){const triggers=assets.filter(a=>['station_drop','voiceover','podcast','dj_set'].includes(a.type));if(!triggers.length){pads.innerHTML='<div class="track">Upload voiceovers, drops, podcasts, or DJ sets in admin.</div>';return;}pads.innerHTML=triggers.map((x,i)=>`<button class="track" data-pad="${i}" type="button"><div class="name">${esc(x.title||'Drop')}</div><div class="desc">${esc(x.type||'Asset')}</div></button>`).join('');}
qList.addEventListener('click',e=>{const load=e.target.closest('[data-load]');if(load){loadTo(load.dataset.load,queue[Number(load.dataset.i)]);return;}const trig=e.target.closest('[data-trigger]');if(trig){const x=queue[Number(trig.dataset.trigger)];loadTo('B',x);deckB.play();}});
pads.addEventListener('click',e=>{const p=e.target.closest('[data-pad]');if(!p)return;const triggers=assets.filter(a=>['station_drop','voiceover','podcast','dj_set'].includes(a.type));const x=triggers[Number(p.dataset.pad)];loadTo('B',x);deckB.play();});
document.getElementById('crossfader').addEventListener('input',setVolumes);
document.getElementById('playA').onclick=()=>deckA.play();document.getElementById('playB').onclick=()=>deckB.play();document.getElementById('stopA').onclick=()=>{deckA.pause();deckA.currentTime=0};document.getElementById('stopB').onclick=()=>{deckB.pause();deckB.currentTime=0};
document.getElementById('cueA').onclick=()=>{deckA.currentTime=0;deckA.play();};document.getElementById('cueB').onclick=()=>{deckB.currentTime=0;deckB.play();};
document.getElementById('micToggle').onclick=()=>{micOn=!micOn;document.getElementById('micToggle').textContent=micOn?'🎙 Mic On':'🎙 Mic Off';note(micOn?'Mic armed locally. Live mic streaming connects next.':'Mic off.');};
document.getElementById('startBroadcast').onclick=async()=>{await ensure();live=true;document.getElementById('broadcastStatus').textContent='Live Broadcast Mode ON';await setDoc(doc(db,'radio_broadcast','main'),{live:true,micOn,updatedAt:serverTimestamp(),hostUid:auth.currentUser?.uid||''},{merge:true});note('Live Broadcast Mode started.','#5dff9e');};
document.getElementById('endBroadcast').onclick=async()=>{await ensure();live=false;document.getElementById('broadcastStatus').textContent='Offline. Start live mode when ready.';await setDoc(doc(db,'radio_broadcast','main'),{live:false,micOn:false,updatedAt:serverTimestamp()},{merge:true});note('Broadcast ended.','#ff7474');};
document.getElementById('reloadQueue').onclick=loadQueue;
document.getElementById('saveQueue').onclick=async()=>{await ensure();await setDoc(doc(db,'radio_dj_queues','main'),{items:queue.map((x,i)=>({id:x.id,kind:x.kind||'item',title:itemName(x),audioUrl:itemUrl(x),order:i})),updatedAt:serverTimestamp()},{merge:true});note('Broadcast queue saved.','#5dff9e');};
setVolumes();loadQueue();