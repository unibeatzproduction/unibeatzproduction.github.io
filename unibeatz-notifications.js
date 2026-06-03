// unibeatz-notifications.js
// Shared UniBeatz loader: account bridge + search + notification center + admin broadcast.

import "/unibeatz-auth.js";
import "/unibeatz-search.js";
import "/unipack-stems.js";
import "/unipack-mobile-upload-fix.js";
// import "/unifreestyle-cypher-fix.js";          // disabled — replaced by unifreestyle-cypher.js
// import "/unifreestyle-cypher-engine.js";       // disabled — replaced by unifreestyle-cypher.js
import "/unifreestyle-cypher.js";
import "/unifreestyle-cypher-camera-center.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";