import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

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

const PREMIUM_URL = '';
let currentUser = null;

function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeKey(s){return String(s||'radio-track').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120) || 'radio_track';}
function player(){return document.getElementById('radioPlayer');}
function titleText(){return (document.getElementById('nowPlayingTitle')?.textContent || 'Radio Track').replace(/^Now Playing:\s*/i,'').trim();}
function trackKey(){
  const src = player()?.currentSrc || player()?.src || titleText();
  return safeKey(src || titleText());
}
function userKey(){return currentUser?.uid || localStorage.getItem('ub_radio_listener_id') || makeListenerId();}
function makeListenerId(){const id='listener_'+Date.now()+'_'+Math.random().toString(16).slice(2);localStorage.setItem('ub_radio_listener_id',id);return id;}
function notice(msg,color='#40D0FF'){
  const badge=document.getElementById('nowPlayingBadge');
  if(badge){badge.textContent=msg;badge.style.color=color;}
}

function injectStyles(){
  if(document.getElementById('radioEnhancementStyles')) return;
  const s=document.createElement('style');
  s.id='radioEnhancementStyles';
  s.textContent=`
    .radio-reactions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}.radio-reactions .count{font-family:Orbitron,sans-serif;font-size:.5rem;letter-spacing:1.4px;color:#cbd3e4}.premium-pop{position:fixed;inset:0;z-index:500;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);padding:16px}.premium-pop.open{display:flex}.premium-card{max-width:520px;width:100%;border:1px solid rgba(201,168,76,.38);border-radius:18px;background:linear-gradient(145deg,#0a0d18,#030305);box-shadow:0 25px 80px rgba(0,0,0,.65);padding:20px;position:relative}.premium-card h2{font-family:Bebas Neue,sans-serif;font-size:3rem;letter-spacing:2px;color:#F0C040;line-height:.9}.premium-close{position:absolute;right:12px;top:10px;background:transparent;border:0;color:#cbd3e4;font-size:1.2rem;cursor:pointer}.premium-card ul{padding-left:18px;margin:12px 0;color:#cbd3e4}.premium-card li{margin:5px 0}.premium-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:520px){.premium-actions .btn{width:100%}}
  `;
  document.head.appendChild(s);
}

function injectReactionButtons(){
  if(document.getElementById('radioReactions')) return;
  const controls=document.querySelector('.uni-player') || document.querySelector('.player');
  if(!controls) return;
  const row=document.createElement('div');
  row.id='radioReactions';
  row.className='radio-reactions';
  row.innerHTML='<button id="radioLikeBtn" type="button" class="btn btn-blue">👍 Like</button><button id="radioDislikeBtn" type="button" class="btn btn-blue">👎 Dislike</button><span id="radioReactionCount" class="count">Likes 0 · Dislikes 0</span>';
  controls.appendChild(row);
  document.getElementById('radioLikeBtn').onclick=()=>saveReaction('like');
  document.getElementById('radioDislikeBtn').onclick=()=>saveReaction('dislike');
  setInterval(loadReactionCount,5000);
}

async function saveReaction(type){
  try{
    const key=trackKey();
    const uid=userKey();
    localStorage.setItem('ub_radio_reaction_'+key,type);
    await setDoc(doc(db,'radio_reactions',key+'_'+uid),{
      trackKey:key,
      trackTitle:titleText(),
      audioUrl:player()?.currentSrc || player()?.src || '',
      uid:currentUser?.uid || null,
      listenerId:uid,
      type,
      updatedAt:serverTimestamp()
    },{merge:true});
    notice(type==='like'?'Thanks for the like.':'Feedback saved.','#5dff9e');
    loadReactionCount();
  }catch(e){
    console.warn('reaction failed',e);
    notice('Reaction saved locally. Firebase rules may need radio_reactions enabled.','#F0C040');
  }
}

async function loadReactionCount(){
  const label=document.getElementById('radioReactionCount');
  if(!label) return;
  const key=trackKey();
  const local=localStorage.getItem('ub_radio_reaction_'+key);
  label.textContent = local ? `Your vote: ${local}` : 'Like or dislike this track';
}

function injectPremiumPopup(){
  if(document.getElementById('radioPremiumPopup')) return;
  const pop=document.createElement('div');
  pop.id='radioPremiumPopup';
  pop.className='premium-pop';
  pop.innerHTML=`<div class="premium-card"><button id="premiumClose" class="premium-close">✕</button><div class="eyebrow">UNI RADIO PREMIUM</div><h2>$9.99 Premium</h2><p class="sub">Unlock premium radio features, priority artist tools, exclusive DJ sets, and subscriber-only station drops.</p><ul><li>Premium DJ sets</li><li>Priority review eligibility</li><li>Exclusive event access</li><li>Premium listener badge path</li></ul><div class="premium-actions"><button id="premiumJoinBtn" class="btn btn-gold">Join Premium</button><button id="premiumLaterBtn" class="btn btn-blue">Maybe Later</button></div></div>`;
  document.body.appendChild(pop);
  document.getElementById('premiumClose').onclick=closePremium;
  document.getElementById('premiumLaterBtn').onclick=closePremium;
  document.getElementById('premiumJoinBtn').onclick=()=>{
    if(PREMIUM_URL) location.href=PREMIUM_URL;
    else location.href='radio-premium.html';
  };
}
function closePremium(){document.getElementById('radioPremiumPopup')?.classList.remove('open');}
function openPremium(){document.getElementById('radioPremiumPopup')?.classList.add('open');}

async function shouldShowPremium(user){
  if(!user || user.isAnonymous) return false;
  const key='ub_radio_premium_seen_'+user.uid;
  if(localStorage.getItem(key)==='yes') return false;
  try{
    const snap=await getDoc(doc(db,'radio_memberships',user.uid));
    if(snap.exists() && snap.data()?.active) return false;
  }catch(e){
    console.warn('premium membership check failed',e);
  }
  localStorage.setItem(key,'yes');
  return true;
}

function boot(){
  injectStyles();
  injectReactionButtons();
  injectPremiumPopup();
  player()?.addEventListener('loadedmetadata',loadReactionCount);
  player()?.addEventListener('play',loadReactionCount);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  boot();
  if(await shouldShowPremium(user)) setTimeout(openPremium,900);
});
