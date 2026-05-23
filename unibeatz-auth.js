// unibeatz-auth.js
// Unified UniBeatz account bridge.
// One Firebase Auth login across UniBeatzProduction, UniBeatWorld, UniPack, radio, and battle/customer pages.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0",
  measurementId: "G-QR5J3KW8T1"
};

const ADMIN_EMAIL = "unibeatzproduction@gmail.com";
const PLATFORM = detectPlatform();

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// This is the important part: one browser-local Firebase session across all pages on the same domain.
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("[UniBeatzAuth] Persistence setup failed:", err);
});

let currentProfile = null;
let currentUser = null;

function detectPlatform() {
  const path = (location.pathname || "").toLowerCase();
  if (path.includes("unipack")) return "unipack";
  if (path.includes("radio")) return "radio";
  if (path.includes("unifreestyle") || path.includes("battle")) return "battle";
  if (path.includes("unibeatzworld")) return "unibeatworld";
  return "unibeatzproduction";
}

function defaultMemberships(email = "") {
  const admin = email.toLowerCase() === ADMIN_EMAIL;
  return {
    unibeatzproduction: admin ? "admin" : "visitor",
    unibeatworld: "free",
    unipack: admin ? "master" : "starter",
    battle: "visitor",
    radio: "listener",
    merch: "customer"
  };
}

function safeUsername(user) {
  const base = user.displayName || (user.email || "user").split("@")[0] || "user";
  return base.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "user";
}

async function ensureProfile(user, extra = {}) {
  if (!user) return null;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  const memberships = {
    ...defaultMemberships(user.email || ""),
    ...(existing.memberships || {}),
    ...(extra.memberships || {})
  };
  const unipackTier = existing.unipackTier || memberships.unipack || (user.email === ADMIN_EMAIL ? "master" : "starter");
  memberships.unipack = unipackTier;
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: extra.displayName || existing.displayName || user.displayName || safeUsername(user),
    username: existing.username || extra.username || safeUsername(user),
    photoURL: user.photoURL || existing.photoURL || "",
    role: user.email === ADMIN_EMAIL ? "admin" : (existing.role || "customer"),
    isAdmin: user.email === ADMIN_EMAIL,
    memberships,
    unipackTier,
    updatedAt: serverTimestamp(),
    createdAt: existing.createdAt || serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
  await setDoc(ref, profile, { merge: true });
  currentProfile = { ...existing, ...profile, memberships };
  localStorage.setItem("ub_unified_user", JSON.stringify({
    uid: user.uid,
    email: user.email || "",
    displayName: currentProfile.displayName,
    username: currentProfile.username,
    photoURL: currentProfile.photoURL,
    role: currentProfile.role,
    isAdmin: currentProfile.isAdmin,
    memberships: currentProfile.memberships,
    unipackTier: currentProfile.unipackTier,
    platform: PLATFORM
  }));
  window.dispatchEvent(new CustomEvent("ub-auth-ready", { detail: { user, profile: currentProfile, platform: PLATFORM } }));
  syncLegacyHomepageFields(user, currentProfile);
  return currentProfile;
}

function platformLabel(key) {
  return ({
    unibeatzproduction: "UniBeatzProduction",
    unibeatworld: "UniBeatWorld",
    unipack: "UniPack",
    battle: "Uni Freestyle Battle",
    radio: "Uni Radio",
    merch: "Merch"
  })[key] || key;
}

function membershipText(profile) {
  const m = profile?.memberships || defaultMemberships(profile?.email || "");
  return Object.entries(m).map(([k, v]) => `${platformLabel(k)}: ${String(v).toUpperCase()}`).join("\n");
}

