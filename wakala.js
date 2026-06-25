/* ===== WAKALA POINT — App Logic (Firebase Realtime Database) ===== */

// localStorage is still used to cache the *current session* only.
// All real data (users + requests) lives in Firebase Realtime Database.
const KEYS = {
  USER: 'wp_user',
};

/* ---------- Wait for firebase-init.js (loaded as a <script type="module">) ---------- */
function wpFirebaseReady() {
  if (window.__wpFirebase) return Promise.resolve(window.__wpFirebase);
  return new Promise((resolve) => {
    window.addEventListener('wp-firebase-ready', () => resolve(window.__wpFirebase), { once: true });
  });
}

// Wait for Firebase Auth to finish restoring the session on page load
function wpAuthReady() {
  return wpFirebaseReady().then((fb) => new Promise((resolve) => {
    const unsub = fb.onAuthStateChanged(fb.auth, (fbUser) => {
      unsub();
      resolve(fbUser);
    });
  }));
}

/* ---------- Helpers ---------- */

// Generate unique ID (used for request display IDs)
function genId() {
  return 'WP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Format date in Swahili
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- Session (synchronous, cached locally) ---------- */

// Get current user (synchronous — reads cached session)
function getUser() {
  return JSON.parse(localStorage.getItem(KEYS.USER) || 'null');
}

// Save user session locally (cache only; source of truth is RTDB)
function saveUser(user) {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(KEYS.USER);
  localStorage.removeItem('wakala_user');
}

/* ---------- Auth: Firebase Authentication (email/password + Google) ---------- */
/*
  Phone Auth requires Firebase's paid Blaze plan, so sign-in uses:
   - Email + password (Firebase Authentication)
   - Continue with Google (Firebase Authentication)
  "Namba ya Simu" is kept as a profile field in Realtime Database (users/{uid}),
  not as the sign-in credential.
*/

// Read or create the RTDB profile for a signed-in Firebase Auth user.
async function syncUserProfile(fbUser, extra) {
  const fb = await wpFirebaseReady();
  const userRef = fb.ref(fb.db, `users/${fbUser.uid}`);
  const snap = await fb.get(userRef);

  if (snap.exists()) {
    return { id: fbUser.uid, ...snap.val() };
  }

  // First time we see this Firebase Auth user — create their profile.
  const profile = {
    id: fbUser.uid,
    jina: (extra && extra.jina) || fbUser.displayName || 'Mteja',
    simu: (extra && extra.simu) || '',
    mkoa: (extra && extra.mkoa) || '',
    email: fbUser.email || '',
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };

  await fb.set(userRef, profile);
  return profile;
}

// Register a new user with email + password. Returns the user profile object.
async function registerUser({ jina, simu, mkoa, email, pass }) {
  const fb = await wpFirebaseReady();
  let cred;

  try {
    cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }

  if (jina) {
    try {
      await fb.updateProfile(cred.user, { displayName: jina });
    } catch (e) {
      // non-fatal
    }
  }

  return syncUserProfile(cred.user, { jina, simu, mkoa });
}

// Log in with email + password. Returns the user profile object.
async function loginUser(email, pass) {
  const fb = await wpFirebaseReady();
  let cred;

  try {
    cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }

  return syncUserProfile(cred.user);
}

// Continue with Google. Returns the user profile object.
async function loginWithGoogle() {
  const fb = await wpFirebaseReady();
  let cred;

  try {
    cred = await fb.signInWithPopup(fb.auth, fb.googleProvider);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }

  return syncUserProfile(cred.user);
}

// Forgot password / reset link
async function sendPasswordReset(email) {
  const fb = await wpFirebaseReady();

  if (!email || !email.trim()) {
    throw new Error('Weka barua pepe kwanza.');
  }

  try {
    await fb.sendPasswordResetEmail(fb.auth, email.trim());
    return true;
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
}

// Translate common Firebase Auth error codes into Swahili messages.
function authErrorMessage(e) {
  const code = e && e.code;
  const map = {
    'auth/email-already-in-use': 'Barua pepe hii tayari imesajiliwa. Tafadhali ingia.',
    'auth/invalid-email': 'Barua pepe si sahihi.',
    'auth/missing-email': 'Weka barua pepe kwanza.',
    'auth/weak-password': 'Nenosiri ni hafifu. Tumia angalau herufi 6.',
    'auth/user-not-found': 'Akaunti haipo. Tafadhali jiandikishe kwanza.',
    'auth/wrong-password': 'Barua pepe au nenosiri si sahihi.',
    'auth/invalid-credential': 'Barua pepe au nenosiri si sahihi.',
    'auth/too-many-requests': 'Majaribio mengi yameshindwa. Tafadhali subiri kidogo kisha jaribu tena.',
    'auth/popup-closed-by-user': 'Umefunga dirisha la Google kabla ya kukamilisha.',
    'auth/network-request-failed': 'Hitilafu ya mtandao. Hakikisha intaneti yako inafanya kazi.',
  };

  return map[code] || 'Hitilafu imetokea. Tafadhali jaribu tena.';
}

/* ---------- Admin PIN (Realtime Database, scoped to the admin's own uid) ---------- */

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Returns the current admin's stored PIN hash, or null if never set.
async function getAdminPinHash(uid) {
  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, `users/${uid}/adminPinHash`));
  return snap.exists() ? snap.val() : null;
}

