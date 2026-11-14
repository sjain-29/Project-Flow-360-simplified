/**
 * DEMO backend — used only while Firebase is not configured.
 * Everything lives in this browser's localStorage and is visible to no one else.
 * Demo accounts exist only here; they never exist in your Firebase project.
 * Permissions are checked by the app (js/data.js) — in live mode Firebase's
 * Security Rules enforce them on the server.
 */
import { USERNAME_DOMAIN } from './config/firebase-config.js';
import { defaultSettings } from './config/app-config.js';
import { AppError, today, addDays } from './util.js';
import { pushId, stagesFromTemplate } from './model.js';

const DB_KEY = 'pf360t.demo.db'; const AUTH_KEY = 'pf360t.demo.auth'; const SESSION_KEY = 'pf360t.demo.session';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_USERS = [
  ['admin', 'Asha Admin (demo)', 'admin'],
  ['commenter', 'Chetan Commenter (demo)', 'commenter'],
  ['viewer', 'Vina Viewer (demo)', 'viewer'],
];

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const parts = (p) => String(p).split('/').filter(Boolean);
async function hash(salt, pw) {
  const data = new TextEncoder().encode(`${salt}:${pw}`);
  if (globalThis.crypto?.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let h = 0; for (const b of data) h = (h * 31 + b) | 0; return `weak-${h}`; // only where Web Crypto is unavailable
}
const storage = () => globalThis.localStorage;
const sess = () => globalThis.sessionStorage || globalThis.localStorage;

export function createDemoBackend() {
  let tree = {}; let accounts = {}; let user = null;
  const authSubs = new Set(); const subs = new Set();
  const save = () => { storage().setItem(DB_KEY, JSON.stringify(tree)); storage().setItem(AUTH_KEY, JSON.stringify(accounts)); };
  const read = (path) => parts(path).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), tree);
  const write = (path, value) => {
    const ks = parts(path); let n = tree;
    for (const k of ks.slice(0, -1)) { if (!n[k] || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
    const last = ks[ks.length - 1];
    if (value === null || value === undefined) delete n[last]; else n[last] = clone(value);
  };
  const prune = (n) => { if (!n || typeof n !== 'object') return n; for (const k of Object.keys(n)) { n[k] = prune(n[k]); if (n[k] === undefined || (typeof n[k] === 'object' && n[k] !== null && !Object.keys(n[k]).length)) delete n[k]; } return n; };
  const notify = (changed) => {
    for (const s of subs) if (changed.some((c) => c === s.path || c.startsWith(`${s.path}/`) || s.path.startsWith(`${c}/`) || !s.path)) s.cb(clone(read(s.path) ?? null));
  };
  const setUser = (u) => { user = u; authSubs.forEach((cb) => cb(user)); };

  const backend = {
    mode: 'demo',
    async init() {
      try { tree = JSON.parse(storage().getItem(DB_KEY) || 'null') || {}; accounts = JSON.parse(storage().getItem(AUTH_KEY) || 'null') || {}; } catch { tree = {}; accounts = {}; }
      if (!tree.system?.initialized || !Object.keys(accounts).length) await seed();
      const uid = sess().getItem(SESSION_KEY) || storage().getItem(SESSION_KEY);
      const acc = Object.entries(accounts).find(([, a]) => a.uid === uid);
      user = acc ? { uid, email: acc[0] } : null;
    },
    newId: pushId,
    auth: {
      ready: async () => user,
      current: () => user,
      onChange(cb) { authSubs.add(cb); return () => authSubs.delete(cb); },
      async signIn(email, password, remember) {
        const a = accounts[email];
        if (!a || a.hash !== await hash(a.salt, password)) throw new AppError('Incorrect username or password.');
        (remember ? storage() : sess()).setItem(SESSION_KEY, a.uid);
        setUser({ uid: a.uid, email });
        return user;
      },
      async signOut() { sess().removeItem(SESSION_KEY); storage().removeItem(SESSION_KEY); setUser(null); },
      async updatePassword(pw) {
        const e = user && Object.keys(accounts).find((k) => accounts[k].uid === user.uid);
        if (!e) throw new AppError('Not signed in.');
        accounts[e].salt = pushId(); accounts[e].hash = await hash(accounts[e].salt, pw); save();
      },
      async adminCreateUser(email, password) {
        if (accounts[email]) throw new AppError('That username is already in use.');
        const uid = `u_${pushId()}`; const salt = pushId();
        accounts[email] = { uid, salt, hash: await hash(salt, password) }; save();
        return uid;
      },
    },
    async get(path) { return clone(read(path) ?? null); },
    subscribe(path, cb) {
      const s = { path: parts(path).join('/'), cb }; subs.add(s);
      Promise.resolve().then(() => subs.has(s) && cb(clone(read(path) ?? null)));
      return () => subs.delete(s);
    },
    async update(map) {
      await Promise.resolve();
      for (const [p, v] of Object.entries(map)) write(p, v);
      prune(tree); save();
      notify(Object.keys(map).map((p) => parts(p).join('/')));
    },
    /** Demo only: wipe this browser's demo data and start again. */
    reset() { storage().removeItem(DB_KEY); storage().removeItem(AUTH_KEY); storage().removeItem(SESSION_KEY); sess().removeItem(SESSION_KEY); },
  };

  async function seed() {
    tree = {}; accounts = {};
    const now = Date.now(); const d = (n) => addDays(today(), n);
    tree.system = { initialized: true };
    tree.settings = defaultSettings('Demo Organisation');
    tree.users = {}; tree.loginIndex = {};
    for (const [username, name, role] of DEMO_USERS) {
      const uid = `u_${username}`; const salt = pushId();
      accounts[`${username}@${USERNAME_DOMAIN}`] = { uid, salt, hash: await hash(salt, DEMO_PASSWORD) };
      tree.users[uid] = { username, name, role, active: true, mustChangePassword: false, createdAt: now };
      tree.loginIndex[username] = { v: 1 };
    }
    const by = { updatedAt: now, updatedBy: 'u_admin' };
    tree.projects = {
      'DRN-A1': { code: 'DRN-A1', name: 'Survey drone prototype A1', description: 'Long-range survey drone, first flying prototype.', status: 'Active', priority: 'High', startDate: d(-30), targetDate: d(45), createdAt: now, ...by },
      'GCS-B2': { code: 'GCS-B2', name: 'Ground control station B2', description: 'Portable ground station with long-range telemetry.', status: 'Planning', priority: 'Medium', startDate: d(-5), targetDate: d(80), createdAt: now, ...by },
    };
    tree.items = {}; tree.stages = {}; tree.comments = {}; tree.activity = {};
    // done = stages completed; then the current stage's status and expected date; later stages planned every 4 days
    const plan = [
      ['DRN-A1', 'FC-H743', 'Flight controller H743', 4, 'Nos', 7, 'In Progress', -3, { ref: { po: 'PO-2026-118', pr: 'PR-2026-091' } }],
      ['DRN-A1', 'BLDC-2212', 'BLDC motor 2212 920KV', 8, 'Nos', 2, 'Waiting', -2, { ref: { pr: 'PR-2026-097' } }],
      ['DRN-A1', 'CF-FRAME-X8', 'Carbon-fibre X8 frame kit', 2, 'Sets', 3, 'In Progress', 3, { na: ['avail'] }],
      ['DRN-A1', 'LIPO-6S', 'LiPo battery 6S 10000 mAh', 6, 'Nos', 13, 'In Progress', 5, {}],
      ['GCS-B2', 'RADIO-900', '900 MHz telemetry radio', 2, 'Nos', 0, 'Not Started', 6, {}],
    ];
    plan.forEach(([pid, code, name, qty, unit, done, status, due, extra], n) => {
      const iid = `i${n + 1}`;
      tree.items[pid] = tree.items[pid] || {};
      tree.items[pid][iid] = { code, name, qty, unit, priority: n === 1 ? 'Critical' : 'Medium', requiredBy: d(30 + n * 5), order: (n + 1) * 10, createdAt: now, ...by };
      const st = stagesFromTemplate(tree.settings.stageTemplate);
      Object.values(st).sort((a, b) => a.order - b.order).forEach((s, i) => {
        s.expStart = d(-30 + i * 4); s.expEnd = d(-28 + i * 4);
        if (i < done) { s.status = 'Completed'; s.doneOn = d(-29 + i * 3); }
        else if (i === done) { s.status = status; s.expEnd = d(due); }
        else s.expEnd = d(due + (i - done) * 4);
        s.expStart = addDays(s.expEnd, -2);
        Object.assign(s, by);
      });
      for (const [k, v] of Object.entries(extra.ref || {})) st[k].ref = v;
      for (const k of extra.na || []) { st[k].status = 'Not Applicable'; delete st[k].doneOn; }
      tree.stages[pid] = tree.stages[pid] || {}; tree.stages[pid][iid] = st;
    });
    tree.stages['DRN-A1'].i1.dispatch.notes = 'Vendor confirmed dispatch by courier; tracking number awaited.';
    tree.stages['DRN-A1'].i2.prApproval.notes = 'Waiting for the project manager to sign the PR.';
    const comment = (pid, itemId, stageId, uid, name, text, ago) => { tree.comments[pid] = tree.comments[pid] || {}; tree.comments[pid][pushId()] = { itemId, stageId, text, by: uid, byName: name, at: now - ago * 3600000 }; };
    comment('DRN-A1', 'i1', 'dispatch', 'u_commenter', 'Chetan Commenter (demo)', 'Called the vendor — they say it leaves their warehouse tomorrow.', 20);
    comment('DRN-A1', 'i1', 'dispatch', 'u_admin', 'Asha Admin (demo)', 'Thanks. I moved the expected date to match.', 18);
    comment('DRN-A1', 'i2', 'prApproval', 'u_admin', 'Asha Admin (demo)', 'Reminder sent to the PM.', 5);
    comment('DRN-A1', '', '', 'u_commenter', 'Chetan Commenter (demo)', 'Kick-off done. First flight planned once the frame and motors arrive.', 200);
    const act = (pid, text, itemId, stageId, ago) => { tree.activity[pid] = tree.activity[pid] || {}; tree.activity[pid][pushId()] = { at: now - ago * 3600000, by: 'u_admin', byName: 'Asha Admin (demo)', text, itemId, stageId }; };
    act('DRN-A1', 'Project created', '', '', 720);
    act('DRN-A1', 'Payment marked Completed', 'i1', 'payment', 30);
    act('DRN-A1', 'Vendor dispatch: expected date changed', 'i1', 'dispatch', 18);
    act('DRN-A1', 'PR approval set to Waiting', 'i2', 'prApproval', 6);
    save();
  }
  return backend;
}
