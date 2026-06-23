// unibeatz-auth.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, updateProfile, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
const FIREBASE_CONFIG={apiKey:"AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",authDomain:"unibeatzproduction-7ae31.firebaseapp.com",projectId:"unibeatzproduction-7ae31",storageBucket:"unibeatzproduction-7ae31.firebasestorage.app",messagingSenderId:"70667820609",appId:"1:70667820609:web:57762df5510e6b4000b0c0"};
const ADMIN_EMAIL="unibeatzproduction@gmail.com";
const app=getApps().length?getApp():initializeApp(FIREBASE_CONFIG);
const auth=getAuth(app);
const db=getFirestore(app);
const googleProvider=new GoogleAuthProvider();
googleProvider.setCustomParameters({prompt:"select_account"});
const persistenceReady=setPersistence(auth,browserLocalPersistence).catch(()=>{});
let currentProfile=null,currentUser=null;
function safeUsername(user){const base=user.displayName||(user.email||"user").split("@")[0]||"user";return base.toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"")||"user";}
async function ensureProfile(user,extra={}){
  if(!user)return null;
  const ref=doc(db,"users",user.uid);
  const snap=await getDoc(ref);
  const existing=snap.exists()?snap.data():{};
  const profile={uid:user.uid,email:user.email||"",displayName:extra.displayName||existing.displayName||user.displayName||safeUsername(user),username:existing.username||extra.username||safeUsername(user),photoURL:user.photoURL||existing.photoURL||"",role:user.email===ADMIN_EMAIL?"admin":(existing.role||"customer"),isAdmin:user.email===ADMIN_EMAIL,updatedAt:serverTimestamp(),createdAt:existing.createdAt||serverTimestamp(),lastLoginAt:serverTimestamp()};
  await setDoc(ref,profile,{merge:true});
  currentProfile={...existing,...profile};
  localStorage.setItem("ub_unified_user",JSON.stringify({uid:user.uid,email:user.email||"",displayName:currentProfile.displayName,username:currentProfile.username,role:currentProfile.role,isAdmin:currentProfile.isAdmin}));
  window.dispatchEvent(new CustomEvent("ub-auth-ready",{detail:{user,profile:currentProfile}}));
  return currentProfile;
}
function showAccountModal(mode="login"){
  if(document.getElementById("ub-auth-modal"))document.getElementById("ub-auth-modal").remove();
  const modal=document.createElement("div");modal.id="ub-auth-modal";
  modal.innerHTML=`<style>#ub-auth-modal{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:18px;font-family:sans-serif;color:#fff}#ub-auth-modal .ub-card{width:min(430px,100%);background:#0d0d18;border:1px solid rgba(201,168,76,.45);border-radius:18px;padding:24px}#ub-auth-modal h2{font-size:22px;color:#F0C040;margin:0 0 12px}#ub-auth-modal input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;padding:12px;font-size:15px;outline:none;margin:6px 0}#ub-auth-modal .ub-btn{width:100%;border:0;border-radius:10px;padding:13px;font-weight:900;cursor:pointer;margin-top:10px;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#050505}#ub-auth-modal .ub-google{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}#ub-auth-modal .ub-x{float:right;background:transparent;border:0;color:#aaa;font-size:24px;cursor:pointer}#ub-auth-modal .ub-status{margin-top:10px;font-size:13px;color:#ff8092}</style>
  <div class="ub-card"><button class="ub-x" id="ub-auth-close">×</button><h2>${mode==="signup"?"Create Account":"Sign In"}</h2>
  ${mode==="signup"?`<input id="ub-auth-name" placeholder="Your name">`:""}
  <input id="ub-auth-email" type="email" placeholder="Email">
  <input id="ub-auth-pass" type="password" placeholder="Password">
  <button class="ub-btn" id="ub-auth-submit">${mode==="signup"?"Create Account":"Log In"}</button>
  <button class="ub-btn ub-google" id="ub-auth-google">Continue with Google</button>
  <div class="ub-status" id="ub-auth-status"></div></div>`;
  document.body.appendChild(modal);
  document.getElementById("ub-auth-close").onclick=()=>modal.remove();
  modal.onclick=e=>{if(e.target===modal)modal.remove();};
  const status=document.getElementById("ub-auth-status");
  document.getElementById("ub-auth-submit").onclick=async()=>{
    try{
      await persistenceReady;
      const email=document.getElementById("ub-auth-email").value.trim();
      const pass=document.getElementById("ub-auth-pass").value;
      if(!email||!pass){status.textContent="Enter email and password.";return;}
      if(mode==="signup"){const name=document.getElementById("ub-auth-name")?.value.trim()||"";const cred=await createUserWithEmailAndPassword(auth,email,pass);if(name)await updateProfile(cred.user,{displayName:name});await ensureProfile(cred.user,{displayName:name});}
      else{const cred=await signInWithEmailAndPassword(auth,email,pass);await ensureProfile(cred.user);}
      modal.remove();
    }catch(err){status.textContent=err.message||"Failed.";}
  };
  document.getElementById("ub-auth-google").onclick=async()=>{
    try{await persistenceReady;const cred=await signInWithPopup(auth,googleProvider);await ensureProfile(cred.user);modal.remove();}
    catch(err){status.textContent=err.message||"Google sign-in failed.";}
  };
}
function mountAccountButton(){
  if(document.getElementById("ub-auth-float"))return;
  const btn=document.createElement("button");btn.id="ub-auth-float";
  btn.style.cssText="position:fixed;top:12px;right:108px;z-index:999996;height:36px;border-radius:999px;border:1px solid rgba(201,168,76,.7);background:#10101c;color:#fff;font-size:15px;cursor:pointer;padding:0 10px;font-weight:900;";
  btn.textContent="👤 Account";
  btn.onclick=()=>showAccountModal(currentUser?"account":"login");
  document.body.appendChild(btn);
}
onAuthStateChanged(auth,async user=>{
  await persistenceReady;currentUser=user;
  if(user)await ensureProfile(user);
  else{currentProfile=null;localStorage.removeItem("ub_unified_user");window.dispatchEvent(new CustomEvent("ub-auth-ready",{detail:{user:null,profile:null}}));}
  mountAccountButton();
});
window.UniBeatzAuth={app,auth,db,getUser:()=>currentUser,getProfile:()=>currentProfile,showLogin:()=>showAccountModal("login"),showSignup:()=>showAccountModal("signup"),showAccount:()=>showAccountModal("account"),signOut:()=>signOut(auth),ensureProfile};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountAccountButton);
else mountAccountButton();