async function setAdminPinHash(uid, hash) {
  const fb = await wpFirebaseReady();
  await fb.set(fb.ref(fb.db, `users/${uid}/adminPinHash`), hash);
}

/* ---------- Requests (Realtime Database) ---------- */

// Get all requests (admin use) — returns an array, newest first
async function getRequests() {
  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, 'requests'));
  if (!snap.exists()) return [];

  const obj = snap.val();
  return Object.keys(obj)
    .map((key) => ({ ...obj[key], _key: key }))
    .sort((a, b) => new Date(b.tarehe) - new Date(a.tarehe));
}

// Get a single request by its display id
async function getRequestById(id) {
  const mine = await getUserRequests();
  const found = mine.find((r) => r.id === id);
  if (found) return found;

  try {
    const all = await getRequests();
    return all.find((r) => r.id === id) || null;
  } catch (e) {
    return null;
  }
}

// Get current user's requests
async function getUserRequests() {
  const fb = await wpFirebaseReady();
  const fbUser = fb.auth.currentUser;
  if (!fbUser) return [];

  const snap = await fb.get(fb.ref(fb.db, `userRequests/${fbUser.uid}`));
  if (!snap.exists()) return [];

  const obj = snap.val();
  const keys = Object.keys(obj);

  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const liveSnap = await fb.get(fb.ref(fb.db, `requests/${key}`));
        if (liveSnap.exists()) return { ...liveSnap.val(), _key: key };
      } catch (e) {}
      return { ...obj[key], _key: key };
    })
  );

  return results
    .filter(Boolean)
    .sort((a, b) => new Date(b.tarehe) - new Date(a.tarehe));
}

// Submit a new request
async function submitRequest(type, details) {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const fb = await wpFirebaseReady();
  const fbUser = fb.auth.currentUser;
  if (!fbUser) {
    window.location.href = 'login.html';
    return;
  }

  const newRef = fb.push(fb.ref(fb.db, 'requests'));
  const nowIso = new Date().toISOString();

  const newReq = {
    id: genId(),
    userId: fbUser.uid,
    userName: user.jina,
    userPhone: user.simu,
    type,
    details,
    status: 'pending',
    tarehe: nowIso,
    updatedAt: nowIso,
    adminNote: '',
  };

  await fb.update(fb.ref(fb.db), {
    [`requests/${newRef.key}`]: newReq,
    [`userRequests/${fbUser.uid}/${newRef.key}`]: newReq,
  });

  return { ...newReq, _key: newRef.key };
}

// Admin: update a request's status + note.
async function updateRequest(_key, { status, adminNote }) {
  const fb = await wpFirebaseReady();
  const updatedAt = new Date().toISOString();

  await fb.update(fb.ref(fb.db), {
    [`requests/${_key}/status`]: status,
    [`requests/${_key}/adminNote`]: adminNote,
    [`requests/${_key}/updatedAt`]: updatedAt,
  });
}

/* ---------- Labels ---------- */

// Status label in Swahili
function statusLabel(status) {
  const map = {
    pending: 'Inasubiri',
    approved: 'Imekubaliwa',
    rejected: 'Imekataliwa',
    processing: 'Inashughulikiwa'
  };
  return map[status] || status;
}

// Status badge HTML
function statusBadge(status) {
  return `<span class="badge-${status}">${statusLabel(status)}</span>`;
}

