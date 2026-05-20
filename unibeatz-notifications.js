// unibeatz-notifications.js
// Drop in GitHub repo root. Include AFTER firebase init in each HTML file:
//   <script type="module" src="/unibeatz-notifications.js"></script>
//
// Requires firebase already initialized + firebase/auth + firebase/firestore + firebase/messaging + firebase/storage on the page.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, doc, setDoc, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ============================================================
// CONFIG
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDTStQ25aX1e-sgzOtmcKZPmdJM0NkEaH4",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.firebasestorage.app",
  messagingSenderId: "70667820609",
  appId: "1:70667820609:web:57762df5510e6b4000b0c0"
};

// ⚠️ PASTE YOUR VAPID KEY HERE once generated in Firebase Console → Cloud Messaging → Web Push certificates
const VAPID_KEY = "BBFJmA6QKx8YgG2BvP8OVuUlJYxIbuO_fAGyl_weagUVBFRlfNt7bfCwsg_j2HwHtWW9TgEQxSKJ_8LBiHk3yt0";

const ADMIN_EMAIL = "unibeatzproduction@gmail.com";

// ============================================================
// INIT
// ============================================================
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn('[UniBeatz Push] Messaging not supported in this browser:', e);
}

// ============================================================
// SOFT PERMISSION PROMPT (custom UI before native prompt)
// ============================================================
function showSoftPrompt() {
  if (localStorage.getItem('ub_notif_asked') === 'true') return;
  if (Notification.permission !== 'default') return;
  if (!messaging) return;

  const banner = document.createElement('div');
  banner.id = 'ub-notif-banner';
  banner.innerHTML = `
    <style>
      #ub-notif-banner {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #fff; padding: 18px 22px; border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
        z-index: 99998; max-width: 420px; width: calc(100% - 40px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: ubSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(20px);
      }
      @keyframes ubSlideUp { from { transform: translate(-50%, 80px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }
      #ub-notif-banner .ub-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
      #ub-notif-banner .ub-sub { font-size: 13px; opacity: 0.75; margin-bottom: 12px; line-height: 1.4; }
      #ub-notif-banner .ub-btns { display: flex; gap: 8px; }
      #ub-notif-banner button {
        flex: 1; padding: 9px 14px; border: none; border-radius: 8px;
        font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;
      }
      #ub-notif-banner .ub-yes { background: #ff3366; color: #fff; }
      #ub-notif-banner .ub-yes:hover { background: #ff1f56; transform: translateY(-1px); }
      #ub-notif-banner .ub-no { background: rgba(255,255,255,0.08); color: #fff; }
      #ub-notif-banner .ub-no:hover { background: rgba(255,255,255,0.14); }
    </style>
    <div class="ub-title">🔔 Stay in the loop</div>
    <div class="ub-sub">Get notified about new beats, packs, and battles across all UniBeatz platforms.</div>
    <div class="ub-btns">
      <button class="ub-no" id="ub-notif-no">Not now</button>
      <button class="ub-yes" id="ub-notif-yes">Allow</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('ub-notif-yes').onclick = async () => {
    banner.remove();
    localStorage.setItem('ub_notif_asked', 'true');
    await requestPermissionAndRegister();
  };
  document.getElementById('ub-notif-no').onclick = () => {
    banner.remove();
    localStorage.setItem('ub_notif_asked', 'true');
  };
}

async function requestPermissionAndRegister() {
  if (!messaging) return;
  try {
    // Register the SW (must be at root)
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[UniBeatz Push] Permission denied');
      return;
    }
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });
    if (token) {
      console.log('[UniBeatz Push] FCM token:', token);
      // Save token to Firestore under fcm_tokens collection
      await setDoc(doc(db, 'fcm_tokens', token), {
        token,
        uid: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        platform: location.pathname.split('/').pop() || 'index',
        userAgent: navigator.userAgent,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error('[UniBeatz Push] Registration error:', err);
  }
}

// Foreground messages - show toast since native notification won't fire
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('[UniBeatz Push] Foreground:', payload);
    showInAppToast(payload.data || {});
  });
}

function showInAppToast(data) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <style>
      .ub-toast {
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        background: #0d0d18; color: #fff; border-radius: 14px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,51,102,0.3);
        max-width: 380px; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: ubToastIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      }
      @keyframes ubToastIn { from { transform: translateX(420px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      .ub-toast-header { padding: 14px 16px 8px; display: flex; align-items: center; gap: 8px; }
      .ub-toast-brand { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #ff3366; font-weight: 700; }
      .ub-toast-title { padding: 0 16px 6px; font-weight: 700; font-size: 16px; }
      .ub-toast-top { padding: 0 16px 10px; font-size: 13px; opacity: 0.85; line-height: 1.4; }
      .ub-toast-img { width: 100%; max-height: 200px; object-fit: cover; display: block; }
      .ub-toast-bot { padding: 10px 16px 14px; font-size: 13px; opacity: 0.85; line-height: 1.4; }
    </style>
    <div class="ub-toast" onclick="this.remove()">
      <div class="ub-toast-header"><span class="ub-toast-brand">● UniBeatz</span></div>
      <div class="ub-toast-title">${escapeHtml(data.title || 'Notification')}</div>
      ${data.topText ? `<div class="ub-toast-top">${escapeHtml(data.topText)}</div>` : ''}
      ${data.image ? `<img class="ub-toast-img" src="${escapeAttr(data.image)}" alt="">` : ''}
      ${data.bottomText ? `<div class="ub-toast-bot">${escapeHtml(data.bottomText)}</div>` : ''}
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

// ============================================================
// ADMIN COMPOSER (floating button visible only to admin)
// ============================================================
function mountAdminComposer() {
  if (document.getElementById('ub-admin-fab')) return;

  const fab = document.createElement('div');
  fab.id = 'ub-admin-fab';
  fab.innerHTML = `
    <style>
      #ub-admin-fab {
        position: fixed; bottom: 24px; right: 24px; z-index: 99997;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #ub-admin-fab-btn {
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, #ff3366 0%, #ff6b3d 100%);
        color: #fff; border: none; cursor: pointer;
        box-shadow: 0 10px 30px rgba(255,51,102,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; transition: all 0.25s ease;
      }
      #ub-admin-fab-btn:hover { transform: scale(1.08) rotate(-5deg); box-shadow: 0 14px 40px rgba(255,51,102,0.7); }
      #ub-admin-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
        z-index: 99999; display: none; align-items: center; justify-content: center; padding: 20px;
      }
      #ub-admin-modal.open { display: flex; animation: ubFade 0.25s ease; }
      @keyframes ubFade { from { opacity: 0; } to { opacity: 1; } }
      #ub-admin-modal .ub-card {
        background: #0d0d18; color: #fff; border-radius: 20px;
        width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08);
        padding: 28px;
      }
      #ub-admin-modal h2 {
        margin: 0 0 4px; font-size: 22px; font-weight: 800;
        background: linear-gradient(135deg, #ff3366 0%, #ff6b3d 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }
      #ub-admin-modal .ub-sub { font-size: 13px; opacity: 0.6; margin-bottom: 20px; }
      #ub-admin-modal label {
        display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
        font-weight: 700; margin-bottom: 6px; opacity: 0.7;
      }
      #ub-admin-modal input[type="text"],
      #ub-admin-modal textarea {
        width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
        color: #fff; padding: 12px 14px; font-size: 14px; font-family: inherit;
        margin-bottom: 16px; transition: border 0.2s;
      }
      #ub-admin-modal input:focus, #ub-admin-modal textarea:focus { outline: none; border-color: #ff3366; }
      #ub-admin-modal textarea { resize: vertical; min-height: 60px; }
      #ub-admin-modal .ub-image-zone {
        border: 2px dashed rgba(255,255,255,0.15); border-radius: 12px;
        padding: 24px; text-align: center; cursor: pointer; margin-bottom: 16px;
        transition: all 0.2s; position: relative; overflow: hidden;
      }
      #ub-admin-modal .ub-image-zone:hover { border-color: #ff3366; background: rgba(255,51,102,0.04); }
      #ub-admin-modal .ub-image-zone.has-image { padding: 0; }
      #ub-admin-modal .ub-image-zone img { width: 100%; max-height: 200px; object-fit: cover; display: block; }
      #ub-admin-modal .ub-btns { display: flex; gap: 10px; margin-top: 8px; }
      #ub-admin-modal .ub-send {
        flex: 1; padding: 14px; border: none; border-radius: 10px; cursor: pointer;
        background: linear-gradient(135deg, #ff3366 0%, #ff6b3d 100%);
        color: #fff; font-weight: 700; font-size: 14px; letter-spacing: 0.5px;
        transition: all 0.2s;
      }
      #ub-admin-modal .ub-send:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(255,51,102,0.4); }
      #ub-admin-modal .ub-send:disabled { opacity: 0.5; cursor: not-allowed; }
      #ub-admin-modal .ub-cancel {
        padding: 14px 20px; border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
        background: transparent; color: #fff; cursor: pointer; font-weight: 600;
      }
      #ub-admin-modal .ub-status { margin-top: 14px; font-size: 13px; padding: 10px 14px; border-radius: 8px; display: none; }
      #ub-admin-modal .ub-status.ok { display: block; background: rgba(0,200,100,0.15); color: #4ade80; }
      #ub-admin-modal .ub-status.err { display: block; background: rgba(255,50,80,0.15); color: #ff6b85; }
    </style>
    <button id="ub-admin-fab-btn" title="Send Notification">📢</button>
    <div id="ub-admin-modal">
      <div class="ub-card">
        <h2>Broadcast Notification</h2>
        <div class="ub-sub">Sends to ALL platforms (UniBeatz World, UniFreestyle, UniPack)</div>

        <label>Title</label>
        <input type="text" id="ub-comp-title" maxlength="80" placeholder="🔥 New Drop Live">

        <label>Top Passage</label>
        <textarea id="ub-comp-top" maxlength="200" placeholder="Short hook above the image"></textarea>

        <label>Image (optional)</label>
        <div class="ub-image-zone" id="ub-image-zone">
          <input type="file" id="ub-comp-image" accept="image/*" style="display:none">
          <div id="ub-image-placeholder">📷 Click to add image</div>
        </div>

        <label>Bottom Passage</label>
        <textarea id="ub-comp-bottom" maxlength="200" placeholder="Call to action below the image"></textarea>

        <label>Link URL (where clicks go)</label>
        <input type="text" id="ub-comp-url" placeholder="/unipack.html" value="/">

        <div class="ub-btns">
          <button class="ub-cancel" id="ub-comp-cancel">Cancel</button>
          <button class="ub-send" id="ub-comp-send">Send to Everyone</button>
        </div>
        <div class="ub-status" id="ub-comp-status"></div>
      </div>
    </div>
  `;
  document.body.appendChild(fab);

  const modal = document.getElementById('ub-admin-modal');
  const fabBtn = document.getElementById('ub-admin-fab-btn');
  const cancelBtn = document.getElementById('ub-comp-cancel');
  const sendBtn = document.getElementById('ub-comp-send');
  const imageZone = document.getElementById('ub-image-zone');
  const imageInput = document.getElementById('ub-comp-image');
  const statusEl = document.getElementById('ub-comp-status');
  let uploadedImageUrl = null;

  fabBtn.onclick = () => modal.classList.add('open');
  cancelBtn.onclick = () => modal.classList.remove('open');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

  imageZone.onclick = () => imageInput.click();
  imageInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    statusEl.className = 'ub-status'; statusEl.textContent = '';
    try {
      const path = `notifications/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      uploadedImageUrl = await getDownloadURL(ref);
      imageZone.classList.add('has-image');
      imageZone.innerHTML = `<img src="${uploadedImageUrl}" alt="">`;
    } catch (err) {
      console.error(err);
      statusEl.className = 'ub-status err';
      statusEl.textContent = 'Image upload failed: ' + err.message;
    }
  };

  sendBtn.onclick = async () => {
    const title = document.getElementById('ub-comp-title').value.trim();
    const topText = document.getElementById('ub-comp-top').value.trim();
    const bottomText = document.getElementById('ub-comp-bottom').value.trim();
    const url = document.getElementById('ub-comp-url').value.trim() || '/';

    if (!title) {
      statusEl.className = 'ub-status err';
      statusEl.textContent = 'Title is required';
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    statusEl.className = 'ub-status'; statusEl.textContent = '';

    try {
      // Write to Firestore - Cloud Function picks it up and fans out
      await addDoc(collection(db, 'notifications'), {
        title,
        topText,
        bottomText,
        image: uploadedImageUrl,
        url,
        sentBy: auth.currentUser?.email || 'admin',
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      statusEl.className = 'ub-status ok';
      statusEl.textContent = '✓ Queued. Cloud Function is delivering now.';
      sendBtn.textContent = 'Sent ✓';

      // Reset
      setTimeout(() => {
        document.getElementById('ub-comp-title').value = '';
        document.getElementById('ub-comp-top').value = '';
        document.getElementById('ub-comp-bottom').value = '';
        uploadedImageUrl = null;
        imageZone.classList.remove('has-image');
        imageZone.innerHTML = '<input type="file" id="ub-comp-image" accept="image/*" style="display:none"><div id="ub-image-placeholder">📷 Click to add image</div>';
        // re-bind
        document.getElementById('ub-comp-image').onchange = imageInput.onchange;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send to Everyone';
        statusEl.textContent = '';
        statusEl.className = 'ub-status';
        modal.classList.remove('open');
      }, 1500);
    } catch (err) {
      console.error(err);
      statusEl.className = 'ub-status err';
      statusEl.textContent = 'Send failed: ' + err.message;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send to Everyone';
    }
  };
}

// ============================================================
// HISTORY PANEL (visible to everyone)
// ============================================================
async function loadHistory(containerId = 'ub-notif-history') {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = '<p style="opacity:0.6">No announcements yet.</p>';
      return;
    }
    container.innerHTML = snap.docs.map(d => {
      const n = d.data();
      const date = n.createdAt?.toDate?.()?.toLocaleString() || '';
      return `
        <article style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px; margin-bottom:14px;">
          <div style="font-size:11px; opacity:0.5; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:8px;">${date}</div>
          <h3 style="margin:0 0 8px; font-size:18px;">${escapeHtml(n.title || '')}</h3>
          ${n.topText ? `<p style="margin:0 0 10px; opacity:0.8;">${escapeHtml(n.topText)}</p>` : ''}
          ${n.image ? `<img src="${escapeAttr(n.image)}" style="width:100%; max-height:240px; object-fit:cover; border-radius:10px; margin:8px 0;">` : ''}
          ${n.bottomText ? `<p style="margin:10px 0 0; opacity:0.8;">${escapeHtml(n.bottomText)}</p>` : ''}
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:#ff6b85">Could not load history.</p>';
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    mountAdminComposer();
  }
});

// Soft-ask after 5s on first visit (gives page time to load)
setTimeout(showSoftPrompt, 5000);

// Refresh token timestamp for known users
onAuthStateChanged(auth, async (user) => {
  if (user && Notification.permission === 'granted' && messaging) {
    try {
      const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
        || await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      if (token) {
        await setDoc(doc(db, 'fcm_tokens', token), {
          token, uid: user.uid, email: user.email, lastSeen: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) { /* silent */ }
  }
});

// Expose for manual triggering
window.UniBeatzPush = {
  loadHistory,
  requestPermission: requestPermissionAndRegister,
  showPrompt: showSoftPrompt
};
