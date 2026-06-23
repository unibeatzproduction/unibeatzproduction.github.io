// unibeatz-auth.js — UniBeatz Auth System
// Floating account button removed.

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
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
};

const ADMIN_EMAIL = "unibeatzproduction@gmail.com";

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {});

let currentProfile = null;
let currentUser = null;

function safeUsername(user) {
  const base = user.displayName || (user.email || "user").split("@")[0] || "user";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "user";
}

async function ensureProfile(user, extra = {}) {
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};

  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: extra.displayName || existing.displayName || user.displayName || safeUsername(user),
    username: existing.username || extra.username || safeUsername(user),
    photoURL: user.photoURL || existing.photoURL || "",
    role: user.email === ADMIN_EMAIL ? "admin" : (existing.role || "customer"),
    isAdmin: user.email === ADMIN_EMAIL,
    updatedAt: serverTimestamp(),
    createdAt: existing.createdAt || serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  await setDoc(ref, profile, { merge: true });

  currentProfile = { ...existing, ...profile };

  localStorage.setItem(
    "ub_unified_user",
    JSON.stringify({
      uid: user.uid,
      email: user.email || "",
      displayName: currentProfile.displayName,
      username: currentProfile.username,
      role: currentProfile.role,
      isAdmin: currentProfile.isAdmin
    })
  );

  window.dispatchEvent(
    new CustomEvent("ub-auth-ready", {
      detail: { user, profile: currentProfile }
    })
  );

  return currentProfile;
}

