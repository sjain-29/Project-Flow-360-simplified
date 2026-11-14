/** Projects list and project page (items, comments, history). */
import * as D from '../data.js';
import { PROJECT_STATUSES, PRIORITIES } from '../config/app-config.js';
import { esc, icon, badge, meter, pageHead, btn, table, tabsBar, formModal, confirmDialog, toast, downloadCsv } from '../ui.js';
import { fmtDate, fmtDateTime, fmtQty, today } from '../util.js';
import { itemFields, commentThread, commentBox, addCommentFrom, delComment } from './item.js';

const projectFields = (isNew) => [
  ...(isNew ? [{ name: 'code', label: 'Project code', req: true, max: 24, hint: 'Unique. Capital letters, digits and hyphens, e.g. DRN-A1. Cannot be changed later.' }] : []),
  { name: 'name', label: 'Project name', req: true, max: 160 },
  { name: 'status', label: 'Status', type: 'select', opts: PROJECT_STATUSES, noBlank: true, main: true },
  { name: 'startDate', label: 'Start date', type: 'date', main: true },
  { name: 'targetDate', label: 'Target completion', type: 'date', main: true },
  { name: 'priority', label: 'Priority', type: 'select', opts: PRIORITIES, noBlank: true },
  { name: 'description', label: 'Description', type: 'textarea' },
];
export const newProject = () => formModal({ title: 'New project', fields: projectFields(true), values: { status: 'Active', priority: 'Medium', startDate: today() }, submitLabel: 'Create project', successMessage: 'Project created.', onSubmit: (v) => D.saveProject(v) }).then((pid) => { if (typeof pid === 'string') location.hash = `#/p/${pid}`; });

const projectRow = (p) => {
  const prog = D.projectProgress(p.id); const late = D.stageRows({ includeClosed: true }).filter((r) => r.pid === p.id && r.late > 0).length;
  return { ...p, items: D.items(p.id).length, prog, late };
};

