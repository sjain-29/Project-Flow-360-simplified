/** Administration (administrator only): users, the standard stage list, settings and backup. */
import * as D from '../data.js';
import { ROLES } from '../config/app-config.js';
import { isDemo } from '../backend.js';
import { esc, icon, badge, pageHead, btn, table, tabsBar, formModal, toast, withBusy, download, downloadCsv, $$ } from '../ui.js';
import { fmtDate } from '../util.js';
import { list } from '../model.js';

let draft = null; // stage-list editor rows while editing
const rerender = () => window.dispatchEvent(new Event('pf:rerender'));
const tempPw = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const a = new Uint32Array(12); crypto.getRandomValues(a); return [...a].map((n) => c[n % c.length]).join(''); };

export function adminView({ sec }) {
  if (!D.isAdmin()) return { title: 'Administration', html: '<div class="pagehead"><div class="titles"><h1>Administration</h1></div></div><div class="panel"><div class="empty"><b>Only the administrator can open this page.</b></div></div>' };
  const tabs = tabsBar([['users', 'Users'], ['stages', 'Stage list'], ['settings', 'Settings'], ['backup', 'Backup']], sec, (id) => `#/admin/${id}`);
  const S = { users, stages, settings, backup }[sec] || users;
  const v = S();
  return { ...v, title: `Administration · ${v.title}`, html: `${pageHead({ title: 'Administration', sub: v.sub, actions: v.actions })}${tabs}${v.html}` };
}

function users() {
  const rows = D.users();
  return {
    title: 'Users', sub: 'You are the only administrator. Everyone else can view; commenters can also add comments.',
    actions: btn('addUser', 'Add user', { ic: 'plus', cls: 'primary' }),
    html: `<div class="note">${Object.entries(ROLES).map(([, r]) => `<b>${esc(r.name)}</b> — ${esc(r.description)}`).join('<br>')}</div>
      <section class="panel">${table({
        rows,
        cols: [
          { label: 'Name', html: (r) => `<b>${esc(r.name)}</b>${r.id === D.session.uid ? ' <span class="muted small">(you)</span>' : ''}` },
          { label: 'Username', key: 'username' },
          { label: 'Role', html: (r) => badge(ROLES[r.role]?.name || r.role, r.role === 'admin' ? 'good' : r.role === 'commenter' ? 'info' : '') },
          { label: 'Status', html: (r) => (r.active !== true ? badge('Deactivated') : r.mustChangePassword ? badge('Password change pending') : badge('Active user')) },
          { label: 'Added', html: (r) => esc(fmtDate(r.createdAt)) },
          { label: 'Actions', cls: 'num', html: (r) => (r.id === D.session.uid ? '<span class="muted small">Change your password from your name at the top right.</span>' : `<div class="rowacts">${btn('editUser', 'Edit', { ic: 'edit', cls: 'sm', data: { uid: r.id } })}${btn('resetPw', 'Reset password', { ic: 'key', cls: 'sm ghost', data: { uid: r.id } })}</div>`) },
        ],
      })}</section>`,
    acts: {
      addUser: () => { const pw = tempPw(); return formModal({ title: 'Add user', intro: 'Give the person their username and temporary password. They must choose their own password at first sign-in.', fields: [{ name: 'name', label: 'Display name', req: true }, { name: 'username', label: 'Username', req: true, hint: 'Lower-case letters, digits, _ or -; starts with a letter. Cannot be changed later.', autocomplete: 'off' }, { name: 'role', label: 'Role', type: 'select', opts: [['commenter', 'Commenter — view and comment'], ['viewer', 'Viewer — view only']], noBlank: true, main: true }, { name: 'password', label: 'Temporary password', req: true, value: pw, hint: 'Pre-filled with a random password. Note it down before saving.' }], submitLabel: 'Create user', successMessage: false, onSubmit: async (v) => { await D.createUser(v); toast(`User ${v.username} created. Temporary password: ${v.password}`); } }); },
      editUser: (d) => { const u = D.users().find((x) => x.id === d.uid); return formModal({ title: `Edit ${u.username}`, fields: [{ name: 'name', label: 'Display name', req: true }, { name: 'role', label: 'Role', type: 'select', opts: [['commenter', 'Commenter — view and comment'], ['viewer', 'Viewer — view only']], noBlank: true, main: true }, { name: 'active', label: 'Account is active (can sign in and see the data)', type: 'bool', wide: true }], values: u, submitLabel: 'Save', onSubmit: (v) => D.updateUser(d.uid, v) }); },
      resetPw: (d) => { const u = D.users().find((x) => x.id === d.uid); return formModal({ title: `Reset password — ${u.username}`, intro: 'The person signs in with the same username and this temporary password, then chooses a new one. (On Firebase\'s free plan this issues a fresh sign-in for the same username and switches the old one off.)', fields: [{ name: 'password', label: 'Temporary password', req: true, value: tempPw() }], submitLabel: 'Reset password', successMessage: false, onSubmit: async (v) => { await D.resetPassword(d.uid, v.password); toast(`Password reset. Temporary password for ${u.username}: ${v.password}`); } }); },
    },
  };
}

