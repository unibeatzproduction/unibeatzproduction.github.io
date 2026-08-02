// radio-talk-firebase.js
// Uses the existing Firebase app — no separate initialization

import {
  doc, setDoc, collection, addDoc, onSnapshot,
  serverTimestamp, query, orderBy, getFirestore
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';

const TOKEN_FN = 'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken';

function db() {
  // Always use the existing app's Firestore — never create a new one
  try {
    return getFirestore(getApp());
  } catch(e) {
    if (window.UB_FIREBASE && window.UB_FIREBASE.db) return window.UB_FIREBASE.db;
    throw new Error('Firebase not ready');
  }
}

export async function createSession(sessionId, djName) {
  await setDoc(doc(db(), 'talk_sessions', sessionId), {
    sessionId, djName, hosts: [], live: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function endSession(sessionId) {
  await setDoc(doc(db(), 'talk_sessions', sessionId), {
    live: false, endedAt: serverTimestamp()
  }, { merge: true });
}

export function watchSession(sessionId, cb) {
  return onSnapshot(doc(db(), 'talk_sessions', sessionId), snap => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export async function sendMessage(sessionId, msg) {
  await addDoc(collection(db(), 'talk_sessions', sessionId, 'chat'), {
    ...msg, timestamp: serverTimestamp()
  });
}

export function watchChat(sessionId, cb) {
  const q = query(
    collection(db(), 'talk_sessions', sessionId, 'chat'),
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
    body: JSON.stringify({ room, identity, metadata: JSON.stringify({ isDJ, role: isDJ ? 'dj' : 'host' }) })
  });
  if (!resp.ok) throw new Error('Token fetch failed: ' + resp.status);
  const data = await resp.json();
  return data.token;
}
