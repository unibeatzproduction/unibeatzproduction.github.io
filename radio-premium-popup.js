import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const STRIPE_RADIO_PREMIUM_URL = 'https://buy.stripe.com/4gMeV6gHM4WO0LObls93y0w';
const DISMISS_KEY = 'ub_radio_premium_popup_dismissed_until';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const auth = getAuth();
const db = getFirestore();

function dismissed(){
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() < until;
}
function dismiss(){
  localStorage.setItem(DISMISS_KEY, String(Date.now() + SEVEN_DAYS));
  closePopup();
}
function closePopup(){
  document.getElementById('radioPremiumPopup')?.classList.remove('open');
}
function openPopup(){
  buildPopup();
  document.getElementById('radioPremiumPopup')?.classList.add('open');
}
function buildPopup(){
  if(document.getElementById('radioPremiumPopup')) return;
  const style = document.createElement('style');
  style.id = 'radioPremiumPopupCss';
  style.textContent = `
    #radioPremiumPopup{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.78);backdrop-filter:blur(6px)}
    #radioPremiumPopup.open{display:flex}
    .radio-premium-card{max-width:520px;width:100%;border:1px solid rgba(201,168,76,.38);border-radius:18px;background:linear-gradient(145deg,rgba(4,6,12,.98),rgba(0,0,0,.94));box-shadow:0 24px 70px rgba(0,0,0,.65);padding:22px;color:#F0EDE8;font-family:Rajdhani,sans-serif;position:relative}
    .radio-premium-card h2{font-family:'Bebas Neue',sans-serif;font-size:3rem;letter-spacing:2px;line-height:.9;color:#F0C040;margin:8px 0 10px}
    .radio-premium-card p{color:#cbd3e4;line-height:1.45;font-size:1rem}
    .radio-premium-eyebrow{font-family:Orbitron,sans-serif;font-size:.55rem;letter-spacing:3px;color:#40D0FF;text-transform:uppercase}
    .radio-premium-price{font-family:'Bebas Neue',sans-serif;font-size:2.7rem;color:#F0C040;margin-top:12px}
    .radio-premium-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .radio-premium-actions button{border:0;border-radius:10px;padding:13px 12px;font-family:Orbitron,sans-serif;font-size:.58rem;letter-spacing:1.7px;text-transform:uppercase;font-weight:900;cursor:pointer}
    #joinRadioPremium{background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#05050a}
    #laterRadioPremium{background:rgba(0,170,255,.10);border:1px solid #00AAFF;color:#40D0FF}
    #closeRadioPremium{position:absolute;right:12px;top:10px;background:transparent;border:0;color:#cbd3e4;font-size:1.4rem;cursor:pointer}
    @media(max-width:520px){.radio-premium-actions{grid-template-columns:1fr}.radio-premium-card h2{font-size:2.45rem}}
  `;
  document.head.appendChild(style);
  const wrap = document.createElement('div');
  wrap.id = 'radioPremiumPopup';
  wrap.innerHTML = `
    <div class="radio-premium-card" role="dialog" aria-modal="true" aria-label="Uni Radio Premium">
      <button id="closeRadioPremium" type="button" aria-label="Close">×</button>
      <div class="radio-premium-eyebrow">Uni Radio Premium</div>
      <h2>Upgrade To Uni Radio Premium</h2>
      <p>For only $9.99/month, unlock premium DJ sets, subscriber-only broadcasts, exclusive events, priority artist opportunities, and help support independent radio growth.</p>
      <div class="radio-premium-price">$9.99 <span style="font-size:1rem;color:#cbd3e4;font-family:Orbitron,sans-serif">/ month</span></div>
      <div class="radio-premium-actions">
        <button id="joinRadioPremium" type="button">Join Premium</button>
        <button id="laterRadioPremium" type="button">Maybe Later</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  document.getElementById('joinRadioPremium').addEventListener('click',()=>{ location.href = STRIPE_RADIO_PREMIUM_URL; });
  document.getElementById('laterRadioPremium').addEventListener('click',dismiss);
  document.getElementById('closeRadioPremium').addEventListener('click',dismiss);
  wrap.addEventListener('click',(e)=>{ if(e.target === wrap) dismiss(); });
}

async function isPremiumUser(user){
  if(!user || user.isAnonymous) return false;
  const email = String(user.email || '').toLowerCase();

  try{
    const userSnap = await getDoc(doc(db,'users',user.uid));
    const data = userSnap.exists() ? userSnap.data() : {};
    if(data.radioPremiumActive === true || data.premium === true || data.subscriptionStatus === 'active' || data.radioPremiumStatus === 'active') return true;
  }catch(e){ console.warn('[radio premium] users check skipped', e); }

  try{
    const subSnap = await getDoc(doc(db,'radio_premium_subscribers',user.uid));
    const data = subSnap.exists() ? subSnap.data() : {};
    if(data.active === true || data.status === 'active') return true;
  }catch(e){ console.warn('[radio premium] uid subscriber check skipped', e); }

  if(email){
    try{
      const q = query(collection(db,'radio_premium_subscribers'), where('email','==',email), where('status','==','active'));
      const snap = await getDocs(q);
      if(!snap.empty) return true;
    }catch(e){ console.warn('[radio premium] email subscriber check skipped', e); }
  }

  return false;
}

async function maybeShowPremium(user){
  if(!user || user.isAnonymous) return;
  if(dismissed()) return;
  const premium = await isPremiumUser(user);
  if(!premium) setTimeout(openPopup, 900);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPopup);
else buildPopup();

onAuthStateChanged(auth, maybeShowPremium);
window.addEventListener('ub-auth-ready', (e)=> maybeShowPremium(e.detail?.user));
