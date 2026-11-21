import { describe, expect, it } from "vitest";
import { project } from "../src/document.js";
import { outcomeFor } from "../src/outcome.js";
import { COMMENT_MAX_ROWS, commentMarker, escapeText, renderComment, renderSummary } from "../src/render.js";
import { failedDoc, noCreditsDoc, passedDoc, timeoutDoc } from "./fixtures.js";

const opts = { failOnTunerError: false, timeout: "30m" };
const cases = [
  ["passed", 0, passedDoc],
  ["failed", 1, failedDoc],
  ["customer error", 2, noCreditsDoc],
  ["tuner error", 3, timeoutDoc],
  ["canceled", 130, failedDoc],
  ["no result", 7, null],
] as const;

describe.each(cases)("%s", (_name, code, doc) => {
  const view = project(doc);
  const outcome = outcomeFor(code, view, opts);
  it("renders the summary", () => expect(renderSummary(outcome, view)).toMatchSnapshot());
  it("renders the comment", () => expect(renderComment(outcome, view, "agent_abc")).toMatchSnapshot());
});

describe("comment content", () => {
  it("passed: title and link only", () => {
    const view = project(passedDoc);
    expect(renderComment(outcomeFor(0, view, opts), view, "a")).toBe(
      `${commentMarker("a")}\n### Tuner simulations: all 6 passed\n[Open run in Tuner](https://app.usetuner.ai/runs/4821)\n`,
    );
  });

  it("failed: lists only failed scenarios with their evals", () => {
    const view = project(failedDoc);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body).toContain("### Tuner simulations: 2 of 6 failed");
    expect(body).toContain("| Scenario | Failed evals | |\n|---|---|---|");
    expect(body).toContain("| Reschedule with a wrong booking ID | Hallucination | |");
    expect(body).toContain("| Ask for a human while booking | Transfer | |");
    expect(body).not.toContain("happy path");
    expect(body).toContain("|\n\n[Open run in Tuner]");
  });

  it("links each failed call when the call URL is known", () => {
    const view = project(failedDoc)!;
    view.scenarios[1]!.callUrl = "https://app.usetuner.ai/calls/9002";
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body).toContain(
      "| Reschedule with a wrong booking ID | Hallucination | [View call](https://app.usetuner.ai/calls/9002) |",
    );
    expect(renderSummary(outcomeFor(1, view, opts), view)).toContain(
      "| Reschedule with a wrong booking ID | Failed | Hallucination | [View call](https://app.usetuner.ai/calls/9002) |",
    );
  });

  it("customer error: reason, no run link", () => {
    const view = project(noCreditsDoc);
    const body = renderComment(outcomeFor(2, view, opts), view, "a");
    expect(body).toContain("### Tuner simulations: couldn't run");
    expect(body).toContain("Not enough credits to start this run.");
    expect(body).not.toContain("Open run in Tuner");
  });

  it("tuner error: build not blocked, with link", () => {
    const view = project(timeoutDoc);
    const body = renderComment(outcomeFor(3, view, opts), view, "a");
    expect(body).toContain("### Tuner simulations: couldn't finish");
    expect(body).toContain("Your build wasn&#39;t blocked.\n[Open run in Tuner]");
  });

  it("caps the failed table", () => {
    const many = {
      ...failedDoc,
      summary: { ...failedDoc.summary, total: 60, failed: 60 },
      scenarios: Array.from({ length: 60 }, (_, i) => ({
        ...failedDoc.scenarios[1]!,
        scenario_id: i,
        name: `S${i}`,
      })),
    };
    const view = project(many);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body.match(/^\| S\d+ /gm)).toHaveLength(COMMENT_MAX_ROWS);
    expect(body).toContain("and 10 more");
  });

  it("summary lists every scenario with its result", () => {
    const view = project(failedDoc);
    const md = renderSummary(outcomeFor(1, view, opts), view);
    expect(md).toContain("| Scenario | Result | Failed evals | |\n|---|---|---|---|");
    expect(md).toContain("| Book a cleaning, happy path | Passed | | |");
    expect(md).toContain("| Reschedule with a wrong booking ID | Failed | Hallucination | |");
  });

  it("summary of other outcomes mirrors the comment", () => {
    for (const [code, doc] of [[0, passedDoc], [2, noCreditsDoc], [3, timeoutDoc]] as const) {
      const view = project(doc);
      const outcome = outcomeFor(code, view, opts);
      expect(`${commentMarker("a")}\n${renderSummary(outcome, view)}`).toBe(renderComment(outcome, view, "a"));
    }
  });

  it("drops a non-http run link", () => {
    const view = project({ ...passedDoc, run: { ...passedDoc.run, dashboard_url: "javascript:alert(1)" } });
    expect(renderComment(outcomeFor(0, view, opts), view, "a")).not.toContain("javascript");
  });
});

describe("escapeText", () => {
  it("neutralizes mentions, markdown, html and table pipes", () => {
    const out = escapeText("@org/team <img src=x> | **bold** [x](y) #12\nnext");
    expect(out).not.toMatch(/@[a-z]/);
    expect(out.replace(/&#\d+;/g, "")).not.toMatch(/[<>|*[\]#\n]/);
  });
});

describe("commentMarker", () => {
  it("is keyed by agent and can't close the HTML comment", () => {
    expect(commentMarker("a")).not.toBe(commentMarker("b"));
    expect(commentMarker("x --> y")).toBe("<!-- tuner-action:v1 agent=x%20--%3E%20y -->");
  });
});
