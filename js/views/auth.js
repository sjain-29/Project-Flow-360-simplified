/** Screens shown before the app: sign in, one-time set-up, forced password change, and account problems. */
import { APP, PASSWORD_MIN } from '../config/app-config.js';
import { missingFirebaseValues } from '../config/firebase-config.js';
import { DEMO_USERS, DEMO_PASSWORD } from '../backend-demo.js';
import { isDemo, be } from '../backend.js';
import { session, login, logout, initialiseSystem, changePassword, usernameOf } from '../data.js';
import { esc, icon, withBusy } from '../ui.js';

const brand = `<div class="login-brand"><img src="assets/logo.svg" alt="" width="52" height="52"><h1>${APP.name}</h1>
  <p class="lead">Track every stage of every item — from the first check to closure — and see at a glance what is late.</p>
  <ol class="route"><li><b>Projects and items</b><span>each item gets the standard stage list</span></li><li><b>Stages</b><span>status, expected dates, references and notes</span></li><li><b>Mark complete</b><span>when the work is done outside</span></li><li><b>Comments</b><span>on any stage, by you or your commenters</span></li><li><b>Dashboard</b><span>overdue, due soon and progress</span></li></ol></div>`;
const page = (card) => `<div class="login-wrap">${brand}<div class="login-card">${card}</div></div>`;
const err = '<div class="err" hidden role="alert"></div>';
function wire(root, formSel, fn) {
  const form = root.querySelector(formSel); const e = root.querySelector('.err'); const b = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); e.hidden = true;
    b.classList.add('busy'); b.disabled = true;
    try { await fn(new FormData(form)); } catch (x) { e.textContent = x.message || String(x); e.hidden = false; if (!x.name?.includes('AppError')) console.error(x); } finally { b.classList.remove('busy'); b.disabled = false; }
  });
}

export function loginScreen(root, done) {
  const missing = missingFirebaseValues();
  const partly = missing.length && missing.length < 5;
  root.innerHTML = page(`<h2>Sign in</h2><p class="sub">Use the username and password given to you by your administrator.</p>${err}
    <form id="loginForm" novalidate>
      <div class="field"><label for="u">Username</label><input id="u" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="p">Password</label><div class="pw"><input id="p" name="p" type="password" autocomplete="current-password" required><button type="button" class="iconbtn" data-show aria-label="Show password">${icon('eye')}</button></div></div>
      <div class="row"><label class="check"><input type="checkbox" name="r"><span>Remember me on this device</span></label></div>
      <button type="submit" class="btn primary" id="go">Sign in</button>
    </form>
    ${partly ? `<div class="note warn" style="margin-top:18px">Firebase is partly set up. Add ${missing.map((m) => `<b>${esc(m)}</b>`).join(' and ')} to <code>js/config/firebase-config.js</code> to switch from demo mode to your live database (README, step 4).</div>` : ''}
    ${isDemo() ? `<div class="demo-box"><h3>${icon('alert')}Demo mode — not connected to Firebase</h3><p>Everything is stored only in this browser. These demo accounts all use the password <b>${DEMO_PASSWORD}</b>. Pick one to fill in the form.</p>
      <div class="demo-users">${DEMO_USERS.map(([u, n, r]) => `<button type="button" data-demo="${u}"><b>${u}</b><span>${esc(r[0].toUpperCase() + r.slice(1))} · ${esc(n.replace(' (demo)', ''))}</span></button>`).join('')}</div></div>` : ''}`);
  root.querySelector('[data-show]').addEventListener('click', () => { const p = root.querySelector('#p'); p.type = p.type === 'password' ? 'text' : 'password'; });
  root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => { root.querySelector('#u').value = b.dataset.demo; root.querySelector('#p').value = DEMO_PASSWORD; root.querySelector('#p').focus(); }));
  wire(root, '#loginForm', async (f) => { await login(f.get('u'), f.get('p'), !!f.get('r')); done(); });
  root.querySelector('#u').focus();
}

export function setupScreen(root, done) {
  const u = usernameOf(session.email);
  root.innerHTML = page(`<h2>Set up ${APP.name}</h2><p class="sub">You are signing in for the first time as <b>${esc(u)}</b>. This creates the administrator account and the default settings. It works only once.</p>${err}
    <form id="setupForm" novalidate>
      <div class="field"><label for="n">Your display name</label><input id="n" name="n" value="${esc(u ? u[0].toUpperCase() + u.slice(1) : '')}" required></div>
      <div class="field"><label for="o">Organisation name</label><input id="o" name="o" value="My Organisation"></div>
      <button type="submit" class="btn primary">Initialise the system</button>
    </form><p class="muted small" style="margin-top:14px">Next you will be asked to choose a new password.</p>`);
  wire(root, '#setupForm', async (f) => { await initialiseSystem({ name: f.get('n'), orgName: f.get('o') }); done(); });
}

export function passwordScreen(root, done, { forced = true } = {}) {
  root.innerHTML = page(`<h2>${forced ? 'Choose a new password' : 'Change password'}</h2><p class="sub">${forced ? 'You signed in with a temporary password. Choose your own before continuing.' : 'Choose a new password for your account.'}</p>${err}
    <form id="pwForm" novalidate>
      <div class="field"><label for="n1">New password</label><input id="n1" name="n1" type="password" autocomplete="new-password" required><div class="hint">At least ${PASSWORD_MIN} characters.</div></div>
      <div class="field"><label for="n2">Repeat the new password</label><input id="n2" name="n2" type="password" autocomplete="new-password" required></div>
      <button type="submit" class="btn primary">Save password</button>
      <button type="button" class="btn ghost" data-out>${forced ? 'Sign out' : 'Cancel'}</button>
    </form>`);
  root.querySelector('[data-out]').addEventListener('click', async () => { if (forced) await logout(); done(); });
  wire(root, '#pwForm', async (f) => { await changePassword(f.get('n1'), f.get('n2')); done(); });
  root.querySelector('#n1').focus();
}

export function problemScreen(root, done) {
  const inactive = session.state === 'inactive';
  root.innerHTML = page(inactive
    ? `<h2>Account switched off</h2><p class="sub">This account has been deactivated or replaced by a new sign-in. Ask your administrator.</p><button class="btn primary" data-out>Sign out</button>`
    : `<h2>This system is not set up yet</h2><p class="sub">You are signed in, but this account has no profile in ${APP.name}.</p>
       <p>If you are the owner setting it up for the first time, put this account's UID into <code>system/bootstrapUid</code> in the Realtime Database (README, step 6), then reload this page.</p>
       <div class="field"><div class="lbl">Your UID</div><div class="uidbox" id="uid">${esc(session.uid)}</div></div>
       <div class="row" style="margin-top:14px"><button class="btn" data-copy>${icon('copy')}Copy UID</button><button class="btn primary" data-reload>Reload</button><button class="btn ghost" data-out>Sign out</button></div>`);
  root.querySelector('[data-out]')?.addEventListener('click', async (e) => withBusy(e.currentTarget, async () => { await logout(); done(); }));
  root.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  root.querySelector('[data-copy]')?.addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(session.uid); e.currentTarget.textContent = 'Copied'; } catch { /* select manually */ } });
}

export function fatalScreen(root, e) {
  root.innerHTML = page(`<h2>Cannot start</h2><div class="err">${esc(e?.message || e)}</div><p class="muted">If you just connected Firebase, check the values in <code>js/config/firebase-config.js</code> and that this computer can reach www.gstatic.com.</p><button class="btn primary" onclick="location.reload()">Try again</button>`);
  console.error(e);
}
export { be };
