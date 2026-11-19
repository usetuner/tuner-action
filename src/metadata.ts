/** The GitHub context the action reads, so tests can pass plain fixtures. */
export interface GitHubContext {
  eventName: string;
  sha: string;
  ref: string;
  refName: string;
  refType: string;
  headRef: string;
  repository: string;
  serverUrl: string;
  payload: Record<string, unknown>;
}

export type Metadata = Record<string, string>;

export const PR_EVENTS = new Set(["pull_request", "pull_request_target"]);

export function contextFromEnv(
  env: NodeJS.ProcessEnv,
  payload: Record<string, unknown>,
): GitHubContext {
  return {
    eventName: env.GITHUB_EVENT_NAME ?? "",
    sha: env.GITHUB_SHA ?? "",
    ref: env.GITHUB_REF ?? "",
    refName: env.GITHUB_REF_NAME ?? "",
    refType: env.GITHUB_REF_TYPE ?? "",
    headRef: env.GITHUB_HEAD_REF ?? "",
    repository: env.GITHUB_REPOSITORY ?? "",
    serverUrl: env.GITHUB_SERVER_URL ?? "https://github.com",
    payload,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface PullRequestInfo {
  number: number;
  headSha: string;
  headRepo: string;
  htmlUrl: string;
}

export function pullRequest(ctx: GitHubContext): PullRequestInfo | null {
  if (!PR_EVENTS.has(ctx.eventName)) return null;
  const pr = obj(ctx.payload.pull_request);
  if (typeof pr.number !== "number") return null;
  const head = obj(pr.head);
  return {
    number: pr.number,
    headSha: text(head.sha),
    headRepo: text(obj(head.repo).full_name),
    htmlUrl: text(pr.html_url),
  };
}

/** The commit the run tested: the PR head on pull request events, not the merge commit. */
export function testedSha(ctx: GitHubContext): string {
  const pr = pullRequest(ctx);
  if (pr) return pr.headSha;
  if (ctx.eventName === "merge_group") return text(obj(ctx.payload.merge_group).head_sha);
  return ctx.sha;
}

/** `commit`, `branch`, `pr_url` and `repo_url` for this event. Missing values are left out. */
export function autoMetadata(ctx: GitHubContext): Metadata {
  const pr = pullRequest(ctx);
  let branch = "";
  if (pr) branch = ctx.headRef;
  else if (ctx.eventName === "merge_group") branch = text(obj(ctx.payload.merge_group).head_ref);
  else if (ctx.refType === "branch" || ctx.ref.startsWith("refs/heads/")) branch = ctx.refName;

  const meta: Metadata = {
    commit: testedSha(ctx),
    branch,
    pr_url: pr?.htmlUrl ?? "",
    repo_url: ctx.repository ? `${ctx.serverUrl.replace(/\/+$/, "")}/${ctx.repository}` : "",
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== ""));
}

/** Parses the `meta` input: one `key=value` per line; blank lines are skipped. */
export function parseMetaInput(input: string): Metadata {
  const meta = new Map<string, string>();
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new Error(`Invalid meta line '${line}'. Use key=value.`);
    meta.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  // fromEntries defines own properties, so a `__proto__` key stays a plain key.
  return Object.fromEntries(meta);
}

/** Auto keys first, then user keys; a user key replaces an auto key and is reported. */
export function mergeMetadata(auto: Metadata, user: Metadata): { meta: Metadata; overridden: string[] } {
  const overridden = Object.keys(user).filter((k) => Object.hasOwn(auto, k));
  return { meta: Object.fromEntries([...Object.entries(auto), ...Object.entries(user)]), overridden };
}
