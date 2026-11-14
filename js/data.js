/**
 * Session, live data and every change the app can make.
 * Roles: admin (changes everything), commenter (view + comment), viewer (view only).
 * The checks here give clear messages; in live mode Firebase's Security Rules are
 * what actually enforce them.
 */
import { be } from './backend.js';
import { USERNAME_DOMAIN } from './config/firebase-config.js';
import { ROLES, STAGE_STATUSES, PROJECT_STATUSES, PRIORITIES, USERNAME_RE, CODE_RE, PASSWORD_MIN, defaultSettings } from './config/app-config.js';
import { AppError, today, fmtDate, num } from './util.js';
import { list, stagesFromTemplate, isOpen, lateDays, dueInfo, progress, itemState } from './model.js';

/* ------------------------------------------------------------------ session */
export const emailFor = (username, v = 1) => `${username}${v > 1 ? `.v${v}` : ''}@${USERNAME_DOMAIN}`;
export const usernameOf = (email) => String(email || '').split('@')[0].replace(/\.v\d+$/, '');
export const session = { uid: null, email: null, me: null, state: 'none' };

export async function login(username, password, remember) {
  const u = String(username || '').trim().toLowerCase();
  if (!u || !password) throw new AppError('Enter your username and password.');
  if (!USERNAME_RE.test(u)) throw new AppError('Incorrect username or password.');
  let v = 1;
  try { v = num((await be().get(`loginIndex/${u}`))?.v) || 1; } catch { /* first sign-in, or offline: try the original account */ }
  await be().auth.signIn(emailFor(u, v), password, remember);
  return establish();
}
export async function logout() { stop(); await be().auth.signOut(); Object.assign(session, { uid: null, email: null, me: null, state: 'none' }); }

/** Work out what the signed-in account may do: none | ok | changePassword | bootstrap | unknown | inactive. */
export async function establish() {
  const u = be().auth.current();
  if (!u) return Object.assign(session, { uid: null, email: null, me: null, state: 'none' });
  Object.assign(session, { uid: u.uid, email: u.email });
  const me = await be().get(`users/${u.uid}`);
  session.me = me;
  if (!me) {
    const sys = (await be().get('system').catch(() => null)) || {};
    session.state = !sys.initialized && sys.bootstrapUid === u.uid ? 'bootstrap' : 'unknown';
  } else if (me.active !== true) session.state = 'inactive';
  else session.state = me.mustChangePassword ? 'changePassword' : 'ok';
  return session;
}

/** One-time set-up by the account whose UID the owner put in /system/bootstrapUid. */
export async function initialiseSystem({ name, orgName }) {
  if (session.state !== 'bootstrap') throw new AppError('This account cannot set up the system.');
  if (!String(name || '').trim()) throw new AppError('Enter your display name.');
  const username = usernameOf(session.email);
  await be().update({
    [`users/${session.uid}`]: { username, name: name.trim(), role: 'admin', active: true, mustChangePassword: true, createdAt: Date.now() },
    [`loginIndex/${username}`]: { v: 1 },
    settings: defaultSettings(String(orgName || '').trim() || 'My Organisation'),
    'system/initialized': true,
  });
  return establish();
}

export async function changePassword(pw, confirm) {
  if (String(pw || '').length < PASSWORD_MIN) throw new AppError(`Use at least ${PASSWORD_MIN} characters.`);
  if (pw !== confirm) throw new AppError('The two passwords do not match.');
  await be().auth.updatePassword(pw);
  if (session.me?.mustChangePassword) await be().update({ [`users/${session.uid}/mustChangePassword`]: false });
  return establish();
}

/* ------------------------------------------------------------------ live data */
const state = { settings: {}, projects: {}, items: {}, stages: {}, comments: {}, activity: {}, users: {} };
let unsubs = []; let changed = () => {}; let queued = false;
const bump = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; changed(); }); };
export function start(onChange) {
  stop(); changed = onChange;
  const keys = ['settings', 'projects', 'items', 'stages', 'comments', 'activity', ...(isAdmin() ? ['users'] : [])];
  for (const k of keys) unsubs.push(be().subscribe(k, (v) => { state[k] = v || {}; bump(); }, (e) => console.warn(k, e.message)));
  unsubs.push(be().subscribe(`users/${session.uid}`, (v) => {
    const was = session.me; session.me = v;
    if (!v || v.active !== true || v.role !== was?.role) { session.state = !v || v.active !== true ? 'inactive' : session.state; bump(); }
  }));
}
export function stop() { unsubs.forEach((u) => u && u()); unsubs = []; }

