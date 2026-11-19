import type { RunView, Scenario } from "./document.js";
import type { Outcome } from "./outcome.js";

export const COMMENT_MAX_ROWS = 50;
export const SUMMARY_MAX_ROWS = 1000;
const COMMENT_MAX_CHARS = 65_536;

const VERDICT_LABELS: Record<string, string> = {
  passed: "Passed",
  failed: "Failed",
  not_connected: "Not connected",
  platform_error: "Tuner error",
  unreported: "No result",
  analysis_failed: "Analysis failed",
  ran: "Ran",
  pending: "Pending",
  canceled: "Canceled",
};

/**
 * Escapes a customer string for Markdown and HTML on one line. `@` gets a zero-width space so
 * a name like `@org/team` doesn't mention anyone.
 */
export function escapeText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[&<>"'|\\`*_[\]#~!()]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/@/g, "@​")
    .trim();
}

export function title(outcome: Outcome, view: RunView | null): string {
  switch (outcome.kind) {
    case "passed":
      return `Tuner simulations: all ${view?.total ?? 0} passed`;
    case "failed":
      return `Tuner simulations: ${view?.failed ?? 0} of ${view?.total ?? 0} failed`;
    case "tuner_error":
      return "Tuner simulations: couldn't finish";
    case "canceled":
      return "Tuner simulations: canceled";
    default:
      return "Tuner simulations: couldn't run";
  }
}

function runLink(view: RunView | null): string | null {
  return view?.runUrl ? `[Open run in Tuner](${view.runUrl})` : null;
}

function evalNames(s: Scenario): string {
  return s.failedEvals.map(escapeText).join(", ");
}

function failedTable(view: RunView): string[] {
  const failed = view.scenarios.filter((s) => s.verdict === "failed");
  if (failed.length === 0) return [];
  const rows = failed.slice(0, COMMENT_MAX_ROWS).map((s) => `| ${escapeText(s.name)} | ${evalNames(s)} |`);
  const lines = ["| Scenario | Failed evals |", "| --- | --- |", ...rows];
  if (failed.length > COMMENT_MAX_ROWS) lines.push("", `and ${failed.length - COMMENT_MAX_ROWS} more`);
  return [lines.join("\n")];
}

function scenarioTable(view: RunView): string[] {
  if (view.scenarios.length === 0) return [];
  const rows = view.scenarios.slice(0, SUMMARY_MAX_ROWS).map((s) => {
    const label = VERDICT_LABELS[s.verdict] ?? escapeText(s.verdict);
    return `| ${escapeText(s.name)} | ${label} | ${evalNames(s)} |`;
  });
  const lines = ["| Scenario | Result | Failed evals |", "| --- | --- | --- |", ...rows];
  if (view.scenarios.length > SUMMARY_MAX_ROWS) {
    lines.push("", `and ${view.scenarios.length - SUMMARY_MAX_ROWS} more`);
  }
  return [lines.join("\n")];
}

/** Body text under the title: the outcome line, as plain escaped text. */
function messageBlock(outcome: Outcome): string[] {
  if (outcome.kind === "passed" || outcome.kind === "failed" || !outcome.message) return [];
  return [escapeText(outcome.message)];
}

function sections(parts: (string | null)[]): string {
  return `${parts.filter((p): p is string => Boolean(p)).join("\n\n")}\n`;
}

/** The job summary: title, every scenario with its result, and the run link. */
export function renderSummary(outcome: Outcome, view: RunView | null): string {
  const link = outcome.kind === "customer_error" ? null : runLink(view);
  return sections([
    `### ${title(outcome, view)}`,
    ...messageBlock(outcome),
    ...(view ? scenarioTable(view) : []),
    link,
  ]);
}

export function commentMarker(agent: string): string {
  const key = agent.trim() ? encodeURIComponent(agent.trim()) : "default";
  return `<!-- tuner-action:v1 agent=${key} -->`;
}

/** The PR comment: passed scenarios appear only as a count; failed ones are listed. */
export function renderComment(outcome: Outcome, view: RunView | null, agent: string): string {
  const link = outcome.kind === "customer_error" ? null : runLink(view);
  const body = sections([
    commentMarker(agent),
    `### ${title(outcome, view)}`,
    ...messageBlock(outcome),
    ...(outcome.kind === "failed" && view ? failedTable(view) : []),
    link,
  ]);
  return body.length > COMMENT_MAX_CHARS ? `${body.slice(0, COMMENT_MAX_CHARS - 2)}…\n` : body;
}
