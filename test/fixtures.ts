/** `tuner sim run --output json` documents, shaped like schema/run-result.v1.json. */

const RUN_URL = "https://app.usetuner.ai/runs/4821";

function run(result: string | null) {
  return {
    id: 4821,
    status: "completed",
    result,
    is_terminal: true,
    dashboard_url: RUN_URL,
    workspace: { id: 7, name: "Acme" },
    agent: { id: 12, remote_id: "agent_abc", name: "Booking agent" },
    config: { language: "en-US", profile: null, noise: null, noise_intensity: null },
    started_at: "2026-11-19T10:00:00Z",
    completed_at: "2026-11-19T10:04:00Z",
  };
}

function scenario(id: number, name: string, verdict: string, evals: string[] = []) {
  return {
    scenario_id: id,
    library_scenario_id: null,
    name,
    verdict,
    failure_category: verdict === "failed" ? "agent_failed" : null,
    failed_evals: evals.map((e) => ({ name: e, value: "FAIL" })),
    call_id: 9000 + id,
  };
}

function summary(total: number, passed: number, failed: number) {
  return { total, passed, failed, inconclusive: 0, canceled: 0, pending: 0 };
}

export const passedDoc = {
  schema_version: 1,
  run: run("passed"),
  summary: summary(6, 6, 0),
  scenarios: [
    scenario(1, "Book a cleaning, happy path", "passed"),
    scenario(2, "Reschedule with a wrong booking ID", "passed"),
    scenario(3, "Move an appointment to next week", "passed"),
    scenario(4, "Ask for a human while booking", "passed"),
    scenario(5, "Cancel and ask about the refund policy", "passed"),
    scenario(6, "Book for a family member", "passed"),
  ],
  reason: null,
  exit_code: 0,
};

export const failedDoc = {
  schema_version: 1,
  run: run("failed"),
  summary: summary(6, 4, 2),
  scenarios: [
    scenario(1, "Book a cleaning, happy path", "passed"),
    scenario(2, "Reschedule with a wrong booking ID", "failed", ["Hallucination"]),
    scenario(3, "Move an appointment to next week", "passed"),
    scenario(4, "Ask for a human while booking", "failed", ["Transfer"]),
    scenario(5, "Cancel and ask about the refund policy", "passed"),
    scenario(6, "Book for a family member", "passed"),
  ],
  reason: "agent_failed",
  exit_code: 1,
};

export const noCreditsDoc = {
  schema_version: 1,
  run: null,
  summary: summary(0, 0, 0),
  scenarios: [],
  reason: "insufficient_credits",
  exit_code: 2,
  error: { code: "insufficient_credits", message: "Not enough credits to start this run." },
};

export const timeoutDoc = {
  schema_version: 1,
  run: { ...run("canceled"), status: "canceled" },
  summary: { total: 6, passed: 3, failed: 0, inconclusive: 0, canceled: 3, pending: 0 },
  scenarios: [
    scenario(1, "Book a cleaning, happy path", "passed"),
    scenario(2, "Reschedule with a wrong booking ID", "canceled"),
  ],
  reason: "timeout",
  exit_code: 3,
};

export const CANARIES = ["CANARY_TRANSCRIPT_7f3a", "CANARY_REASONING_91bd", "CANARY_AUDIO_c0de"];

/** A document with fields the action must never show; extra keys at every level. */
export const leakyDoc = {
  ...failedDoc,
  transcript: `agent: ${CANARIES[0]}`,
  recording_url: `https://audio.example/${CANARIES[2]}.wav`,
  run: { ...failedDoc.run, transcript: CANARIES[0], recording_url: CANARIES[2] },
  scenarios: failedDoc.scenarios.map((s) => ({
    ...s,
    transcript: CANARIES[0],
    recording_url: CANARIES[2],
    reasoning: CANARIES[1],
    failed_evals: s.failed_evals.map((e) => ({ ...e, reasoning: CANARIES[1], value: CANARIES[1] })),
  })),
  error: { code: "x", message: "ok", reasoning: CANARIES[1] },
};
