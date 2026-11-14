/**
 * LIVE backend: Firebase Authentication + Firebase Realtime Database (free Spark plan).
 * All protection comes from Firebase Authentication plus the Security Rules in
 * firebase/database.rules.json, which Firebase checks on its servers for every
 * read and write. Nothing in the browser is trusted.
 */
import { firebaseConfig } from './config/firebase-config.js';
import { APP } from './config/app-config.js';
import { AppError } from './util.js';

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'Incorrect username or password.',
  'auth/wrong-password': 'Incorrect username or password.',
  'auth/user-not-found': 'Incorrect username or password.',
  'auth/invalid-email': 'Incorrect username or password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many failed attempts. Sign-in is blocked for a few minutes — wait and try again.',
  'auth/network-request-failed': 'No connection to the server. Check your internet connection and try again.',
  'auth/email-already-in-use': 'That username is already in use.',
  'auth/weak-password': 'That password is too weak. Use at least 8 characters.',
  'auth/requires-recent-login': 'For security, sign out and sign in again before changing your password.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase Authentication (README, step 2).',
};
const authError = (e) => { const x = new AppError(AUTH_MESSAGES[e?.code] || `Sign-in failed (${e?.code || e?.message || 'unknown error'}).`); x.code = e?.code; return x; };
const dbError = (e) => {
  const msg = String(e?.code || e?.message || '').toLowerCase();
  const x = new AppError(msg.includes('permission') ? 'You do not have permission to do this.' : `Could not reach the database (${e?.message || e}). Check your connection and try again.`);
  x.code = msg.includes('permission') ? 'PERMISSION_DENIED' : 'NETWORK'; return x;
};

async function loadSdk() {
  if (globalThis.__PF360_FIREBASE_SDK__) return globalThis.__PF360_FIREBASE_SDK__; // test double
  const base = `https://www.gstatic.com/firebasejs/${APP.firebaseSdkVersion}`;
  const [app, auth, database] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-database.js`)]);
  return { app, auth, database };
}

export function createFirebaseBackend() {
  let sdk; let app; let auth; let db; let user = null; let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  const subs = new Set();
  const norm = (p) => String(p).replace(/^\/+/, '');
  return {
    mode: 'firebase',
    async init() {
      sdk = await loadSdk();
      app = sdk.app.initializeApp(firebaseConfig);
      auth = sdk.auth.getAuth(app);
      db = sdk.database.getDatabase(app);
      sdk.auth.onAuthStateChanged(auth, (u) => { user = u ? { uid: u.uid, email: u.email } : null; readyResolve(user); subs.forEach((cb) => cb(user)); });
    },
    newId: () => sdk.database.push(sdk.database.ref(db, 'ids')).key,
    auth: {
      ready: () => ready,
      current: () => user,
      onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
      async signIn(email, password, remember) {
        try {
          await sdk.auth.setPersistence(auth, remember ? sdk.auth.browserLocalPersistence : sdk.auth.browserSessionPersistence);
          const cred = await sdk.auth.signInWithEmailAndPassword(auth, email, password);
          user = { uid: cred.user.uid, email: cred.user.email };
          return user;
        } catch (e) { throw authError(e); }
      },
      async signOut() { try { await sdk.auth.signOut(auth); } finally { user = null; } },
      async updatePassword(pw) { try { await sdk.auth.updatePassword(auth.currentUser, pw); } catch (e) { throw authError(e); } },
      /** Create a sign-in account WITHOUT signing the administrator out (a temporary second app instance). */
      async adminCreateUser(email, password) {
        const app2 = sdk.app.initializeApp(firebaseConfig, `pf360-new-${Date.now()}`);
        try {
          const auth2 = sdk.auth.initializeAuth(app2, { persistence: sdk.auth.inMemoryPersistence });
          const cred = await sdk.auth.createUserWithEmailAndPassword(auth2, email, password);
          await sdk.auth.signOut(auth2);
          return cred.user.uid;
        } catch (e) { throw authError(e); } finally { await sdk.app.deleteApp(app2).catch(() => {}); }
      },
    },
    async get(path) { try { return (await sdk.database.get(sdk.database.ref(db, norm(path)))).val(); } catch (e) { throw dbError(e); } },
    subscribe(path, cb, onError) { return sdk.database.onValue(sdk.database.ref(db, norm(path)), (s) => cb(s.val()), (e) => onError?.(dbError(e))); },
    /** Atomic multi-path update: every path is written, or none is. */
    async update(map) {
      const flat = {}; for (const [p, v] of Object.entries(map)) flat[norm(p)] = v;
      try { await sdk.database.update(sdk.database.ref(db), flat); } catch (e) { throw dbError(e); }
    },
  };
}
