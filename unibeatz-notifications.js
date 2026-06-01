// unibeatz-notifications.js
// Shared UniBeatz loader: account bridge + search + notification center + admin broadcast.

import "/unibeatz-auth.js";
import "/unibeatz-search.js";
import "/unipack-stems.js";
import "/unipack-mobile-upload-fix.js";
// import "/unifreestyle-cypher-fix.js";          // disabled — replaced by unifreestyle-cypher.js
// import "/unifreestyle-cypher-engine.js";       // disabled — replaced by unifreestyle-cypher.js
import "/unifreestyle-cypher.js";

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
const SW_PATH = "/firebase-messaging-sw.js";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
