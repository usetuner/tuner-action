import type { EventEmitter } from "node:events";
import { upsertComment, type CommentClient, type CommentResult } from "./comment.js";
import { parseDocument, project, type RunView } from "./document.js";
import { cliArgs, MISSING_KEY, readInputs, UNSUPPORTED_OS, type GetInput } from "./inputs.js";
import {
  autoMetadata,
  contextFromEnv,
  mergeMetadata,
  parseMetaInput,
  pullRequest,
  testedSha,
  type PullRequestInfo,
} from "./metadata.js";
import { CLI_VERSION } from "./install.js";
import { outcomeFor, type Outcome } from "./outcome.js";
import { commentMarker, renderComment, renderSummary } from "./render.js";
import type { RunOptions, RunResult } from "./runner.js";

/** Everything the action touches outside itself, injected so tests can fake it. */
export interface Deps {
  getInput: GetInput;
  setSecret(value: string): void;
  setOutput(name: string, value: string | number): void;
  setFailed(message: string): void;
  warning(message: string): void;
  notice(message: string): void;
  writeSummary(markdown: string): Promise<void>;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  payload: Record<string, unknown>;
  /** Installs the pinned CLI and returns its entry script. */
  installCli(): Promise<string>;
  signals: EventEmitter;
  runCli(opts: RunOptions): Promise<RunResult>;
  commentClient(token: string, pr: PullRequestInfo): CommentClient;
}

export interface ActionResult {
  outcome: Outcome | null;
  view: RunView | null;
  args: string[];
  comment: CommentResult | "off" | null;
}

export async function run(deps: Deps): Promise<ActionResult> {
  const result: ActionResult = { outcome: null, view: null, args: [], comment: null };
  if (deps.platform === "win32") {
    deps.setFailed(UNSUPPORTED_OS);
    return result;
  }

  const ctx = contextFromEnv(deps.env, deps.payload);
  let inputs;
  let meta;
  try {
    inputs = readInputs(deps.getInput, deps.env);
    if (!inputs.apiKey) {
      deps.setFailed(MISSING_KEY);
      return result;
    }
    deps.setSecret(inputs.apiKey);
    const merged = mergeMetadata(autoMetadata(ctx), parseMetaInput(inputs.meta));
    for (const key of merged.overridden) deps.notice(`meta input overrides the ${key} the action filled in.`);
    meta = merged.meta;
  } catch (err) {
    deps.setFailed(err instanceof Error ? err.message : String(err));
    return result;
  }

  result.args = cliArgs(inputs, meta);
  let script: string;
  try {
    script = await deps.installCli();
  } catch (err) {
    deps.setFailed(
      `Couldn't install Tuner CLI ${CLI_VERSION}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }
  const cli = await deps.runCli({
    script,
    args: result.args,
    env: { ...deps.env, TUNER_API_KEY: inputs.apiKey },
    signals: deps.signals,
  });

  const view = project(parseDocument(cli.stdout));
  const outcome = outcomeFor(cli.exitCode, view, {
    failOnTunerError: inputs.failOnTunerError,
    timeout: inputs.timeout,
  });
  result.view = view;
  result.outcome = outcome;

  setOutputs(deps, cli.exitCode, view);
  try {
    await deps.writeSummary(renderSummary(outcome, view));
  } catch (err) {
    deps.warning(`Couldn't write the job summary: ${err instanceof Error ? err.message : String(err)}`);
  }

  // A stopped job makes no further API calls.
  const pr = pullRequest(ctx);
  if (!outcome.comment || cli.signal || !pr) {
    result.comment = null;
  } else if (!inputs.comment) {
    result.comment = "off";
  } else {
    result.comment = await upsertComment({
      client: deps.commentClient(inputs.githubToken, pr),
      body: renderComment(outcome, view, inputs.agent),
      marker: commentMarker(inputs.agent),
      testedSha: testedSha(ctx),
      isFork: Boolean(pr.headRepo) && pr.headRepo !== ctx.repository,
      log: deps,
    });
  }

  if (outcome.fail && outcome.message) deps.setFailed(outcome.message);
  else if (outcome.message) deps.warning(outcome.message);
  return result;
}

function setOutputs(deps: Deps, exitCode: number, view: RunView | null): void {
  deps.setOutput("exit-code", exitCode);
  if (!view) return;
  if (view.runId !== null) deps.setOutput("run-id", view.runId);
  if (view.runUrl) deps.setOutput("run-url", view.runUrl);
  if (view.result) deps.setOutput("result", view.result);
  if (view.reason) deps.setOutput("reason", view.reason);
  deps.setOutput("total", view.total);
  deps.setOutput("passed", view.passed);
  deps.setOutput("failed", view.failed);
}
