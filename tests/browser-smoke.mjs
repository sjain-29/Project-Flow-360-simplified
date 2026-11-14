/**
 * Browser smoke test (needs Chrome):  CHROME=/path/to/chrome node tests/browser-smoke.mjs
 * Serves the app in demo mode, signs in as each role, opens every screen at desktop
 * and phone size, exercises the main actions, and fails on any page error, console
 * error, horizontal overflow or wrong permission. Screenshots go to tests/screens/.
 */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = p === '/' ? '/index.html' : p;
  try { const data = await readFile(join(root, f)); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const shots = join(root, 'tests', 'screens'); await mkdir(shots, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
const problems = []; let where = 'start';
page.on('pageerror', (e) => { problems.push(`[${where}] page error: ${e.message}`); console.log('PAGEERROR', where, e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`[${where}] console: ${m.text().slice(0, 300)}`); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESK = { width: 1366, height: 860 }; const PHONE = { width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const text = () => page.$eval('body', (b) => b.innerText);
const check = (ok, msg) => { if (!ok) { problems.push(`[${where}] ${msg}`); console.log(`PROBLEM [${where}] ${msg}`); } };

async function signIn(user) {
  where = `login ${user}`;
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('pf360t.demo.session'); location.hash = ''; });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#loginForm');
  await page.type('#u', user); await page.type('#p', 'demo1234');
  await page.click('#go');
  await page.waitForSelector('#content h1', { timeout: 15000 });
}
async function visit(hash, name, { shot = false, expect } = {}) {
  where = `${name} ${hash}`;
  await page.evaluate((h) => { location.hash = h; }, hash); await sleep(350);
  const h1 = await page.$('#content h1'); check(h1, 'no page title');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 1, `horizontal overflow of ${over}px`);
  if (expect) check(expect.test(await text()), `expected ${expect}`);
  if (shot) await page.screenshot({ path: join(shots, `${name}.png`) });
}
const closeModals = async () => { while (await page.$('.modal [data-close]')) { await page.click('.modal [data-close]'); await sleep(150); } };

process.on('unhandledRejection', async (e) => { console.error(`FAILED at [${where}]: ${e.message}\n - ${problems.join('\n - ')}`); await page.screenshot({ path: join(shots, 'failure.png') }).catch(() => {}); process.exit(1); });
await page.setViewport(DESK);
// 1. administrator: every screen, plus the main actions
await signIn('admin');
await page.screenshot({ path: join(shots, 'dashboard.png') });
const routes = [['#/dashboard', 'dashboard', /Needs attention/], ['#/projects', 'projects', /DRN-A1/], ['#/p/DRN-A1', 'project', /FC-H743/], ['#/p/DRN-A1?tab=comments', 'project-comments', /Kick-off/], ['#/p/DRN-A1?tab=history', 'project-history', /Project created/], ['#/p/DRN-A1/i/i1', 'item', /Vendor dispatch/], ['#/deadlines', 'deadlines', /Overdue/], ['#/deadlines?f=soon', 'deadlines-soon'], ['#/activity', 'activity', /Called the vendor/], ['#/admin/users', 'admin-users', /Chetan/], ['#/admin/stages', 'admin-stages', /Standard stage list/], ['#/admin/settings', 'admin-settings'], ['#/admin/backup', 'admin-backup', /Download a backup/], ['#/nowhere', 'notfound', /Page not found/]];
for (const [h, n, e] of routes) await visit(h, n, { shot: true, expect: e });

where = 'stage dialog';
await visit('#/p/DRN-A1/i/i1?stage=dispatch', 'stage-dialog');
await page.waitForSelector('.modal .stagehead'); await sleep(200);
check(/Called the vendor/.test(await page.$eval('.modal', (m) => m.innerText)), 'stage comments missing in dialog');
await page.screenshot({ path: join(shots, 'stage-dialog.png') });
where = 'mark complete';
await page.click('.modal [data-act="complete"]'); await page.waitForSelector('.modal [data-submit]');
await page.type('.modal textarea[name="comment"]', 'Delivered to SPIF today.');
await page.click('.modal [data-submit]'); await sleep(700);
check(await page.evaluate(() => /Completed/.test(document.querySelector('.modal .stagehead')?.innerText || '')), 'stage dialog did not update to Completed');
check(/Delivered to SPIF today/.test(await page.$eval('.modal', (m) => m.innerText)), 'completion comment not shown');
await closeModals();
where = 'edit dates after completion';
await page.click('tr[data-sid="dispatch"] [data-act="editStage"]'); await page.waitForSelector('.modal #f-expEnd');
await page.$eval('.modal #f-expEnd', (e) => { e.value = '2027-01-15'; });
await page.click('.modal [data-submit]'); await sleep(600);
check(/15 Jan 2027/.test(await page.$eval('tr[data-sid="dispatch"]', (r) => r.innerText)), 'expected date not saved on a completed stage');
where = 'inline status';
await page.select('tr[data-sid="spifReceipt"] select.inline-status', 'In Progress'); await sleep(600);
check(await page.$eval('tr[data-sid="spifReceipt"] select.inline-status', (s) => s.value) === 'In Progress', 'inline status did not stick');
where = 'add stage';
await page.click('[data-act="addStage"]'); await page.waitForSelector('.modal #f-name');
await page.type('.modal #f-name', 'Customs clearance'); await page.click('.modal [data-submit]'); await sleep(600);
check(/Customs clearance/.test(await text()), 'added stage missing');
where = 'create project';
await visit('#/projects', 'projects');
await page.click('[data-act="new"]'); await page.waitForSelector('.modal #f-code'); await sleep(100);
await page.type('.modal #f-code', 'ui-test-1'); await page.type('.modal #f-name', 'Created in the browser');
await page.click('.modal [data-submit]'); await sleep(800);
check((await page.evaluate(() => location.hash)).includes('UI-TEST-1'), `project creation failed: ${await page.$eval('body', (b) => b.querySelector('.modal .err')?.innerText || 'no error shown')}`);
await page.click('[data-act="addItem"]'); await page.waitForSelector('.modal #f-code'); await sleep(100);
await page.type('.modal #f-code', 'PART-1'); await page.type('.modal #f-name', 'Test part');
await page.click('.modal [data-submit]'); await sleep(800);
check(await page.$$eval('table.stages tbody tr', (r) => r.length) === 15, 'new item should start with 15 stages');
await page.screenshot({ path: join(shots, 'new-item.png') });
where = 'add user';
await visit('#/admin/users', 'admin-users');
await page.click('[data-act="addUser"]'); await page.waitForSelector('.modal #f-username');
await page.type('.modal #f-name', 'Rita Reviewer'); await page.type('.modal #f-username', 'rita');
await page.click('.modal [data-submit]'); await sleep(800);
check(/rita/.test(await text()), 'new user missing from the list');
await page.setViewport(PHONE);
for (const [h, n] of [['#/dashboard', 'm-dashboard'], ['#/p/DRN-A1/i/i1', 'm-item'], ['#/deadlines', 'm-deadlines'], ['#/p/DRN-A1', 'm-project'], ['#/admin/stages', 'm-admin-stages']]) await visit(h, n, { shot: true });
where = 'mobile menu'; await page.click('#menuToggle'); await sleep(300); await page.screenshot({ path: join(shots, 'm-menu.png') });
check(await page.evaluate(() => document.body.classList.contains('nav-open')), 'mobile menu does not open');
await page.click('#menuToggle'); await page.setViewport(DESK);

// 2. commenter: can comment, cannot change anything
await signIn('commenter');
where = 'commenter';
await visit('#/p/DRN-A1/i/i2', 'c-item');
check(!(await page.$('select.inline-status')), 'commenter sees the status editor');
check(!(await page.$('[data-act="addStage"]')), 'commenter sees Add stage');
check(!(await page.$$eval('#nav a', (a) => a.map((x) => x.innerText).join())).includes('Administration'), 'commenter sees Administration');
await page.click('tr[data-sid="prApproval"]'); await page.waitForSelector('.modal #stageComment');
check(!(await page.$('.modal [data-act="complete"]')), 'commenter can mark complete');
await page.type('.modal #stageComment', 'Chased the approver again.');
await page.click('.modal [data-act="addComment"]'); await sleep(600);
check(/Chased the approver again/.test(await page.$eval('.modal', (m) => m.innerText)), 'commenter comment not shown');
check(await page.$eval('.modal #stageComment', (t) => t.value) === '', 'comment box not cleared after posting');
await page.screenshot({ path: join(shots, 'commenter-stage.png') });
await closeModals();
await visit('#/admin/users', 'c-admin', { expect: /Only the administrator/ });
where = 'commenter write refused';
check(/Only the administrator/.test(await page.evaluate(async () => { const D = await import('./js/data.js'); try { await D.saveProject({ code: 'HACK-1', name: 'x' }); return 'allowed'; } catch (e) { return e.message; } })), 'commenter could create a project through the data layer');

// 3. viewer: view only
await signIn('viewer');
where = 'viewer';
await visit('#/p/DRN-A1/i/i1?stage=dispatch', 'v-item');
await page.waitForSelector('.modal .stagehead'); await sleep(200);
check(!(await page.$('.modal #stageComment')), 'viewer has a comment box');
await page.screenshot({ path: join(shots, 'viewer-stage.png') });
await closeModals();
check(/can view but not comment/.test(await page.evaluate(async () => { const D = await import('./js/data.js'); try { await D.addComment('DRN-A1', { text: 'x' }); return 'allowed'; } catch (e) { return e.message; } })), 'viewer could comment through the data layer');
await visit('#/dashboard', 'v-dashboard', { shot: true, expect: /Needs attention/ });

await browser.close(); server.close();
if (problems.length) { console.error(`${problems.length} problem(s):\n - ${problems.join('\n - ')}`); process.exit(1); }
console.log('browser smoke test passed: admin, commenter and viewer on desktop and phone — every screen, the main actions and the permission checks');