export function projectsView({ query }) {
  const show = query.show || 'open';
  const all = D.projects().map(projectRow);
  const rows = all.filter((p) => show === 'all' || (show === 'open' ? !['Completed', 'Cancelled'].includes(p.status) : ['Completed', 'Cancelled'].includes(p.status)));
  return {
    title: 'Projects',
    html: `${pageHead({ title: 'Projects', sub: `${all.length} project${all.length === 1 ? '' : 's'}`, actions: `${D.isAdmin() ? btn('new', 'New project', { ic: 'plus', cls: 'primary' }) : ''}${btn('csv', 'Export', { ic: 'download', cls: 'ghost' })}` })}
      ${tabsBar([['open', 'Open'], ['closed', 'Completed / cancelled'], ['all', 'All']], show, (id) => `#/projects?show=${id}`)}
      <section class="panel">${table({
        rows, href: (r) => `#/p/${r.id}`, flag: (r) => r.late > 0,
        empty: D.isAdmin() ? '<b>No projects here yet</b>Use “New project” to add your first one.' : '<b>No projects here yet</b>',
        cols: [
          { label: 'Code', html: (r) => `<b>${esc(r.code)}</b>`, cls: 'id' },
          { label: 'Project', key: 'name' },
          { label: 'Status', type: 'status', key: 'status' },
          { label: 'Items', key: 'items', type: 'number' },
          { label: 'Progress', html: (r) => `<div style="min-width:120px">${meter(r.prog.frac, r.prog.frac === 1 ? 'good' : '')}<span class="muted small">${Math.round(r.prog.frac * 100)}% · ${r.prog.done}/${r.prog.total} stages</span></div>` },
          { label: 'Overdue stages', html: (r) => (r.late ? badge(`${r.late} overdue`, 'crit') : '<span class="muted">—</span>') },
          { label: 'Target', key: 'targetDate', type: 'date' },
        ],
      })}</section>`,
    acts: {
      new: newProject,
      csv: () => downloadCsv('projects.csv', [['code', 'Code'], ['name', 'Project'], ['status', 'Status'], ['priority', 'Priority'], ['startDate', 'Start'], ['targetDate', 'Target'], ['items', 'Items'], [(r) => Math.round(r.prog.frac * 100), 'Progress %'], ['late', 'Overdue stages']], rows),
    },
  };
}

export function projectView({ pid, query }) {
  const p = D.project(pid);
  if (!p) return { title: 'Not found', html: '<div class="pagehead"><div class="titles"><h1>Project not found</h1></div></div><div class="panel"><div class="empty"><a href="#/projects">Back to projects</a></div></div>' };
  const tab = query.tab || 'items'; const admin = D.isAdmin();
  const prog = D.projectProgress(pid);
  const srows = D.stageRows({ includeClosed: true }).filter((r) => r.pid === pid);
  const late = srows.filter((r) => r.late > 0).length; const soon = srows.filter((r) => r.due && ['today', 'soon'].includes(r.due.key)).length;
  const items = D.items(pid).map((i) => ({ ...i, prog: D.itemProgress(pid, i.id), st: D.itemStatus(pid, i.id), late: srows.filter((r) => r.iid === i.id && r.late > 0).length }));
  let body = '';
  if (tab === 'items') {
    body = `<section class="panel"><header><h2>Items</h2>${admin ? btn('addItem', 'Add item', { ic: 'plus', cls: 'primary sm' }) : ''}${btn('csv', 'Export', { ic: 'download', cls: 'ghost sm' })}</header>${table({
      rows: items, href: (r) => `#/p/${pid}/i/${r.id}`, flag: (r) => r.late > 0,
      empty: admin ? '<b>No items yet</b>Use “Add item”. Each new item gets the standard stage list, which you can then adjust.' : '<b>No items yet</b>',
      cols: [
        { label: 'Item code', html: (r) => `<b>${esc(r.code)}</b>`, cls: 'id' },
        { label: 'Item', key: 'name' },
        { label: 'Qty', html: (r) => (r.qty ? `${esc(fmtQty(r.qty))} ${esc(r.unit || '')}` : '<span class="muted">—</span>'), cls: 'nowrap' },
        { label: 'Current stage', html: (r) => (r.st.current ? `${esc(r.st.current.name)}<div>${badge(r.st.current.status)}</div>` : badge(r.st.label)) },
        { label: 'Progress', html: (r) => `<div style="min-width:110px">${meter(r.prog.frac, r.prog.frac === 1 ? 'good' : '')}<span class="muted small">${r.prog.done}/${r.prog.total}</span></div>` },
        { label: 'Overdue', html: (r) => (r.late ? badge(`${r.late} overdue`, 'crit') : '<span class="muted">—</span>') },
        { label: 'Required by', key: 'requiredBy', type: 'date' },
      ],
    })}</section>`;
  } else if (tab === 'comments') {
    body = `<section class="panel"><header><h2>Project comments</h2><span class="muted small">General comments here; stage comments are on each stage.</span></header><div class="body">${commentBox('projComment', { pid })}<div style="margin-top:16px">${commentThread(pid, D.comments(pid).reverse(), { context: true })}</div></div></section>`;
  } else {
    const log = D.activity(pid);
    body = `<section class="panel"><header><h2>History</h2><span class="muted small">Every change made by the administrator.</span></header><div class="body">${log.length ? `<div class="loglist">${log.slice(0, 300).map((a) => { const it = a.itemId && D.item(pid, a.itemId); return `<div class="logrow"><span class="when">${esc(fmtDateTime(a.at))}</span><span>${it ? `<a href="#/p/${esc(pid)}/i/${esc(a.itemId)}${a.stageId && D.stage(pid, a.itemId, a.stageId) ? `?stage=${esc(a.stageId)}` : ''}">${esc(it.code)}</a> · ` : ''}${esc(a.text)} <span class="muted">— ${esc(a.byName)}</span></span></div>`; }).join('')}</div>` : '<p class="muted">Nothing recorded yet.</p>'}</div></section>`;
  }
  return {
    title: pid,
    html: `${pageHead({
      crumbs: '<a href="#/projects">Projects</a>',
      title: `${esc(p.code)} — ${esc(p.name)}`,
      sub: `${badge(p.status)} ${p.priority && p.priority !== 'Medium' ? badge(p.priority) : ''} ${p.startDate ? `· started ${esc(fmtDate(p.startDate))}` : ''} ${p.targetDate ? `· target ${esc(fmtDate(p.targetDate))}` : ''}`,
      actions: admin ? `${btn('editProject', 'Edit project', { ic: 'edit' })}${btn('delProject', '', { ic: 'trash', cls: 'ghost', title: 'Delete project' })}` : '',
    })}
    ${p.description ? `<p class="soft">${esc(p.description)}</p>` : ''}
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><b>${items.length}</b><span>Items</span></div>
      <div class="kpi"><b>${Math.round(prog.frac * 100)}%</b><span>Stages complete (${prog.done}/${prog.total})</span></div>
      <a class="kpi${late ? ' alert' : ''}" href="#/deadlines?f=overdue&p=${esc(pid)}"><b>${late}</b><span>Overdue stages</span></a>
      <a class="kpi${soon ? ' warn' : ''}" href="#/deadlines?f=soon&p=${esc(pid)}"><b>${soon}</b><span>Due in ${D.settings().dueSoonDays} days</span></a>
    </div>
    ${tabsBar([['items', `Items (${items.length})`], ['comments', `Comments (${D.comments(pid).length})`], ['history', 'History']], tab, (id) => `#/p/${pid}?tab=${id}`)}
    ${body}`,
    acts: {
      addItem: () => formModal({ title: `Add item to ${pid}`, intro: `The item starts with the ${Object.keys(D.settings().stageTemplate || {}).length} stages from Administration → Stage list. You can add, remove or rename them afterwards.`, fields: itemFields(), values: { priority: 'Medium', unit: 'Nos' }, submitLabel: 'Add item', successMessage: 'Item added.', onSubmit: (v) => D.saveItem(pid, v) }).then((iid) => { if (typeof iid === 'string') location.hash = `#/p/${pid}/i/${iid}`; }),
      editProject: () => formModal({ title: `Edit ${pid}`, fields: projectFields(false), values: p, submitLabel: 'Save', onSubmit: (v) => D.saveProject(v, pid) }),
      delProject: async () => { if (await confirmDialog({ title: 'Delete project', body: `Delete <b>${esc(pid)}</b> with all its items, stages, comments and history? This cannot be undone. (To keep it, set the status to Completed or Cancelled instead.)`, confirmLabel: 'Delete project', danger: true, requireText: pid })) { await D.deleteProject(pid); toast('Project deleted.'); location.hash = '#/projects'; } },
      csv: () => downloadCsv(`${pid}-stages.csv`, [['itemCode', 'Item code'], ['itemName', 'Item'], ['name', 'Stage'], ['status', 'Status'], ['owner', 'Responsible'], ['expStart', 'Expected start'], ['expEnd', 'Expected completion'], ['doneOn', 'Completed on'], ['ref', 'Reference'], ['late', 'Days overdue'], ['notes', 'Notes']], srows),
      addComment: addCommentFrom,
      delComment,
    },
  };
}
export { icon };
