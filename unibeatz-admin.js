// unibeatz-admin.js — INDEX-ONLY administration controls.
// ONE admin control point for the whole site (owner's rule): this module is
// loaded ONLY by index.html. Other pages get display-only bells/panels/search
// and must NEVER load this file or contain admin controls.
// Controls: Firebase admin sign-in, Beat Store uploads (marketplace_beats +
// marketplace_packs), Battle Beats uploads (platform_beats), email subscribers,
// UniPack user management (localStorage ub_users, same origin), danger zone.
// Everything here requires Firebase sign-in as the admin email, on top of the
// index passcode that unlocks the panel shell. The notification composer itself
// is rendered by unibeatz-notifications.js into #ubNotificationAdmin once the
// admin is Firebase-signed-in.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

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
const storage = getStorage(app);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttr = (s) => esc(s).replace(/'/g, "&#39;");
function toast(msg) {
  if (typeof window.showToast === "function") window.showToast(msg);
  const st = $("ubAdminAuthStatus");
  if (st) st.textContent = msg;
}

let isAdmin = false;
let currentUser = null;
let battleBeatsCache = [];

// ---------- Admin sign-in (Firebase) ----------
function refreshAuthUI() {
  const status = $("ubAdminAuthStatus");
  const sections = $("ubAdminSections");
  const inBtn = $("ubAdminSignInBtn");
  const outBtn = $("ubAdminSignOutBtn");
  if (status) {
    status.textContent = currentUser
      ? (isAdmin ? `Signed in as admin: ${currentUser.email}` : `Signed in as ${currentUser.email} — not the admin account.`)
      : "Not signed in. Sign in with Google as the admin account to unlock uploads and user tools.";
  }
  if (sections) sections.style.display = isAdmin ? "block" : "none";
  if (inBtn) inBtn.style.display = currentUser ? "none" : "inline-block";
  if (outBtn) outBtn.style.display = currentUser ? "inline-block" : "none";
  if (isAdmin) { refreshStoreLists(); refreshBattleBeats(); refreshUsers(); refreshEmails(); }
}

async function signIn() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (e) {
    toast("Google sign-in failed: " + e.message + " (allow popups and try again)");
  }
}

async function signOutAdmin() {
  try { await signOut(auth); } catch (e) { toast("Sign-out failed: " + e.message); }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  refreshAuthUI();
});

// The panel shell is passcode-gated by index's own script; re-evaluate the
// Firebase gate whenever the panel opens.
const panelObserver = new MutationObserver(() => refreshAuthUI());
if ($("adminPanel")) panelObserver.observe($("adminPanel"), { attributes: true, attributeFilter: ["class"] });

function requireAdmin() {
  if (!isAdmin) { toast("Sign in with Google as the admin account first."); return false; }
  return true;
}

// ---------- Shared upload helper ----------
async function uploadFile(inputId, folder) {
  const input = $(inputId);
  if (!input || !input.files || !input.files[0]) return "";
  const file = input.files[0];
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageRef = ref(storage, `${folder}/${Date.now()}_${safeName}`);
  toast("Uploading " + file.name + "...");
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  toast("Uploaded " + file.name);
  return url;
}

function clearFields(ids) {
  ids.forEach((id) => { const el = $(id); if (el) el.value = ""; });
}

