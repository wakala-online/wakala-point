/* =========================================================
   WAKALA POINT — FIREBASE INIT
   Auth + Realtime Database + Helpers for classic scripts
   ========================================================= */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  get,
  child,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

/* =========================================================
   FIREBASE CONFIG
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyB36tCsZPPstZvojZLE6srWUVNahdzgvZw",
  authDomain: "wakala-point.firebaseapp.com",
  projectId: "wakala-point",
  storageBucket: "wakala-point.firebasestorage.app",
  messagingSenderId: "601072568380",
  appId: "1:601072568380:web:4210c8a78610413aeddb39",
  measurementId: "G-D085CTF9C7"
};

/* =========================================================
   SAFE INIT
   ========================================================= */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/* Google provider tweaks */
googleProvider.setCustomParameters({
  prompt: "select_account"
});

/* =========================================================
   READY PROMISE
   Hii inasaidia pages kusubiri Firebase iwe tayari
   ========================================================= */
let _readyResolve;
const firebaseReadyPromise = new Promise((resolve) => {
  _readyResolve = resolve;
});

/* =========================================================
   GLOBAL EXPOSE
   Hii ndiyo wakala.js / classic scripts zitaitumia
   ========================================================= */
window.__wpFirebase = {
  app,
  db,
  auth,

  // database
  ref,
  push,
  set,
  update,
  remove,
  get,
  child,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,
  serverTimestamp,

  // auth
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
};

/* =========================================================
   READY HELPER
   Hii unaweza kuitumia kwenye wakala.js:
   const fb = await wpFirebaseReady();
   ========================================================= */
window.wpFirebaseReady = function () {
  return firebaseReadyPromise;
};

/* =========================================================
   OPTIONAL: AUTH STATE HELPER
   Kama unataka kupata current user kwa urahisi
   ========================================================= */
window.wpGetCurrentUser = function () {
  return auth.currentUser;
};

/* =========================================================
   OPTIONAL: WAIT FOR FIRST AUTH STATE
   Hii ni nzuri kwa admin/login pages
   ========================================================= */
window.wpWaitForAuth = function () {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
};

/* =========================================================
   OPTIONAL: DEBUG HELPERS
   ========================================================= */
window.wpFirebaseDebug = {
  get app() { return app; },
  get db() { return db; },
  get auth() { return auth; }
};

/* =========================================================
   FIRE EVENT + RESOLVE READY
   ========================================================= */
window.dispatchEvent(new Event("wp-firebase-ready"));
_readyResolve(window.__wpFirebase);

console.log("[Wakala Point] Firebase initialized successfully");
