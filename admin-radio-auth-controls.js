import './admin-radio-workflow-panel.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const ADMIN_EMAILS = ['syncere862@gmail.com','unibeatzproduction@gmail.com'];
const auth = getAuth();

function isAdminEmail(email){
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase());
}

function notice(msg, color = '#40D0FF'){
  const box = document.getElementById('stationNotice') || document.getElementById('lockNotice');
  if(box){
    box.textContent = msg;
    box.style.color = color;
  }
}

function cleanAdminNav(){
  document.querySelectorAll('a[href="radio-premium.html"]').forEach(a => a.remove());
}

function buildControls(){
  cleanAdminNav();
  if(document.getElementById('radioAdminGoogleControls')) return;
  const adminApp = document.getElementById('adminApp');
  const hero = adminApp?.querySelector('.hero');
  if(!hero) return;

  const wrap = document.createElement('div');
  wrap.id = 'radioAdminGoogleControls';
  wrap.style.marginTop = '14px';
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  wrap.innerHTML = `
    <button id="radioAdminGoogleSignIn" type="button" class="btn btn-gold">Google Admin Sign In</button>
    <button id="radioAdminGoogleSignOut" type="button" class="btn btn-blue">Google Sign Out</button>
    <span id="radioAdminGoogleStatus" class="badge">Checking Google...</span>
  `;

  hero.appendChild(wrap);

  document.getElementById('radioAdminGoogleSignIn').addEventListener('click', signInAdmin);
  document.getElementById('radioAdminGoogleSignOut').addEventListener('click', signOutAdmin);
}

async function signInAdmin(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  notice('Opening Google account picker...');
  try{
    await signInWithPopup(auth, provider);
  }catch(error){
    if(error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request'){
      await signInWithRedirect(auth, provider);
      return;
    }
    notice('Google sign-in failed: ' + (error?.message || error), '#ff7474');
  }
}

async function signOutAdmin(){
  notice('Signing out of Google admin...');
  try{
    await signOut(auth);
    const list = document.getElementById('adminList');
    if(list) list.innerHTML = '<div class="empty">Signed out. Tap Google Admin Sign In and choose the correct admin account.</div>';
    notice('Signed out. You can now switch Google accounts.', '#40D0FF');
  }catch(error){
    notice('Sign out failed: ' + (error?.message || error), '#ff7474');
  }
}

function updateControls(user){
  buildControls();
  const status = document.getElementById('radioAdminGoogleStatus');
  const signInBtn = document.getElementById('radioAdminGoogleSignIn');
  const signOutBtn = document.getElementById('radioAdminGoogleSignOut');
  if(!status || !signInBtn || !signOutBtn) return;

  if(user?.email && isAdminEmail(user.email)){
    status.textContent = 'Signed in: ' + user.email;
    status.style.color = '#5dff9e';
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-flex';
  }else if(user?.email){
    status.textContent = 'Wrong account: ' + user.email;
    status.style.color = '#ff7474';
    signInBtn.style.display = 'inline-flex';
    signOutBtn.style.display = 'inline-flex';
    notice('Wrong Google account. Sign out, then sign in with admin email.', '#ff7474');
  }else{
    status.textContent = 'Not signed in';
    status.style.color = '#40D0FF';
    signInBtn.style.display = 'inline-flex';
    signOutBtn.style.display = 'none';
  }
}

window.radioAdminGoogleSignIn = signInAdmin;
window.radioAdminGoogleSignOut = signOutAdmin;

function boot(){
  cleanAdminNav();
  buildControls();
  updateControls(auth.currentUser);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

onAuthStateChanged(auth, updateControls);
window.addEventListener('ub-firebase-ready', boot);