// ---------- Beat Store (marketplace_beats + marketplace_packs) ----------
async function saveStoreBeat() {
  if (!requireAdmin()) return;
  const name = $("bf_name")?.value.trim() || "";
  const tag = $("bf_tag")?.value.trim() || "";
  let audioUrl = $("bf_audio")?.value.trim() || "";
  let coverUrl = $("bf_cover")?.value.trim() || "";
  try {
    const uploadedAudio = await uploadFile("bf_audioFile", "marketplace/beats/audio");
    const uploadedCover = await uploadFile("bf_coverFile", "marketplace/beats/covers");
    if (uploadedAudio) audioUrl = uploadedAudio;
    if (uploadedCover) coverUrl = uploadedCover;
  } catch (e) {
    toast("Upload failed: " + e.message + " — a URL in the text field still works.");
    return;
  }
  if (!name || !tag || !audioUrl) { toast("Name, Tag, and Beat Audio required"); return; }
  try {
    await addDoc(collection(db, "marketplace_beats"), {
      name, tag,
      bpm: $("bf_bpm")?.value || "",
      key: $("bf_key")?.value.trim() || "",
      audioUrl, coverUrl,
      basicPrice: parseInt($("bf_basic")?.value) || 25,
      premiumPrice: parseInt($("bf_premium")?.value) || 75,
      exclusivePrice: parseInt($("bf_exclusive")?.value) || 300,
      stripeBasic: $("bf_stripeBasic")?.value.trim() || "",
      createdAt: serverTimestamp()
    });
    toast("Beat uploaded to the Beat Store!");
    clearFields(["bf_name", "bf_tag", "bf_bpm", "bf_key", "bf_audio", "bf_cover", "bf_stripeBasic", "bf_audioFile", "bf_coverFile"]);
    refreshStoreLists();
  } catch (e) { toast("Save failed: " + e.message); }
}

async function saveStorePack() {
  if (!requireAdmin()) return;
  const name = $("pf_name")?.value.trim() || "";
  const category = $("pf_cat")?.value.trim() || "";
  const includes = $("pf_includes")?.value.trim() || "";
  let zipUrl = $("pf_zip")?.value.trim() || "";
  let coverUrl = $("pf_cover")?.value.trim() || "";
  try {
    const uploadedZip = await uploadFile("pf_zipFile", "marketplace/packs/zips");
    const uploadedCover = await uploadFile("pf_coverFile", "marketplace/packs/covers");
    if (uploadedZip) zipUrl = uploadedZip;
    if (uploadedCover) coverUrl = uploadedCover;
  } catch (e) {
    toast("Upload failed: " + e.message + " — a URL in the text field still works.");
    return;
  }
  if (!name || !category || !zipUrl || !includes) { toast("Name, Category, Contents, and ZIP file required"); return; }
  try {
    await addDoc(collection(db, "marketplace_packs"), {
      name, category,
      icon: $("pf_icon")?.value.trim() || "🎵",
      includes, zipUrl, coverUrl,
      price: parseInt($("pf_price")?.value) || 0,
      type: $("pf_type")?.value || "free",
      stripeLink: $("pf_stripe")?.value.trim() || "",
      createdAt: serverTimestamp()
    });
    toast("Pack uploaded to the Beat Store!");
    clearFields(["pf_name", "pf_cat", "pf_icon", "pf_includes", "pf_zip", "pf_cover", "pf_stripe", "pf_zipFile", "pf_coverFile"]);
    refreshStoreLists();
  } catch (e) { toast("Save failed: " + e.message); }
}

async function refreshStoreLists() {
  if (!isAdmin) return;
  try {
    const beatsSnap = await getDocs(query(collection(db, "marketplace_beats"), orderBy("createdAt", "desc")));
    const beats = beatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const beatsDiv = $("ubAdminStoreBeatsList");
    if (beatsDiv) {
      beatsDiv.innerHTML = beats.length ? beats.map((b) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(201,168,76,0.15);margin-bottom:5px;">
          <div style="flex:1;"><b>${esc(b.name)}</b> · ${esc(b.tag || "")} · ${esc(b.bpm || "?")} BPM<small style="display:block;color:rgba(240,237,232,0.5);">$${b.basicPrice || 25} / $${b.premiumPrice || 75} / $${b.exclusivePrice || 300}</small></div>
          <button class="btn-blue" onclick="ubAdminDeleteStoreBeat('${escAttr(b.id)}','${escAttr(b.name)}')">🗑️</button>
        </div>`).join("") : "<div>No beats yet.</div>";
    }
    const packsSnap = await getDocs(query(collection(db, "marketplace_packs"), orderBy("createdAt", "desc")));
    const packs = packsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const packsDiv = $("ubAdminStorePacksList");
    if (packsDiv) {
      packsDiv.innerHTML = packs.length ? packs.map((p) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(201,168,76,0.15);margin-bottom:5px;">
          <div style="flex:1;"><b>${esc(p.icon || "🎵")} ${esc(p.name)}</b> · ${esc(p.category || "")}<small style="display:block;color:rgba(240,237,232,0.5);">${p.type === "free" ? "FREE" : "$" + p.price}</small></div>
          <button class="btn-blue" onclick="ubAdminDeleteStorePack('${escAttr(p.id)}','${escAttr(p.name)}')">🗑️</button>
        </div>`).join("") : "<div>No packs yet.</div>";
    }
  } catch (e) { toast("Could not load store lists: " + e.message); }
}

