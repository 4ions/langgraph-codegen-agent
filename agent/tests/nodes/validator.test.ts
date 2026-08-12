import { describe, it, expect } from "vitest";
import { createValidatorNode } from "../../src/nodes/validator.js";
import { makeState } from "../helpers/makeState.js";

describe("validatorNode", () => {
  it("stores the validation result and logs a zero-cost history entry", async () => {
    const fakeRunValidation = async () => ({
      typecheckOk: false,
      testOk: true,
      output: "type error in Car.tsx",
    });

    const node = createValidatorNode(fakeRunValidation);
    const update = await node(makeState({ outputDir: "/tmp/whatever" }));

    expect(update.validationResult).toEqual({
      typecheckOk: false,
      testOk: true,
      output: "type error in Car.tsx",
    });
    expect(update.history).toEqual([
      { node: "validator", detail: "typecheck=false test=true", costUsd: 0 },
    ]);
  });

  it("snapshots filesWritten into lastGreenFiles when validation fully passes", async () => {
    const node = createValidatorNode(async () => ({
      typecheckOk: true,
      testOk: true,
      output: "ok",
    }));

    const update = await node(
      makeState({
        outputDir: "/tmp/whatever",
        filesWritten: { "src/a.ts": "green" },
      })
    );

    expect(update.lastGreenFiles).toEqual({ "src/a.ts": "green" });
  });

  it("keeps the previous lastGreenFiles untouched when validation fails", async () => {
    const node = createValidatorNode(async () => ({
      typecheckOk: false,
      testOk: true,
      output: "error TS1234",
    }));

    const update = await node(
      makeState({
        outputDir: "/tmp/whatever",
        filesWritten: { "src/a.ts": "broken" },
        lastGreenFiles: { "src/a.ts": "green" },
      })
    );

    expect(update.lastGreenFiles).toEqual({ "src/a.ts": "green" });
  });
});
