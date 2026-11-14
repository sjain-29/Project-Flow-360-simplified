/** Dashboard and the comments & activity feed. */
import * as D from '../data.js';
import { esc, badge, meter, pageHead, btn, table } from '../ui.js';
import { fmtDate, fmtDateTime, timeAgo, truncate } from '../util.js';
import { chartPanel, drawCharts, STATUS } from '../charts.js';
import { newProject } from './projects.js';

const chartState = {};
const rerender = () => window.dispatchEvent(new Event('pf:rerender'));
const STATUS_SERIES = [['Completed', STATUS.good], ['In Progress', '#2a78d6'], ['Waiting', STATUS.warn], ['On Hold', STATUS.serious], ['Not Started', '#b9c6dc']];

const feedRow = (c) => {
  const it = c.itemId && D.item(c.pid, c.itemId); const st = it && c.stageId && D.stage(c.pid, c.itemId, c.stageId);
  const href = it ? `#/p/${c.pid}/i/${c.itemId}${st ? `?stage=${c.stageId}` : ''}` : `#/p/${c.pid}?tab=comments`;
  return `<a href="${esc(href)}" class="feedrow"><span class="muted small">${esc(c.pid)}${it ? ` › ${esc(it.code)}` : ''}${st ? ` › ${esc(st.name)}` : ''} · ${esc(timeAgo(c.at))}</span><span><b>${esc(c.byName)}</b> ${esc(truncate(c.text, 160))}</span></a>`;
};

export function dashboardView() {
  const s = D.settings(); const all = D.stageRows();
  const active = D.projects().filter((p) => !['Completed', 'Cancelled'].includes(p.status));
  const late = all.filter((r) => r.late > 0); const soon = all.filter((r) => r.due && ['today', 'soon'].includes(r.due.key));
  const inHand = all.filter((r) => ['In Progress', 'Waiting', 'On Hold'].includes(r.status));
  const applicable = all.filter((r) => r.status !== 'Not Applicable'); const done = applicable.filter((r) => r.status === 'Completed').length;
  const itemsCount = active.reduce((n, p) => n + D.items(p.id).length, 0);
  const attention = [...late, ...soon.filter((r) => !r.late)].slice(0, 10);
  const projs = active.slice(0, 12);
  const defs = [{
    id: 'status', title: 'Stage status by project', dim: 'Project', stacked: true, labels: projs.map((p) => p.code),
    series: STATUS_SERIES.map(([name, color]) => ({ name, color, data: projs.map((p) => all.filter((r) => r.pid === p.id && r.status === name).length) })),
    empty: 'Add a project with items to see this chart.',
  }, {
    id: 'late', title: 'Overdue stages by stage', dim: 'Stage', labels: [...new Set(late.map((r) => r.name))],
    series: [{ name: 'Overdue', color: STATUS.crit, data: [...new Set(late.map((r) => r.name))].map((n) => late.filter((r) => r.name === n).length) }],
    empty: 'Nothing is overdue.',
  }];
  const kpi = (n, label, href, cls = '') => `<a class="kpi ${cls}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
  return {
    title: 'Dashboard',
    html: `${pageHead({ title: 'Dashboard', sub: `${esc(s.orgName)} · ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}`, actions: D.isAdmin() ? btn('newProject', 'New project', { ic: 'plus', cls: 'primary' }) : '' })}
    <div class="kpis">
      ${kpi(active.length, 'Active projects', '#/projects')}
      ${kpi(itemsCount, 'Items being tracked', '#/projects')}
      ${kpi(inHand.length, 'Stages in hand', '#/deadlines?f=open')}
      ${kpi(`${applicable.length ? Math.round((done / applicable.length) * 100) : 0}%`, 'Overall completion', '#/projects')}
      ${kpi(soon.length, `Due in ${s.dueSoonDays} days`, '#/deadlines?f=soon', soon.length ? 'warn' : '')}
      ${kpi(late.length, 'Overdue stages', '#/deadlines?f=overdue', late.length ? 'alert' : '')}
    </div>
    <section class="panel" style="margin-top:16px"><header><h2>Needs attention</h2><a class="btn ghost sm" href="#/deadlines">All deadlines</a></header>${table({
      rows: attention, href: (r) => `#/p/${r.pid}/i/${r.iid}?stage=${r.sid}`, flag: (r) => r.late > 0,
      empty: '<b>Nothing overdue or due soon</b>All open stages are on schedule.',
      cols: [
        { label: 'Project', html: (r) => `<b>${esc(r.pid)}</b>`, cls: 'id' },
        { label: 'Item', html: (r) => `${esc(r.itemCode)}<div class="muted small">${esc(r.itemName)}</div>` },
        { label: 'Stage', html: (r) => `${esc(r.name)}${r.owner ? `<div class="muted small">${esc(r.owner)}</div>` : ''}` },
        { label: 'Status', type: 'status', key: 'status' },
        { label: 'Expected', key: 'expEnd', type: 'date', cls: 'nowrap' },
        { label: 'Due', html: (r) => (r.late ? badge(`${r.late} d overdue`, 'crit') : badge(r.due.key === 'today' ? 'Due today' : `in ${r.due.days} d`, 'warn')) },
      ],
    })}</section>
    <div class="grid c2" style="margin-top:16px">
      ${chartPanel(defs[0], chartState)}
      <section class="panel"><header><h2>Project progress</h2></header><div class="body">${active.length ? active.map((p) => { const g = D.projectProgress(p.id); return `<a class="progressrow" href="#/p/${esc(p.id)}" style="color:inherit"><span><b>${esc(p.code)}</b> <span class="muted small">${esc(truncate(p.name, 26))}</span></span>${meter(g.frac, g.frac === 1 ? 'good' : '')}<span>${Math.round(g.frac * 100)}%</span></a>`; }).join('') : '<p class="muted">No active projects.</p>'}</div></section>
    </div>
    <div class="grid c2" style="margin-top:16px">
      ${chartPanel(defs[1], chartState)}
      <section class="panel"><header><h2>Recent comments</h2><a class="btn ghost sm" href="#/activity">See all</a></header><div class="body feed">${D.allComments().slice(0, 6).map(feedRow).join('') || '<p class="muted">No comments yet.</p>'}</div></section>
    </div>`,
    acts: { newProject, toggleChart: (d) => { chartState[`tbl_${d.id}`] = !chartState[`tbl_${d.id}`]; rerender(); } },
    mount: (root) => drawCharts(root, defs),
  };
}

export function feedView() {
  const act = D.allActivity().slice(0, 80);
  return {
    title: 'Comments & activity',
    html: `${pageHead({ title: 'Comments & activity', sub: 'Latest comments from everyone, and every change made by the administrator.' })}
    <div class="grid c2">
      <section class="panel"><header><h2>Comments</h2></header><div class="body feed">${D.allComments().slice(0, 80).map(feedRow).join('') || '<p class="muted">No comments yet.</p>'}</div></section>
      <section class="panel"><header><h2>Changes</h2></header><div class="body"><div class="loglist">${act.map((a) => { const it = a.itemId && D.item(a.pid, a.itemId); return `<div class="logrow"><span class="when">${esc(fmtDateTime(a.at))}</span><span><b>${esc(a.pid)}</b>${it ? ` › <a href="#/p/${esc(a.pid)}/i/${esc(a.itemId)}">${esc(it.code)}</a>` : ''} · ${esc(a.text)}</span></div>`; }).join('') || '<p class="muted">Nothing yet.</p>'}</div></div></section>
    </div>`,
  };
}
