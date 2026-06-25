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
// (auth.currentUser is null for a brief moment after a refresh, until
// Firebase re-hydrates it from its own storage). Resolves with the
// Firebase Auth user, or null if nobody is signed in.
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
    // Existing profile — return as-is (don't overwrite jina/simu/mkoa on every login).
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
    try { await fb.updateProfile(cred.user, { displayName: jina }); } catch (e) { /* non-fatal */ }
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

// Translate common Firebase Auth error codes into Swahili messages.
function authErrorMessage(e) {
  const code = e && e.code;
  const map = {
    'auth/email-already-in-use': 'Barua pepe hii tayari imesajiliwa. Tafadhali ingia.',
    'auth/invalid-email': 'Barua pepe si sahihi.',
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
// The PIN itself is never stored — only its SHA-256 hash, under
// users/{uid}/adminPinHash. RTDB rules only allow an account that is
// ALREADY isAdmin === true to read or write this field for itself.

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

// Get a single request by its display id (e.g. "WPABC123").
// Checks the current user's own requests first (works for regular users,
// since RTDB rules only allow a non-admin to read requests matching their
// own userId). Falls back to the full admin list if not found there.
async function getRequestById(id) {
  const mine = await getUserRequests();
  const found = mine.find((r) => r.id === id);
  if (found) return found;
  try {
    const all = await getRequests();
    return all.find((r) => r.id === id) || null;
  } catch (e) {
    // Not an admin and not their own request — no access.
    return null;
  }
}

// Get current user's requests — reads from userRequests/ for the push-key
// index, then fetches the live record from requests/ to get the latest
// admin-updated status/note (admin only writes to requests/, not userRequests/).
async function getUserRequests() {
  const fb = await wpFirebaseReady();
  const fbUser = fb.auth.currentUser;
  if (!fbUser) return [];
  const snap = await fb.get(fb.ref(fb.db, `userRequests/${fbUser.uid}`));
  if (!snap.exists()) return [];
  const obj = snap.val();
  const keys = Object.keys(obj);
  // Fetch live records from requests/ in parallel to get latest status
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const liveSnap = await fb.get(fb.ref(fb.db, `requests/${key}`));
        if (liveSnap.exists()) return { ...liveSnap.val(), _key: key };
      } catch (e) { /* fall back to cached copy */ }
      return { ...obj[key], _key: key };
    })
  );
  return results
    .filter(Boolean)
    .sort((a, b) => new Date(b.tarehe) - new Date(a.tarehe));
}

// Submit a new request — writes to Realtime Database
async function submitRequest(type, details) {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const fb = await wpFirebaseReady();
  const fbUser = fb.auth.currentUser;
  if (!fbUser) { window.location.href = 'login.html'; return; }
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

// Admin: update a request's status + note. Needs the Firebase push key (_key) of the request.
// Admin: update a request's status + note.
// Only writes to requests/ — per DB rules, userRequests.$uid .write only
// allows the owner (auth.uid === $uid), not admin. Authoritative status
// lives in requests/ which admin CAN write per the rules.
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
  const map = { pending: 'Inasubiri', approved: 'Imekubaliwa', rejected: 'Imekataliwa', processing: 'Inashughulikiwa' };
  return map[status] || status;
}

// Status badge HTML
function statusBadge(status) {
  return `<span class="badge-${status}">${statusLabel(status)}</span>`;
}

// Service type label
function serviceLabel(type) {
  const map = { 'lipa-namba': 'Lipa Namba', 'till-uwakala': 'Till ya Uwakala' };
  return map[type] || type;
}

/* ---------- Guards ---------- */

// Auth guard — redirect to login if not logged in, or show blocked screen if blocked.
// Waits for Firebase Auth to finish restoring the session before deciding,
// so a page refresh doesn't briefly look "logged out".
async function requireAuth() {
  const fbUser = await wpAuthReady();
  if (!fbUser) {
    clearUser();
    window.location.href = 'login.html';
    return false;
  }
  // Check if account is blocked by admin
  const fb = await wpFirebaseReady();
  const blockedSnap = await fb.get(fb.ref(fb.db, `users/${fbUser.uid}/blocked`));
  if (blockedSnap.exists() && blockedSnap.val() === true) {
    // Show block screen instead of redirecting to keep context
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

// Admin guard — verifies admin status LIVE against Realtime Database,
// using the signed-in Firebase Auth user's uid. Never trusts the
// localStorage cache, since that's fully editable by anyone with devtools.
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
  // Refresh the local cache now that we've confirmed admin status server-side,
  // so the rest of the page (which reads getUser() synchronously) is accurate.
  const profile = await syncUserProfile(fbUser);
  saveUser(profile);
  return true;
}

// Logout — signs out of Firebase Auth and clears local session cache
async function logout() {
  clearUser();
  try {
    const fb = await wpFirebaseReady();
    await fb.signOut(fb.auth);
  } catch (e) { /* ignore — local session is already cleared */ }
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
// Must write directly to the blocked child node — the parent $uid .write
// rule restricts to auth.uid === $uid, but the blocked child rule allows admin.
async function setUserBlocked(uid, blocked) {
  const fb = await wpFirebaseReady();
  await fb.set(fb.ref(fb.db, `users/${uid}/blocked`), blocked ? true : false);
}

// Check if current user is blocked — called on every protected page load
async function checkBlocked() {
  const fbUser = await wpAuthReady();
  if (!fbUser) return false;
  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, `users/${fbUser.uid}/blocked`));
  return snap.exists() && snap.val() === true;
}
