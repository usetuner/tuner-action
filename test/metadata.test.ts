import { describe, expect, it } from "vitest";
import { cliArgs, readInputs } from "../src/inputs.js";
import { autoMetadata, contextFromEnv, mergeMetadata, parseMetaInput } from "../src/metadata.js";

const base = {
  GITHUB_SHA: "merge000",
  GITHUB_REPOSITORY: "acme/agent",
  GITHUB_SERVER_URL: "https://github.com",
};
const pr = {
  pull_request: {
    number: 7,
    html_url: "https://github.com/acme/agent/pull/7",
    head: { sha: "head111", repo: { full_name: "acme/agent" } },
  },
};

describe("autoMetadata", () => {
  it("push to a branch", () => {
    const env = { ...base, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", GITHUB_REF_NAME: "main", GITHUB_REF_TYPE: "branch" };
    expect(autoMetadata(contextFromEnv(env, {}))).toEqual({
      commit: "merge000",
      branch: "main",
      repo_url: "https://github.com/acme/agent",
    });
  });

  it("push of a tag has no branch", () => {
    const env = { ...base, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/tags/v1", GITHUB_REF_NAME: "v1", GITHUB_REF_TYPE: "tag" };
    expect(autoMetadata(contextFromEnv(env, {}))).toEqual({
      commit: "merge000",
      repo_url: "https://github.com/acme/agent",
    });
  });

  it.each(["pull_request", "pull_request_target"])("%s uses the head SHA, not the merge SHA", (event) => {
    const env = { ...base, GITHUB_EVENT_NAME: event, GITHUB_HEAD_REF: "feat/x", GITHUB_REF: "refs/pull/7/merge" };
    expect(autoMetadata(contextFromEnv(env, pr))).toEqual({
      commit: "head111",
      branch: "feat/x",
      pr_url: "https://github.com/acme/agent/pull/7",
      repo_url: "https://github.com/acme/agent",
    });
  });

  it("merge_group", () => {
    const env = { ...base, GITHUB_EVENT_NAME: "merge_group" };
    const payload = { merge_group: { head_sha: "mg222", head_ref: "gh-readonly-queue/main/pr-7" } };
    expect(autoMetadata(contextFromEnv(env, payload))).toEqual({
      commit: "mg222",
      branch: "gh-readonly-queue/main/pr-7",
      repo_url: "https://github.com/acme/agent",
    });
  });

  it("workflow_dispatch on a branch", () => {
    const env = { ...base, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/dev", GITHUB_REF_NAME: "dev", GITHUB_REF_TYPE: "branch" };
    expect(autoMetadata(contextFromEnv(env, {}))).toMatchObject({ commit: "merge000", branch: "dev" });
  });
});

describe("meta input", () => {
  it("parses lines and lets user keys win", () => {
    const user = parseMetaInput("env=staging\n\n branch = release \n");
    const { meta, overridden } = mergeMetadata({ commit: "c", branch: "b" }, user);
    expect(meta).toEqual({ commit: "c", branch: "release", env: "staging" });
    expect(overridden).toEqual(["branch"]);
  });

  it("rejects a line without a key", () => {
    expect(() => parseMetaInput("=x")).toThrow("Use key=value");
  });
});

describe("cliArgs", () => {
  it("builds flags, repeats --meta and never includes the key", () => {
    const inputs = readInputs(
      (n) => ({ "api-key": "tnr_secret", tag: "smoke", "base-url": "https://staging", "noise-intensity": "low" })[n] ?? "",
      { TUNER_AGENT_ID: "agent_abc" },
    );
    const args = cliArgs(inputs, { commit: "c1", branch: "main" });
    expect(args).toEqual([
      "--base-url", "https://staging",
      "sim", "run",
      "--agent", "agent_abc",
      "--tag", "smoke",
      "--noise-intensity", "low",
      "--timeout", "60m",
      "--meta", "commit=c1",
      "--meta", "branch=main",
      "--output", "json",
    ]);
    expect(args.join(" ")).not.toContain("tnr_secret");
  });

  it("passes suite as --suite, with the metadata", () => {
    const inputs = readInputs((n) => ({ "api-key": "tnr_secret", agent: "agent_abc", suite: " Smoke " })[n] ?? "", {});
    expect(inputs.suite).toBe("Smoke");
    expect(cliArgs(inputs, { commit: "c1" })).toEqual([
      "sim", "run",
      "--agent", "agent_abc",
      "--suite", "Smoke",
      "--timeout", "60m",
      "--meta", "commit=c1",
      "--output", "json",
    ]);
  });
  it("passes max-concurrent-calls as --max-concurrent-calls when set", () => {
    const inputs = readInputs((n) => ({ "api-key": "k", agent: "agent_abc", tag: "smoke", "max-concurrent-calls": " 3 " })[n] ?? "", {});
    expect(inputs.maxConcurrentCalls).toBe("3");
    expect(cliArgs(inputs, {})).toEqual([
      "sim", "run",
      "--agent", "agent_abc",
      "--tag", "smoke",
      "--max-concurrent-calls", "3",
      "--timeout", "60m",
      "--output", "json",
    ]);
  });

  it("leaves out --max-concurrent-calls when unset or empty", () => {
    for (const value of [undefined, "", "  "]) {
      const inputs = readInputs(
        (n) => ({ "api-key": "k", agent: "agent_abc", tag: "smoke", ...(value === undefined ? {} : { "max-concurrent-calls": value }) } as Record<string, string>)[n] ?? "",
        {},
      );
      expect(cliArgs(inputs, {})).not.toContain("--max-concurrent-calls");
    }
  });
});