export const role = () => session.me?.role || 'viewer';
export const roleName = () => ROLES[role()]?.name || '';
export const isAdmin = () => session.me?.active === true && session.me?.role === 'admin';
export const canComment = () => session.me?.active === true && ['admin', 'commenter'].includes(session.me?.role);
const requireAdmin = () => { if (!isAdmin()) throw new AppError('Only the administrator can change this.'); };

export const settings = () => ({ orgName: 'My Organisation', dueSoonDays: 7, stageTemplate: {}, ...state.settings });
export const projects = () => list(state.projects).sort((a, b) => a.code.localeCompare(b.code));
export const project = (pid) => (state.projects[pid] ? { id: pid, ...state.projects[pid] } : null);
export const items = (pid) => list(state.items[pid]);
export const item = (pid, iid) => (state.items[pid]?.[iid] ? { id: iid, ...state.items[pid][iid] } : null);
export const stageMap = (pid, iid) => state.stages[pid]?.[iid] || {};
export const stages = (pid, iid) => list(stageMap(pid, iid));
export const stage = (pid, iid, sid) => (stageMap(pid, iid)[sid] ? { id: sid, ...stageMap(pid, iid)[sid] } : null);
export const comments = (pid, f = {}) => list(state.comments[pid], 'at').filter((c) => (f.itemId === undefined || (c.itemId || '') === f.itemId) && (f.stageId === undefined || (c.stageId || '') === f.stageId));
export const allComments = () => Object.keys(state.comments).flatMap((pid) => comments(pid).map((c) => ({ ...c, pid }))).sort((a, b) => b.at - a.at);
export const activity = (pid) => list(state.activity[pid], 'at').reverse();
export const allActivity = () => Object.keys(state.activity).flatMap((pid) => activity(pid).map((a) => ({ ...a, pid }))).sort((a, b) => b.at - a.at);
export const users = () => Object.entries(state.users).map(([id, u]) => ({ id, ...u })).filter((u) => !u.replacedBy).sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.username.localeCompare(b.username));

export const projectProgress = (pid) => progress(Object.assign({}, ...items(pid).map((i) => Object.fromEntries(Object.entries(stageMap(pid, i.id)).map(([k, v]) => [`${i.id}/${k}`, v])))));
export const itemProgress = (pid, iid) => progress(stageMap(pid, iid));
export const itemStatus = (pid, iid) => itemState(stageMap(pid, iid));

/** Every stage of every item, with its project and item, for the dashboard, deadlines and search. */
export function stageRows({ includeClosed = false } = {}) {
  const soon = settings().dueSoonDays;
  const out = [];
  for (const p of projects()) {
    if (!includeClosed && ['Completed', 'Cancelled'].includes(p.status)) continue;
    for (const i of items(p.id)) for (const s of stages(p.id, i.id)) out.push({ ...s, sid: s.id, pid: p.id, iid: i.id, projectName: p.name, itemCode: i.code, itemName: i.name, late: lateDays(s), due: dueInfo(s, soon) });
  }
  return out;
}
export const overdueRows = () => stageRows().filter((r) => r.late > 0).sort((a, b) => b.late - a.late);

/* ------------------------------------------------------------------ writes (one atomic update each) */
const stamp = () => ({ updatedAt: Date.now(), updatedBy: session.uid });
const logEntry = (pid, text, itemId = '', stageId = '') => ({ [`activity/${pid}/${be().newId()}`]: { at: Date.now(), by: session.uid, byName: session.me?.name || '', text, itemId, stageId } });
const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== undefined));
const orNull = (v) => (v === '' || v === undefined ? null : v);
const checkDates = (a, b, what) => { if (a && b && b < a) throw new AppError(`${what}: the end date cannot be before the start date.`); };

