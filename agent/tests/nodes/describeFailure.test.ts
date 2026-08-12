import { describe, it, expect } from "vitest";
import {
  describeFailureForFixer,
  describeLastFailure,
} from "../../src/nodes/describeFailure.js";
import { makeState } from "../helpers/makeState.js";

describe("describeLastFailure", () => {
  it("prefers the validation output when validation is red", () => {
    const state = makeState({
      validationResult: { typecheckOk: false, testOk: true, output: "TS2345" },
      reviewResult: { approved: false, notes: ["also rejected"] },
    });

    expect(describeLastFailure(state)).toBe("TS2345");
  });

  it("falls back to the review notes when validation is green", () => {
    const state = makeState({
      validationResult: { typecheckOk: true, testOk: true, output: "ok" },
      reviewResult: { approved: false, notes: ["no search", "no sort"] },
    });

    expect(describeLastFailure(state)).toBe("no search\nno sort");
  });

  it("returns an empty string when nothing failed", () => {
    expect(describeLastFailure(makeState())).toBe("");
  });
});

describe("describeFailureForFixer", () => {
  it("labels the primary failure and appends coder failures from the current cycle", () => {
    const state = makeState({
      validationResult: { typecheckOk: false, testOk: true, output: "TS2345" },
      history: [
        { node: "fixer", detail: "queued", costUsd: 0 },
        {
          node: "coder",
          detail: "Failed task t1 targeting src/a.ts: boom",
          costUsd: 0,
        },
      ],
    });

    const described = describeFailureForFixer(state);

    expect(described).toContain("Validation output:\nTS2345");
    expect(described).toContain("Code generation failures from the previous cycle");
    expect(described).toContain("Failed task t1 targeting src/a.ts: boom");
  });

  it("labels review notes when validation passed but the review rejected", () => {
    const state = makeState({
      validationResult: { typecheckOk: true, testOk: true, output: "ok" },
      reviewResult: { approved: false, notes: ["no search"] },
    });

    expect(describeFailureForFixer(state)).toBe("Review notes:\nno search");
  });

  it("returns the unknown-failure fallback when there is nothing to report", () => {
    expect(describeFailureForFixer(makeState())).toContain("Unknown failure");
  });
});
