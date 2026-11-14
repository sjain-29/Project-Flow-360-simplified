/** Item page: the stage list, and the stage dialog with dates, notes and comments. */
import * as D from '../data.js';
import { STAGE_STATUSES, PRIORITIES } from '../config/app-config.js';
import { esc, icon, badge, toneOf, meter, pageHead, btn, dl, formModal, confirmDialog, openModal, toast, showError, withBusy, downloadCsv } from '../ui.js';
import { fmtDate, fmtDateTime, timeAgo, fmtQty, today } from '../util.js';

export const stageFields = (s = {}) => [
  { name: 'name', label: 'Stage name', req: true, max: 120 },
  { name: 'status', label: 'Status', type: 'select', opts: STAGE_STATUSES, noBlank: true, main: true },
  { name: 'owner', label: 'Responsible (person or department)', max: 120, main: true },
  { name: 'expStart', label: 'Expected start', type: 'date', main: true },
  { name: 'expEnd', label: 'Expected completion date', type: 'date', main: true, hint: 'Shows as overdue when this passes and the stage is still open.' },
  { name: 'doneOn', label: 'Completed on', type: 'date', main: s.status === 'Completed', hint: 'Used when the status is Completed (today if left empty).' },
  { name: 'actStart', label: 'Actual start', type: 'date' },
  { name: 'ref', label: 'Reference (PR / PO / invoice no.)', max: 120 },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];
