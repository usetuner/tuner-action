import { describe, expect, it } from "vitest";
import { project } from "../src/document.js";
import { describeDuration, outcomeFor } from "../src/outcome.js";
import { failedDoc, noCreditsDoc, passedDoc, timeoutDoc } from "./fixtures.js";

const opts = { failOnTunerError: false, timeout: "30m" };

describe("outcomeFor", () => {
  it("passes on 0", () => {
    expect(outcomeFor(0, project(passedDoc), opts)).toEqual({
      kind: "passed",
      fail: false,
      message: null,
      comment: true,
    });
  });

  it("fails on 1 with the failed count", () => {
    const o = outcomeFor(1, project(failedDoc), opts);
    expect(o).toMatchObject({ kind: "failed", fail: true, comment: true });
    expect(o.message).toBe("Tuner simulations: 2 of 6 failed");
  });

  it("fails on 2 with the CLI's message", () => {
    const o = outcomeFor(2, project(noCreditsDoc), opts);
    expect(o).toMatchObject({ kind: "customer_error", fail: true, comment: true });
    expect(o.message).toBe("Not enough credits to start this run.");
  });

  it("fails on 2 without a document with the fallback", () => {
    expect(outcomeFor(2, null, opts).message).toBe("Tuner CLI exited 2; see the log above.");
  });

  it("passes with a warning on 3", () => {
    const o = outcomeFor(3, project(timeoutDoc), opts);
    expect(o).toMatchObject({ kind: "tuner_error", fail: false, comment: true });
    expect(o.message).toBe(
      "Tuner couldn't finish this run (run timed out after 30 minutes). Your build wasn't blocked.",
    );
  });

  it("fails on 3 with fail-on-tuner-error", () => {
    const o = outcomeFor(3, project(timeoutDoc), { ...opts, failOnTunerError: true });
    expect(o).toMatchObject({ kind: "tuner_error", fail: true });
    expect(o.message).toBe("Tuner couldn't finish this run (run timed out after 30 minutes).");
  });

  it("describes a Tuner error on 3 without a document", () => {
    expect(outcomeFor(3, null, opts).message).toBe(
      "Tuner couldn't finish this run (Tuner error). Your build wasn't blocked.",
    );
  });

  it.each([130, 143])("cancels on %i without touching the comment", (code) => {
    expect(outcomeFor(code, project(failedDoc), opts)).toEqual({
      kind: "canceled",
      fail: true,
      message: "Run canceled because the job was stopped.",
      comment: false,
    });
  });

  it.each([0, 1])("fails when %i comes without a document", (code) => {
    expect(outcomeFor(code, null, opts)).toMatchObject({
      kind: "no_result",
      fail: true,
      comment: false,
      message: `Tuner CLI exited ${code} without a result; see the log above.`,
    });
  });

  it("fails on an unknown exit code", () => {
    expect(outcomeFor(9, project(passedDoc), opts)).toMatchObject({
      kind: "no_result",
      fail: true,
      message: "Tuner CLI exited 9 without a result; see the log above.",
    });
  });
});

describe("describeDuration", () => {
  it.each([
    ["30m", "30 minutes"],
    ["1h", "1 hour"],
    ["90s", "90 seconds"],
    ["1h30m", "1h30m"],
  ])("%s", (input, expected) => expect(describeDuration(input)).toBe(expected));
});
