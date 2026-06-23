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
    return `
      <div class="ub-notif-item">
        <div class="ub-notif-title">${safeText(n.title)}</div>
        <div class="ub-notif-message">${safeText(n.message)}</div>
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
  const status = $("ubAdminNotifStatus");

  if(!isAdmin){
    if(status) status.textContent = "Admin only.";
    return;
  }

  if(!title || !message){
    if(status) status.textContent = "Add title and message.";
    return;
  }

  try{
    await addDoc(collection(db, "notification_broadcasts"), {
      title,
      message,
      target,
      active: true,
      createdBy: currentUser?.email || "admin",
      createdAt: serverTimestamp()
    });

    $("ubAdminNotifTitle").value = "";
    $("ubAdminNotifMessage").value = "";
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