export const itemFields = () => [
  { name: 'code', label: 'Item code', req: true, max: 40 },
  { name: 'name', label: 'Item name', req: true, max: 160 },
  { name: 'qty', label: 'Quantity', type: 'number', main: true },
  { name: 'unit', label: 'Unit', max: 20, main: true, placeholder: 'Nos, sets, kg…' },
  { name: 'requiredBy', label: 'Required by', type: 'date', main: true },
  { name: 'priority', label: 'Priority', type: 'select', opts: PRIORITIES, noBlank: true },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const STOP = { Completed: ['done', 'check'], 'In Progress': ['active', 'repeat'], Waiting: ['wait', 'clock'], 'On Hold': ['held', 'alert'], 'Not Applicable': ['off', 'x'], 'Not Started': ['', null] };
const dueBadge = (s) => (s.late ? badge(`${s.late} d overdue`, 'crit') : s.due && s.due.key !== 'upcoming' ? badge(s.due.label) : '');
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function commentThread(pid, list, { context = false } = {}) {
  if (!list.length) return '<p class="muted">No comments yet.</p>';
  return `<div class="thread">${list.map((c) => {
    const where = context && c.itemId ? (() => { const it = D.item(pid, c.itemId); const st = c.stageId && D.stage(pid, c.itemId, c.stageId); return it ? ` · <a href="#/p/${esc(pid)}/i/${esc(c.itemId)}${st ? `?stage=${esc(c.stageId)}` : ''}">${esc(it.code)}${st ? ` › ${esc(st.name)}` : ''}</a>` : ''; })() : '';
    const del = D.isAdmin() || c.by === D.session.uid ? ` · <button class="linkbtn" data-act="delComment" data-pid="${esc(pid)}" data-cid="${esc(c.id)}">Delete</button>` : '';
    return `<div class="comment"><span class="avatar sm">${esc(initials(c.byName))}</span><div><div class="meta"><b>${esc(c.byName)}</b> · <span title="${esc(fmtDateTime(c.at))}">${esc(timeAgo(c.at))}</span>${where}${del}</div><p>${esc(c.text)}</p></div></div>`;
  }).join('')}</div>`;
}
export const commentBox = (id, data) => (D.canComment() ? `<div class="commentbox"><label class="sr" for="${id}">Add a comment</label><textarea id="${id}" rows="2" maxlength="2000" placeholder="Write a comment…"></textarea><div><button class="btn primary sm" data-act="addComment" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} data-box="${id}">${icon('send')}Add comment</button></div></div>` : '');
export async function addCommentFrom(d, el) {
  const text = document.getElementById(d.box)?.value;
  // the dialog may re-render while saving, so clear whichever box is on screen afterwards
  await withBusy(el, async () => { await D.addComment(d.pid, { itemId: d.iid || '', stageId: d.sid || '', text }); const box = document.getElementById(d.box); if (box) box.value = ''; }, 'Comment added.');
}
export async function delComment(d) {
  if (await confirmDialog({ title: 'Delete comment', body: 'Delete this comment? This cannot be undone.', confirmLabel: 'Delete', danger: true })) await D.deleteComment(d.pid, d.cid).then(() => toast('Comment deleted.'));
}

/* ------------------------------------------------------------------ stage dialog (stays live while open) */
let live = null;
function stageBody(pid, iid, sid) {
  const s = D.stageRows({ includeClosed: true }).find((r) => r.pid === pid && r.iid === iid && r.sid === sid);
  if (!s) return '<div class="empty"><b>This stage no longer exists.</b></div>';
  const admin = D.isAdmin(); const open = D.isOpen(s);
  const hist = D.activity(pid).filter((a) => a.stageId === sid).slice(0, 8);
  return `<div class="stagehead">${badge(s.status)} ${dueBadge(s)}<span class="spacer"></span>
      ${admin ? `${open ? btn('complete', 'Mark complete', { ic: 'check', cls: 'primary sm', data: { sid } }) : s.status === 'Completed' ? btn('reopen', 'Reopen', { ic: 'refresh', cls: 'sm', data: { sid } }) : ''}
      ${btn('editStage', 'Edit dates & details', { ic: 'edit', cls: 'sm', data: { sid } })}` : ''}</div>
    ${dl([['Responsible', esc(s.owner || '—')], ['Expected start', esc(fmtDate(s.expStart))], ['Expected completion', esc(fmtDate(s.expEnd))], ['Actual start', s.actStart ? esc(fmtDate(s.actStart)) : null], ['Completed on', s.doneOn ? esc(fmtDate(s.doneOn)) : null], ['Reference', s.ref ? esc(s.ref) : null], ['Last updated', esc(fmtDateTime(s.updatedAt))]])}
    ${s.notes ? `<div class="note" style="margin-top:14px;white-space:pre-wrap">${esc(s.notes)}</div>` : ''}
    <h3 style="margin:20px 0 10px">Comments</h3>${commentThread(pid, D.comments(pid, { itemId: iid, stageId: sid }))}${commentBox('stageComment', { pid, iid, sid })}
    ${hist.length ? `<details class="more"><summary>Change history <span class="muted">(${hist.length})</span></summary><div class="loglist">${hist.map((a) => `<div class="logrow"><span class="when">${esc(fmtDateTime(a.at))}</span><span>${esc(a.text)} <span class="muted">— ${esc(a.byName)}</span></span></div>`).join('')}</div></details>` : ''}`;
}
function openStage(pid, iid, sid) {
  const s = D.stage(pid, iid, sid); if (!s) return;
  live?.m.close();
  const m = openModal({ title: s.name, wide: true, body: stageBody(pid, iid, sid), onClose: () => { if (live?.m === m) live = null; } });
  live = { m, pid, iid, sid };
  m.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    try { await ACTS(pid, iid)[t.dataset.act]?.(t.dataset, t); } catch (x) { showError(x); }
  });
}
function refreshLive() {
  if (!live || !document.body.contains(live.m.el)) { live = null; return; }
  const body = live.m.el.querySelector('.modal > .body'); const box = body.querySelector('#stageComment'); const draft = box?.value; const hadFocus = document.activeElement === box;
  body.innerHTML = stageBody(live.pid, live.iid, live.sid);
  const s = D.stage(live.pid, live.iid, live.sid); if (s) live.m.el.querySelector('.modal > header h2').textContent = s.name;
  const nb = body.querySelector('#stageComment'); if (nb && draft) nb.value = draft; if (nb && hadFocus) nb.focus();
}

