// クラブ卓の通し確認: 4人がログイン→卓を開く→着席→対局→精算→残高と戦績を確認
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { installAuto } from './auto.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? 'out/club';
const PW = 'mahjong-dev-1234';
const USERS = ['owner@example.test', 'p1@example.test', 'p2@example.test', 'p3@example.test'];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const r = await fetch(`/api/${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}, { method, path, body });

const pages = [];
for (const email of USERS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', email, e.message));
  await page.goto(`${BASE}/login`);
  const r = await api(page, 'POST', 'auth/login', { email, password: PW });
  if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r)}`);
  pages.push(page);
}
const owner = pages[0];
const clubs = await api(owner, 'GET', 'clubs');
const club = (clubs.body.clubs ?? clubs.body)[0];
const clubId = club.id ?? club.club_id;
console.log('club', clubId, club.name);
const balance = async (p) => { const r = await api(p, 'GET', `clubs/${clubId}/points`); return r.body?.balance ?? r.body?.me?.balance ?? JSON.stringify(r.body).slice(0, 200); };
const before = [];
for (const p of pages) before.push(await balance(p));
console.log('before', JSON.stringify(before));

const opened = await api(owner, 'POST', `clubs/${clubId}/tables`, { name: '通し確認卓', players: 4, length: 'east', rate: 100, minBuyin: 0, rules: {} });
console.log('open', JSON.stringify(opened));
const tableId = opened.body.tableId;
for (const p of pages) { const r = await api(p, 'POST', `tables/${tableId}/join`, {}); console.log('join', r.status, JSON.stringify(r.body).slice(0, 160)); }
const detail = await api(owner, 'GET', `tables/${tableId}`);
console.log('table', JSON.stringify(detail.body).slice(0, 400));

await Promise.all(pages.map((p) => p.goto(`${BASE}/table/${tableId}`)));
await Promise.all(pages.map((p) => p.waitForFunction(() => window.__game && window.__game.getState().view, null, { timeout: 60000 })));
await owner.screenshot({ path: `${OUT}/01-start.png` });
for (const p of pages) await p.evaluate(installAuto, { pace: 'fast' });
const t0 = Date.now();
for (;;) {
  await owner.waitForTimeout(1000);
  const fin = await Promise.all(pages.map((p) => p.evaluate(() => !!window.__game.getState().final)));
  if (fin.every(Boolean)) break;
  if (Date.now() - t0 > 400000) { console.log('TIMEOUT', JSON.stringify(fin)); break; }
}
await owner.waitForTimeout(3000);
await owner.screenshot({ path: `${OUT}/02-final.png` });
const final = await owner.evaluate(() => window.__game.getState().final);
console.log('final', JSON.stringify(final));
const after = [];
for (const p of pages) { await p.goto(`${BASE}/`); after.push(await balance(p)); }
console.log('after', JSON.stringify(after));
const hist = await api(owner, 'GET', 'history');
console.log('history', JSON.stringify(hist.body).slice(0, 500));
const td = await api(owner, 'GET', `tables/${tableId}`);
console.log('table after', JSON.stringify(td.body).slice(0, 300));
await owner.goto(`${BASE}/clubs/${clubId}`);
await owner.waitForTimeout(2500);
await owner.screenshot({ path: `${OUT}/03-club.png` });
await browser.close();
