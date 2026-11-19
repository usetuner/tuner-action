// Bundles the action into dist/index.js and vendors the pinned CLI into dist/cli/node_modules,
// so the action runs the same CLI bytes customers get from npm, with no install at run time.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const vendor = join(dist, "cli/node_modules");
function vendorPackage(name, entries) {
  const from = join(root, "node_modules", name);
  const to = join(vendor, name);
  mkdirSync(to, { recursive: true });
  for (const entry of entries) cpSync(join(from, entry), join(to, entry), { recursive: true });
  return JSON.parse(readFileSync(join(from, "package.json"), "utf8"));
}

const cli = vendorPackage("@usetuner.ai/cli", ["package.json", "dist", "schema", "LICENSE"]);
const deps = Object.keys(cli.dependencies ?? {});
if (deps.join() !== "commander") throw new Error(`Unexpected CLI dependencies: ${deps.join()}`);
vendorPackage("commander", ["package.json", "index.js", "esm.mjs", "lib", "LICENSE"]);

const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies[cli.name];
if (pinned !== cli.version) throw new Error(`CLI must be pinned exactly: ${pinned} vs ${cli.version}`);