/* ------------------------------------------------------------------ actions */
const ACTS = (pid, iid) => ({
  open: (d) => openStage(pid, iid, d.sid),
  complete: (d) => { const s = D.stage(pid, iid, d.sid); return formModal({ title: `Mark complete — ${s.name}`, fields: [{ name: 'doneOn', label: 'Completed on', type: 'date', req: true, value: today() }, { name: 'comment', label: 'Comment (optional)', type: 'textarea', main: true }], submitLabel: 'Mark complete', successMessage: 'Stage completed.', onSubmit: (v) => D.setStageStatus(pid, iid, d.sid, 'Completed', v) }); },
  reopen: (d) => formModal({ title: 'Reopen stage', fields: [{ name: 'status', label: 'New status', type: 'select', opts: ['In Progress', 'Waiting', 'On Hold', 'Not Started'], noBlank: true }, { name: 'comment', label: 'Reason (optional)', type: 'textarea', main: true }], submitLabel: 'Reopen', successMessage: 'Stage reopened.', onSubmit: (v) => D.setStageStatus(pid, iid, d.sid, v.status, { comment: v.comment }) }),
  editStage: (d) => { const s = D.stage(pid, iid, d.sid); return formModal({ title: `Edit — ${s.name}`, wide: true, fields: stageFields(s), values: s, submitLabel: 'Save', onSubmit: (v) => D.saveStage(pid, iid, d.sid, v) }); },
  status: async (d, el) => withBusy(el, () => D.setStageStatus(pid, iid, d.sid, el.value), 'Status updated.'),
  up: (d, el) => withBusy(el, () => D.moveStage(pid, iid, d.sid, -1)),
  down: (d, el) => withBusy(el, () => D.moveStage(pid, iid, d.sid, 1)),
  delStage: async (d) => { const s = D.stage(pid, iid, d.sid); if (await confirmDialog({ title: 'Remove stage', body: `Remove “${esc(s.name)}” and its comments from this item? If it simply does not apply, set its status to Not Applicable instead.`, confirmLabel: 'Remove', danger: true })) { live?.m.close(); await D.deleteStage(pid, iid, d.sid); toast('Stage removed.'); } },
  addStage: () => formModal({ title: 'Add a stage', fields: [{ name: 'name', label: 'Stage name', req: true, max: 120 }, { name: 'after', label: 'Position', type: 'select', opts: [['', 'At the end'], ...D.stages(pid, iid).map((s) => [s.id, `After: ${s.name}`])], noBlank: true, main: true }, { name: 'owner', label: 'Responsible', main: true }, { name: 'expEnd', label: 'Expected completion date', type: 'date', main: true }], submitLabel: 'Add stage', successMessage: 'Stage added.', onSubmit: (v) => D.addStage(pid, iid, v) }),
  editItem: () => formModal({ title: 'Edit item', fields: itemFields(), values: D.item(pid, iid), submitLabel: 'Save', onSubmit: (v) => D.saveItem(pid, v, iid) }),
  delItem: async () => { const it = D.item(pid, iid); if (await confirmDialog({ title: 'Delete item', body: `Delete <b>${esc(it.code)}</b> with all its stages and comments? This cannot be undone.`, confirmLabel: 'Delete item', danger: true, requireText: it.code })) { await D.deleteItem(pid, iid); toast('Item deleted.'); location.hash = `#/p/${pid}`; } },
  csv: () => { const it = D.item(pid, iid); downloadCsv(`${pid}-${it.code}-stages.csv`, [[(r) => r.order, 'Order'], ['name', 'Stage'], ['status', 'Status'], ['owner', 'Responsible'], ['expStart', 'Expected start'], ['expEnd', 'Expected completion'], ['actStart', 'Actual start'], ['doneOn', 'Completed on'], ['ref', 'Reference'], ['notes', 'Notes']], D.stages(pid, iid)); },
  addComment: addCommentFrom,
  delComment,
});

