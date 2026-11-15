// 通しプレイの録画。ホームから CPU 対局に入り、実際にマウスで牌とボタンを押して終局まで打つ。
//   node record.mjs            → out/record/video/*.webm と、要所のスクリーンショット
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? 'out/record';
const MODE = process.env.MODE ?? '四人 東風';
const MAX_MS = Number(process.env.MAX_MS ?? 1500000);
const ROUNDS = Number(process.env.ROUNDS ?? 0);
const W = 1280, H = 720;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS !== '0', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: `${OUT}/video`, size: { width: W, height: H } } });
const page = await ctx.newPage();
const issues = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) issues.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
// 録画に写るカーソル
await page.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px;border-radius:50%;border:2px solid #fff;background:rgba(255,215,106,.55);box-shadow:0 0 8px rgba(0,0,0,.8);pointer-events:none;left:-50px;top:-50px;transition:transform .08s';
    document.body.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'scale(.6)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  });
});

let shot = 0;
const snap = async (name) => page.screenshot({ path: `${OUT}/${String(++shot).padStart(2, '0')}-${name}.png` });
let mx = W / 2, my = H / 2;
const moveTo = async (x, y) => { await page.mouse.move(x, y, { steps: 14 }); mx = x; my = y; };
const click = async (x, y) => { await moveTo(x, y); await page.waitForTimeout(140); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
const clickText = async (text) => {
  const loc = page.getByRole('button', { name: text, exact: true }).first();
  const box = await loc.boundingBox({ timeout: 3000 }).catch(() => null);
  if (!box) { issues.push(`button not found: ${text}`); return false; }
  await click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

await page.goto(BASE);
await page.waitForTimeout(1800);
await snap('home');
{
  const b = page.locator('button', { hasText: MODE.split(' ')[1] }).filter({ hasText: MODE.split(' ')[0] }).first();
  const box = await b.boundingBox();
  await click(box.x + box.width / 2, box.y + box.height / 2);
}
await page.waitForFunction(() => window.__game && window.__game.getState().view, null, { timeout: 40000 });
await page.waitForTimeout(2600);
await snap('deal');

// 画面の中で「次に何を押すか」を決める
const decide = () => page.evaluate(() => {
  const st = window.__game.getState();
  const sc = window.__scene;
  if (st.final) return { k: 'final' };
  if (st.winShow) { const w = st.winShow.wins[st.winShow.index]; return { k: 'win', key: `${st.view.roundWind}-${st.view.kyoku}-${st.view.honba}-${st.winShow.index}`, info: { seat: w.seat, from: w.from, limit: w.result.limit, han: w.result.han, fu: w.result.fu, yaku: w.result.yaku.map((y) => y.name) } }; }
  if (st.roundEnd) return { k: 'roundEnd', info: { type: st.roundEnd.result.type, reason: st.roundEnd.draw ? st.roundEnd.draw.reason : '', scores: st.roundEnd.result.scores } };
  const p = st.prompt;
  if (!p) return { k: 'wait' };
  const o = p.options;
  const pos = (t) => sc.screenPosOfTile(t);
  if (o.kind === 'turn') {
    if (o.tsumo) return { k: 'btn', label: 'ツモ', seq: p.seq };
    if (o.nuki) return { k: 'btn', label: '北', seq: p.seq };
    if (o.riichi.length && !st.riichiMode) return { k: 'btn', label: 'リーチ', seq: p.seq, sub: 'riichi' };
    const me = st.view.players[st.seat];
    const cnt = {};
    for (const t of [...me.hand, ...(me.drawn != null ? [me.drawn] : [])]) cnt[t >> 2] = (cnt[t >> 2] || 0) + 1;
    const score = (t) => {
      const k = t >> 2;
      if (k >= 27) return cnt[k] >= 2 ? 50 : 0;
      const n = k % 9;
      const near = (n > 0 ? cnt[k - 1] || 0 : 0) + (n < 8 ? cnt[k + 1] || 0 : 0) + 0.5 * ((n > 1 ? cnt[k - 2] || 0 : 0) + (n < 7 ? cnt[k + 2] || 0 : 0)) + 2 * (cnt[k] - 1);
      return 5 + near * 10 - (n === 0 || n === 8 ? 3 : 0);
    };
    const list = st.riichiMode ? o.riichi : o.discard;
    const pick = [...list].sort((a, b) => score(a) - score(b))[0];
    return { k: 'tile', tile: pick, pos: pos(pick), seq: p.seq, riichi: st.riichiMode };
  }
  if (o.ron) return { k: 'btn', label: 'ロン', seq: p.seq };
  if (o.pon.length && (o.tile >> 2) >= 31) return { k: 'btn', label: 'ポン', seq: p.seq };
  if (o.chi.length && Math.random() < 0.12) return { k: 'btn', label: 'チー', seq: p.seq };
  return { k: 'btn', label: 'パス', seq: p.seq };
});

const t0 = Date.now();
let lastSeq = -1, lastWin = '', rounds = 0, lastRe = '', stuckSince = 0, firstCall = false, firstRiichi = false;
const log = [];
for (;;) {
  if (Date.now() - t0 > MAX_MS) { issues.push('timeout'); break; }
  const d = await decide();
  if (d.k === 'final') { await page.waitForTimeout(1200); await snap('final'); await page.waitForTimeout(5000); break; }
  if (d.k === 'win') {
    if (d.key !== lastWin) {
      lastWin = d.key; log.push({ t: 'win', ...d.info }); console.log('win', JSON.stringify(d.info));
      await page.waitForTimeout(4200); await snap('win');
      await page.waitForTimeout(1600); await click(W / 2, H - 60);
    }
    await page.waitForTimeout(300); continue;
  }
  if (d.k === 'roundEnd') {
    const key = JSON.stringify(d.info);
    if (key !== lastRe) {
      lastRe = key; rounds++; log.push({ t: 'roundEnd', ...d.info }); console.log('roundEnd', key);
      await page.waitForTimeout(1500); await snap('roundEnd'); await page.waitForTimeout(1500);
      if (ROUNDS && rounds >= ROUNDS) break;
      const ok = await page.locator('button', { hasText: '次の局へ' }).first().boundingBox().catch(() => null);
      if (ok) await click(ok.x + ok.width / 2, ok.y + ok.height / 2);
    }
    await page.waitForTimeout(300); continue;
  }
  if (d.k === 'wait') { await page.waitForTimeout(120); continue; }
  if (d.seq === lastSeq && d.k !== 'tile') {
    // 押したのに選択肢が残っている
    if (!stuckSince) stuckSince = Date.now();
    if (Date.now() - stuckSince > 4000) { issues.push(`stuck on ${JSON.stringify(d)}`); await snap('stuck'); stuckSince = 0; lastSeq = -2; }
    await page.waitForTimeout(150); continue;
  }
  stuckSince = 0;
  await page.waitForTimeout(450 + Math.random() * 900);
  if (d.k === 'btn') {
    if (d.label === 'ポン' || d.label === 'チー') { if (!firstCall) { await snap('call-prompt'); firstCall = true; } }
    if (d.label === 'ロン' || d.label === 'ツモ') await snap('win-prompt');
    if (d.sub === 'riichi' && !firstRiichi) { await snap('riichi-prompt'); }
    const ok = await clickText(d.label);
    if (d.label === 'チー') { // 形の選択が出たら最初の候補を押す
      await page.waitForTimeout(350);
      const opt = page.locator('button:has(img)').first();
      const box = await opt.boundingBox().catch(() => null);
      if (box) { await snap('chi-choice'); await click(box.x + box.width / 2, box.y + box.height / 2); }
    }
    if (d.sub === 'riichi') { await page.waitForTimeout(500); if (!firstRiichi) { await snap('riichi-select'); firstRiichi = true; } continue; }
    if (ok) lastSeq = d.seq;
  } else if (d.k === 'tile') {
    if (!d.pos) { issues.push('tile has no screen position'); await page.waitForTimeout(200); continue; }
    await moveTo(d.pos.x, d.pos.y - 6);
    await page.waitForTimeout(260);
    await click(d.pos.x, d.pos.y - 6);
    await page.waitForTimeout(250);
    const still = await page.evaluate((seq) => { const p = window.__game.getState().prompt; return !!p && p.seq === seq; }, d.seq);
    if (still) { issues.push(`tile click did not discard (tile ${d.tile})`); await snap('tile-miss'); await page.evaluate((t) => window.__ctl.act({ type: 'discard', tile: t }), d.tile); }
    lastSeq = d.seq;
  }
}
console.log('ISSUES', JSON.stringify([...new Set(issues)], null, 1));
writeFileSync(`${OUT}/log.json`, JSON.stringify({ log, issues }, null, 2));
const video = page.video();
await ctx.close();
await browser.close();
console.log('VIDEO', video ? await video.path() : 'none');
