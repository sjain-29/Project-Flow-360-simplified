/** Deadlines: every open stage by how urgent it is. */
import * as D from '../data.js';
import { esc, badge, pageHead, btn, table, tabsBar, downloadCsv } from '../ui.js';

const FILTERS = [
  ['overdue', 'Overdue', (r) => r.late > 0],
  ['soon', 'Due soon', (r) => r.due && ['today', 'soon'].includes(r.due.key)],
  ['waiting', 'Waiting / on hold', (r) => ['Waiting', 'On Hold'].includes(r.status)],
  ['upcoming', 'Upcoming', (r) => r.due?.key === 'upcoming'],
  ['nodate', 'No date set', (r) => D.isOpen(r) && !r.expEnd],
  ['open', 'All open', (r) => D.isOpen(r)],
];

export function deadlinesView({ query }) {
  const f = FILTERS.find((x) => x[0] === query.f) || FILTERS[0];
  const base = D.stageRows().filter((r) => !query.p || r.pid === query.p);
  const rows = base.filter(f[2]).sort((a, b) => (b.late - a.late) || String(a.expEnd || '9').localeCompare(String(b.expEnd || '9')));
  const q = (id) => `#/deadlines?f=${id}${query.p ? `&p=${encodeURIComponent(query.p)}` : ''}`;
  return {
    title: 'Deadlines',
    html: `${pageHead({ title: 'Deadlines', sub: `${query.p ? `Project ${esc(query.p)} · <a href="#/deadlines?f=${f[0]}">show all projects</a> · ` : ''}Open stages of active projects, by expected completion date. “Due soon” means within ${D.settings().dueSoonDays} days.`, actions: btn('csv', 'Export', { ic: 'download', cls: 'ghost' }) })}
      ${tabsBar(FILTERS.map(([id, label, fn]) => [id, `${label} (${base.filter(fn).length})`]), f[0], q)}
      <section class="panel">${table({
        rows, href: (r) => `#/p/${r.pid}/i/${r.iid}?stage=${r.sid}`, flag: (r) => r.late > 0,
        empty: f[0] === 'overdue' ? '<b>Nothing is overdue</b>Well done.' : '<b>Nothing here</b>',
        cols: [
          { label: 'Project', html: (r) => `<b>${esc(r.pid)}</b>`, cls: 'id' },
          { label: 'Item', html: (r) => `${esc(r.itemCode)}<div class="muted small">${esc(r.itemName)}</div>` },
          { label: 'Stage', html: (r) => `${esc(r.name)}${r.owner ? `<div class="muted small">${esc(r.owner)}</div>` : ''}` },
          { label: 'Status', type: 'status', key: 'status' },
          { label: 'Expected', key: 'expEnd', type: 'date', cls: 'nowrap' },
          { label: 'Due', html: (r) => (r.late ? badge(`${r.late} d overdue`, 'crit') : r.due ? badge(r.due.key === 'today' ? 'Due today' : `in ${r.due.days} d`, r.due.key === 'upcoming' ? 'info' : 'warn') : '<span class="muted">—</span>') },
        ],
      })}</section>`,
    acts: { csv: () => downloadCsv(`deadlines-${f[0]}.csv`, [['pid', 'Project'], ['itemCode', 'Item code'], ['itemName', 'Item'], ['name', 'Stage'], ['owner', 'Responsible'], ['status', 'Status'], ['expEnd', 'Expected completion'], ['late', 'Days overdue'], ['ref', 'Reference']], rows) },
  };
}
