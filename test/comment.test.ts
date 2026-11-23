import { describe, expect, it, vi } from "vitest";
import { COMMENT_SKIPPED, upsertComment, type CommentClient, type IssueComment } from "../src/comment.js";

const MARKER = "<!-- tuner-action:v1 agent=a -->";

function fakeClient(comments: IssueComment[], head = "sha1"): CommentClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    listComments: vi.fn(async (page: number, perPage: number) => {
      calls.push(`list:${page}`);
      return comments.slice((page - 1) * perPage, page * perPage);
    }),
    createComment: vi.fn(async () => void calls.push("create")),
    updateComment: vi.fn(async (id: number) => void calls.push(`update:${id}`)),
    pullHeadSha: vi.fn(async () => head),
  };
}

const log = () => ({ warning: vi.fn(), notice: vi.fn() });
const input = (client: CommentClient, l = log()) => ({
  client,
  body: `${MARKER}\nbody`,
  marker: MARKER,
  testedSha: "sha1",
  isFork: false,
  log: l,
});

describe("upsertComment", () => {
  it("creates when no comment has the marker", async () => {
    const client = fakeClient([{ id: 1, body: "hello" }]);
    expect(await upsertComment(input(client))).toBe("created");
    expect(client.calls).toEqual(["list:1", "create"]);
  });

  it("updates the newest marked comment found on page three", async () => {
    const comments: IssueComment[] = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, body: "other" }));
    comments[10] = { id: 11, body: `${MARKER}\nold` };
    comments[230] = { id: 231, body: `${MARKER}\nnewer` };
    const client = fakeClient(comments);
    expect(await upsertComment(input(client))).toBe("updated");
    expect(client.calls).toEqual(["list:1", "list:2", "list:3", "update:231"]);
  });

  it("leaves another agent's comment alone", async () => {
    const client = fakeClient([{ id: 5, body: "<!-- tuner-action:v1 agent=b -->\nx" }]);
    expect(await upsertComment(input(client))).toBe("created");
  });

  it("skips when the PR head moved on", async () => {
    const client = fakeClient([], "sha2");
    const l = log();
    expect(await upsertComment(input(client, l))).toBe("stale");
    expect(client.createComment).not.toHaveBeenCalled();
    expect(l.notice).toHaveBeenCalled();
  });

  it("skips a fork PR with a warning and no API call", async () => {
    const client = fakeClient([]);
    const l = log();
    expect(await upsertComment({ ...input(client, l), isFork: true })).toBe("fork");
    expect(client.pullHeadSha).not.toHaveBeenCalled();
    expect(l.warning).toHaveBeenCalledWith(COMMENT_SKIPPED);
  });

  it.each([403, 404])("turns a %i into the permission warning", async (status) => {
    const client = fakeClient([]);
    client.createComment = vi.fn(async () => {
      throw Object.assign(new Error("Resource not accessible by integration"), { status });
    });
    const l = log();
    expect(await upsertComment(input(client, l))).toBe("no_permission");
    expect(l.warning).toHaveBeenCalledWith(COMMENT_SKIPPED);
  });

  it("never throws on other errors", async () => {
    const client = fakeClient([]);
    client.listComments = vi.fn(async () => {
      throw new Error("boom");
    });
    const l = log();
    expect(await upsertComment(input(client, l))).toBe("error");
    expect(l.warning).toHaveBeenCalledWith("Couldn't post the PR comment: boom");
  });
});
