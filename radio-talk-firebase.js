// radio-talk-firebase.js
// Imports Firestore methods directly — uses db from UB_FIREBASE

import {
  doc, setDoc, collection, addDoc, onSnapshot,
  serverTimestamp, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';

async function waitForDb(tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (window.UB_FIREBASE && window.UB_FIREBASE.db) return window.UB_FIREBASE.db;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Firebase not ready after waiting. Reload the page.');
}

function db() {
  if (window.UB_FIREBASE && window.UB_FIREBASE.db) return window.UB_FIREBASE.db;
  throw new Error('Firebase not initialized. Reload the page and try again.');
}

export async function createSession(sessionId, djName) {
  const _db = await waitForDb();
  await setDoc(doc(_db, 'talk_sessions', sessionId), {
    sessionId,
    djName,
    hosts: [],
    live: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function endSession(sessionId) {
  const _db = await waitForDb();
  await setDoc(doc(_db, 'talk_sessions', sessionId), {
    live: false,
    endedAt: serverTimestamp()
  }, { merge: true });
}

export async function watchSession(sessionId, cb) {
  const _db = await waitForDb();
  return onSnapshot(doc(_db, 'talk_sessions', sessionId), snap => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export async function sendMessage(sessionId, msg) {
  const _db = await waitForDb();
  await addDoc(collection(_db, 'talk_sessions', sessionId, 'chat'), {
    ...msg,
    timestamp: serverTimestamp()
  });
}

export async function watchChat(sessionId, cb) {
  const _db = await waitForDb();
  const q = query(
    collection(_db, 'talk_sessions', sessionId, 'chat'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    cb(msgs);
  });
}

export async function getLiveKitToken(room, identity, isDJ = false) {
  const resp = await fetch(TOKEN_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room,
      identity,
      metadata: JSON.stringify({ isDJ, role: isDJ ? 'dj' : 'host' })
    })
  });
  if (!resp.ok) throw new Error('Token fetch failed: ' + resp.status);
  const data = await resp.json();
  return data.token;
}