export function itemView({ pid, iid, query }) {
  const p = D.project(pid); const it = D.item(pid, iid);
  if (!p || !it) return { title: 'Not found', html: '<div class="pagehead"><div class="titles"><h1>Item not found</h1></div></div><div class="panel"><div class="empty"><a href="#/projects">Back to projects</a></div></div>' };
  const admin = D.isAdmin();
  const rows = D.stageRows({ includeClosed: true }).filter((r) => r.pid === pid && r.iid === iid);
  const prog = D.itemProgress(pid, iid); const st = D.itemStatus(pid, iid);
  const ccount = (sid) => D.comments(pid, { itemId: iid, stageId: sid }).length;
  const track = `<div class="flow"><div class="track"><div class="track-label"><b>Stages</b><span>${prog.done} of ${prog.total} done</span></div>${rows.map((s) => {
    const [cls, ic] = STOP[s.status] || ['', null];
    return `<button type="button" class="stop ${cls}${s.late ? ' late' : ''}" data-act="open" data-sid="${esc(s.sid)}" title="${esc(`${s.name} — ${s.status}`)}"><i>${ic ? icon(ic) : `<b style="font:600 11px var(--font-cond)">${rows.indexOf(s) + 1}</b>`}</i><span>${esc(s.name)}</span><small>${s.late ? `${s.late} d late` : s.doneOn ? esc(fmtDate(s.doneOn)) : s.expEnd ? esc(fmtDate(s.expEnd)) : esc(s.status)}</small></button>`;
  }).join('')}</div></div>`;
  const tbl = `<div class="table-wrap"><table class="tbl stack stages"><thead><tr><th>#</th><th>Stage</th><th>Status</th><th>Expected</th><th>Completed on</th><th>Reference</th><th class="num">Comments</th>${admin ? '<th class="num">Actions</th>' : ''}</tr></thead><tbody>${rows.map((s, n) => `
    <tr data-act="open" data-sid="${esc(s.sid)}" tabindex="0" class="${s.late ? 'rowflag' : ''}${s.status === 'Not Applicable' ? ' na' : ''}">
      <td data-label="#" class="muted">${n + 1}</td>
      <td data-label="Stage"><b>${esc(s.name)}</b>${s.owner ? `<div class="muted small">${esc(s.owner)}</div>` : ''}</td>
      <td data-label="Status">${admin ? `<select class="inline-status tone-${toneOf(s.status) || 'plain'}" data-act="status" data-sid="${esc(s.sid)}" aria-label="Status of ${esc(s.name)}">${STAGE_STATUSES.map((x) => `<option${x === s.status ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : badge(s.status)} ${dueBadge(s)}</td>
      <td data-label="Expected" class="nowrap">${s.expEnd ? esc(fmtDate(s.expEnd)) : '<span class="muted">—</span>'}${s.expStart ? `<div class="muted small">from ${esc(fmtDate(s.expStart))}</div>` : ''}</td>
      <td data-label="Completed on" class="nowrap">${s.doneOn ? esc(fmtDate(s.doneOn)) : '<span class="muted">—</span>'}</td>
      <td data-label="Reference">${s.ref ? esc(s.ref) : '<span class="muted">—</span>'}</td>
      <td data-label="Comments" class="num">${ccount(s.sid) ? `<span class="badge info plain">${icon('message')} ${ccount(s.sid)}</span>` : '<span class="muted">—</span>'}</td>
      ${admin ? `<td data-label="Actions" class="num"><div class="rowacts">${D.isOpen(s) ? btn('complete', 'Complete', { ic: 'check', cls: 'sm', data: { sid: s.sid }, title: 'Mark complete' }) : ''}${btn('editStage', '', { ic: 'edit', cls: 'sm ghost', data: { sid: s.sid }, title: 'Edit dates and details' })}${btn('up', '', { ic: 'back', cls: 'sm ghost up', data: { sid: s.sid }, title: 'Move up' })}${btn('down', '', { ic: 'back', cls: 'sm ghost down', data: { sid: s.sid }, title: 'Move down' })}${btn('delStage', '', { ic: 'trash', cls: 'sm ghost', data: { sid: s.sid }, title: 'Remove stage' })}</div></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  const acts = ACTS(pid, iid);
  return {
    title: `${it.code} · ${pid}`,
    html: `${pageHead({
      crumbs: `<a href="#/projects">Projects</a> / <a href="#/p/${esc(pid)}">${esc(pid)}</a>`,
      title: `${esc(it.code)} — ${esc(it.name)}`,
      sub: `${badge(st.label)} ${it.priority && it.priority !== 'Medium' ? badge(it.priority) : ''} ${it.qty ? `· ${esc(fmtQty(it.qty))} ${esc(it.unit || '')}` : ''} ${it.requiredBy ? `· required by ${esc(fmtDate(it.requiredBy))}` : ''}`,
      actions: `${admin ? `${btn('addStage', 'Add stage', { ic: 'plus' })}${btn('editItem', 'Edit item', { ic: 'edit' })}` : ''}${btn('csv', 'Export', { ic: 'download', cls: 'ghost' })}${admin ? btn('delItem', '', { ic: 'trash', cls: 'ghost', title: 'Delete item' }) : ''}`,
    })}
    ${it.notes ? `<div class="note">${esc(it.notes)}</div>` : ''}
    <section class="panel"><header><h2>Progress</h2><span class="muted">${Math.round(prog.frac * 100)}% · ${prog.done} of ${prog.total} applicable stages complete${st.current ? ` · now: <b>${esc(st.current.name)}</b>` : ''}</span></header><div class="body">${meter(prog.frac, prog.frac === 1 ? 'good' : '')}${track}</div></section>
    <section class="panel"><header><h2>Stages</h2><span class="muted small">${admin ? 'Click a stage to see details and comments. Change the status right in the list.' : 'Click a stage to see details and comments.'}</span></header>${rows.length ? tbl : `<div class="empty"><b>No stages</b>${admin ? 'Use “Add stage”.' : ''}</div>`}</section>
    <section class="panel"><header><h2>Item comments</h2></header><div class="body">${commentThread(pid, D.comments(pid, { itemId: iid, stageId: '' }))}${commentBox('itemComment', { pid, iid })}</div></section>`,
    acts,
    mount: () => { refreshLive(); },
    after: () => {
      if (query.stage && D.stage(pid, iid, query.stage) && !live) { openStage(pid, iid, query.stage); history.replaceState(null, '', `#/p/${pid}/i/${iid}`); }
    },
  };
}
