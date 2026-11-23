import type { RunView } from "./document.js";

export type OutcomeKind =
  | "passed"
  | "failed"
  | "customer_error"
  | "tuner_error"
  | "canceled"
  | "no_result";

export interface Outcome {
  kind: OutcomeKind;
  /** Fail the step with `message`. */
  fail: boolean;
  /** Annotation text: the failure message, or a warning when `fail` is false. */
  message: string | null;
  /** Post or update the PR comment. */
  comment: boolean;
}

export interface OutcomeOptions {
  failOnTunerError: boolean;
  timeout: string;
}

/** The CLI exit code decides the outcome; the document only fills in the text. */
export function outcomeFor(exitCode: number, view: RunView | null, opts: OutcomeOptions): Outcome {
  switch (exitCode) {
    case 0:
      if (!view) return noResult(exitCode);
      return { kind: "passed", fail: false, message: null, comment: true };
    case 1:
      if (!view) return noResult(exitCode);
      return {
        kind: "failed",
        fail: true,
        message: `Tuner simulations: ${view.failed} of ${view.total} failed`,
        comment: true,
      };
    case 2:
      return {
        kind: "customer_error",
        fail: true,
        message: view?.errorMessage ?? "Tuner CLI exited 2; see the log above.",
        comment: true,
      };
    case 3:
      return {
        kind: "tuner_error",
        fail: opts.failOnTunerError,
        message: tunerErrorLine(view?.reason ?? null, opts),
        comment: true,
      };
    case 130:
    case 143:
      return {
        kind: "canceled",
        fail: true,
        message: "Run canceled because the job was stopped.",
        comment: false,
      };
    default:
      return noResult(exitCode);
  }
}

function noResult(exitCode: number): Outcome {
  return {
    kind: "no_result",
    fail: true,
    message: `Tuner CLI exited ${exitCode} without a result; see the log above.`,
    comment: false,
  };
}

export function tunerErrorLine(reason: string | null, opts: OutcomeOptions): string {
  const line = `Tuner couldn't finish this run (${describeReason(reason, opts.timeout)}).`;
  return opts.failOnTunerError ? line : `${line} Your build wasn't blocked.`;
}

export function describeReason(reason: string | null, timeout: string): string {
  switch (reason) {
    case "timeout":
      return `run timed out after ${describeDuration(timeout)}`;
    case "canceled":
      return "run was canceled";
    case "run_start_failed":
      return "run couldn't start";
    case "rate_limited":
      return "too many requests";
    case "tuner_error":
    case "internal_error":
    case "unexpected_response":
    case null:
      return "Tuner error";
    default:
      return reason;
  }
}

const UNITS: Record<string, string> = { s: "second", m: "minute", h: "hour" };

/** `30m` becomes `30 minutes`; anything else is shown as given. */
export function describeDuration(value: string): string {
  const match = /^(\d+)\s*([smh])$/.exec(value.trim());
  if (!match) return value;
  const n = Number(match[1]);
  return `${n} ${UNITS[match[2]!]}${n === 1 ? "" : "s"}`;
}
