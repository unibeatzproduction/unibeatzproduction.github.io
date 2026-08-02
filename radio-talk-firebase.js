// radio-talk-firebase.js
// Firebase integration for Talk Studio sessions

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDxQxQxQxQxQxQxQxQxQxQxQxQxQxQxQx",
  authDomain: "unibeatzproduction-7ae31.firebaseapp.com",
  projectId: "unibeatzproduction-7ae31",
  storageBucket: "unibeatzproduction-7ae31.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

let _app, _db;

function getDb(){
  if(_db) return _db;
  _app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  _db = getFirestore(_app);
  return _db;
}

// Use existing Firebase if already initialized
function db(){
  if(window.UB_FIREBASE && window.UB_FIREBASE.db) return window.UB_FIREBASE.db;
  return getDb();
}

export async function createSession(sessionId, djName){
  await setDoc(doc(db(), 'talk_sessions', sessionId), {
    sessionId,
    djName,
    hosts: [],
    live: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function endSession(sessionId){
  await setDoc(doc(db(), 'talk_sessions', sessionId), {
    live: false,
    endedAt: serverTimestamp()
  }, { merge: true });
}

export function watchSession(sessionId, cb){
  return onSnapshot(doc(db(), 'talk_sessions', sessionId), snap => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export async function sendMessage(sessionId, msg){
  await addDoc(collection(db(), 'talk_sessions', sessionId, 'chat'), {
    ...msg,
    timestamp: serverTimestamp()
  });
}

export function watchChat(sessionId, cb){
  return onSnapshot(
    collection(db(), 'talk_sessions', sessionId, 'chat'),
    snap => {
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.sort((a,b) => (a.timestamp?.seconds||0) - (b.timestamp?.seconds||0));
      cb(msgs);
    }
  );
}

export async function getLiveKitToken(room, identity, isDJ = false){
  const resp = await fetch(
    'https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, identity, metadata: JSON.stringify({ isDJ }) })
    }
  );
  if(!resp.ok) throw new Error('Token fetch failed: ' + resp.status);
  const data = await resp.json();
  return data.token;
}