function showAccountModal(mode = "login") {
  const old = document.getElementById("ub-auth-modal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "ub-auth-modal";

  modal.innerHTML = `
    <style>
      #ub-auth-modal{
        position:fixed;
        inset:0;
        z-index:999999;
        background:rgba(0,0,0,.82);
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px;
        font-family:sans-serif;
        color:#fff;
      }
      #ub-auth-modal .ub-card{
        width:min(430px,100%);
        background:#0d0d18;
        border:1px solid rgba(201,168,76,.45);
        border-radius:18px;
        padding:24px;
      }
      #ub-auth-modal h2{
        font-size:22px;
        color:#F0C040;
        margin:0 0 12px;
      }
      #ub-auth-modal input{
        width:100%;
        box-sizing:border-box;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        border-radius:10px;
        color:#fff;
        padding:12px;
        font-size:15px;
        outline:none;
        margin:6px 0;
      }
      #ub-auth-modal .ub-btn{
        width:100%;
        border:0;
        border-radius:10px;
        padding:13px;
        font-weight:900;
        cursor:pointer;
        margin-top:10px;
        background:linear-gradient(135deg,#C9A84C,#F0C040);
        color:#050505;
      }
      #ub-auth-modal .ub-google{
        background:rgba(255,255,255,.08);
        color:#fff;
        border:1px solid rgba(255,255,255,.14);
      }
      #ub-auth-modal .ub-x{
        float:right;
        background:transparent;
        border:0;
        color:#aaa;
        font-size:24px;
        cursor:pointer;
      }
      #ub-auth-modal .ub-status{
        margin-top:10px;
        font-size:13px;
        color:#ff8092;
      }
    </style>

    <div class="ub-card">
      <button class="ub-x" id="ub-auth-close">×</button>
      <h2>${mode === "signup" ? "Create Account" : mode === "account" ? "Account" : "Sign In"}</h2>

      ${
        mode === "account" && currentUser
          ? `
            <p style="color:#ccc;margin:8px 0 12px;">Signed in as:</p>
            <p style="color:#F0C040;font-weight:900;margin-bottom:14px;">${currentUser.email || currentProfile?.displayName || "User"}</p>
            <button class="ub-btn" id="ub-auth-logout">Sign Out</button>
          `
          : `
            ${mode === "signup" ? `<input id="ub-auth-name" placeholder="Your name">` : ""}
            <input id="ub-auth-email" type="email" placeholder="Email">
            <input id="ub-auth-pass" type="password" placeholder="Password">
            <button class="ub-btn" id="ub-auth-submit">${mode === "signup" ? "Create Account" : "Log In"}</button>
            <button class="ub-btn ub-google" id="ub-auth-google">Continue with Google</button>
            <div style="margin-top:12px;font-size:13px;color:#ccc;text-align:center;">
              ${
                mode === "signup"
                  ? `<button id="ub-switch-login" style="background:none;border:0;color:#40D0FF;cursor:pointer;">Already have an account? Sign in</button>`
                  : `<button id="ub-switch-signup" style="background:none;border:0;color:#40D0FF;cursor:pointer;">Create an account</button>`
              }
            </div>
          `
      }

      <div class="ub-status" id="ub-auth-status"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = document.getElementById("ub-auth-close");
  const status = document.getElementById("ub-auth-status");

  closeBtn.onclick = () => modal.remove();
  modal.onclick = e => {
    if (e.target === modal) modal.remove();
  };

  const logoutBtn = document.getElementById("ub-auth-logout");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await signOut(auth);
      modal.remove();
    };
    return;
  }

  const submitBtn = document.getElementById("ub-auth-submit");
  if (submitBtn) {
    submitBtn.onclick = async () => {
      try {
        await persistenceReady;

        const email = document.getElementById("ub-auth-email").value.trim();
        const pass = document.getElementById("ub-auth-pass").value;

        if (!email || !pass) {
          status.textContent = "Enter email and password.";
          return;
        }

        if (mode === "signup") {
          const name = document.getElementById("ub-auth-name")?.value.trim() || "";
          const cred = await createUserWithEmailAndPassword(auth, email, pass);

          if (name) await updateProfile(cred.user, { displayName: name });

          await ensureProfile(cred.user, { displayName: name });
        } else {
          const cred = await signInWithEmailAndPassword(auth, email, pass);
          await ensureProfile(cred.user);
        }

        modal.remove();
      } catch (err) {
        status.textContent = err.message || "Failed.";
      }
    };
  }

  const googleBtn = document.getElementById("ub-auth-google");
  if (googleBtn) {
    googleBtn.onclick = async () => {
      try {
        await persistenceReady;
        const cred = await signInWithPopup(auth, googleProvider);
        await ensureProfile(cred.user);
        modal.remove();
      } catch (err) {
        status.textContent = err.message || "Google sign-in failed.";
      }
    };
  }

  const switchSignup = document.getElementById("ub-switch-signup");
  if (switchSignup) {
    switchSignup.onclick = () => showAccountModal("signup");
  }

  const switchLogin = document.getElementById("ub-switch-login");
  if (switchLogin) {
    switchLogin.onclick = () => showAccountModal("login");
  }
}

// Removed automatic floating account button.
function mountAccountButton() {
  const float = document.getElementById("ub-auth-float");
  if (float) float.remove();

  const oldAccountBtn = document.getElementById("accountBtn");
  if (oldAccountBtn) oldAccountBtn.remove();

  const pill = document.querySelector(".account-pill");
  if (pill) pill.remove();
}

onAuthStateChanged(auth, async user => {
  await persistenceReady;

  currentUser = user;

  if (user) {
    await ensureProfile(user);
  } else {
    currentProfile = null;
    localStorage.removeItem("ub_unified_user");

    window.dispatchEvent(
      new CustomEvent("ub-auth-ready", {
        detail: { user: null, profile: null }
      })
    );
  }

  mountAccountButton();
});

window.UniBeatzAuth = {
  app,
  auth,
  db,
  getUser: () => currentUser,
  getProfile: () => currentProfile,
  showLogin: () => showAccountModal("login"),
  showSignup: () => showAccountModal("signup"),
  showAccount: () => showAccountModal("account"),
  signOut: () => signOut(auth),
  ensureProfile
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAccountButton);
} else {
  mountAccountButton();
}