function escapeHtml(s) { return String(s ?? "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }

function syncLegacyHomepageFields(user, profile) {
  const name = profile?.displayName || profile?.username || user?.displayName || "";
  const email = user?.email || profile?.email || "";
  ["mName", "bName"].forEach(id => { const el = document.getElementById(id); if (el && !el.value && name) el.value = name; });
  ["mEmail", "bEmail"].forEach(id => { const el = document.getElementById(id); if (el && !el.value && email) el.value = email; });
}

function showAccountModal(mode = "login") {
  if (document.getElementById("ub-auth-modal")) document.getElementById("ub-auth-modal").remove();
  const modal = document.createElement("div");
  modal.id = "ub-auth-modal";
  modal.innerHTML = `
    <style>
      #ub-auth-modal{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}
      #ub-auth-modal .ub-card{width:min(430px,100%);background:linear-gradient(135deg,#0d0d18,#070710);border:1px solid rgba(201,168,76,.45);border-radius:18px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,.75),0 0 28px rgba(0,170,255,.12)}
      #ub-auth-modal .ub-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
      #ub-auth-modal h2{font-size:22px;margin:0;background:linear-gradient(135deg,#F0C040,#40D0FF);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
      #ub-auth-modal .ub-x{background:transparent;border:0;color:#aaa;font-size:24px;cursor:pointer}
      #ub-auth-modal .ub-sub{font-size:13px;color:rgba(255,255,255,.65);line-height:1.4;margin-bottom:16px}
      #ub-auth-modal label{display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;color:#C9A84C;margin:10px 0 6px}
      #ub-auth-modal input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;padding:12px;font-size:15px;outline:none}
      #ub-auth-modal input:focus{border-color:#C9A84C}
      #ub-auth-modal .ub-btn{width:100%;border:0;border-radius:10px;padding:13px;font-weight:900;cursor:pointer;margin-top:12px;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#050505;letter-spacing:.6px}
      #ub-auth-modal .ub-google{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}
      #ub-auth-modal .ub-switch{font-size:13px;text-align:center;color:#aaa;margin-top:14px}.ub-switch a{color:#40D0FF;cursor:pointer;font-weight:800}
      #ub-auth-modal .ub-status{display:none;margin-top:12px;border-radius:10px;padding:10px;font-size:13px}.ub-status.err{display:block;background:rgba(255,40,70,.15);color:#ff8092}.ub-status.ok{display:block;background:rgba(0,200,100,.15);color:#4ade80}
      #ub-auth-modal pre{white-space:pre-wrap;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;color:#ddd;font-size:12px;line-height:1.5;margin:12px 0 0}
    </style>
    <div class="ub-card">
      <div class="ub-head"><h2>${mode === "signup" ? "Create UniBeatz Account" : "UniBeatz Account"}</h2><button class="ub-x" id="ub-auth-close">×</button></div>
      <div class="ub-sub">One account signs you into the full empire. Memberships stay separate for UniBeatWorld, UniPack, Battle, Radio, and Merch.</div>
      ${mode === "account" && currentProfile ? `<pre>${escapeHtml(membershipText(currentProfile))}</pre><button class="ub-btn" id="ub-auth-logout">Log Out</button>` : `
        ${mode === "signup" ? `<label>Name</label><input id="ub-auth-name" placeholder="Producer / customer name">` : ""}
        <label>Email</label><input id="ub-auth-email" type="email" placeholder="you@email.com">
        <label>Password</label><input id="ub-auth-pass" type="password" placeholder="At least 6 characters">
        <button class="ub-btn" id="ub-auth-submit">${mode === "signup" ? "Create Account" : "Log In"}</button>
        <button class="ub-btn ub-google" id="ub-auth-google">Continue with Google</button>
        <div class="ub-switch">${mode === "signup" ? "Already have one? <a id='ub-auth-toggle'>Log in</a>" : "Need one account? <a id='ub-auth-toggle'>Create it</a>"}</div>`}
      <div class="ub-status" id="ub-auth-status"></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  document.getElementById("ub-auth-close").onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };
  const status = document.getElementById("ub-auth-status");
  const setStatus = (msg, cls = "err") => { status.textContent = msg; status.className = "ub-status " + cls; };
  const toggle = document.getElementById("ub-auth-toggle");
  if (toggle) toggle.onclick = () => showAccountModal(mode === "signup" ? "login" : "signup");
  const logoutBtn = document.getElementById("ub-auth-logout");
  if (logoutBtn) logoutBtn.onclick = async () => { await signOut(auth); close(); };
  const submit = document.getElementById("ub-auth-submit");
  if (submit) submit.onclick = async () => {
    try {
      await persistenceReady;
      const email = document.getElementById("ub-auth-email").value.trim().toLowerCase();
      const pass = document.getElementById("ub-auth-pass").value;
      if (!email || !pass) return setStatus("Enter email and password.");
      let cred;
      if (mode === "signup") {
        const name = document.getElementById("ub-auth-name").value.trim();
        cred = await createUserWithEmailAndPassword(auth, email, pass);
        if (name) await updateProfile(cred.user, { displayName: name });
        await ensureProfile(cred.user, { displayName: name });
      } else {
        cred = await signInWithEmailAndPassword(auth, email, pass);
        await ensureProfile(cred.user);
      }
      setStatus("Signed in across UniBeatz.", "ok");
      setTimeout(close, 700);
    } catch (err) { setStatus(err.message || "Sign-in failed."); }
  };
  const google = document.getElementById("ub-auth-google");
  if (google) google.onclick = async () => {
    try {
      await persistenceReady;
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureProfile(cred.user);
      setStatus("Signed in with Google.", "ok");
      setTimeout(close, 700);
    } catch (err) { setStatus(err.message || "Google sign-in failed."); }
  };
}

function mountAccountButton() {
  if (document.getElementById("ub-auth-float")) return;
  const btn = document.createElement("button");
  btn.id = "ub-auth-float";
  btn.innerHTML = `
    <style>
      #ub-auth-float{position:fixed;top:12px;right:108px;z-index:999996;min-width:42px;height:36px;border-radius:999px;border:1px solid rgba(201,168,76,.7);background:linear-gradient(135deg,#10101c,#070710);color:#fff;font-size:15px;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.45),0 0 14px rgba(201,168,76,.14);padding:0 10px;font-weight:900;display:flex;align-items:center;gap:6px}
      #ub-auth-float[data-signed='true']{background:linear-gradient(135deg,#C9A84C,#00AAFF);color:#050505}
      #ub-auth-float small{font-size:10px;font-weight:900;max-width:82px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:860px){#ub-auth-float{top:12px;right:62px;min-width:36px;width:36px;padding:0;justify-content:center}#ub-auth-float small{display:none}}
    </style>
    <span>👤</span><small>Account</small>`;
  btn.onclick = () => showAccountModal(currentUser ? "account" : "login");
  document.body.appendChild(btn);
  refreshAccountButton();
}

function refreshAccountButton() {
  const btn = document.getElementById("ub-auth-float");
  if (!btn) return;
  btn.dataset.signed = currentUser ? "true" : "false";
  const small = btn.querySelector("small");
  if (small) small.textContent = currentUser ? (currentProfile?.username || currentUser.email || "Signed In") : "Account";
}

onAuthStateChanged(auth, async user => {
  await persistenceReady;
  currentUser = user;
  if (user) await ensureProfile(user);
  else {
    currentProfile = null;
    localStorage.removeItem("ub_unified_user");
    window.dispatchEvent(new CustomEvent("ub-auth-ready", { detail: { user: null, profile: null, platform: PLATFORM } }));
  }
  mountAccountButton();
  refreshAccountButton();
});

window.UniBeatzAuth = {
  app,
  auth,
  db,
  platform: PLATFORM,
  getUser: () => currentUser,
  getProfile: () => currentProfile,
  getMembership: platform => currentProfile?.memberships?.[platform || PLATFORM] || null,
  showLogin: () => showAccountModal("login"),
  showSignup: () => showAccountModal("signup"),
  showAccount: () => showAccountModal("account"),
  signOut: () => signOut(auth),
  ensureProfile
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAccountButton);
else mountAccountButton();
