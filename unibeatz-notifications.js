// unibeatz-notifications.js
// UniBeatz real broadcast notification system
// No auth button. No floating account. Firebase-connected.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
};

const ADMIN_EMAIL = "unibeatzproduction@gmail.com";
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Shared styling for the notification list + admin composer, so the bell
// looks right on every page without touching each page's CSS file.
(function injectNotifCss(){
  if(document.getElementById("ubNotifCss")) return;
  const s = document.createElement("style");
  s.id = "ubNotifCss";
  s.textContent = `
    .ub-notifications-panel{position:fixed;top:64px;right:12px;z-index:9998;width:min(360px,92vw);max-height:70vh;overflow-y:auto;border:1px solid rgba(201,168,76,.55);border-radius:12px;background:linear-gradient(135deg,#0d0d18,#050508);color:#F0EDE8;box-shadow:0 0 24px rgba(201,168,76,.22);padding:12px;font-family:Rajdhani,sans-serif;}
    .ub-notifications-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
    .ub-notifications-head button{background:none;border:none;color:#F0EDE8;cursor:pointer;font-size:1rem;}
    .ub-notif-item{border-top:1px solid rgba(201,168,76,.22);padding:10px 2px;}
    .ub-notif-item:first-child{border-top:none;}
    .ub-notif-title{font-weight:700;color:#F0C040;}
    .ub-notif-message{margin-top:4px;white-space:pre-wrap;}
    .ub-notif-image{width:100%;border-radius:8px;margin-top:8px;display:block;}
    .ub-notif-meta{margin-top:6px;font-size:.75rem;color:rgba(240,237,232,.55);}
    .ub-notif-empty{padding:12px;color:rgba(240,237,232,.65);}
    .ub-admin-notif-box{display:flex;flex-direction:column;gap:8px;}
    .ub-admin-notif-box input,.ub-admin-notif-box textarea,.ub-admin-notif-box select{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(201,168,76,.4);background:rgba(0,0,0,.3);color:#F0EDE8;font-family:Rajdhani,sans-serif;}
    .ub-admin-notif-box button{padding:10px 14px;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0C040);color:#030305;font-weight:700;}
    .ub-admin-notif-box small{color:rgba(240,237,232,.6);}
  `;
  document.head.appendChild(s);
})();

const platform =
  document.body?.dataset?.platform ||
  document.querySelector("meta[name='ub-platform']")?.content ||
  "all";

let currentUser = null;
let isAdmin = false;
let lastSeen = Number(localStorage.getItem("ub_notifications_last_seen") || 0);

const state = {
  notifications: [],
  unread: 0
};

function $(id){ return document.getElementById(id); }

function safeText(v){
  return String(v || "").replace(/[<>&"]/g, s => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"
  }[s]));
}

