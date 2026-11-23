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

  it("failed: lists every scenario, failed ones with evals and call links", () => {
    const view = project(failedDoc);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body).toBe(
      [
        commentMarker("a"),
        "### Tuner simulations: 2 of 6 failed",
        "| Scenario | Result | Failed evals | |",
        "|---|---|---|---|",
        "| Book a cleaning, happy path | Passed | | |",
        "| Reschedule with a wrong booking ID | Failed | Hallucination | [View call](https://app.usetuner.ai/call-logs/9002) |",
        "| Move an appointment to next week | Passed | | |",
        "| Ask for a human while booking | Failed | Transfer | [View call](https://app.usetuner.ai/call-logs/9004) |",
        "| Cancel and ask about the refund policy | Passed | | |",
        "| Book for a family member | Passed | | |",
        "",
        "[Open run in Tuner](https://app.usetuner.ai/runs/4821)",
        "",
      ].join("\n"),
    );
  });

  it("comment and summary share the failed layout", () => {
    const view = project(failedDoc);
    const outcome = outcomeFor(1, view, opts);
    expect(renderComment(outcome, view, "a")).toBe(`${commentMarker("a")}\n${renderSummary(outcome, view)}`);
  });

  it("builds the call link on the run link's origin", () => {
    const run = { ...failedDoc.run, dashboard_url: "https://app.example.com/simulations/runs/4821?workspace=7" };
    const view = project({ ...failedDoc, run });
    expect(view?.scenarios[1]?.callUrl).toBe("https://app.example.com/call-logs/9002");
  });

  it("leaves the call cell empty without a call id", () => {
    const doc = { ...failedDoc, scenarios: failedDoc.scenarios.map((s) => ({ ...s, call_id: null })) };
    const view = project(doc);
    expect(renderComment(outcomeFor(1, view, opts), view, "a")).toContain(
      "| Reschedule with a wrong booking ID | Failed | Hallucination | |",
    );
  });

  it("labels other verdicts and unknown ones", () => {
    const doc = {
      ...failedDoc,
      scenarios: [
        { ...failedDoc.scenarios[0]!, name: "A", verdict: "not_connected" },
        { ...failedDoc.scenarios[0]!, name: "B", verdict: "setup_error" },
        { ...failedDoc.scenarios[0]!, name: "C", verdict: "something_new" },
      ],
    };
    const view = project(doc);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body).toContain("| A | Not connected | | |");
    expect(body).toContain("| B | Setup error | | |");
    expect(body).toContain("| C | Didn't finish | | |");
  });

  it("shows eval names with markdown characters as typed", () => {
    const doc = {
      ...failedDoc,
      scenarios: [
        {
          ...failedDoc.scenarios[1]!,
          failed_evals: [
            { name: "human_transfer", value: "FAIL" },
            { name: "`tone`", value: "FAIL" },
          ],
        },
      ],
    };
    const view = project(doc);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body).toContain("| Failed | human\\_transfer, \\`tone\\` |");
    expect(body).not.toContain("&#");
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
    expect(body).toContain("Your build wasn't blocked.\n[Open run in Tuner]");
  });

  it("caps the comment table, failed scenarios first", () => {
    const many = {
      ...failedDoc,
      summary: { ...failedDoc.summary, total: 60, failed: 1 },
      scenarios: Array.from({ length: 60 }, (_, i) => ({
        ...failedDoc.scenarios[i === 59 ? 1 : 0]!,
        scenario_id: i,
        name: `S${i}`,
      })),
    };
    const view = project(many);
    const body = renderComment(outcomeFor(1, view, opts), view, "a");
    expect(body.match(/^\| S\d+ /gm)).toHaveLength(COMMENT_MAX_ROWS);
    expect(body).toContain("|---|---|---|---|\n| S59 | Failed |");
    expect(body).toContain("and 10 more");
    expect(renderSummary(outcomeFor(1, view, opts), view).match(/^\| S\d+ /gm)).toHaveLength(60);
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
    expect(out.replace(/\\[<>|*[\]#]/g, "")).not.toMatch(/[<>|*[\]#\n]/);
  });

  it("escapes a backslash so it can't escape the next character", () => {
    expect(escapeText("a\\|b")).toBe("a\\\\\\|b");
  });
});

describe("commentMarker", () => {
  it("is keyed by agent and can't close the HTML comment", () => {
    expect(commentMarker("a")).not.toBe(commentMarker("b"));
    expect(commentMarker("x --> y")).toBe("<!-- tuner-action:v1 agent=x%20--%3E%20y -->");
  });
});