export async function saveProject(v, pid) {
  requireAdmin();
  const d = clean(v);
  if (!d.name) throw new AppError('Enter the project name.');
  if (d.status && !PROJECT_STATUSES.includes(d.status)) throw new AppError('Choose a valid status.');
  if (d.priority && !PRIORITIES.includes(d.priority)) throw new AppError('Choose a valid priority.');
  checkDates(d.startDate, d.targetDate, 'Project');
  const fields = { name: d.name, description: orNull(d.description), status: d.status || 'Active', priority: d.priority || 'Medium', startDate: orNull(d.startDate), targetDate: orNull(d.targetDate), ...stamp() };
  if (pid) {
    const old = project(pid); if (!old) throw new AppError('Project not found.');
    await be().update({ ...Object.fromEntries(Object.entries(fields).map(([k, x]) => [`projects/${pid}/${k}`, x])), ...logEntry(pid, old.status !== fields.status ? `Project status: ${old.status} → ${fields.status}` : 'Project details edited') });
    return pid;
  }
  const code = String(d.code || '').toUpperCase();
  if (!CODE_RE.test(code)) throw new AppError('Project code: 2–24 capital letters, digits or hyphens (for example DRN-A1).');
  if (state.projects[code]) throw new AppError(`Project ${code} already exists.`);
  await be().update({ [`projects/${code}`]: { code, ...fields, createdAt: Date.now() }, ...logEntry(code, 'Project created') });
  return code;
}
export async function deleteProject(pid) {
  requireAdmin();
  await be().update({ [`projects/${pid}`]: null, [`items/${pid}`]: null, [`stages/${pid}`]: null, [`comments/${pid}`]: null, [`activity/${pid}`]: null });
}

export async function saveItem(pid, v, iid) {
  requireAdmin();
  if (!project(pid)) throw new AppError('Project not found.');
  const d = clean(v);
  if (!d.code) throw new AppError('Enter the item code.');
  if (!d.name) throw new AppError('Enter the item name.');
  if (d.qty !== undefined && d.qty !== '' && !(num(d.qty) > 0)) throw new AppError('Quantity must be more than zero.');
  if (items(pid).some((i) => i.id !== iid && i.code.toLowerCase() === d.code.toLowerCase())) throw new AppError(`Item ${d.code} is already in this project.`);
  const fields = { code: d.code, name: d.name, qty: d.qty === '' || d.qty === undefined ? null : num(d.qty), unit: orNull(d.unit), priority: d.priority || 'Medium', requiredBy: orNull(d.requiredBy), notes: orNull(d.notes), ...stamp() };
  if (iid) {
    await be().update({ ...Object.fromEntries(Object.entries(fields).map(([k, x]) => [`items/${pid}/${iid}/${k}`, x])), ...logEntry(pid, `Item ${fields.code} edited`, iid) });
    return iid;
  }
  const id = be().newId();
  const order = Math.max(0, ...items(pid).map((i) => i.order || 0)) + 10;
  const st = stagesFromTemplate(settings().stageTemplate);
  for (const s of Object.values(st)) Object.assign(s, stamp());
  await be().update({ [`items/${pid}/${id}`]: { ...fields, order, createdAt: Date.now() }, [`stages/${pid}/${id}`]: st, ...logEntry(pid, `Item ${fields.code} added with ${Object.keys(st).length} stages`, id) });
  return id;
}
export async function deleteItem(pid, iid) {
  requireAdmin();
  const it = item(pid, iid); if (!it) throw new AppError('Item not found.');
  const u = { [`items/${pid}/${iid}`]: null, [`stages/${pid}/${iid}`]: null, ...logEntry(pid, `Item ${it.code} deleted`) };
  for (const c of comments(pid, { itemId: iid })) u[`comments/${pid}/${c.id}`] = null;
  await be().update(u);
}

