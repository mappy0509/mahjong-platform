// SVG → PNG（resvg）。使い方: node render.mjs in.svg out.png [width]
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [, , input, output, width] = process.argv;
const svg = readFileSync(input, "utf8");
const opts = { font: { loadSystemFonts: false } };
if (width) opts.fitTo = { mode: "width", value: Number(width) };
const png = new Resvg(svg, opts).render().asPng();
writeFileSync(output, png);
console.log(`wrote ${output}`);