// Service type label
function serviceLabel(type) {
  const map = {
    'lipa-namba': 'Lipa Namba',
    'till-uwakala': 'Till ya Uwakala'
  };
  return map[type] || type;
}

/* ---------- Guards ---------- */

// Auth guard
async function requireAuth() {
  const fbUser = await wpAuthReady();

  if (!fbUser) {
    clearUser();
    window.location.href = 'login.html';
    return false;
  }

  // Refresh cached profile from DB
  try {
    const profile = await syncUserProfile(fbUser);
    saveUser(profile);
  } catch (e) {}

  // Check if account is blocked
  const fb = await wpFirebaseReady();
  const blockedSnap = await fb.get(fb.ref(fb.db, `users/${fbUser.uid}/blocked`));

  if (blockedSnap.exists() && blockedSnap.val() === true) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:var(--wakala-surface,#f5f5f5);text-align:center;">
        <div style="width:72px;height:72px;border-radius:20px;background:#FEE2E2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <i class="icon-secure1" style="font-size:32px;color:#DC2626;"></i>
        </div>
        <h2 style="font-size:20px;font-weight:800;color:#111;margin:0 0 10px;">Akaunti Imezuiwa</h2>
        <p style="font-size:14px;color:#666;margin:0 0 28px;max-width:300px;">Akaunti yako imezuiwa na msimamizi. Tafadhali wasiliana na msaada kwa maelezo zaidi.</p>
        <button onclick="logout()" style="background:#DC2626;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;">Toka</button>
      </div>`;
    return false;
  }

  return true;
}

// Admin guard
async function requireAdmin() {
  const fbUser = await wpAuthReady();

  if (!fbUser) {
    clearUser();
    window.location.href = 'login.html';
    return false;
  }

  const fb = await wpFirebaseReady();
  let isAdmin = false;

  try {
    const snap = await fb.get(fb.ref(fb.db, `users/${fbUser.uid}/isAdmin`));
    isAdmin = snap.exists() && snap.val() === true;
  } catch (e) {
    isAdmin = false;
  }

  if (!isAdmin) {
    window.location.href = 'login.html';
    return false;
  }

  const profile = await syncUserProfile(fbUser);
  saveUser(profile);
  return true;
}

// Logout
async function logout() {
  clearUser();

  try {
    const fb = await wpFirebaseReady();
    await fb.signOut(fb.auth);
  } catch (e) {}

  window.location.href = 'login.html';
}

/* ---------- On DOM ready ---------- */
document.addEventListener('DOMContentLoaded', function () {
  // Preloader
  setTimeout(() => {
    const pre = document.querySelector('.preload-container');
    if (pre) pre.style.display = 'none';
  }, 800);
});

/* ---------- User Management (Admin only) ---------- */

// Get all registered users — admin only
async function getUsers() {
  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, 'users'));
  if (!snap.exists()) return [];

  const obj = snap.val();
  return Object.keys(obj)
    .map((uid) => ({ uid, ...obj[uid] }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

// Admin: block or unblock a user by uid
async function setUserBlocked(uid, blocked) {
  const fb = await wpFirebaseReady();
  await fb.set(fb.ref(fb.db, `users/${uid}/blocked`), blocked ? true : false);
}

// Check if current user is blocked
async function checkBlocked() {
  const fbUser = await wpAuthReady();
  if (!fbUser) return false;

  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, `users/${fbUser.uid}/blocked`));
  return snap.exists() && snap.val() === true;
}

/* ---------- Expose functions to window so HTML pages can call them ---------- */
window.getUser = getUser;
window.saveUser = saveUser;
window.clearUser = clearUser;

window.registerUser = registerUser;
window.loginUser = loginUser;
window.loginWithGoogle = loginWithGoogle;
window.sendPasswordReset = sendPasswordReset;

window.getRequests = getRequests;
window.getRequestById = getRequestById;
window.getUserRequests = getUserRequests;
window.submitRequest = submitRequest;
window.updateRequest = updateRequest;

window.statusLabel = statusLabel;
window.statusBadge = statusBadge;
window.serviceLabel = serviceLabel;
window.formatDate = formatDate;

window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.logout = logout;

window.getUsers = getUsers;
window.setUserBlocked = setUserBlocked;
window.checkBlocked = checkBlocked;

window.sha256Hex = sha256Hex;
window.getAdminPinHash = getAdminPinHash;
window.setAdminPinHash = setAdminPinHash;
