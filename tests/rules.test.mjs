/**
 * Security Rules tests, run through "targaryen" — an independent simulator of
 * Firebase Realtime Database rules. Each case checks one thing a role may or may not do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const targaryen = require('targaryen');
const rules = JSON.parse(readFileSync(new URL('../firebase/database.rules.json', import.meta.url), 'utf8'));
const NOW = Date.now(); // targaryen evaluates `now` with the real clock
const DOMAIN = 'pf360.example.com';

const base = () => ({
  system: { bootstrapUid: 'boss', initialized: true },
  loginIndex: { suyash: { v: 1 }, chetan: { v: 1 }, vina: { v: 1 } },
  users: {
    boss: { username: 'suyash', name: 'Suyash', role: 'admin', active: true, mustChangePassword: false },
    c1: { username: 'chetan', name: 'Chetan', role: 'commenter', active: true, mustChangePassword: true },
    v1: { username: 'vina', name: 'Vina', role: 'viewer', active: true },
    x1: { username: 'old', name: 'Old', role: 'commenter', active: false },
  },
  settings: { orgName: 'Org', dueSoonDays: 7, stageTemplate: { pr: { name: 'PR', owner: 'Planning', order: 10 } } },
  projects: { 'P-1': { code: 'P-1', name: 'Project one', status: 'Active' } },
  items: { 'P-1': { i1: { code: 'IT-1', name: 'Item one', order: 10 } } },
  stages: { 'P-1': { i1: { pr: { name: 'PR', order: 10, status: 'In Progress', expEnd: '2026-11-20' } } } },
  comments: { 'P-1': { k1: { text: 'Hello', by: 'c1', byName: 'Chetan', at: NOW - 1000, itemId: 'i1', stageId: 'pr' }, k2: { text: 'Admin note', by: 'boss', byName: 'Suyash', at: NOW - 500 } } },
  activity: { 'P-1': { a1: { at: NOW - 2000, by: 'boss', byName: 'Suyash', text: 'Project created' } } },
});
const as = (uid, data = base(), email) => targaryen.database(rules, data, NOW).as(uid ? { uid, token: { email: email || `${uid}@${DOMAIN}` } } : null);
const ok = (r, what) => assert.equal(r.allowed, true, `${what} should be allowed\n${r.info || ''}`);
const no = (r, what) => assert.equal(r.allowed, false, `${what} should be refused`);
const comment = (by, byName, extra = {}) => ({ text: 'New comment', by, byName, at: NOW, itemId: 'i1', stageId: 'pr', ...extra });

test('signed-out visitors can read nothing except one username\'s sign-in version', () => {
  const db = as(null);
  for (const p of ['/projects', '/stages', '/comments', '/users', '/settings', '/system', '/activity', '/loginIndex']) no(db.read(p), `read ${p}`);
  ok(db.read('/loginIndex/suyash'), 'read one loginIndex entry');
  no(db.write('/comments/P-1/z', comment('c1', 'Chetan')), 'anonymous comment');
});

test('viewer: reads the project data, cannot change anything or comment', () => {
  const db = as('v1');
  for (const p of ['/projects', '/items', '/stages', '/comments', '/activity', '/settings', '/system', '/users/v1']) ok(db.read(p), `read ${p}`);
  no(db.read('/users'), 'read the user list');
  no(db.read('/users/c1'), 'read another user');
  no(db.write('/stages/P-1/i1/pr/status', 'Completed'), 'complete a stage');
  no(db.write('/projects/P-2', { code: 'P-2', name: 'x', status: 'Active' }), 'create a project');
  no(db.write('/comments/P-1/z', comment('v1', 'Vina')), 'comment');
  no(db.write('/settings/orgName', 'Hacked'), 'change settings');
});

test('commenter: adds and deletes only their own comments, under their own name', () => {
  const db = as('c1');
  ok(db.write('/comments/P-1/z', comment('c1', 'Chetan')), 'own comment');
  no(db.write('/comments/P-1/z', comment('boss', 'Suyash')), 'comment posing as the admin');
  no(db.write('/comments/P-1/z', comment('c1', 'Suyash')), 'comment with a false display name');
  no(db.write('/comments/P-1/z', comment('c1', 'Chetan', { at: NOW + 3600000 })), 'comment dated in the future');
  no(db.write('/comments/P-1/z', comment('c1', 'Chetan', { extra: 'x' })), 'comment with unknown fields');
  no(db.write('/comments/P-9/z', comment('c1', 'Chetan')), 'comment on a project that does not exist');
  no(db.write('/comments/P-1/k1/text', 'Edited'), 'edit a comment');
  ok(db.write('/comments/P-1/k1', null), 'delete own comment');
  no(db.write('/comments/P-1/k2', null), 'delete the admin\'s comment');
  no(db.write('/stages/P-1/i1/pr/status', 'Completed'), 'complete a stage');
  no(db.write('/stages/P-1/i1/pr/expEnd', '2026-12-01'), 'change a date');
  no(db.write('/activity/P-1/z', { at: NOW, by: 'c1', text: 'x' }), 'write history');
  no(db.write('/users/c1/role', 'admin'), 'promote self');
  no(db.write('/users/c1/role', 'viewer'), 'change own role');
  ok(db.write('/users/c1/mustChangePassword', false), 'clear own password-change flag');
  no(db.write('/users/c1/mustChangePassword', true), 'set own password-change flag');
  no(db.write('/users/v1/mustChangePassword', false), 'touch another user\'s flag');
});

test('deactivated accounts can do nothing', () => {
  const db = as('x1');
  for (const p of ['/projects', '/stages', '/comments', '/settings']) no(db.read(p), `read ${p}`);
  no(db.write('/comments/P-1/z', comment('x1', 'Old')), 'comment');
  const data = base(); data.users.c1.active = false;
  no(as('c1', data).read('/projects'), 'read after being switched off');
});

test('administrator: changes projects, items, stages, history and settings', () => {
  const db = as('boss');
  ok(db.write('/projects/P-2', { code: 'P-2', name: 'Two', status: 'Planning', createdAt: NOW }), 'create project');
  no(db.write('/projects/p-2', { code: 'p-2', name: 'Two', status: 'Planning' }), 'project code in lower case');
  no(db.write('/projects/P-3', { code: 'P-4', name: 'Mismatch', status: 'Active' }), 'project code different from its key');
  no(db.write('/projects/P-1/status', 'Finished'), 'unknown project status');
  ok(db.update('/', { 'items/P-1/i2': { code: 'IT-2', name: 'Two', order: 20 }, 'stages/P-1/i2/pr': { name: 'PR', order: 10, status: 'Not Started' } }), 'add item with its stages in one update');
  no(db.write('/items/P-9/i1', { code: 'X', name: 'Orphan' }), 'item for a missing project');
  no(db.write('/stages/P-1/i9/pr', { name: 'PR', order: 10, status: 'Not Started' }), 'stage for a missing item');
  ok(db.update('/stages/P-1/i1/pr', { status: 'Completed', doneOn: '2026-11-14', updatedAt: NOW, updatedBy: 'boss' }), 'mark stage complete');
  ok(db.update('/stages/P-1/i1/pr', { expEnd: '2026-10-01', notes: 'Dates changed after completion' }), 'edit dates at any time');
  no(db.write('/stages/P-1/i1/pr/status', 'Done'), 'unknown stage status');
  no(db.write('/stages/P-1/i1/pr/expEnd', '14/11/2026'), 'badly formatted date');
  no(db.write('/stages/P-1/i1/pr/colour', 'red'), 'unknown stage field');
  ok(db.write('/comments/P-1/k1', null), 'delete anyone\'s comment');
  ok(db.write('/activity/P-1/z', { at: NOW, by: 'boss', byName: 'Suyash', text: 'x' }), 'write history');
  ok(db.update('/settings', { orgName: 'New name', dueSoonDays: 10 }), 'change settings');
  no(db.write('/settings/dueSoonDays', 400), 'due-soon window out of range');
  ok(db.update('/', { 'projects/P-1': null, 'items/P-1': null, 'stages/P-1': null, 'comments/P-1': null, 'activity/P-1': null }), 'delete a project completely');
  no(db.write('/system/bootstrapUid', 'someone'), 'change the bootstrap account');
  no(db.write('/system/initialized', null), 'undo initialisation');
});

test('administrator: manages users, but cannot create another administrator or lock themselves out', () => {
  const db = as('boss');
  ok(db.read('/users'), 'read the user list');
  ok(db.update('/', { 'users/n1': { username: 'rita', name: 'Rita', role: 'viewer', active: true, mustChangePassword: true, createdAt: NOW }, 'loginIndex/rita': { v: 1 } }), 'create a viewer');
  no(db.write('/users/n1', { username: 'rita', name: 'Rita', role: 'admin', active: true }), 'create a second administrator');
  no(db.write('/users/c1/role', 'admin'), 'promote a commenter to administrator');
  ok(db.write('/users/c1/role', 'viewer'), 'change a commenter to viewer');
  ok(db.write('/users/c1/active', false), 'deactivate a user');
  no(db.write('/users/boss/active', false), 'deactivate self');
  no(db.write('/users/boss/role', 'viewer'), 'demote self');
  ok(db.write('/users/boss/name', 'Suyash N'), 'rename self');
  no(db.write('/users/c1/password', 'secret123'), 'store a password in the database');
  ok(db.update('/', { 'users/c2': { username: 'chetan', name: 'Chetan', role: 'commenter', active: true, mustChangePassword: true }, 'users/c1/active': false, 'users/c1/replacedBy': 'c2', 'loginIndex/chetan': { v: 2 } }), 'password reset (re-issue)');
});

test('bootstrap: only the named account, only once', () => {
  const fresh = { system: { bootstrapUid: 'boss' } };
  const init = { 'users/boss': { username: 'suyash', name: 'Suyash', role: 'admin', active: true, mustChangePassword: true, createdAt: NOW }, 'loginIndex/suyash': { v: 1 }, settings: { orgName: 'Org', dueSoonDays: 7, stageTemplate: { pr: { name: 'PR', owner: '', order: 10 } } }, 'system/initialized': true };
  ok(as('boss', fresh, `suyash@${DOMAIN}`).update('/', init), 'initialise by the bootstrap account');
  no(as('intruder', fresh, `suyash@${DOMAIN}`).update('/', { ...init, 'users/intruder': init['users/boss'], 'users/boss': null }), 'initialise by another account');
  no(as('boss', fresh, `suyash@${DOMAIN}`).write('/loginIndex/someoneelse', { v: 1 }), 'bootstrap account writing another username');
  no(as('boss', { system: { bootstrapUid: 'boss', initialized: true } }, `suyash@${DOMAIN}`).write('/users/boss', init['users/boss']), 'bootstrap again after initialisation');
  no(as('boss', fresh, `suyash@${DOMAIN}`).write('/projects/P-1', { code: 'P-1', name: 'x', status: 'Active' }), 'bootstrap account writing project data before it is an admin');
});
