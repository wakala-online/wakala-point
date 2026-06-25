/* ===== WAKALA POINT — Firebase Initialization (Auth + Realtime Database) ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  get,
  child,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

/* ===== Firebase Project Config ===== */
const firebaseConfig = {
  apiKey: "AIzaSyB36tCsZPPstZvojZLE6srWUVNahdzgvZw",
  authDomain: "wakala-point.firebaseapp.com",
  projectId: "wakala-point",
  storageBucket: "wakala-point.firebasestorage.app",
  messagingSenderId: "601072568380",
  appId: "1:601072568380:web:4210c8a78610413aeddb39",
  measurementId: "G-D085CTF9C7"
};

/* ===== Initialize Firebase ===== */
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/* ===== Optional: Google login always asks account picker ===== */
googleProvider.setCustomParameters({
  prompt: "select_account"
});

/* ===== Expose Firebase helpers to wakala.js =====
   Kwa sababu firebase-init.js ni module lakini wakala.js ni classic script,
   tunazitoa kwenye window ili wakala.js iweze kuzitumia.
*/
window.__wpFirebase = {
  // app + db
  app,
  db,
  ref,
  push,
  set,
  update,
  get,
  child,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,

  // auth
  auth,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
};

/* ===== Notify other scripts that Firebase is ready ===== */
window.dispatchEvent(new Event("wp-firebase-ready"));
