import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { COMMENT_SKIPPED, type CommentClient } from "../src/comment.js";
import { MISSING_KEY, UNSUPPORTED_OS } from "../src/inputs.js";
import { run, type Deps } from "../src/main.js";
import { CANARIES, failedDoc, leakyDoc, passedDoc, timeoutDoc } from "./fixtures.js";

const prPayload = (headRepo = "acme/agent") => ({
  pull_request: {
    number: 7,
    html_url: "https://github.com/acme/agent/pull/7",
    head: { sha: "head111", repo: { full_name: headRepo } },
  },
});

function setup(opts: {
  exitCode: number;
  doc?: unknown;
  inputs?: Record<string, string>;
  payload?: Record<string, unknown>;
  event?: string;
  platform?: NodeJS.Platform;
  signal?: NodeJS.Signals | null;
  createError?: unknown;
  installError?: Error;
}) {
  const written: string[] = [];
  const client: CommentClient = {
    listComments: vi.fn(async () => []),
    createComment: vi.fn(async (body: string) => {
      if (opts.createError) throw opts.createError;
      written.push(body);
    }),
    updateComment: vi.fn(async () => {}),
    pullHeadSha: vi.fn(async () => "head111"),
  };
  const inputs: Record<string, string> = { "api-key": "tnr_key", agent: "agent_abc", tag: "smoke", ...opts.inputs };
  const deps: Deps & { outputs: Record<string, unknown>; summaries: string[]; annotations: string[] } = {
    outputs: {},
    summaries: [],
    annotations: [],
    getInput: (n) => inputs[n] ?? "",
    setSecret: vi.fn(),
    setOutput(n, v) {
      this.outputs[n] = v;
    },
    setFailed: vi.fn(function (this: void, m: string) {
      deps.annotations.push(`error:${m}`);
    }),
    warning: vi.fn((m: string) => void deps.annotations.push(`warning:${m}`)),
    notice: vi.fn((m: string) => void deps.annotations.push(`notice:${m}`)),
    writeSummary: async (md) => void deps.summaries.push(md),
    env: {
      GITHUB_EVENT_NAME: opts.event ?? "pull_request",
      GITHUB_SHA: "merge000",
      GITHUB_HEAD_REF: "feat/x",
      GITHUB_REPOSITORY: "acme/agent",
      GITHUB_SERVER_URL: "https://github.com",
    },
    platform: opts.platform ?? "linux",
    payload: opts.payload ?? prPayload(),
    installCli: vi.fn(async () => opts.installError ? Promise.reject(opts.installError) : "/tmp/cli.js"),
    signals: new EventEmitter(),
    runCli: vi.fn(async () => ({
      exitCode: opts.exitCode,
      stdout: opts.doc === undefined ? "" : JSON.stringify(opts.doc),
      signal: opts.signal ?? null,
    })),
    commentClient: vi.fn(() => client),
  };
  return { deps, client, written };
}

