// unibeatz-notifications.js
// Shared UniBeatz loader: account bridge + search + notification center + admin broadcast.

import "/unibeatz-auth.js";
import "/unibeatz-search.js";
import "/unipack-stems.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
};

const VAPID_KEY = "BBFJmA6QKx8YgG2BvP8OVuU1JYxIbu0_fAGy1_weagUVBFR1fNt7bfCwsg_j2HwHtWw9TgEQxSKJ_8LBiHk3yt0";
const ADMIN_EMAIL = "unibeatzproduction@gmail.com";
const SW_PATH = "/firebase-messaging-sw.js";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let messaging = null;
let registeredToken = null;

try {
  if (await isSupported()) messaging = getMessaging(app);
} catch (e) {
  console.warn("[UniBeatz Push] Messaging not supported:", e);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return String(s ?? "").replace(/\"/g, "&quot;"); }
function toDate(v) { return v?.toDate?.() || (v ? new Date(v) : null); }
function isRecent(createdAt) {
  const d = toDate(createdAt);
  return !d || Date.now() - d.getTime() <= TWO_WEEKS_MS;
}

function showMiniToast(message, ms = 4500) {
  const old = document.getElementById("ub-mini-toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.id = "ub-mini-toast";
  toast.innerHTML = `<style>#ub-mini-toast{position:fixed;bottom:92px;right:22px;z-index:999999;background:#0d0d18;color:#fff;border:1px solid rgba(201,168,76,.55);box-shadow:0 12px 35px rgba(0,0,0,.55),0 0 18px rgba(0,170,255,.18);border-radius:12px;padding:12px 15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;max-width:310px;line-height:1.35}</style>${escapeHtml(message)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

function removeFloatingReminder() {
  document.getElementById("ub-push-float")?.remove();
}
function mountFloatingReminder() { removeFloatingReminder(); }

async function requestPermissionAndRegister({ silent = false } = {}) {
  if (!messaging || !("Notification" in window)) return null;
  try {
    if (!("serviceWorker" in navigator)) {
      if (!silent) showMiniToast("This browser does not support service worker notifications.");
      return null;
    }
    const swReg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    let permission = Notification.permission;
    if (permission !== "granted") permission = await Notification.requestPermission();
    if (permission !== "granted") {
      if (!silent) showMiniToast("Notifications were not turned on yet.");
      return null;
    }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      registeredToken = token;
      await setDoc(doc(db, "fcm_tokens", token), {
        token,
        uid: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        platform: location.pathname.split("/").pop() || "index",
        userAgent: navigator.userAgent,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });
      removeFloatingReminder();
      updateBellDot();
      if (!silent) showMiniToast("✅ UniBeatz notifications are on.");
    }
    return token;
  } catch (err) {
    console.error("[UniBeatz Push] Registration error:", err);
    if (!silent) showMiniToast("Notification setup error: " + err.message, 8000);
    return null;
  }
}
