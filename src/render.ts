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

function callLink(s: Scenario): string {
  return s.callUrl ? `[View call](${s.callUrl})` : "";
}

function table(header: string[], rows: string[][], total: number, max: number): string {
  const line = (cells: string[]) => `|${cells.map((c) => (c ? ` ${c} ` : " ")).join("|")}|`;
  const lines = [line(header), `|${header.map(() => "---").join("|")}|`, ...rows.slice(0, max).map(line)];
  if (total > max) lines.push("", `and ${total - max} more`);
  return lines.join("\n");
}

/** Comment table: failed scenarios only. */
function failedTable(view: RunView): string | null {
  const failed = view.scenarios.filter((s) => s.verdict === "failed");
  if (failed.length === 0) return null;
  const rows = failed.map((s) => [escapeText(s.name), evalNames(s), callLink(s)]);
  return table(["Scenario", "Failed evals", ""], rows, failed.length, COMMENT_MAX_ROWS);
}

/** Summary table: every scenario with its result. */
function scenarioTable(view: RunView): string | null {
  if (view.scenarios.length === 0) return null;
  const rows = view.scenarios.map((s) => [
    escapeText(s.name),
    VERDICT_LABELS[s.verdict] ?? escapeText(s.verdict),
    s.verdict === "failed" ? evalNames(s) : "",
    s.verdict === "failed" ? callLink(s) : "",
  ]);
  return table(["Scenario", "Result", "Failed evals", ""], rows, view.scenarios.length, SUMMARY_MAX_ROWS);
}

/** The outcome line under the title, as plain escaped text. */
function message(outcome: Outcome): string | null {
  if (outcome.kind === "passed" || outcome.kind === "failed" || !outcome.message) return null;
  return escapeText(outcome.message);
}

/**
 * Title, then the outcome line or the table, then the run link. A table needs a blank line
 * after it so the link doesn't join it.
 */
function render(outcome: Outcome, view: RunView | null, tableText: string | null): string {
  const link = outcome.kind === "customer_error" ? null : runLink(view);
  const lines = [`### ${title(outcome, view)}`];
  if (tableText) lines.push(tableText, "");
  const text = message(outcome);
  if (text) lines.push(text);
  if (link) lines.push(link);
  return `${lines.join("\n")}\n`;
}

/** The job summary: like the comment, but a failed run lists every scenario. */
export function renderSummary(outcome: Outcome, view: RunView | null): string {
  return render(outcome, view, outcome.kind === "failed" && view ? scenarioTable(view) : null);
}

export function commentMarker(agent: string): string {
  const key = agent.trim() ? encodeURIComponent(agent.trim()) : "default";
  return `<!-- tuner-action:v1 agent=${key} -->`;
}

/** The PR comment: passed scenarios appear only as a count; failed ones are listed. */
export function renderComment(outcome: Outcome, view: RunView | null, agent: string): string {
  const table = outcome.kind === "failed" && view ? failedTable(view) : null;
  const body = `${commentMarker(agent)}\n${render(outcome, view, table)}`;
  return body.length > COMMENT_MAX_CHARS ? `${body.slice(0, COMMENT_MAX_CHARS - 2)}…\n` : body;
}
