// unibeatz-notifications.js
// Shared UniBeatz loader: Google/Firebase account bridge + notifications + admin broadcast.
// Pages already include this file, so this safely activates unified auth everywhere this loader is present.

import "/unibeatz-auth.js";

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

function mountFloatingReminder() {
  removeFloatingReminder();
}

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
      if (!silent) showMiniToast("✅ UniBeatz notifications are on.");
    }
    return token;
  } catch (err) {
    console.error("[UniBeatz Push] Registration error:", err);
    if (!silent) showMiniToast("Notification setup error: " + err.message, 8000);
    return null;
  }
}

function showPrompt() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return requestPermissionAndRegister({ silent: false });
  if (Notification.permission === "denied") {
    showMiniToast("Notifications are blocked. Open browser site settings and allow notifications for this site.", 8000);
    return;
  }
  if (document.getElementById("ub-notif-banner")) return;
  const banner = document.createElement("div");
  banner.id = "ub-notif-banner";
  banner.innerHTML = `<style>#ub-notif-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:999998;width:min(460px,calc(100% - 30px));background:linear-gradient(135deg,#0d0d18,#101b2e);color:#fff;border:1px solid rgba(201,168,76,.7);box-shadow:0 18px 55px rgba(0,0,0,.65),0 0 28px rgba(0,170,255,.18);border-radius:16px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.ub-btns{display:flex;gap:8px;margin-top:12px}#ub-notif-banner button{border:0;border-radius:9px;padding:9px 12px;font-weight:800;font-size:12px;cursor:pointer}.ub-yes{flex:1;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#070707}.ub-no{background:rgba(255,255,255,.08);color:#fff}</style><div style="font-weight:900;margin-bottom:4px">🔔 Turn on UniBeatzProduction updates</div><div style="font-size:13px;opacity:.8;line-height:1.35">Get beat drops, UniPack alerts, merch launches, and battle notifications.</div><div class="ub-btns"><button class="ub-no" id="ub-notif-later">Later</button><button class="ub-yes" id="ub-notif-yes">Turn On</button></div>`;
  document.body.appendChild(banner);
  document.getElementById("ub-notif-later").onclick = () => banner.remove();
  document.getElementById("ub-notif-yes").onclick = async () => { await requestPermissionAndRegister({ silent: false }); banner.remove(); };
}

