/** App shell: start-up, sign-in states, menu, search, routing and re-rendering. */
import { APP } from './config/app-config.js';
import { initBackend, isDemo, be } from './backend.js';
import * as D from './data.js';
import { esc, icon, $, toast, showError, withBusy, confirmDialog } from './ui.js';
import { loginScreen, setupScreen, passwordScreen, problemScreen, fatalScreen } from './views/auth.js';
import { dashboardView, feedView } from './views/dashboard.js';
import { projectsView, projectView } from './views/projects.js';
import { itemView } from './views/item.js';
import { deadlinesView } from './views/deadlines.js';
import { adminView } from './views/admin.js';

const root = document.getElementById('root');
let current = null; let cleanup = null; let shellUp = false;

const NAV = [
  ['#/dashboard', 'Dashboard', 'dashboard'],
  ['#/projects', 'Projects', 'projects'],
  ['#/deadlines', 'Deadlines', 'clock', () => D.overdueRows().length],
  ['#/activity', 'Comments & activity', 'message'],
  ['#/admin/users', 'Administration', 'settings', null, true],
];

function parseHash() {
  const [path, q = ''] = (location.hash.slice(1) || '/dashboard').split('?');
  return { path: path.replace(/\/+$/, '') || '/dashboard', query: Object.fromEntries(new URLSearchParams(q)) };
}
function resolve() {
  const { path, query } = parseHash();
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'dashboard') return () => dashboardView({ query });
  if (seg[0] === 'projects' && !seg[1]) return () => projectsView({ query });
  if (seg[0] === 'p' && seg[1] && !seg[2]) return () => projectView({ pid: seg[1], query });
  if (seg[0] === 'p' && seg[2] === 'i' && seg[3]) return () => itemView({ pid: seg[1], iid: seg[3], query });
  if (seg[0] === 'deadlines') return () => deadlinesView({ query });
  if (seg[0] === 'activity') return () => feedView({ query });
  if (seg[0] === 'admin') return () => adminView({ sec: seg[1] || 'users', query });
  return () => ({ title: 'Not found', html: '<div class="pagehead"><div class="titles"><h1>Page not found</h1></div></div><div class="panel"><div class="empty">Use the menu to continue.</div></div>' });
}

/* ------------------------------------------------------------------ start-up and sign-in states */
async function boot() {
  try { await initBackend(); await be().auth.ready(); await D.establish(); } catch (e) { document.body.className = 'login'; fatalScreen(root, e); return; }
  showState();
}
function showState() {
  const s = D.session.state;
  if (s === 'ok') { document.body.className = ''; startApp(); return; }
  D.stop(); shellUp = false; document.body.className = 'login';
  const next = () => showState();
  if (s === 'none') loginScreen(root, next);
  else if (s === 'bootstrap') setupScreen(root, next);
  else if (s === 'changePassword') passwordScreen(root, next);
  else problemScreen(root, next);
}

function startApp() {
  if (!shellUp) {
    root.innerHTML = shellHtml(); shellUp = true; wireShell();
    D.start(() => { if (D.session.state !== 'ok') { showState(); return; } render(); });
  }
  render();
}

function shellHtml() {
  const u = D.session.me;
  const initials = (u.name || u.username).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<div class="shell">
  <aside class="rail" id="rail"><a class="brand" href="#/dashboard" style="color:inherit;text-decoration:none"><img src="assets/logo.svg" alt=""><div><b>${APP.name}</b><span id="orgName"></span></div></a><nav class="nav" id="nav" aria-label="Main menu"></nav><div class="rail-foot">${APP.tagline} · v${APP.version}</div></aside>
  <div class="main">
    ${isDemo() ? `<div class="demo-banner">${icon('alert')}<b>Demo mode.</b> Not connected to Firebase — data lives only in this browser and is not shared with anyone.</div>` : ''}
    <header class="topbar">
      <button class="iconbtn menu-toggle" id="menuToggle" aria-label="Open menu">${icon('menu')}</button>
      <div class="search rel">${icon('search')}<input id="q" type="search" placeholder="Search projects, items, stages, references…" autocomplete="off" aria-label="Search"><div class="pop" id="searchPop" hidden></div></div>
      <div class="spacer"></div>
      <div class="rel"><button class="userchip" id="userBtn" aria-haspopup="true"><span class="avatar">${esc(initials)}</span><div><b>${esc(u.name)}</b><span>${esc(D.roleName())}</span></div></button><div class="pop" id="userPop" hidden></div></div>
    </header>
    <main class="content" id="content"></main>
  </div></div>`;
}

function navHtml() {
  const here = `#${parseHash().path}`;
  return NAV.map(([href, label, ic, count, adminOnly]) => {
    if (adminOnly && !D.isAdmin()) return '';
    const active = here === href || (href === '#/projects' && here.startsWith('#/p/')) || (href.startsWith('#/admin') && here.startsWith('#/admin'));
    const n = count ? count() : 0;
    return `<a href="${href}" data-k="${ic === 'message' ? 'chart' : ic}"${active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span>${n ? `<span class="count" title="${n} overdue">${n}</span>` : ''}</a>`;
  }).join('');
}

