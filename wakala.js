/* =========================================================
   WAKALA POINT — CORE APP / DATA LAYER
   Inafanya kazi pamoja na firebase-init.js
   - Auth
   - Users
   - Requests
   - Admin guard
   - Admin PIN
   - Local/session helpers
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     CONFIG
     ========================================================= */
  const LS_USER_KEY = "wp_user";
  const LS_ADMIN_USER_KEY = "wp_admin_user";
  const DEFAULT_AVATAR = "";

  /* =========================================================
     INTERNAL HELPERS
     ========================================================= */
  function ensureFirebase() {
    if (!window.__wpFirebase) {
      throw new Error("Firebase haijapakiwa. Hakikisha firebase-init.js imewekwa kabla ya wakala.js");
    }
    return window.__wpFirebase;
  }

  async function fbReady() {
    if (typeof window.wpFirebaseReady === "function") {
      return await window.wpFirebaseReady();
    }
    return ensureFirebase();
  }

  function normalizePhone(phone = "") {
    let p = String(phone).trim();
    if (!p) return "";
    p = p.replace(/\s+/g, "");

    // +2557..., 2557..., 07...
    if (p.startsWith("+255")) return p;
    if (p.startsWith("255")) return "+" + p;
    if (p.startsWith("0")) return "+255" + p.slice(1);
    return p;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeText(v, fallback = "") {
    return v == null ? fallback : String(v);
  }

  function cleanObject(obj = {}) {
    const out = {};
    Object.keys(obj).forEach((k) => {
      const val = obj[k];
      if (val !== undefined) out[k] = val;
    });
    return out;
  }

  function randomId(prefix = "WP") {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function toArrayFromSnapshot(snapshot) {
    const arr = [];
    if (!snapshot || !snapshot.exists()) return arr;
    snapshot.forEach((childSnap) => {
      arr.push({
        _key: childSnap.key,
        ...(childSnap.val() || {})
      });
    });
    return arr;
  }

  function sortByDateDesc(list, dateField = "tarehe") {
    return [...list].sort((a, b) => {
      const da = new Date(a?.[dateField] || 0).getTime();
      const db = new Date(b?.[dateField] || 0).getTime();
      return db - da;
    });
  }

  function mapFirebaseAuthError(err) {
    const code = err?.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "Barua pepe si sahihi.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Barua pepe au nenosiri si sahihi.";
      case "auth/email-already-in-use":
        return "Barua pepe hii tayari imesajiliwa.";
      case "auth/weak-password":
        return "Nenosiri ni dhaifu. Tumia angalau herufi/simu 6 au zaidi.";
      case "auth/popup-closed-by-user":
        return "Dirisha la Google limefungwa kabla ya kumaliza kuingia.";
      case "auth/cancelled-popup-request":
        return "Ombi la kuingia limekatishwa.";
      case "auth/network-request-failed":
        return "Tatizo la mtandao. Tafadhali jaribu tena.";
      case "auth/too-many-requests":
        return "Majaribio mengi yameshindwa. Jaribu tena baadaye.";
      default:
        return err?.message || "Hitilafu imetokea. Tafadhali jaribu tena.";
    }
  }

  /* =========================================================
     HASH / SECURITY HELPERS
     ========================================================= */
  async function sha256Hex(text) {
    const msgUint8 = new TextEncoder().encode(String(text));
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* =========================================================
     STORAGE HELPERS
     ========================================================= */
  function saveUser(user) {
    if (!user) return;
    try {
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
      if (user.isAdmin) {
        localStorage.setItem(LS_ADMIN_USER_KEY, JSON.stringify(user));
      }
    } catch (_) {}
  }

  function getSavedUser() {
    try {
      const raw = localStorage.getItem(LS_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getSavedAdmin() {
    try {
      const raw = localStorage.getItem(LS_ADMIN_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearSavedUser() {
    try {
      localStorage.removeItem(LS_USER_KEY);
      localStorage.removeItem(LS_ADMIN_USER_KEY);
      sessionStorage.removeItem("wp_admin_unlocked");
    } catch (_) {}
  }

  function getCurrentUser() {
    return getSavedUser();
  }

  /* =========================================================
     USERS DB HELPERS
     DB Structure (recommended):
     users/{uid} = {
       uid, email, jina, simu, mkoa, isAdmin, blocked, createdAt, updatedAt
     }
     ========================================================= */
  async function getUserByUid(uid) {
    if (!uid) return null;
    const fb = await fbReady();
    const snap = await fb.get(fb.ref(fb.db, `users/${uid}`));
    return snap.exists() ? { uid, ...(snap.val() || {}) } : null;
  }

  async function createOrUpdateUserProfile(uid, data = {}) {
    if (!uid) throw new Error("UID haipo");
    const fb = await fbReady();

    const userRef = fb.ref(fb.db, `users/${uid}`);
    const existingSnap = await fb.get(userRef);
    const existing = existingSnap.exists() ? existingSnap.val() : null;

    const payload = cleanObject({
      uid,
      email: safeText(data.email, existing?.email || ""),
      jina: safeText(data.jina, existing?.jina || ""),
      simu: normalizePhone(data.simu || existing?.simu || ""),
      mkoa: safeText(data.mkoa, existing?.mkoa || ""),
      avatar: safeText(data.avatar, existing?.avatar || DEFAULT_AVATAR),
      isAdmin: data.isAdmin === true || existing?.isAdmin === true,
      blocked: data.blocked === true || existing?.blocked === true,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    });

    await fb.set(userRef, payload);
    return payload;
  }

  async function setUserBlocked(uid, blocked = true) {
    if (!uid) throw new Error("UID ya mtumiaji haipo");
    const fb = await fbReady();
    await fb.update(fb.ref(fb.db, `users/${uid}`), {
      blocked: !!blocked,
      updatedAt: nowIso()
    });
    return true;
  }

  async function getUsers() {
    const fb = await fbReady();
    const snap = await fb.get(fb.ref(fb.db, "users"));
    if (!snap.exists()) return [];
    const list = [];
    snap.forEach((childSnap) => {
      list.push({
        uid: childSnap.key,
        ...(childSnap.val() || {})
      });
    });
    // Admins juu, then recent
    return list.sort((a, b) => {
      if ((a.isAdmin ? 1 : 0) !== (b.isAdmin ? 1 : 0)) return (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0);
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }

  /* =========================================================
     AUTH
     ========================================================= */
  async function registerUser(payload = {}) {
    const fb = await fbReady();

    const email = String(payload.email || "").trim();
    const password = String(payload.password || "");
    const jina = String(payload.jina || "").trim();
    const simu = normalizePhone(payload.simu || "");
    const mkoa = String(payload.mkoa || "").trim();

    if (!email || !password || !jina) {
      throw new Error("Jaza jina, barua pepe na nenosiri.");
    }

    try {
      const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, password);

      if (jina) {
        try {
          await fb.updateProfile(cred.user, { displayName: jina });
        } catch (_) {}
      }

      const profile = await createOrUpdateUserProfile(cred.user.uid, {
        email,
        jina,
        simu,
        mkoa,
        isAdmin: false,
        blocked: false
      });

      saveUser(profile);
      return profile;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }

  async function loginUser(email, password) {
    const fb = await fbReady();

    if (!email || !password) {
      throw new Error("Weka barua pepe na nenosiri.");
    }

    try {
      const cred = await fb.signInWithEmailAndPassword(fb.auth, String(email).trim(), String(password));
      let profile = await getUserByUid(cred.user.uid);

      // Ikiwa profile haipo kabisa DB, itengeneze kwa msingi wa auth profile
      if (!profile) {
        profile = await createOrUpdateUserProfile(cred.user.uid, {
          email: cred.user.email || email,
          jina: cred.user.displayName || "Mtumiaji",
          simu: "",
          mkoa: "",
          isAdmin: false,
          blocked: false
        });
      }

      if (profile.blocked === true) {
        await fb.signOut(fb.auth);
        clearSavedUser();
        throw new Error("Akaunti yako imezuiwa. Wasiliana na msimamizi.");
      }

      saveUser(profile);
      return profile;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }

  async function loginWithGoogle() {
    const fb = await fbReady();

    try {
      const result = await fb.signInWithPopup(fb.auth, fb.googleProvider);
      const gUser = result.user;

      let profile = await getUserByUid(gUser.uid);

      if (!profile) {
        profile = await createOrUpdateUserProfile(gUser.uid, {
          email: gUser.email || "",
          jina: gUser.displayName || "Mtumiaji",
          simu: "",
          mkoa: "",
          avatar: gUser.photoURL || "",
          isAdmin: false,
          blocked: false
        });
      } else {
        // refresh basic profile
        profile = await createOrUpdateUserProfile(gUser.uid, {
          ...profile,
          email: gUser.email || profile.email || "",
          jina: gUser.displayName || profile.jina || "Mtumiaji",
          avatar: gUser.photoURL || profile.avatar || ""
        });
      }

      if (profile.blocked === true) {
        await fb.signOut(fb.auth);
        clearSavedUser();
        throw new Error("Akaunti yako imezuiwa. Wasiliana na msimamizi.");
      }

      saveUser(profile);
      return profile;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }

  async function sendResetPassword(email) {
    const fb = await fbReady();
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) throw new Error("Weka barua pepe kwanza.");

    try {
      await fb.sendPasswordResetEmail(fb.auth, cleanEmail);
      return true;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }

  async function logout() {
    const fb = await fbReady();
    try {
      await fb.signOut(fb.auth);
    } catch (_) {}
    clearSavedUser();
    window.location.href = "login.html";
  }

  /* =========================================================
     ADMIN GUARD
     ========================================================= */
  async function requireAuth(redirectTo = "login.html") {
    const fb = await fbReady();

    // 1) if local saved user exists, use it
    let user = getSavedUser();

    // 2) if no local, try auth state
    if (!user) {
      const authUser = typeof window.wpWaitForAuth === "function"
        ? await window.wpWaitForAuth()
        : fb.auth.currentUser;

      if (!authUser) {
        window.location.href = redirectTo;
        return false;
      }

      const profile = await getUserByUid(authUser.uid);
      if (!profile) {
        window.location.href = redirectTo;
        return false;
      }

      if (profile.blocked === true) {
        clearSavedUser();
        try { await fb.signOut(fb.auth); } catch (_) {}
        window.location.href = redirectTo;
        return false;
      }

      saveUser(profile);
      user = profile;
    }

    return user;
  }

  async function requireAdmin(redirectTo = "login.html") {
    const user = await requireAuth(redirectTo);
    if (!user) return false;

    if (user.isAdmin !== true) {
      alert("Huna ruhusa ya kuingia Admin Panel.");
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  /* =========================================================
     REQUESTS
     DB Structure (recommended):
     requests/{autoKey} = {
       id, type, status, tarehe,
       userUid, userName, userPhone,
       adminNote,
       details: { ... }
     }
     ========================================================= */

  function normalizeRequestPayload(payload = {}) {
    const details = payload.details || {};

    return cleanObject({
      id: payload.id || randomId("REQ"),
      type: payload.type || "lipa-namba", // lipa-namba / till-uwakala / etc
      status: payload.status || "pending", // pending / processing / approved / rejected
      tarehe: payload.tarehe || nowIso(),

      userUid: payload.userUid || "",
      userName: payload.userName || "",
      userPhone: normalizePhone(payload.userPhone || ""),
      adminNote: payload.adminNote || "",

      details: cleanObject({
        jina: details.jina || payload.userName || "",
        simu: normalizePhone(details.simu || payload.userPhone || ""),
        aina_id: details.aina_id || "",
        namba_id: details.namba_id || "",
        jina_biashara: details.jina_biashara || "",
        aina_biashara: details.aina_biashara || "",
        namba_ya_biashara: details.namba_ya_biashara || "",
        mtandao: details.mtandao || "",
        aina_wakala: details.aina_wakala || "",
        mkoa: details.mkoa || "",
        wilaya: details.wilaya || "",
        kata: details.kata || "",
        umbali_wakala: details.umbali_wakala || "",
        mtaji: details.mtaji || "",
        mahali: details.mahali || "",
        umri: details.umri || "",
        historia_wakala: details.historia_wakala || "",
        maelezo: details.maelezo || "",
        eneo_maelezo: details.eneo_maelezo || ""
      }),

      createdAt: payload.createdAt || nowIso(),
      updatedAt: nowIso()
    });
  }

  async function createRequest(payload = {}) {
    const fb = await fbReady();
    const normalized = normalizeRequestPayload(payload);

    const reqRef = fb.push(fb.ref(fb.db, "requests"));
    await fb.set(reqRef, normalized);

    return {
      _key: reqRef.key,
      ...normalized
    };
  }

  async function getRequests() {
    const fb = await fbReady();
    const snap = await fb.get(fb.ref(fb.db, "requests"));
    const list = toArrayFromSnapshot(snap);
    return sortByDateDesc(list, "tarehe");
  }

  async function getRequestByKey(key) {
    if (!key) return null;
    const fb = await fbReady();
    const snap = await fb.get(fb.ref(fb.db, `requests/${key}`));
    return snap.exists() ? { _key: key, ...(snap.val() || {}) } : null;
  }

  async function getRequestById(requestId) {
    const all = await getRequests();
    return all.find((r) => r.id === requestId) || null;
  }

  async function getRequestsByUser(uid) {
    if (!uid) return [];
    const all = await getRequests();
    return all.filter((r) => r.userUid === uid);
  }

  async function updateRequest(key, patch = {}) {
    if (!key) throw new Error("Request key haipo");
    const fb = await fbReady();

    const allowed = cleanObject({
      status: patch.status,
      adminNote: patch.adminNote,
      type: patch.type,
      userName: patch.userName,
      userPhone: patch.userPhone ? normalizePhone(patch.userPhone) : undefined,
      details: patch.details
    });

    allowed.updatedAt = nowIso();

    await fb.update(fb.ref(fb.db, `requests/${key}`), allowed);
    return true;
  }

  async function deleteRequest(key) {
    if (!key) throw new Error("Request key haipo");
    const fb = await fbReady();
    await fb.remove(fb.ref(fb.db, `requests/${key}`));
    return true;
  }

  /* =========================================================
     ADMIN PIN
     DB Structure:
     adminPins/{uid} = {
       pinHash: "...",
       updatedAt: "..."
     }
     ========================================================= */
  async function getAdminPinHash(uid) {
    if (!uid) return null;
    const fb = await fbReady();
    const snap = await fb.get(fb.ref(fb.db, `adminPins/${uid}`));
    if (!snap.exists()) return null;
    const data = snap.val() || {};
    return data.pinHash || null;
  }

  async function setAdminPinHash(uid, pinHash) {
    if (!uid) throw new Error("Admin UID haipo");
    if (!pinHash) throw new Error("PIN hash haipo");

    const fb = await fbReady();
    await fb.set(fb.ref(fb.db, `adminPins/${uid}`), {
      pinHash,
      updatedAt: nowIso()
    });
    return true;
  }

  /* =========================================================
     OPTIONAL LIVE LISTENERS
     Kama utahitaji realtime updates kwenye page
     ========================================================= */
  function listenRequests(callback) {
    const fb = ensureFirebase();
    const requestsRef = fb.ref(fb.db, "requests");

    const handler = (snap) => {
      const list = sortByDateDesc(toArrayFromSnapshot(snap), "tarehe");
      if (typeof callback === "function") callback(list);
    };

    fb.onValue(requestsRef, handler);
    return () => fb.off(requestsRef, "value", handler);
  }

  function listenUsers(callback) {
    const fb = ensureFirebase();
    const usersRef = fb.ref(fb.db, "users");

    const handler = (snap) => {
      const list = [];
      if (snap.exists()) {
        snap.forEach((childSnap) => {
          list.push({ uid: childSnap.key, ...(childSnap.val() || {}) });
        });
      }
      if (typeof callback === "function") callback(list);
    };

    fb.onValue(usersRef, handler);
    return () => fb.off(usersRef, "value", handler);
  }

  /* =========================================================
     UTILITIES FOR UI
     ========================================================= */
  function serviceLabel(type) {
    const map = {
      "lipa-namba": "Lipa Namba",
      "till-uwakala": "Till",
      "wakala-mpya": "Uwakala Mpya",
      "ongeza-float": "Ongeza Float",
      "tatizo": "Tatizo / Support"
    };
    return map[type] || type || "Huduma";
  }

  function statusLabel(status) {
    const map = {
      pending: "Inasubiri",
      processing: "Inashughulikiwa",
      approved: "Imekubaliwa",
      rejected: "Imekataliwa"
    };
    return map[status] || status || "—";
  }

  function formatDate(dateLike) {
    if (!dateLike) return "—";
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "—";

    try {
      return new Intl.DateTimeFormat("sw-TZ", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  /* =========================================================
     OPTIONAL: seed first admin manually
     Tumia hii mara moja browser console:
     await seedAdminByEmail("you@example.com")
     ========================================================= */
  async function seedAdminByEmail(email) {
    const fb = await fbReady();
    const allUsers = await getUsers();
    const found = allUsers.find((u) => String(u.email || "").toLowerCase() === String(email || "").toLowerCase());
    if (!found) throw new Error("Mtumiaji wa email hiyo hajapatikana kwenye users.");
    await fb.update(fb.ref(fb.db, `users/${found.uid}`), {
      isAdmin: true,
      updatedAt: nowIso()
    });
    return true;
  }

  /* =========================================================
     OPTIONAL: demo helper
     ========================================================= */
  async function ensureUserProfileFromAuth() {
    const fb = await fbReady();
    const authUser = fb.auth.currentUser;
    if (!authUser) return null;

    let profile = await getUserByUid(authUser.uid);
    if (!profile) {
      profile = await createOrUpdateUserProfile(authUser.uid, {
        email: authUser.email || "",
        jina: authUser.displayName || "Mtumiaji",
        simu: "",
        mkoa: "",
        avatar: authUser.photoURL || "",
        isAdmin: false,
        blocked: false
      });
    }
    saveUser(profile);
    return profile;
  }

  /* =========================================================
     EXPOSE GLOBALS
     ========================================================= */
  window.sha256Hex = sha256Hex;

  // storage
  window.saveUser = saveUser;
  window.getSavedUser = getSavedUser;
  window.getCurrentUser = getCurrentUser;
  window.clearSavedUser = clearSavedUser;

  // auth
  window.registerUser = registerUser;
  window.loginUser = loginUser;
  window.loginWithGoogle = loginWithGoogle;
  window.sendResetPassword = sendResetPassword;
  window.logout = logout;
  window.requireAuth = requireAuth;
  window.requireAdmin = requireAdmin;

  // users
  window.getUsers = getUsers;
  window.getUserByUid = getUserByUid;
  window.createOrUpdateUserProfile = createOrUpdateUserProfile;
  window.setUserBlocked = setUserBlocked;
  window.ensureUserProfileFromAuth = ensureUserProfileFromAuth;

  // requests
  window.createRequest = createRequest;
  window.getRequests = getRequests;
  window.getRequestByKey = getRequestByKey;
  window.getRequestById = getRequestById;
  window.getRequestsByUser = getRequestsByUser;
  window.updateRequest = updateRequest;
  window.deleteRequest = deleteRequest;

  // admin pin
  window.getAdminPinHash = getAdminPinHash;
  window.setAdminPinHash = setAdminPinHash;

  // live
  window.listenRequests = listenRequests;
  window.listenUsers = listenUsers;

  // ui helpers
  window.serviceLabel = serviceLabel;
  window.statusLabel = statusLabel;
  window.formatDate = formatDate;

  // admin seed helper
  window.seedAdminByEmail = seedAdminByEmail;
})();