function toast(message){
  const existing = $("ubNotifyToast");
  if(existing) existing.remove();

  const t = document.createElement("div");
  t.id = "ubNotifyToast";
  t.textContent = message;
  t.style.cssText = `
    position:fixed;
    left:50%;
    bottom:88px;
    transform:translateX(-50%);
    z-index:9999;
    max-width:92%;
    padding:12px 16px;
    border:1px solid rgba(201,168,76,.55);
    border-radius:10px;
    background:linear-gradient(135deg,#0d0d18,#050508);
    color:#F0EDE8;
    font-family:Rajdhani,sans-serif;
    box-shadow:0 0 24px rgba(201,168,76,.22);
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3600);
}

function targetMatches(n){
  const t = String(n.target || "all").toLowerCase();
  const p = String(platform || "all").toLowerCase();
  return t === "all" || t === p;
}

function renderBadge(){
  const badge = $("ubNotifBadge") || $("notifBadge") || $("notificationBadge");
  if(!badge) return;

  badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
  badge.style.display = state.unread > 0 ? "inline-flex" : "none";
}

function renderList(){
  const list = $("ubNotificationsList") || $("notificationsList");
  if(!list) return;

  if(!state.notifications.length){
    list.innerHTML = `<div class="ub-notif-empty">No notifications yet.</div>`;
    return;
  }

  list.innerHTML = state.notifications.map(n => {
    const created = n.createdAt?.toDate ? n.createdAt.toDate() : null;
    const time = created ? created.toLocaleString() : "";
    // Image support: paragraph, image, or paragraph + image — same as
    // Eugene's original composer. imageUrl is set by the admin composer.
    const img = n.imageUrl
      ? `<img class="ub-notif-image" src="${safeText(n.imageUrl)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    return `
      <div class="ub-notif-item">
        <div class="ub-notif-title">${safeText(n.title)}</div>
        <div class="ub-notif-message">${safeText(n.message)}</div>
        ${img}
        <div class="ub-notif-meta">${safeText(n.target || "all")} ${time ? "· " + safeText(time) : ""}</div>
      </div>
    `;
  }).join("");
}

function markSeen(){
  lastSeen = Date.now();
  localStorage.setItem("ub_notifications_last_seen", String(lastSeen));
  state.unread = 0;
  renderBadge();
}

function setupOpenButtons(){
  const buttons = [
    $("ubNotificationsBtn"),
    $("notificationsBtn"),
    $("notificationBell")
  ].filter(Boolean);

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = $("ubNotificationsPanel") || $("notificationsPanel");
      if(panel){
        panel.classList.toggle("open");
        panel.style.display = panel.classList.contains("open") ? "block" : "none";
      }
      markSeen();
    });
  });
}

function renderAdminPanel(){
  const adminBox = $("ubNotificationAdmin") || $("adminNotificationsPanel");
  if(!adminBox || !isAdmin) return;

  adminBox.innerHTML = `
    <div class="ub-admin-notif-box">
      <h3>Broadcast Notification</h3>
      <input id="ubAdminNotifTitle" placeholder="Notification title"/>
      <textarea id="ubAdminNotifMessage" placeholder="Message to send"></textarea>
      <input id="ubAdminNotifImageUrl" placeholder="Image URL (optional — paragraph + image)"/>
      <small>Or upload an image (optional):</small>
      <input id="ubAdminNotifImageFile" type="file" accept="image/*"/>
      <select id="ubAdminNotifTarget">
        <option value="all">All Platforms</option>
        <option value="home">Homepage</option>
        <option value="battle">UniFreestyle Battle</option>
        <option value="radio">UniBeatz Radio</option>
        <option value="unipack">UniPack</option>
        <option value="world">UniBeatWorld</option>
        <option value="merch">Merch</option>
      </select>
      <button id="ubSendNotificationBtn">Send Broadcast</button>
      <div id="ubAdminNotifStatus"></div>
    </div>
  `;

  $("ubSendNotificationBtn").onclick = sendAdminNotification;
}

async function sendAdminNotification(){
  const title = $("ubAdminNotifTitle")?.value.trim();
  const message = $("ubAdminNotifMessage")?.value.trim();
  const target = $("ubAdminNotifTarget")?.value || "all";
  const imageUrlInput = $("ubAdminNotifImageUrl")?.value.trim() || "";
  const imageFile = $("ubAdminNotifImageFile")?.files?.[0] || null;
  const status = $("ubAdminNotifStatus");

  if(!isAdmin){
    if(status) status.textContent = "Admin only.";
    return;
  }

  if(!title || !message){
    if(status) status.textContent = "Add title and message.";
    return;
  }

  // Image priority: uploaded file wins over a pasted URL. Upload goes to
  // Firebase Storage under notification_images/. If Storage rules block the
  // upload, the send stops here and the admin can paste an image URL instead.
  let imageUrl = imageUrlInput;
  if(imageFile){
    if(status) status.textContent = "Uploading image…";
    try{
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `notification_images/${Date.now()}_${safeName}`;
      const snap = await uploadBytes(storageRef(storage, path), imageFile);
      imageUrl = await getDownloadURL(snap.ref);
    }catch(err){
      console.error(err);
      if(status) status.textContent = "Image upload failed: " + err.message + " — paste an image URL instead, or allow admin writes to notification_images/ in Storage rules.";
      return;
    }
  }

  try{
    await addDoc(collection(db, "notification_broadcasts"), {
      title,
      message,
      target,
      imageUrl: imageUrl || "",
      active: true,
      createdBy: currentUser?.email || "admin",
      createdAt: serverTimestamp()
    });

    $("ubAdminNotifTitle").value = "";
    $("ubAdminNotifMessage").value = "";
    if($("ubAdminNotifImageUrl")) $("ubAdminNotifImageUrl").value = "";
    if($("ubAdminNotifImageFile")) $("ubAdminNotifImageFile").value = "";
    if(status) status.textContent = "Broadcast sent.";
  }catch(err){
    console.error(err);
    if(status) status.textContent = "Send failed: " + err.message;
  }
}

function listenForNotifications(){
  const q = query(
    collection(db, "notification_broadcasts"),
    where("active", "==", true),
    orderBy("createdAt", "desc"),
    limit(25)
  );

  onSnapshot(q, snap => {
    const rows = [];
    snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));

    state.notifications = rows.filter(targetMatches);

    state.unread = state.notifications.filter(n => {
      const ms = n.createdAt?.toMillis ? n.createdAt.toMillis() : 0;
      return ms > lastSeen;
    }).length;

    renderBadge();
    renderList();

    const latest = state.notifications[0];
    if(latest){
      const ms = latest.createdAt?.toMillis ? latest.createdAt.toMillis() : 0;
      if(ms > lastSeen){
        toast(`${latest.title}: ${latest.message}`);
      }
    }
  }, err => {
    console.warn("[UniBeatz Notifications]", err.message);
  });
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  renderAdminPanel();
});

setupOpenButtons();
listenForNotifications();

window.UniBeatzNotifications = {
  send: sendAdminNotification,
  markSeen,
  getAll: () => state.notifications
};

console.log("✅ UniBeatz notification broadcast system loaded:", platform);
