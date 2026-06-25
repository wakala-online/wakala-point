/* ===== Wakala Point — Firebase Initialization (Auth + Realtime Database) ===== */
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
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2vYRwd8qNcz7U7_WVf8nGt6Ta1kf_g9I",
  authDomain: "wakalapoint-1b62d.firebaseapp.com",
  databaseURL: "https://wakalapoint-1b62d-default-rtdb.firebaseio.com",
  projectId: "wakalapoint-1b62d",
  storageBucket: "wakalapoint-1b62d.firebasestorage.app",
  messagingSenderId: "721272156238",
  appId: "1:721272156238:web:b43fde49cff97cd249d31f",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Expose what wakala.js (a plain, non-module script) needs on window,
// since wakala.js loads as a classic script and this file loads as a module.
window.__wpFirebase = {
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
  auth,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
};

// Let other scripts know Firebase is ready (wakala.js waits for this).
window.dispatchEvent(new Event("wp-firebase-ready"));
