/**
 * FIREBASE CONNECTION — the only file you need to edit to go live.
 *
 * Firebase console → Project settings (gear icon) → General → "Your apps" → Web app → Config.
 * Copy apiKey and appId into the object below, save, commit and push.
 * Until both are filled in, the app runs in DEMO MODE (data stays in your browser).
 *
 * These values are not secrets: they only identify your project. Your data is
 * protected by Firebase Authentication and the Security Rules in
 * firebase/database.rules.json — never by hiding this file.
 * NEVER put a service-account key or any password in this repository.
 */
export const firebaseConfig = {
  apiKey: '',      // ← still needed (looks like AIza…)
  authDomain: 'projectflow360-2.firebaseapp.com',
  databaseURL: 'https://projectflow360-2-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'projectflow360-2',
  appId: '',       // ← still needed (looks like 1:123…:web:abc…)
};

/**
 * People sign in with a username. Firebase Authentication needs an e-mail address,
 * so the app builds one internally: <username>@<USERNAME_DOMAIN>. No e-mail is ever
 * sent to it. Never change this after users have been created.
 */
export const USERNAME_DOMAIN = 'pf360.example.com';

const REQUIRED = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
export const missingFirebaseValues = () => REQUIRED.filter((k) => !String(firebaseConfig[k] || '').trim());
export const isFirebaseConfigured = () => missingFirebaseValues().length === 0;