/* ------------------------------------------------------------------ rendering */
function render() {
  if (!shellUp) return;
  $('#nav').innerHTML = navHtml();
  $('#orgName').textContent = D.settings().orgName;
  const content = $('#content');
  const active = document.activeElement; const keepFocus = active && content.contains(active) && active.id ? [active.id, active.selectionStart, active.selectionEnd] : null;
  const y = window.scrollY;
  cleanup?.(); cleanup = null;
  try { current = resolve()(); } catch (e) { current = { title: 'Error', html: `<div class="err">${esc(e.message)}</div>` }; console.error(e); }
  document.title = `${current.title} · ${APP.name}`;
  content.innerHTML = current.html;
  cleanup = current.mount?.(content) || null;
  if (keepFocus) { const el = document.getElementById(keepFocus[0]); if (el) { el.focus(); try { el.setSelectionRange(keepFocus[1], keepFocus[2]); } catch { /* not text */ } } }
  if (renderedPath === location.hash) window.scrollTo(0, y); else { window.scrollTo(0, 0); renderedPath = location.hash; }
  current.after?.();
}
let renderedPath = '';

function wireShell() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (t && ['SELECT', 'INPUT', 'TEXTAREA', 'OPTION'].includes(e.target.tagName)) return; // handled on change / typing
    if (t && current?.acts?.[t.dataset.act] && $('#content').contains(t)) {
      e.preventDefault();
      try { await current.acts[t.dataset.act](t.dataset, t); } catch (x) { showError(x); }
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,input,select')) location.hash = row.dataset.href;
    if (!e.target.closest('#userBtn,#userPop')) $('#userPop').hidden = true;
    if (!e.target.closest('.search')) $('#searchPop').hidden = true;
    if (e.target.closest('#nav a')) document.body.classList.remove('nav-open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-href]')) location.hash = e.target.dataset.href; if (e.key === 'Enter' && e.target.matches('tr[data-act]')) e.target.click(); });
  document.addEventListener('change', async (e) => {
    const t = e.target.closest('select[data-act]');
    if (t && current?.acts?.[t.dataset.act] && $('#content').contains(t)) { try { await current.acts[t.dataset.act](t.dataset, t); } catch (x) { showError(x); } }
  });
  window.addEventListener('pf:rerender', () => render());
  $('#menuToggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.addEventListener('click', (e) => { if (document.body.classList.contains('nav-open') && !e.target.closest('#rail,#menuToggle')) document.body.classList.remove('nav-open'); });
  $('#userBtn').addEventListener('click', () => {
    const pop = $('#userPop'); pop.hidden = !pop.hidden; if (pop.hidden) return;
    pop.innerHTML = `<header><b>${esc(D.session.me.name)}</b><span class="muted small">${esc(D.session.me.username)}</span></header><div class="list">
      <button data-u="pw">${icon('key')} Change password</button>${isDemo() ? `<button data-u="reset">${icon('refresh')} Reset demo data</button>` : ''}<button data-u="out">${icon('logout')} Sign out</button></div>`;
  });
  $('#userPop').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    $('#userPop').hidden = true;
    if (b.dataset.u === 'out') await withBusy(b, async () => { await D.logout(); location.hash = ''; showState(); });
    if (b.dataset.u === 'pw') { D.stop(); shellUp = false; document.body.className = 'login'; passwordScreen(root, () => { location.reload(); }, { forced: false }); }
    if (b.dataset.u === 'reset' && await confirmDialog({ title: 'Reset demo data', body: 'Delete everything in this browser\'s demo and start again with the sample projects?', confirmLabel: 'Reset', danger: true })) { be().reset(); location.hash = ''; location.reload(); }
  });
  const q = $('#q'); const pop = $('#searchPop');
  q.addEventListener('input', () => { const html = searchHtml(q.value); pop.innerHTML = html; pop.hidden = !html; });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; pop.hidden = true; } if (e.key === 'Enter') pop.querySelector('a')?.click(); });
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) { pop.hidden = true; q.value = ''; } });
  window.addEventListener('hashchange', () => { document.body.classList.remove('nav-open'); render(); });
}

function searchHtml(text) {
  const t = text.trim().toLowerCase(); if (t.length < 2) return '';
  const has = (...v) => v.some((x) => String(x || '').toLowerCase().includes(t));
  const hits = [];
  for (const p of D.projects()) {
    if (has(p.code, p.name)) hits.push([`#/p/${p.id}`, `${p.code} — ${p.name}`, 'Project']);
    for (const i of D.items(p.id)) {
      if (has(i.code, i.name)) hits.push([`#/p/${p.id}/i/${i.id}`, `${i.code} — ${i.name}`, `Item · ${p.code}`]);
      for (const s of D.stages(p.id, i.id)) if (has(s.name, s.ref, s.notes, s.owner)) hits.push([`#/p/${p.id}/i/${i.id}?stage=${s.id}`, `${s.name}${s.ref ? ` · ${s.ref}` : ''}`, `Stage · ${p.code} / ${i.code} · ${s.status}`]);
    }
  }
  if (!hits.length) return '<div class="list"><div class="empty">No matches.</div></div>';
  return `<div class="list">${hits.slice(0, 14).map(([h, l, s]) => `<a href="${esc(h)}"><span>${esc(l)}</span><small>${esc(s)}</small></a>`).join('')}</div>`;
}

window.addEventListener('unhandledrejection', (e) => { if (e.reason?.name === 'AppError') { toast(e.reason.message, 'error'); e.preventDefault(); } });
boot();
