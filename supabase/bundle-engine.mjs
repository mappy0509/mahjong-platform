import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, "../packages/mahjong-engine/src/index.ts")],
  bundle: true,
  format: "esm",
  outfile: resolve(__dirname, "functions/_shared/engine.js"),
  platform: "neutral",
  target: "es2022",
  external: [],
  alias: {
    "@mahjong/shared": resolve(__dirname, "../packages/shared/src/index.ts"),
  },
  loader: { ".ts": "ts" },
});

console.log("Engine bundled to supabase/functions/_shared/engine.js");