/** Edit any part of a stage at any time — dates can be set before or after completion. */
export async function saveStage(pid, iid, sid, v) {
  requireAdmin();
  const old = stage(pid, iid, sid); if (!old) throw new AppError('Stage not found.');
  const d = clean(v);
  if (d.name !== undefined && !d.name) throw new AppError('Enter the stage name.');
  if (d.status && !STAGE_STATUSES.includes(d.status)) throw new AppError('Choose a valid status.');
  const status = d.status || old.status;
  if (d.expStart !== undefined || d.expEnd !== undefined) checkDates(d.expStart ?? old.expStart, d.expEnd ?? old.expEnd, 'Expected dates');
  const doneOn = status === 'Completed' ? (d.doneOn || old.doneOn || today()) : null;
  if (doneOn && doneOn > today()) throw new AppError('The completion date cannot be in the future.');
  const next = { name: d.name ?? old.name, owner: orNull(d.owner ?? old.owner), status, expStart: orNull(d.expStart ?? old.expStart), expEnd: orNull(d.expEnd ?? old.expEnd), actStart: orNull(d.actStart ?? old.actStart), doneOn, ref: orNull(d.ref ?? old.ref), notes: orNull(d.notes ?? old.notes), ...stamp() };
  const changes = [];
  if (old.status !== status) changes.push(`${old.status} → ${status}${doneOn ? ` (completed ${fmtDate(doneOn)})` : ''}`);
  else if ((old.doneOn || null) !== doneOn) changes.push(`completion date ${fmtDate(doneOn)}`);
  if ((old.expEnd || null) !== next.expEnd) changes.push(`expected date ${next.expEnd ? fmtDate(next.expEnd) : 'cleared'}`);
  if ((old.expStart || null) !== next.expStart || (old.actStart || null) !== next.actStart) changes.push('start dates');
  if (old.name !== next.name || (old.owner || null) !== next.owner || (old.ref || null) !== next.ref || (old.notes || null) !== next.notes) changes.push('details');
  if (!changes.length) return;
  const u = { ...Object.fromEntries(Object.entries(next).map(([k, x]) => [`stages/${pid}/${iid}/${sid}/${k}`, x])), ...logEntry(pid, `${next.name}: ${changes.join(', ')}`, iid, sid) };
  if (d.comment) Object.assign(u, commentEntry(pid, { itemId: iid, stageId: sid, text: d.comment }));
  await be().update(u);
}
export const setStageStatus = (pid, iid, sid, status, extra = {}) => saveStage(pid, iid, sid, { status, ...extra });

export async function addStage(pid, iid, v) {
  requireAdmin();
  const d = clean(v); if (!d.name) throw new AppError('Enter the stage name.');
  const list2 = stages(pid, iid);
  const after = list2.findIndex((s) => s.id === d.after);
  const order = after < 0 ? Math.max(0, ...list2.map((s) => s.order || 0)) + 10 : (list2[after].order + (list2[after + 1]?.order ?? list2[after].order + 20)) / 2;
  const sid = be().newId();
  await be().update({ [`stages/${pid}/${iid}/${sid}`]: { name: d.name, owner: orNull(d.owner), order, status: 'Not Started', expEnd: orNull(d.expEnd), ...stamp() }, ...logEntry(pid, `Stage added: ${d.name}`, iid, sid) });
  return sid;
}
export async function moveStage(pid, iid, sid, dir) {
  requireAdmin();
  const l = stages(pid, iid); const i = l.findIndex((s) => s.id === sid); const j = i + dir;
  if (i < 0 || j < 0 || j >= l.length) return;
  await be().update({ [`stages/${pid}/${iid}/${l[i].id}/order`]: l[j].order, [`stages/${pid}/${iid}/${l[j].id}/order`]: l[i].order });
}
export async function deleteStage(pid, iid, sid) {
  requireAdmin();
  const s = stage(pid, iid, sid); if (!s) throw new AppError('Stage not found.');
  const u = { [`stages/${pid}/${iid}/${sid}`]: null, ...logEntry(pid, `Stage removed: ${s.name}`, iid) };
  for (const c of comments(pid, { itemId: iid, stageId: sid })) u[`comments/${pid}/${c.id}`] = null;
  await be().update(u);
}

/* ------------------------------------------------------------------ comments (admin and commenters) */
function commentEntry(pid, { itemId = '', stageId = '', text }) {
  const t = String(text || '').trim();
  if (!t) throw new AppError('Write a comment first.');
  if (t.length > 2000) throw new AppError('Comments can be up to 2,000 characters.');
  return { [`comments/${pid}/${be().newId()}`]: { itemId, stageId, text: t, by: session.uid, byName: session.me?.name || '', at: Date.now() } };
}
export async function addComment(pid, c) {
  if (!canComment()) throw new AppError('Your account can view but not comment.');
  if (!project(pid)) throw new AppError('Project not found.');
  await be().update(commentEntry(pid, c));
}
export async function deleteComment(pid, cid) {
  const c = state.comments[pid]?.[cid]; if (!c) return;
  if (!isAdmin() && c.by !== session.uid) throw new AppError('You can only delete your own comments.');
  await be().update({ [`comments/${pid}/${cid}`]: null });
}