function stages() {
  draft = draft || list(D.settings().stageTemplate).map((t) => ({ id: t.id, name: t.name, owner: t.owner || '' }));
  const sync = () => $$('.tmpl-row').forEach((row, i) => { draft[i].name = row.querySelector('[data-f=name]').value; draft[i].owner = row.querySelector('[data-f=owner]').value; });
  return {
    title: 'Stage list', sub: 'The stages every new item starts with. Existing items keep their own list — change those on the item page.',
    actions: '',
    html: `<section class="panel"><header><h2>Standard stage list</h2><span class="muted small">${draft.length} stages</span></header><div class="body">
      <div class="tmpl-row head"><span>#</span><span>Stage name</span><span>Responsible (default)</span><span></span></div>
      ${draft.map((r, i) => `<div class="tmpl-row"><span class="muted">${i + 1}</span><input data-f="name" value="${esc(r.name)}" maxlength="120" aria-label="Stage ${i + 1} name"><input class="ownerin" data-f="owner" value="${esc(r.owner)}" maxlength="120" aria-label="Stage ${i + 1} responsible"><div class="rowacts">${btn('tUp', '', { ic: 'back', cls: 'sm ghost up', data: { i }, title: 'Move up' })}${btn('tDown', '', { ic: 'back', cls: 'sm ghost down', data: { i }, title: 'Move down' })}${btn('tDel', '', { ic: 'trash', cls: 'sm ghost', data: { i }, title: 'Remove' })}</div></div>`).join('')}
      <div class="actions" style="margin-top:14px">${btn('tAdd', 'Add stage', { ic: 'plus' })}<span class="spacer" style="flex:1"></span>${btn('tReset', 'Undo changes', { cls: 'ghost' })}${btn('tSave', 'Save stage list', { ic: 'check', cls: 'primary' })}</div>
    </div></section>`,
    acts: {
      tAdd: () => { sync(); draft.push({ name: '', owner: '' }); rerender(); setTimeout(() => $$('.tmpl-row [data-f=name]').pop()?.focus(), 0); },
      tDel: (d) => { sync(); draft.splice(Number(d.i), 1); rerender(); },
      tUp: (d) => { sync(); const i = Number(d.i); if (i > 0) [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; rerender(); },
      tDown: (d) => { sync(); const i = Number(d.i); if (i < draft.length - 1) [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; rerender(); },
      tReset: () => { draft = null; rerender(); },
      tSave: (d, el) => { sync(); return withBusy(el, async () => { await D.saveTemplate(draft); draft = null; }, 'Stage list saved. New items will use it.'); },
    },
  };
}

function settings() {
  const s = D.settings();
  return {
    title: 'Settings', sub: '',
    html: `<section class="panel"><header><h2>General</h2></header><div class="body"><div class="formgrid">
      <div class="field"><label for="s-org">Organisation name</label><input id="s-org" value="${esc(s.orgName)}" maxlength="120"></div>
      <div class="field"><label for="s-soon">“Due soon” window (days)</label><input id="s-soon" type="number" min="1" max="60" value="${esc(s.dueSoonDays)}"><div class="hint">Stages whose expected date falls within this many days show as “Due soon”.</div></div>
    </div><div class="actions" style="margin-top:14px">${btn('save', 'Save settings', { ic: 'check', cls: 'primary' })}</div></div></section>`,
    acts: { save: (d, el) => withBusy(el, () => D.saveSettings({ orgName: document.getElementById('s-org').value, dueSoonDays: document.getElementById('s-soon').value }), 'Settings saved.') },
  };
}

function backup() {
  return {
    title: 'Backup', sub: '',
    html: `<section class="panel"><header><h2>Download a backup</h2></header><div class="body">
      <p>Download everything — projects, items, stages, comments, history and settings — as one JSON file. Keep a copy somewhere safe, for example once a week.</p>
      <div class="actions">${btn('json', 'Download backup (JSON)', { ic: 'download', cls: 'primary' })}${btn('csv', 'All stages (CSV for Excel)', { ic: 'sheet' })}</div></div></section>
    <section class="panel"><header><h2>Restore</h2></header><div class="body">
      ${isDemo() ? '<p class="muted">Demo mode keeps data only in this browser; use “Reset demo data” in your user menu to start again.</p>' : ''}
      <p>To restore, open the Firebase console → Realtime Database → Data → ⋮ menu → <b>Import JSON</b> on the node you want to replace (for example <code>stages</code>), and choose the matching part of the backup file. Import replaces that node completely, so take a fresh backup first. User accounts are not part of the backup.</p></div></section>`,
    acts: {
      json: () => download(`projectflow360-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(D.exportAll(), null, 2), 'application/json'),
      csv: () => downloadCsv('all-stages.csv', [['pid', 'Project'], ['projectName', 'Project name'], ['itemCode', 'Item code'], ['itemName', 'Item'], ['name', 'Stage'], ['status', 'Status'], ['owner', 'Responsible'], ['expStart', 'Expected start'], ['expEnd', 'Expected completion'], ['actStart', 'Actual start'], ['doneOn', 'Completed on'], ['ref', 'Reference'], ['late', 'Days overdue'], ['notes', 'Notes']], D.stageRows({ includeClosed: true })),
    },
  };
}
export { icon };
