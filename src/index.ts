import * as core from "@actions/core";
import * as github from "@actions/github";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CommentClient } from "./comment.js";
import { installCli } from "./install.js";
import { run } from "./main.js";
import type { PullRequestInfo } from "./metadata.js";
import { runCli } from "./runner.js";

const cliPrefix = join(process.env.RUNNER_TEMP || tmpdir(), "tuner-cli");

function commentClient(token: string, pr: PullRequestInfo): CommentClient {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const issue = { owner, repo, issue_number: pr.number };
  return {
    async listComments(page, perPage) {
      const res = await octokit.rest.issues.listComments({ ...issue, page, per_page: perPage });
      return res.data.map((c) => ({ id: c.id, body: c.body }));
    },
    async createComment(body) {
      await octokit.rest.issues.createComment({ ...issue, body });
    },
    async updateComment(id, body) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: id, body });
    },
    async pullHeadSha() {
      const res = await octokit.rest.pulls.get({ owner, repo, pull_number: pr.number });
      return res.data.head.sha;
    },
  };
}

run({
  getInput: (name) => core.getInput(name),
  setSecret: core.setSecret,
  setOutput: core.setOutput,
  setFailed: core.setFailed,
  warning: (m) => core.warning(m),
  notice: (m) => core.notice(m),
  writeSummary: async (md) => {
    await core.summary.addRaw(md).write();
  },
  env: process.env,
  platform: process.platform,
  payload: github.context.payload as Record<string, unknown>,
  installCli: (spec) => installCli(cliPrefix, spec),
  signals: process,
  runCli,
  commentClient,
}).catch((err: unknown) => core.setFailed(err instanceof Error ? err.message : String(err)));