/* ------------------------------------------------------------------ settings and stage list */
export async function saveSettings(v) {
  requireAdmin();
  const days = num(v.dueSoonDays);
  if (!String(v.orgName || '').trim()) throw new AppError('Enter the organisation name.');
  if (!(days >= 1 && days <= 60)) throw new AppError('"Due soon" must be between 1 and 60 days.');
  await be().update({ 'settings/orgName': v.orgName.trim(), 'settings/dueSoonDays': days });
}
/** rows: [{ id?, name, owner }] in the new order. Applies to items added from now on. */
export async function saveTemplate(rows) {
  requireAdmin();
  const t = {};
  rows.forEach((r, i) => { if (!String(r.name || '').trim()) throw new AppError(`Stage ${i + 1} has no name.`); t[r.id || be().newId()] = { name: r.name.trim(), owner: String(r.owner || '').trim(), order: (i + 1) * 10 }; });
  if (!rows.length) throw new AppError('Keep at least one stage.');
  await be().update({ 'settings/stageTemplate': t });
}

/* ------------------------------------------------------------------ users (administrator only) */
export async function createUser({ username, name, role: r, password }) {
  requireAdmin();
  const u = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw new AppError('Username: 2–32 characters — lower-case letters, digits, _ or -, starting with a letter.');
  if (!String(name || '').trim()) throw new AppError('Enter the display name.');
  if (!['commenter', 'viewer'].includes(r)) throw new AppError('Choose Commenter or Viewer.');
  if (String(password || '').length < PASSWORD_MIN) throw new AppError(`The temporary password needs at least ${PASSWORD_MIN} characters.`);
  if (users().some((x) => x.username === u) || await be().get(`loginIndex/${u}`)) throw new AppError('That username is already in use.');
  const uid = await be().auth.adminCreateUser(emailFor(u), password);
  await be().update({ [`users/${uid}`]: { username: u, name: name.trim(), role: r, active: true, mustChangePassword: true, createdAt: Date.now() }, [`loginIndex/${u}`]: { v: 1 } });
  return uid;
}
export async function updateUser(uid, { name, role: r, active }) {
  requireAdmin();
  if (uid === session.uid) throw new AppError('You cannot change your own role or deactivate yourself.');
  if (r && !['commenter', 'viewer'].includes(r)) throw new AppError('Choose Commenter or Viewer.');
  const u = {};
  if (name !== undefined) { if (!String(name).trim()) throw new AppError('Enter the display name.'); u[`users/${uid}/name`] = name.trim(); }
  if (r) u[`users/${uid}/role`] = r;
  if (active !== undefined) u[`users/${uid}/active`] = !!active;
  await be().update(u);
}
/**
 * Firebase's free plan cannot change another person's password from a web page, so a
 * reset issues a fresh sign-in for the same username (same name and role) and switches
 * the old one off. The person signs in with the temporary password and must change it.
 */
export async function resetPassword(uid, password) {
  requireAdmin();
  const old = state.users[uid]; if (!old) throw new AppError('User not found.');
  if (uid === session.uid) throw new AppError('Use "Change password" in your own menu.');
  if (String(password || '').length < PASSWORD_MIN) throw new AppError(`The temporary password needs at least ${PASSWORD_MIN} characters.`);
  const v = (num((await be().get(`loginIndex/${old.username}`))?.v) || 1) + 1;
  const nuid = await be().auth.adminCreateUser(emailFor(old.username, v), password);
  await be().update({
    [`users/${nuid}`]: { username: old.username, name: old.name, role: old.role, active: old.active === true, mustChangePassword: true, createdAt: Date.now() },
    [`users/${uid}/active`]: false, [`users/${uid}/replacedBy`]: nuid,
    [`loginIndex/${old.username}`]: { v },
  });
}

/** Everything this account can read, as one JSON document (backup). */
export const exportAll = () => ({ exportedAt: new Date().toISOString(), app: 'ProjectFlow 360 tracker', settings: state.settings, projects: state.projects, items: state.items, stages: state.stages, comments: state.comments, activity: state.activity });

export { isOpen };
