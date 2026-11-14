/** Picks the backend: Firebase when js/config/firebase-config.js is complete, otherwise the browser-only demo. */
import { isFirebaseConfigured } from './config/firebase-config.js';
import { createFirebaseBackend } from './backend-firebase.js';
import { createDemoBackend } from './backend-demo.js';

let current = null;
export async function initBackend() {
  if (current) return current;
  current = isFirebaseConfigured() ? createFirebaseBackend() : createDemoBackend();
  await current.init();
  return current;
}
export const be = () => current;
export const isDemo = () => current?.mode === 'demo';
/** Tests only. */
export const _setBackend = (b) => { current = b; };
