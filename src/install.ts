import { spawn } from "node:child_process";
import { join } from "node:path";

/** The one place the Tuner CLI version is pinned. */
export const CLI_PACKAGE = "@usetuner.ai/cli";
export const CLI_VERSION = "0.1.0";

/** `npm install -g` into a private prefix, so the runner's global packages are untouched. */
export function installArgs(prefix: string): string[] {
  return [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    `${CLI_PACKAGE}@${CLI_VERSION}`,
  ];
}

/** The CLI's entry script under a global prefix (Linux and macOS layout). */
export function cliScriptPath(prefix: string): string {
  return join(prefix, "lib/node_modules", CLI_PACKAGE, "dist/cli/main.js");
}

/**
 * Installs the pinned CLI from npm and returns its entry script. The script is later run with
 * `node` directly, not through `npx`, so job signals reach the CLI itself.
 */
export function installCli(prefix: string, npm = "npm"): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, installArgs(prefix), { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(cliScriptPath(prefix));
      else reject(new Error(`npm install exited ${code}`));
    });
  });
}
