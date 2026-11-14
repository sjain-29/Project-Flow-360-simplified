/**
 * Builds firebase/database.rules.json (run: npm run rules).
 * Who may do what — enforced by Firebase on its servers, whatever the browser does:
 *   signed out ......... nothing (except looking up one username's sign-in version)
 *   viewer ............. read everything except the user list
 *   commenter .......... + add comments under their own name, delete their own comments
 *   administrator ...... everything; cannot create other administrators, demote or deactivate themselves
 *   deactivated users .. nothing
 *   bootstrap .......... the one account named in /system/bootstrapUid may initialise the system once
 */
import { writeFileSync } from 'node:fs';
import { USERNAME_DOMAIN } from '../js/config/firebase-config.js';
import { STAGE_STATUSES, PROJECT_STATUSES } from '../js/config/app-config.js';

const ME = "root.child('users/' + auth.uid)";
const ACTIVE = `(auth != null && ${ME}.child('active').val() === true)`;
const ADMIN = `(${ACTIVE} && ${ME}.child('role').val() === 'admin')`;
const COMMENTER = `(${ACTIVE} && (${ME}.child('role').val() === 'admin' || ${ME}.child('role').val() === 'commenter'))`;
const BOOT = "(auth != null && root.child('system/bootstrapUid').val() === auth.uid && !root.child('system/initialized').exists())";
const oneOf = (list) => `(${list.map((s) => `newData.val() === '${s}'`).join(' || ')})`;
const str = (max, min = 1) => ({ '.validate': `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}` });
const date = { '.validate': "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)" };
const numb = { '.validate': 'newData.isNumber()' };
const stamp = { updatedAt: numb, updatedBy: str(128), createdAt: numb };
const NEWROOT = (depth) => `newData${'.parent()'.repeat(depth)}`;

const rules = {
  rules: {
    '.read': false,
    '.write': false,
    system: {
      '.read': 'auth != null',
      bootstrapUid: { '.write': false },
      initialized: { '.write': `${BOOT} && newData.val() === true` },
    },
    loginIndex: {
      $username: {
        '.read': true,
        '.write': `${ADMIN} || (${BOOT} && auth.token.email === $username + '@${USERNAME_DOMAIN}')`,
        '.validate': "newData.hasChildren(['v']) && newData.child('v').isNumber() && newData.child('v').val() >= 1",
        v: numb,
        $other: { '.validate': false },
      },
    },
    users: {
      '.read': ADMIN,
      $uid: {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': `(${ADMIN} && ($uid !== auth.uid || (newData.child('role').val() === 'admin' && newData.child('active').val() === true))) || (${BOOT} && $uid === auth.uid)`,
        '.validate': "newData.hasChildren(['username', 'name', 'role', 'active']) && (newData.child('role').val() === 'commenter' || newData.child('role').val() === 'viewer' || ($uid === auth.uid && newData.child('role').val() === 'admin'))",
        username: { '.validate': 'newData.isString() && newData.val().matches(/^[a-z][a-z0-9_-]{1,31}$/)' },
        name: str(120),
        role: { '.validate': oneOf(['admin', 'commenter', 'viewer']) },
        active: { '.validate': 'newData.isBoolean()' },
        mustChangePassword: { '.write': 'auth != null && auth.uid === $uid && data.exists() && newData.val() === false', '.validate': 'newData.isBoolean()' },
        createdAt: numb,
        replacedBy: str(128),
        $other: { '.validate': false },
      },
    },
    settings: {
      '.read': ACTIVE,
      '.write': `${ADMIN} || ${BOOT}`,
      orgName: str(120),
      dueSoonDays: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 60' },
      stageTemplate: { $k: { '.validate': "newData.hasChildren(['name', 'order'])", name: str(120), owner: str(120, 0), order: numb, $other: { '.validate': false } } },
      $other: { '.validate': false },
    },
    projects: {
      '.read': ACTIVE,
      '.write': ADMIN,
      $pid: {
        '.validate': "$pid.matches(/^[A-Z0-9][A-Z0-9-]{1,23}$/) && newData.hasChildren(['code', 'name', 'status']) && newData.child('code').val() === $pid",
        name: str(160),
        status: { '.validate': oneOf(PROJECT_STATUSES) },
        description: str(5000, 0), priority: str(20), startDate: date, targetDate: date,
        ...stamp,
      },
    },
    items: {
      '.read': ACTIVE,
      '.write': ADMIN,
      $pid: { $iid: {
        '.validate': `newData.hasChildren(['code', 'name']) && ${NEWROOT(3)}.child('projects').child($pid).exists()`,
        code: str(40), name: str(160), qty: numb, unit: str(20, 0), priority: str(20), requiredBy: date, notes: str(5000, 0), order: numb,
        ...stamp,
      } },
    },
    stages: {
      '.read': ACTIVE,
      '.write': ADMIN,
      $pid: { $iid: { $sid: {
        '.validate': `newData.hasChildren(['name', 'order', 'status']) && ${NEWROOT(4)}.child('items').child($pid).child($iid).exists()`,
        name: str(120), owner: str(120, 0), order: numb,
        status: { '.validate': oneOf(STAGE_STATUSES) },
        expStart: date, expEnd: date, actStart: date, doneOn: date,
        ref: str(120, 0), notes: str(5000, 0),
        ...stamp,
        $other: { '.validate': false },
      } } },
    },
    comments: {
      '.read': ACTIVE,
      $pid: {
        '.write': ADMIN,
        $cid: {
          // a commenter adds a comment only under their own uid and name; anyone deletes only their own
          '.write': `(${COMMENTER} && !data.exists() && newData.child('by').val() === auth.uid && newData.child('byName').val() === ${ME}.child('name').val()) || (${ACTIVE} && data.child('by').val() === auth.uid && !newData.exists())`,
          '.validate': `newData.hasChildren(['text', 'by', 'byName', 'at']) && ${NEWROOT(3)}.child('projects').child($pid).exists()`,
          text: str(2000), by: str(128), byName: str(120),
          at: { '.validate': 'newData.isNumber() && newData.val() <= now + 300000' },
          itemId: str(128, 0), stageId: str(128, 0),
          $other: { '.validate': false },
        },
      },
    },
    activity: {
      '.read': ACTIVE,
      '.write': ADMIN,
      $pid: { $aid: { '.validate': "newData.hasChildren(['at', 'by', 'text'])" } },
    },
  },
};

const out = new URL('./database.rules.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(rules, null, 2)}\n`);
console.log(`wrote ${out.pathname} (${(JSON.stringify(rules).length / 1024).toFixed(1)} KB)`);
