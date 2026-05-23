// unibeatz-notifications.js
// Shared UniBeatz loader: account bridge + search + notification center + admin broadcast.

import "/unibeatz-auth.js";
import "/unibeatz-search.js";

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

function showPrompt() {
  return openNotificationCenter();
}

async function getRecentNotifications() {
  const snap = await getDocs(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(n => isRecent(n.createdAt))
    .slice(0, 50);
}

function notificationCard(n) {
  const date = toDate(n.createdAt);
  const when = date ? date.toLocaleString() : "New";
  const url = n.url || "";
  return `<article class="ub-n-card">
    <div class="ub-n-date">${escapeHtml(when)}</div>
    <h3>${escapeHtml(n.title || "UniBeatz Update")}</h3>
    ${n.topText ? `<p>${escapeHtml(n.topText)}</p>` : ""}
    ${n.image ? `<img src="${escapeAttr(n.image)}" alt="">` : ""}
    ${n.bottomText ? `<p>${escapeHtml(n.bottomText)}</p>` : ""}
    ${url ? `<a class="ub-n-link" href="${escapeAttr(url)}">Open Update</a>` : ""}
  </article>`;
}

async function openNotificationCenter() {
  document.getElementById("ub-notif-center")?.remove();
  const modal = document.createElement("div");
  modal.id = "ub-notif-center";
  modal.innerHTML = `<style>
    #ub-notif-center{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding:82px 16px 18px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    #ub-notif-center .ub-n-panel{width:min(720px,100%);max-height:78vh;overflow:hidden;background:linear-gradient(135deg,#0d0d18,#070710);border:1px solid rgba(201,168,76,.5);border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.78),0 0 25px rgba(0,170,255,.12)}
    #ub-notif-center .ub-n-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px;border-bottom:1px solid rgba(255,255,255,.08)}
    #ub-notif-center h2{margin:0;color:#F0C040;font-size:20px;font-weight:900}.ub-n-sub{font-size:13px;opacity:.7;margin-top:3px;line-height:1.35}
    #ub-n-close{background:transparent;border:0;color:#aaa;font-size:26px;cursor:pointer;padding:0 6px}.ub-n-body{padding:14px;max-height:calc(78vh - 82px);overflow:auto}
    .ub-n-actions{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}.ub-n-btn{border:0;border-radius:10px;padding:10px 13px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#050505}.ub-n-btn.secondary{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}
    .ub-n-card{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);border-radius:14px;padding:14px;margin-bottom:12px}.ub-n-date{font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#40D0FF;opacity:.85;margin-bottom:5px}.ub-n-card h3{margin:0 0 7px;color:#F0C040;font-size:17px}.ub-n-card p{margin:7px 0;color:rgba(255,255,255,.78);font-size:13.5px;line-height:1.4}.ub-n-card img{width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin:9px 0}.ub-n-link{display:inline-block;margin-top:8px;color:#050505;background:#F0C040;text-decoration:none;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:900}.ub-n-empty{padding:22px;text-align:center;color:#aaa;border:1px dashed rgba(255,255,255,.14);border-radius:14px}
  </style>
  <div class="ub-n-panel">
    <div class="ub-n-head"><div><h2>🔔 UniBeatz Notifications</h2><div class="ub-n-sub">Broadcasts stay here for 14 days. Turn on browser alerts for beat drops, UniPack alerts, radio updates, merch, and battles.</div></div><button id="ub-n-close">×</button></div>
    <div class="ub-n-body"><div class="ub-n-actions"><button class="ub-n-btn" id="ub-n-enable">Turn On Notifications</button><button class="ub-n-btn secondary" id="ub-n-refresh">Refresh Broadcasts</button></div><div id="ub-n-list"><div class="ub-n-empty">Loading broadcasts...</div></div></div>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) close(); };
  document.getElementById("ub-n-close").onclick = close;
  document.getElementById("ub-n-enable").onclick = async () => { await requestPermissionAndRegister({ silent: false }); };
  document.getElementById("ub-n-refresh").onclick = renderNotificationList;
  await renderNotificationList();
}

async function renderNotificationList() {
  const list = document.getElementById("ub-n-list");
  if (!list) return;
  list.innerHTML = `<div class="ub-n-empty">Loading broadcasts...</div>`;
  try {
    const items = await getRecentNotifications();
    list.innerHTML = items.length ? items.map(notificationCard).join("") : `<div class="ub-n-empty">No broadcasts from the last 14 days yet.</div>`;
    updateBellDot(items.length);
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="ub-n-empty">Could not load broadcasts right now.</div>`;
  }
}

