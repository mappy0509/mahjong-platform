import { chromium } from 'playwright';
const [url, out, w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: +w, height: +h } })).newPage();
p.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text(), m.location().url); });
await p.goto(url); await p.waitForTimeout(2500);
await p.screenshot({ path: out });
console.log((await p.locator('button, a').allInnerTexts()).filter(Boolean).join(' | ').slice(0, 600));
await b.close();