describe("run", () => {
  it("fails early without an API key", async () => {
    const { deps } = setup({ exitCode: 0, inputs: { "api-key": "" } });
    await run(deps);
    expect(deps.setFailed).toHaveBeenCalledWith(MISSING_KEY);
    expect(deps.runCli).not.toHaveBeenCalled();
  });

  it("fails early on Windows", async () => {
    const { deps } = setup({ exitCode: 0, platform: "win32" });
    await run(deps);
    expect(deps.setFailed).toHaveBeenCalledWith(UNSUPPORTED_OS);
  });

  it("passes the key in the environment and the head SHA as commit", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc });
    const result = await run(deps);
    expect(deps.setSecret).toHaveBeenCalledWith("tnr_key");
    const call = vi.mocked(deps.runCli).mock.calls[0]![0];
    expect(call.env.TUNER_API_KEY).toBe("tnr_key");
    expect(call.args).not.toContain("tnr_key");
    expect(call.args).toContain("commit=head111");
    expect(result.comment).toBe("created");
    expect(deps.setFailed).not.toHaveBeenCalled();
    expect(deps.outputs).toMatchObject({ "exit-code": 0, "run-id": 4821, total: 6, passed: 6, failed: 0 });
  });

  it("passes every metadata key as --meta", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc, inputs: { meta: "env=staging" } });
    await run(deps);
    const { args, script } = vi.mocked(deps.runCli).mock.calls[0]![0];
    expect(script).toBe("/tmp/cli.js");
    const metas = args.flatMap((a, i) => (args[i - 1] === "--meta" ? [a] : []));
    expect(metas).toEqual([
      "commit=head111",
      "branch=feat/x",
      "pr_url=https://github.com/acme/agent/pull/7",
      "repo_url=https://github.com/acme/agent",
      "env=staging",
    ]);
  });

  it("installs the pinned CLI unless cli-package is set", async () => {
    const pinned = setup({ exitCode: 0, doc: passedDoc });
    await run(pinned.deps);
    expect(pinned.deps.installCli).toHaveBeenCalledWith("@usetuner.ai/cli@0.3.0");
    const custom = setup({ exitCode: 0, doc: passedDoc, inputs: { "cli-package": "./cli.tgz" } });
    await run(custom.deps);
    expect(custom.deps.installCli).toHaveBeenCalledWith("./cli.tgz");
  });

  it("fails when the CLI can't be installed", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc, installError: new Error("npm install exited 1") });
    await run(deps);
    expect(deps.setFailed).toHaveBeenCalledWith("Couldn't install Tuner CLI @usetuner.ai/cli@0.3.0: npm install exited 1");
    expect(deps.runCli).not.toHaveBeenCalled();
  });

  it("fails on 1 and posts the comment", async () => {
    const { deps, written } = setup({ exitCode: 1, doc: failedDoc });
    await run(deps);
    expect(deps.setFailed).toHaveBeenCalledWith("Tuner simulations: 2 of 6 failed");
    expect(written[0]).toContain("Hallucination");
  });

  it("warns on 3 without failing", async () => {
    const { deps } = setup({ exitCode: 3, doc: timeoutDoc, inputs: { timeout: "30m" } });
    await run(deps);
    expect(deps.setFailed).not.toHaveBeenCalled();
    expect(deps.warning).toHaveBeenCalledWith(
      "Tuner couldn't finish this run (run timed out after 30 minutes). Your build wasn't blocked.",
    );
  });

  it("skips the comment on a fork PR, still writes the summary and check", async () => {
    const { deps, client } = setup({ exitCode: 1, doc: failedDoc, payload: prPayload("someone/agent") });
    const result = await run(deps);
    expect(result.comment).toBe("fork");
    expect(client.pullHeadSha).not.toHaveBeenCalled();
    expect(deps.warning).toHaveBeenCalledWith(COMMENT_SKIPPED);
    expect(deps.summaries).toHaveLength(1);
    expect(deps.setFailed).toHaveBeenCalledWith("Tuner simulations: 2 of 6 failed");
  });

  it("warns without permission and keeps the result", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc, createError: Object.assign(new Error("no"), { status: 403 }) });
    const result = await run(deps);
    expect(result.comment).toBe("no_permission");
    expect(deps.warning).toHaveBeenCalledWith(COMMENT_SKIPPED);
    expect(deps.setFailed).not.toHaveBeenCalled();
    expect(deps.summaries).toHaveLength(1);
  });

  it("posts no comment on a push", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc, event: "push", payload: {} });
    const result = await run(deps);
    expect(result.comment).toBeNull();
    expect(deps.commentClient).not.toHaveBeenCalled();
    expect(deps.summaries).toHaveLength(1);
  });

  it("respects comment: false", async () => {
    const { deps } = setup({ exitCode: 0, doc: passedDoc, inputs: { comment: "false" } });
    expect((await run(deps)).comment).toBe("off");
    expect(deps.commentClient).not.toHaveBeenCalled();
  });

  it("makes no API call after the job was stopped", async () => {
    const { deps } = setup({ exitCode: 130, doc: failedDoc, signal: "SIGINT" });
    await run(deps);
    expect(deps.commentClient).not.toHaveBeenCalled();
    expect(deps.setFailed).toHaveBeenCalledWith("Run canceled because the job was stopped.");
  });

  it("never lets transcript, audio or eval reasoning reach GitHub", async () => {
    const { deps, written } = setup({ exitCode: 1, doc: leakyDoc });
    await run(deps);
    const everything = JSON.stringify([written, deps.summaries, deps.annotations, deps.outputs]);
    for (const canary of CANARIES) expect(everything).not.toContain(canary);
    expect(written[0]).toContain("Hallucination");
  });
});