function showInAppToast(data) {
  const toast = document.createElement("div");
  toast.innerHTML = `<style>.ub-toast{position:fixed;top:20px;right:20px;z-index:999999;background:#0d0d18;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.6),0 0 0 1px rgba(201,168,76,.45);max-width:390px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer}.ub-toast-header{padding:14px 16px 8px}.ub-toast-brand{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#C9A84C;font-weight:800}.ub-toast-title{padding:0 16px 6px;font-weight:800;font-size:16px}.ub-toast-top,.ub-toast-bot{padding:0 16px 10px;font-size:13px;opacity:.86;line-height:1.4}.ub-toast-bot{padding-top:10px;padding-bottom:14px}.ub-toast-img{width:100%;max-height:220px;object-fit:cover;display:block}</style><div class="ub-toast" onclick="this.remove()"><div class="ub-toast-header"><span class="ub-toast-brand">● UniBeatz</span></div><div class="ub-toast-title">${escapeHtml(data.title || "Notification")}</div>${data.topText ? `<div class="ub-toast-top">${escapeHtml(data.topText)}</div>` : ""}${data.image ? `<img class="ub-toast-img" src="${escapeAttr(data.image)}" alt="">` : ""}${data.bottomText ? `<div class="ub-toast-bot">${escapeHtml(data.bottomText)}</div>` : ""}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
}

if (messaging) {
  onMessage(messaging, payload => showInAppToast(payload.data || payload.notification || {}));
}

function mountAdminComposer() {
  if (document.getElementById("ub-admin-fab")) return;
  const fab = document.createElement("div");
  fab.id = "ub-admin-fab";
  fab.innerHTML = `<style>#ub-admin-fab{position:fixed;bottom:24px;right:24px;z-index:999997;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}#ub-admin-fab-btn{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#ff3366,#ff6b3d);color:#fff;border:0;cursor:pointer;box-shadow:0 10px 30px rgba(255,51,102,.5);display:flex;align-items:center;justify-content:center;font-size:24px}#ub-admin-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);z-index:999999;display:none;align-items:center;justify-content:center;padding:20px}#ub-admin-modal.open{display:flex}#ub-admin-modal .ub-card{background:#0d0d18;color:#fff;border-radius:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.7);padding:28px}#ub-admin-modal h2{margin:0 0 4px;font-size:22px;font-weight:900;color:#F0C040}#ub-admin-modal .ub-sub{font-size:13px;opacity:.65;margin-bottom:20px}#ub-admin-modal label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;margin-bottom:6px;opacity:.75}#ub-admin-modal input[type='text'],#ub-admin-modal textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;padding:12px 14px;font-size:14px;font-family:inherit;margin-bottom:16px}#ub-admin-modal textarea{resize:vertical;min-height:60px}.ub-image-zone{border:2px dashed rgba(255,255,255,.15);border-radius:12px;padding:24px;text-align:center;cursor:pointer;margin-bottom:16px;overflow:hidden}.ub-image-zone.has-image{padding:0}.ub-image-zone img{width:100%;max-height:210px;object-fit:cover;display:block}.ub-btns{display:flex;gap:10px;margin-top:8px}.ub-send{flex:1;padding:14px;border:0;border-radius:10px;cursor:pointer;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#050505;font-weight:900}.ub-cancel{padding:14px 20px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:transparent;color:#fff;cursor:pointer;font-weight:700}.ub-status{margin-top:14px;font-size:13px;padding:10px 14px;border-radius:8px;display:none}.ub-status.ok{display:block;background:rgba(0,200,100,.15);color:#4ade80}.ub-status.err{display:block;background:rgba(255,50,80,.15);color:#ff6b85}</style><button id="ub-admin-fab-btn" title="Send Broadcast">📢</button><div id="ub-admin-modal"><div class="ub-card"><h2>Broadcast Notification</h2><div class="ub-sub">Sends to all registered UniBeatz devices.</div><label>Title</label><input type="text" id="ub-comp-title" maxlength="80" placeholder="🔥 New Drop Live"><label>Top Passage</label><textarea id="ub-comp-top" maxlength="220"></textarea><label>Image optional</label><div class="ub-image-zone" id="ub-image-zone"><input type="file" id="ub-comp-image" accept="image/*" style="display:none"><div>📷 Click to add image</div></div><label>Bottom Passage</label><textarea id="ub-comp-bottom" maxlength="220"></textarea><label>Link URL</label><input type="text" id="ub-comp-url" value="/"><div class="ub-btns"><button class="ub-cancel" id="ub-comp-cancel">Cancel</button><button class="ub-send" id="ub-comp-send">Send to Everyone</button></div><div class="ub-status" id="ub-comp-status"></div></div></div>`;
  document.body.appendChild(fab);
  const modal = document.getElementById("ub-admin-modal");
  const imageZone = document.getElementById("ub-image-zone");
  const imageInput = document.getElementById("ub-comp-image");
  const statusEl = document.getElementById("ub-comp-status");
  const sendBtn = document.getElementById("ub-comp-send");
  let uploadedImageUrl = "";
  document.getElementById("ub-admin-fab-btn").onclick = () => modal.classList.add("open");
  document.getElementById("ub-comp-cancel").onclick = () => modal.classList.remove("open");
  modal.onclick = e => { if (e.target === modal) modal.classList.remove("open"); };
  imageZone.onclick = () => imageInput.click();
  imageInput.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ref = storageRef(storage, `notifications/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
      await uploadBytes(ref, file);
      uploadedImageUrl = await getDownloadURL(ref);
      imageZone.classList.add("has-image");
      imageZone.innerHTML = `<img src="${escapeAttr(uploadedImageUrl)}" alt="">`;
    } catch (err) {
      statusEl.className = "ub-status err";
      statusEl.textContent = "Image upload failed: " + err.message;
    }
  };
  sendBtn.onclick = async () => {
    const title = document.getElementById("ub-comp-title").value.trim();
    if (!title) { statusEl.className = "ub-status err"; statusEl.textContent = "Title is required"; return; }
    sendBtn.disabled = true; sendBtn.textContent = "Sending...";
    try {
      await addDoc(collection(db, "notifications"), {
        title,
        topText: document.getElementById("ub-comp-top").value.trim(),
        bottomText: document.getElementById("ub-comp-bottom").value.trim(),
        image: uploadedImageUrl || "",
        url: document.getElementById("ub-comp-url").value.trim() || "/",
        sentBy: auth.currentUser?.email || ADMIN_EMAIL,
        createdAt: serverTimestamp(),
        status: "pending"
      });
      statusEl.className = "ub-status ok";
      statusEl.textContent = "✓ Broadcast queued.";
      sendBtn.textContent = "Sent ✓";
      setTimeout(() => modal.classList.remove("open"), 1300);
    } catch (err) {
      statusEl.className = "ub-status err";
      statusEl.textContent = "Send failed: " + err.message;
      sendBtn.disabled = false; sendBtn.textContent = "Send to Everyone";
    }
  };
}

async function loadHistory(containerId = "ub-notif-history") {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(50)));
    if (snap.empty) { container.innerHTML = '<p style="opacity:.6">No announcements yet.</p>'; return; }
    container.innerHTML = snap.docs.map(d => {
      const n = d.data();
      const date = n.createdAt?.toDate?.()?.toLocaleString() || "";
      return `<article style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px;margin-bottom:14px"><div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">${date}</div><h3 style="margin:0 0 8px;font-size:18px">${escapeHtml(n.title || "")}</h3>${n.topText ? `<p style="margin:0 0 10px;opacity:.8">${escapeHtml(n.topText)}</p>` : ""}${n.image ? `<img src="${escapeAttr(n.image)}" style="width:100%;max-height:240px;object-fit:cover;border-radius:10px;margin:8px 0">` : ""}${n.bottomText ? `<p style="margin:10px 0 0;opacity:.8">${escapeHtml(n.bottomText)}</p>` : ""}</article>`;
    }).join("");
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:#ff6b85">Could not load history.</p>';
  }
}

function wireAuth() {
  const handler = async user => {
    if (user?.email === ADMIN_EMAIL) mountAdminComposer();
    if (user && Notification.permission === "granted" && messaging) await requestPermissionAndRegister({ silent: true });
  };
  if (window.UB_FIREBASE?.auth && window.UB_FIREBASE?.onAuthStateChanged) {
    window.UB_FIREBASE.onAuthStateChanged(window.UB_FIREBASE.auth, handler);
    console.log("[UniBeatz Push] Using page Firebase auth");
  } else {
    onAuthStateChanged(auth, handler);
    console.log("[UniBeatz Push] Using shared Firebase auth");
  }
}

if (window.UB_FIREBASE?.ready) wireAuth();
else {
  window.addEventListener("ub-firebase-ready", wireAuth, { once: true });
  setTimeout(wireAuth, 2000);
}

function bootPush() {
  removeFloatingReminder();
  if (Notification.permission === "granted") requestPermissionAndRegister({ silent: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(bootPush, 700));
else setTimeout(bootPush, 700);

window.UniBeatzPush = {
  loadHistory,
  requestPermission: requestPermissionAndRegister,
  showPrompt,
  forcePrompt: showPrompt,
  showTestToast: (data = {}) => showInAppToast({ title: "UniBeatz Test", topText: "Notification display is working.", ...data }),
  token: () => registeredToken
};