async function deleteStoreBeat(id, name) {
  if (!requireAdmin()) return;
  if (!confirm(`Delete "${name}"?`)) return;
  try { await deleteDoc(doc(db, "marketplace_beats", id)); toast("Beat deleted"); refreshStoreLists(); }
  catch (e) { toast("Delete failed: " + e.message); }
}

async function deleteStorePack(id, name) {
  if (!requireAdmin()) return;
  if (!confirm(`Delete "${name}"?`)) return;
  try { await deleteDoc(doc(db, "marketplace_packs", id)); toast("Pack deleted"); refreshStoreLists(); }
  catch (e) { toast("Delete failed: " + e.message); }
}

// ---------- Email subscribers ----------
async function refreshEmails() {
  if (!isAdmin) return;
  const list = $("ubAdminEmailsList");
  if (!list) return;
  list.innerHTML = "Loading...";
  try {
    const snap = await getDocs(query(collection(db, "email_subscribers"), orderBy("createdAt", "desc")));
    const emails = snap.docs.map((d) => d.data());
    if (!emails.length) { list.innerHTML = "No email signups yet."; return; }
    list.innerHTML = emails.map((e) => {
      const d = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toLocaleString() : "";
      return `<div style="padding:6px 0;border-bottom:1px solid rgba(201,168,76,0.1);">${esc(e.email)}<small style="display:block;color:rgba(240,237,232,0.5);">${esc(e.packName || "")} · ${d}</small></div>`;
    }).join("");
    list._emails = emails;
  } catch (e) { list.innerHTML = "Load failed: " + esc(e.message); }
}

async function exportEmails() {
  if (!requireAdmin()) return;
  try {
    const snap = await getDocs(query(collection(db, "email_subscribers"), orderBy("createdAt", "desc")));
    const emails = snap.docs.map((d) => d.data());
    if (!emails.length) { toast("No emails to export"); return; }
    const csv = "Email,Pack,Source,Date\n" + emails.map((e) => {
      const d = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toISOString() : "";
      return [e.email, e.packName, e.source, d].map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(",");
    }).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unibeatz_subscribers_" + Date.now() + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(emails.length + " emails exported");
  } catch (e) { toast("Export failed: " + e.message); }
}

// ---------- Battle Beats (platform_beats) ----------
async function uploadBattleBeat() {
  if (!requireAdmin()) return;
  const name = $("adminBeatName")?.value.trim() || "";
  const bpm = $("adminBeatBpm")?.value.trim() || "";
  const key = $("adminBeatKey")?.value.trim() || "";
  const genre = $("adminBeatGenre")?.value.trim() || "";
  const fileInput = $("adminBeatFile");
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!name || !file) { toast("Beat name and audio file required"); return; }
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `platform-beats/${Date.now()}_${safeName}`;
    toast("Uploading beat...");
    await uploadBytes(ref(storage, storagePath), file);
    const audioUrl = await getDownloadURL(ref(storage, storagePath));
    await addDoc(collection(db, "platform_beats"), {
      name, bpm, key, genre, audioUrl, storagePath,
      active: true,
      createdAt: serverTimestamp()
    });
    clearFields(["adminBeatName", "adminBeatBpm", "adminBeatKey", "adminBeatGenre", "adminBeatFile"]);
    toast("Beat uploaded to platform");
    refreshBattleBeats();
  } catch (e) { toast("Beat upload failed: " + e.message); }
}

