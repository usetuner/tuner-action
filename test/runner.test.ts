import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/runner.js";

const script = fileURLToPath(new URL("./fixtures/fake-cli.mjs", import.meta.url));

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
}

describe("runCli", () => {
  it("forwards the first signal once and waits for the child", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "tuner-action-")), "signals.log");
    const signals = new EventEmitter();
    const done = runCli({ script, args: [], env: { ...process.env, FAKE_CLI_LOG: log }, signals });
    await waitFor(() => existsSync(log) && readFileSync(log, "utf8").includes("started"));

    signals.emit("SIGINT");
    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    const result = await done;

    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["started", "SIGINT"]);
    expect(result.exitCode).toBe(130);
    expect(result.signal).toBe("SIGINT");
    expect(JSON.parse(result.stdout)).toMatchObject({ exit_code: 130 });
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });
});
