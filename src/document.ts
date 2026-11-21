/**
 * Allowlisted view of the CLI's `--output json` document. Only these fields ever reach
 * GitHub; nothing spreads or serializes the raw document.
 */
export interface Scenario {
  name: string;
  verdict: string;
  failedEvals: string[];
  /** Link to the scenario's call. The CLI document has no call URL yet, so this is always null. */
  callUrl: string | null;
}

export interface RunView {
  runId: number | null;
  runUrl: string | null;
  result: string | null;
  reason: string | null;
  total: number;
  passed: number;
  failed: number;
  scenarios: Scenario[];
  errorMessage: string | null;
}

const MAX_ERROR_CHARS = 500;

/** Parses the CLI's stdout. Returns null when it isn't a v1 run document. */
export function parseDocument(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const doc: unknown = JSON.parse(text);
    return isObject(doc) && doc.schema_version === 1 ? doc : null;
  } catch {
    return null;
  }
}

export function project(doc: unknown): RunView | null {
  if (!isObject(doc)) return null;
  const run = isObject(doc.run) ? doc.run : null;
  const summary = isObject(doc.summary) ? doc.summary : {};
  const error = isObject(doc.error) ? doc.error : null;
  const scenarios = Array.isArray(doc.scenarios) ? doc.scenarios.filter(isObject) : [];
  return {
    runId: run && typeof run.id === "number" ? run.id : null,
    runUrl: run ? httpUrl(run.dashboard_url) : null,
    result: run ? str(run.result) : null,
    reason: str(doc.reason),
    total: count(summary.total),
    passed: count(summary.passed),
    failed: count(summary.failed),
    scenarios: scenarios.map((s) => ({
      name: str(s.name) ?? "",
      verdict: str(s.verdict) ?? "",
      failedEvals: (Array.isArray(s.failed_evals) ? s.failed_evals : [])
        .filter(isObject)
        .map((e) => str(e.name))
        .filter((name): name is string => name !== null),
      callUrl: null,
    })),
    errorMessage: error ? truncate(str(error.message)) : null,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

function truncate(v: string | null): string | null {
  if (v === null) return null;
  return v.length > MAX_ERROR_CHARS ? `${v.slice(0, MAX_ERROR_CHARS - 1)}…` : v;
}

/** Only http(s) links are rendered, so a bad value can't become a `javascript:` link. */
function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
