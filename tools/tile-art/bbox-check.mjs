// 各SVGの描画範囲が余白(24px)の内側に収まっているかを確認する
import { readFileSync, readdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const dir = process.argv[2];
let bad = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()) {
  const svg = readFileSync(`${dir}/${f}`, "utf8");
  if (!svg.includes('viewBox="0 0 300 400"') || svg.includes("<text")) { console.log("NG format", f); bad++; }
  const img = new Resvg(svg).render();
  const { width, height, pixels } = img;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const ok = x0 >= 22 && y0 >= 22 && x1 <= 278 && y1 <= 378;
  if (!ok) bad++;
  console.log(`${ok ? "ok" : "NG"} ${f} bbox=${x0},${y0}-${x1},${y1}`);
}
process.exit(bad ? 1 : 0);
