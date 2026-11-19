export const COMMENT_SKIPPED =
  "Couldn't post the PR comment: the workflow needs pull-requests: write permission.";

export interface IssueComment {
  id: number;
  body?: string | null;
}

/** The GitHub calls the sticky comment needs, scoped to one PR. */
export interface CommentClient {
  listComments(page: number, perPage: number): Promise<IssueComment[]>;
  createComment(body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
  pullHeadSha(): Promise<string>;
}

export interface Log {
  warning(message: string): void;
  notice(message: string): void;
}

export interface StickyCommentInput {
  client: CommentClient;
  body: string;
  marker: string;
  testedSha: string;
  isFork: boolean;
  log: Log;
}

export type CommentResult = "created" | "updated" | "stale" | "fork" | "no_permission" | "error";

const PER_PAGE = 100;

/** Finds this agent's comment by its marker, on every page. The newest match wins. */
export async function findComment(client: CommentClient, marker: string): Promise<IssueComment | null> {
  let found: IssueComment | null = null;
  for (let page = 1; ; page++) {
    const comments = await client.listComments(page, PER_PAGE);
    for (const c of comments) {
      if (c.body?.startsWith(marker) && (!found || c.id > found.id)) found = c;
    }
    if (comments.length < PER_PAGE) return found;
  }
}

function isPermissionError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return status === 403 || status === 404;
}

/** Creates or updates the PR comment. Never throws: a comment problem never changes the check. */
export async function upsertComment(input: StickyCommentInput): Promise<CommentResult> {
  const { client, log } = input;
  if (input.isFork) {
    log.warning(COMMENT_SKIPPED);
    return "fork";
  }
  try {
    const head = await client.pullHeadSha();
    if (input.testedSha && head && head !== input.testedSha) {
      log.notice(
        `Skipped the PR comment: the PR moved on to ${head.slice(0, 7)} after this run tested ${input.testedSha.slice(0, 7)}.`,
      );
      return "stale";
    }
    const existing = await findComment(client, input.marker);
    if (existing) {
      await client.updateComment(existing.id, input.body);
      return "updated";
    }
    await client.createComment(input.body);
    return "created";
  } catch (err) {
    if (isPermissionError(err)) {
      log.warning(COMMENT_SKIPPED);
      return "no_permission";
    }
    log.warning(`Couldn't post the PR comment: ${err instanceof Error ? err.message : String(err)}`);
    return "error";
  }
}