function updateBellDot(count = null) {
  const bell = findBellButton();
  if (!bell) return;
  let dot = bell.querySelector(".nav-notif-dot");
  if (!dot) {
    dot = document.createElement("div");
    dot.className = "nav-notif-dot";
    bell.appendChild(dot);
  }
  dot.style.display = count === 0 ? "none" : "block";
}

function findBellButton() {
  return [...document.querySelectorAll(".nav-icon-btn, button, [role='button']")].find(el => (el.textContent || "").includes("🔔"));
}

function wireTopBell() {
  const bell = findBellButton();
  if (bell) {
    bell.onclick = openNotificationCenter;
    bell.title = "Open UniBeatz notifications";
  }
}

function showInAppToast(data) {
  const toast = document.createElement("div");
  toast.innerHTML = `<style>.ub-toast{position:fixed;top:20px;right:20px;z-index:999999;background:#0d0d18;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.6),0 0 0 1px rgba(201,168,76,.45);max-width:390px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer}.ub-toast-header{padding:14px 16px 8px}.ub-toast-brand{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#C9A84C;font-weight:800}.ub-toast-title{padding:0 16px 6px;font-weight:800;font-size:16px}.ub-toast-top,.ub-toast-bot{padding:0 16px 10px;font-size:13px;opacity:.86;line-height:1.4}.ub-toast-bot{padding-top:10px;padding-bottom:14px}.ub-toast-img{width:100%;max-height:220px;object-fit:cover;display:block}</style><div class="ub-toast" onclick="this.remove()"><div class="ub-toast-header"><span class="ub-toast-brand">● UniBeatz</span></div><div class="ub-toast-title">${escapeHtml(data.title || "Notification")}</div>${data.topText ? `<div class="ub-toast-top">${escapeHtml(data.topText)}</div>` : ""}${data.image ? `<img class="ub-toast-img" src="${escapeAttr(data.image)}" alt="">` : ""}${data.bottomText ? `<div class="ub-toast-bot">${escapeHtml(data.bottomText)}</div>` : ""}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
}

if (messaging) onMessage(messaging, payload => showInAppToast(payload.data || payload.notification || {}));

function mountAdminComposer() {
  if (document.getElementById("ub-admin-fab")) return;
  const fab = document.createElement("div");
  fab.id = "ub-admin-fab";
  fab.innerHTML = `<style>#ub-admin-fab{position:fixed;bottom:24px;right:24px;z-index:999997;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}#ub-admin-fab-btn{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#ff3366,#ff6b3d);color:#fff;border:0;cursor:pointer;box-shadow:0 10px 30px rgba(255,51,102,.5);display:flex;align-items:center;justify-content:center;font-size:24px}#ub-admin-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);z-index:999999;display:none;align-items:center;justify-content:center;padding:20px}#ub-admin-modal.open{display:flex}#ub-admin-modal .ub-card{background:#0d0d18;color:#fff;border-radius:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.7);padding:28px}#ub-admin-modal h2{margin:0 0 4px;font-size:22px;font-weight:900;color:#F0C040}#ub-admin-modal .ub-sub{font-size:13px;opacity:.65;margin-bottom:20px}#ub-admin-modal label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;margin-bottom:6px;opacity:.75}#ub-admin-modal input[type='text'],#ub-admin-modal textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;padding:12px 14px;font-size:14px;font-family:inherit;margin-bottom:16px}#ub-admin-modal textarea{resize:vertical;min-height:60px}.ub-image-zone{border:2px dashed rgba(255,255,255,.15);border-radius:12px;padding:24px;text-align:center;cursor:pointer;margin-bottom:16px;overflow:hidden}.ub-image-zone.has-image{padding:0}.ub-image-zone img{width:100%;max-height:210px;object-fit:cover;display:block}.ub-btns{display:flex;gap:10px;margin-top:8px}.ub-send{flex:1;padding:14px;border:0;border-radius:10px;cursor:pointer;background:linear-gradient(135deg,#C9A84C,#F0C040);color:#050505;font-weight:900}.ub-cancel{padding:14px 20px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:transparent;color:#fff;cursor:pointer;font-weight:700}.ub-status{margin-top:14px;font-size:13px;padding:10px 14px;border-radius:8px;display:none}.ub-status.ok{display:block;background:rgba(0,200,100,.15);color:#4ade80}.ub-status.err{display:block;background:rgba(255,50,80,.15);color:#ff6b85}</style><button id="ub-admin-fab-btn" title="Send Broadcast">📢</button><div id="ub-admin-modal"><div class="ub-card"><h2>Broadcast Notification</h2><div class="ub-sub">Sends to all registered UniBeatz devices and stays in the notification center for 14 days.</div><label>Title</label><input type="text" id="ub-comp-title" maxlength="80" placeholder="🔥 New Drop Live"><label>Top Passage</label><textarea id="ub-comp-top" maxlength="220"></textarea><label>Image optional</label><div class="ub-image-zone" id="ub-image-zone"><input type="file" id="ub-comp-image" accept="image/*" style="display:none"><div>📷 Click to add image</div></div><label>Bottom Passage</label><textarea id="ub-comp-bottom" maxlength="220"></textarea><label>Link URL</label><input type="text" id="ub-comp-url" value="/"><div class="ub-btns"><button class="ub-cancel" id="ub-comp-cancel">Cancel</button><button class="ub-send" id="ub-comp-send">Send + Save 14 Days</button></div><div class="ub-status" id="ub-comp-status"></div></div></div>`;
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
        status: "pending",
        expiresAfterDays: 14
      });
      statusEl.className = "ub-status ok";
      statusEl.textContent = "✓ Broadcast queued and saved in bell center for 14 days.";
      sendBtn.textContent = "Sent ✓";
      updateBellDot(1);
      setTimeout(() => modal.classList.remove("open"), 1400);
    } catch (err) {
      statusEl.className = "ub-status err";
      statusEl.textContent = "Send failed: " + err.message;
      sendBtn.disabled = false; sendBtn.textContent = "Send + Save 14 Days";
    }
  };
}

async function loadHistory(containerId = "ub-notif-history") {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const items = await getRecentNotifications();
    container.innerHTML = items.length ? items.map(notificationCard).join("") : '<p style="opacity:.6">No broadcasts from the last 14 days.</p>';
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
  wireTopBell();
  if (Notification.permission === "granted") requestPermissionAndRegister({ silent: true });
  getRecentNotifications().then(items => updateBellDot(items.length)).catch(() => {});
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(bootPush, 700));
else setTimeout(bootPush, 700);
setTimeout(wireTopBell, 2000);

window.UniBeatzPush = {
  loadHistory,
  requestPermission: requestPermissionAndRegister,
  showPrompt,
  forcePrompt: openNotificationCenter,
  openCenter: openNotificationCenter,
  showTestToast: (data = {}) => showInAppToast({ title: "UniBeatz Test", topText: "Notification display is working.", ...data }),
  token: () => registeredToken
};
