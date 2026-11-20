// Bundles the action into dist/index.js. The Tuner CLI is installed from npm at run time.
import { build } from "esbuild";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: join(dist, "index.js"),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  legalComments: "none",
  logLevel: "warning",
});
writeFileSync(join(dist, "package.json"), '{ "type": "module" }\n');

