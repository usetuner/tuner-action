import { describe, expect, it } from "vitest";
import { CLI_VERSION, cliScriptPath, installArgs } from "../src/install.js";

describe("install", () => {
  it("installs the exact pinned version, without install scripts", () => {
    const args = installArgs("/tmp/p");
    expect(args).toContain(`@usetuner.ai/cli@${CLI_VERSION}`);
    expect(args).toContain("--ignore-scripts");
    expect(args.slice(0, 4)).toEqual(["install", "--global", "--prefix", "/tmp/p"]);
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runs the CLI's entry script from the prefix", () => {
    expect(cliScriptPath("/tmp/p")).toBe("/tmp/p/lib/node_modules/@usetuner.ai/cli/dist/cli/main.js");
  });
});
