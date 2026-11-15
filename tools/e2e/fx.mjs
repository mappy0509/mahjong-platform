// 演出の見本を録画する（/dev/fx のボタンを順に押す）。自然な対局では滅多に出ない跳満〜役満の演出を確認するため。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? 'out/fx';
const W = 1280, H = 720;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: `${OUT}/video`, size: { width: W, height: H } } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${BASE}/dev/fx`);
await page.waitForTimeout(1500);
const press = async (name, wait, shotAt) => {
  await page.getByRole('button', { name, exact: true }).click();
  if (shotAt) { await page.waitForTimeout(shotAt); await page.screenshot({ path: `${OUT}/${name.replace(/[: ]/g, '_')}.png` }); await page.waitForTimeout(Math.max(0, wait - shotAt)); }
  else await page.waitForTimeout(wait);
};
for (const n of ['局開始', 'ポン', 'チー', 'カン']) await press(n, 1500, 300);
await press('立直', 1700, 450);
await press('放銃', 1900, 350);
await press('流局', 1900, 500);
for (let t = 0; t <= 5; t++) await press(`一撃 格${t}`, 2300 + t * 300, 520);
for (const n of ['通常', '満貫', '跳満', '倍満', '三倍満', '役満', 'ダブル役満']) {
  await press(`和了画面: ${n}`, 4200, 3600);
  await page.mouse.click(W / 2, H - 40);
  await page.waitForTimeout(250);
  await page.mouse.click(W / 2, H - 40);
  await page.waitForTimeout(700);
}
const v = page.video();
await ctx.close(); await browser.close();
console.log('VIDEO', await v.path());