async function refreshBattleBeats() {
  if (!isAdmin) return;
  try {
    const snap = await getDocs(query(collection(db, "platform_beats"), orderBy("createdAt", "desc")));
    battleBeatsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const list = $("ubAdminBattleBeatsList");
    if (!list) return;
    list.innerHTML = battleBeatsCache.length ? battleBeatsCache.map((b) => {
      const meta = [b.genre, b.bpm ? b.bpm + " BPM" : "", b.key].filter(Boolean).join(" · ") || "Platform beat";
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(201,168,76,0.15);margin-bottom:5px;">
        <div style="flex:1;"><b>${esc(b.name || "Untitled Beat")}</b><small style="display:block;color:rgba(240,237,232,0.5);">${esc(meta)}</small></div>
        <button class="btn-blue" onclick="ubAdminPreviewBattleBeat('${escAttr(b.id)}')">▶</button>
        <button class="btn-blue" onclick="ubAdminDeleteBattleBeat('${escAttr(b.id)}','${escAttr(b.name || "Untitled Beat")}')">🗑️</button>
      </div>`;
    }).join("") : "<div>No beats uploaded yet.</div>";
  } catch (e) { toast("Could not load battle beats: " + e.message); }
}

function previewBattleBeat(id) {
  const beat = battleBeatsCache.find((b) => b.id === id);
  if (!beat || !beat.audioUrl) return;
  const audio = new Audio();
  audio.src = beat.audioUrl;
  audio.play().catch(() => {});
}

async function deleteBattleBeat(id, name) {
  if (!requireAdmin()) return;
  if (!confirm(`Delete "${name}"?`)) return;
  try { await deleteDoc(doc(db, "platform_beats", id)); toast("Beat deleted"); refreshBattleBeats(); }
  catch (e) { toast("Delete failed: " + e.message); }
}

// ---------- UniPack user management (same-origin localStorage ub_users) ----------
// Moved from UniPack's admin page. These users live in this site's localStorage
// (shared across pages on this origin), so the index admin can manage them.
const LS_USERS = "ub_users";
const LS_CURRENT = "ub_current_user";
const LS_PROJECT = "unipack_project";
const LS_USAGE = "unipack_usage";

function readUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || "{}"); } catch (e) { return {}; }
}
function saveUsers(u) { localStorage.setItem(LS_USERS, JSON.stringify(u)); }

function refreshUsers() {
  const el = $("ubAdminUserList");
  const stats = $("ubAdminUserStats");
  if (!el) return;
  const users = readUsers();
  const list = Object.values(users);
  const total = list.length;
  const pro = list.filter((u) => u.unipackTier === "pro").length;
  const free = total - pro;
  if (stats) stats.textContent = `${total} users · ${pro} Pro · ${free} Free`;
  if (!list.length) { el.innerHTML = "No users yet"; return; }
  el.innerHTML = list.map((u) => {
    const tier = u.unipackTier === "pro"
      ? '<span style="color:#00ff88;font-weight:700;">PRO</span>'
      : '<span style="color:#ff6644;">Free</span>';
    const adminBadge = u.email && u.email.toLowerCase().trim() === ADMIN_EMAIL
      ? '<span style="color:#ffaa00;font-weight:700;"> 👑 ADMIN</span>' : "";
    return `<div style="padding:8px;border-bottom:1px solid rgba(201,168,76,0.08);">
      <div><strong>${esc(u.name || u.username || "?")}</strong>${adminBadge}</div>
      <div style="font-size:0.7rem;color:rgba(240,237,232,0.5);">${esc(u.email || "")} · ${tier} · Joined ${esc(u.joined || "?")}</div>
    </div>`;
  }).join("");
}

function upgradeUser() {
  if (!requireAdmin()) return;
  const email = (prompt("Enter email to upgrade to Pro:") || "").trim().toLowerCase();
  if (!email) return;
  const users = readUsers();
  let updated = false;
  for (const k in users) {
    if (users[k].email === email) {
      users[k].unipackTier = "pro";
      users[k].proSince = new Date().toISOString();
      updated = true;
      break;
    }
  }
  if (updated) { saveUsers(users); toast("Upgraded " + email + " to Pro"); }
  else { toast("User not found: " + email); }
  refreshUsers();
}

function downgradeUser() {
  if (!requireAdmin()) return;
  const email = (prompt("Enter email to downgrade to Free:") || "").trim().toLowerCase();
  if (!email) return;
  if (email === ADMIN_EMAIL) { toast("Cannot downgrade admin"); return; }
  const users = readUsers();
  let updated = false;
  for (const k in users) {
    if (users[k].email === email) {
      users[k].unipackTier = "free";
      delete users[k].proSince;
      updated = true;
      break;
    }
  }
  if (updated) { saveUsers(users); toast("Downgraded " + email + " to Free"); }
  else { toast("User not found: " + email); }
  refreshUsers();
}

// ---------- Danger zone (moved from UniPack's admin page) ----------
function lockPanel() {
  if (typeof window.lockAdmin === "function") window.lockAdmin();
}

function masterReset() {
  if (!requireAdmin()) return;
  if (!confirm("MASTER RESET\n\nThis will wipe ALL UniPack data on this device:\n- All user accounts\n- All projects\n- All usage data\n- Your current session\n\nFirebase cloud users will NOT be deleted.\n\nContinue?")) return;
  if (!confirm("FINAL WARNING — this cannot be undone. Tap OK to confirm.")) return;
  localStorage.removeItem(LS_USERS);
  localStorage.removeItem(LS_CURRENT);
  localStorage.removeItem(LS_PROJECT);
  localStorage.removeItem(LS_USAGE);
  toast("Master reset complete.");
  lockPanel();
}

function resetMyAccount() {
  if (!requireAdmin()) return;
  if (!confirm("Reset YOUR admin account? You can sign in again afterwards.")) return;
  const users = readUsers();
  for (const k in users) {
    if (users[k].email && users[k].email.toLowerCase().trim() === ADMIN_EMAIL) delete users[k];
  }
  saveUsers(users);
  localStorage.removeItem(LS_CURRENT);
  toast("Admin account reset. Sign in again.");
  lockPanel();
}

// ---------- Expose for inline onclick handlers (index admin only) ----------
window.ubAdminSignIn = signIn;
window.ubAdminSignOut = signOutAdmin;
window.ubAdminRefreshAuth = refreshAuthUI;
window.ubAdminSaveStoreBeat = saveStoreBeat;
window.ubAdminSaveStorePack = saveStorePack;
window.ubAdminRefreshStoreLists = refreshStoreLists;
window.ubAdminDeleteStoreBeat = deleteStoreBeat;
window.ubAdminDeleteStorePack = deleteStorePack;
window.ubAdminRefreshEmails = refreshEmails;
window.ubAdminExportEmails = exportEmails;
window.ubAdminUploadBattleBeat = uploadBattleBeat;
window.ubAdminRefreshBattleBeats = refreshBattleBeats;
window.ubAdminPreviewBattleBeat = previewBattleBeat;
window.ubAdminDeleteBattleBeat = deleteBattleBeat;
window.ubAdminRefreshUsers = refreshUsers;
window.ubAdminUpgradeUser = upgradeUser;
window.ubAdminDowngradeUser = downgradeUser;
window.ubAdminMasterReset = masterReset;
window.ubAdminResetMyAccount = resetMyAccount;

refreshAuthUI();
console.log("✅ UniBeatz index-only admin loaded");
