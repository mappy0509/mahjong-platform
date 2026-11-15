// 通しプレイの自動操作。実際の Chrome を動かして、CPU練習卓を終局まで打つ。
//   node play.mjs                      … 速いCPU(8788)で検証。out/ にスクリーンショット
//   VIDEO=1 TS=8787 PACE=human node play.mjs … 通常の速さで録画（out/video/*.webm）
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { installAuto } from './auto.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const TS = process.env.TS ?? '8788';
const N = process.env.N ?? '4';
const LENGTH = process.env.LENGTH ?? 'east';
const OUT = process.env.OUT ?? 'out';
const VIDEO = process.env.VIDEO === '1';
const PACE = process.env.PACE ?? 'fast';
const MAX_MS = Number(process.env.MAX_MS ?? 240000);
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
const HEADLESS = process.env.HEADLESS !== '0';
const STOP_AFTER_ROUNDS = Number(process.env.ROUNDS ?? 0);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(VIDEO ? { recordVideo: { dir: `${OUT}/video`, size: { width: W, height: H } } } : {}) });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/dev/play?ts=${TS}&n=${N}&length=${LENGTH}`);
await page.waitForFunction(() => window.__game && window.__game.getState().view, null, { timeout: 30000 });
await page.mouse.click(W / 2, H / 3); // 音の解禁
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-start.png` });

// 自動プレイ: 和了れるなら和了る／立直できるなら立直／それ以外は向聴を崩さない程度に端から切る
await page.evaluate(installAuto, { pace: PACE });

const t0 = Date.now();
let seen = 0, shots = 1, rounds = 0, done = false;
while (Date.now() - t0 < MAX_MS && !done) {
  await page.waitForTimeout(250);
  const log = await page.evaluate(() => window.__log);
  while (seen < log.length) {
    const e = log[seen++];
    console.log(JSON.stringify(e));
    if (!VIDEO || true) {
      await page.waitForTimeout(e.t === 'win' ? 1400 : 500);
      await page.screenshot({ path: `${OUT}/${String(++shots).padStart(2, '0')}-${e.t}.png` });
    }
    if (e.t === 'roundEnd') rounds++;
    if (e.t === 'final' || (STOP_AFTER_ROUNDS && rounds >= STOP_AFTER_ROUNDS)) done = true;
  }
}
if (done) await page.waitForTimeout(VIDEO ? 5000 : 800);
await page.screenshot({ path: `${OUT}/99-end.png` });
const state = await page.evaluate(() => { const s = window.__game.getState(); return { final: s.final, status: s.status, error: s.error, left: s.view && s.view.left }; });
console.log('STATE', JSON.stringify(state));
console.log('ERRORS', JSON.stringify(errors.slice(0, 20)));
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
await ctx.close();
await browser.close();
if (VIDEO) console.log('video saved under', `${OUT}/video`);
process.exit(done ? 0 : 2);
