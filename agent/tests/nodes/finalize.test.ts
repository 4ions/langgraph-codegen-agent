import { describe, it, expect } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFinalizeNode } from "../../src/nodes/finalize.js";
import type { AgentStateType } from "../../src/state.js";
import { makeState } from "../helpers/makeState.js";

const finalizeNode = createFinalizeNode();

function stateWith(
  validationResult: AgentStateType["validationResult"],
  reviewResult: AgentStateType["reviewResult"],
  pendingTasks: AgentStateType["pendingTasks"] = []
): AgentStateType {
  return makeState({ validationResult, reviewResult, pendingTasks });
}

const PASSING_VALIDATION = {
  typecheckOk: true,
  testOk: true,
  output: "ok",
};
const FAILING_VALIDATION = {
  typecheckOk: false,
  testOk: true,
  output: "type error",
};

describe("finalizeNode", () => {
  it("reports approved only when validation passes and the review approves", async () => {
    const update = await finalizeNode(
      stateWith(PASSING_VALIDATION, { approved: true, notes: [] })
    );

    expect(update.outcome).toBe("approved");
    expect(update.history).toEqual([
      { node: "finalize", detail: "Outcome: approved", costUsd: 0 },
    ]);
  });

  it("reports retries_exhausted when validation passes but the review rejects", async () => {
    const update = await finalizeNode(
      stateWith(PASSING_VALIDATION, { approved: false, notes: ["nope"] })
    );

    expect(update.outcome).toBe("retries_exhausted");
    expect(update.history).toEqual([
      { node: "finalize", detail: "Outcome: retries_exhausted", costUsd: 0 },
    ]);
  });

  it("reports retries_exhausted when validation fails even if the review approves", async () => {
    const update = await finalizeNode(
      stateWith(FAILING_VALIDATION, { approved: true, notes: [] })
    );

    expect(update.outcome).toBe("retries_exhausted");
  });

  it("reports retries_exhausted when validation fails and the review rejects", async () => {
    const update = await finalizeNode(
      stateWith(FAILING_VALIDATION, { approved: false, notes: ["nope"] })
    );

    expect(update.outcome).toBe("retries_exhausted");
  });

  it("reports retries_exhausted when tasks are still pending even if validation and review pass", async () => {
    const update = await finalizeNode(
      stateWith(PASSING_VALIDATION, { approved: true, notes: [] }, [
        { id: "t1", description: "unfinished", targetFile: "src/a.ts", dependsOn: [] },
      ])
    );

    expect(update.outcome).toBe("retries_exhausted");
  });

  it("reports retries_exhausted for the initial state where both results are null", async () => {
    const update = await finalizeNode(stateWith(null, null));

    expect(update.outcome).toBe("retries_exhausted");
  });

  it("restores the last known-good snapshot to disk when the run does not approve", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-finalize-"));
    try {
      const state = makeState({
        validationResult: FAILING_VALIDATION,
        reviewResult: { approved: false, notes: ["broken"] },
        outputDir: dir,
        filesWritten: { "src/a.ts": "export const a = 'broken';" },
        lastGreenFiles: {
          "src/a.ts": "export const a = 'green';",
          "src/b.ts": "export const b = 'green';",
        },
      });

      const update = await finalizeNode(state);

      expect(update.outcome).toBe("retries_exhausted");
      expect(update.filesWritten).toEqual(state.lastGreenFiles);
      expect(await readFile(join(dir, "src/a.ts"), "utf8")).toBe(
        "export const a = 'green';"
      );
      expect(await readFile(join(dir, "src/b.ts"), "utf8")).toBe(
        "export const b = 'green';"
      );
      expect(update.history?.[0]?.detail).toBe(
        "Restored last known-good state (2 files) after failing to improve on it"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not restore anything when the outcome is approved", async () => {
    const state = makeState({
      validationResult: PASSING_VALIDATION,
      reviewResult: { approved: true, notes: [] },
      outputDir: "/tmp/does-not-exist-finalize",
      filesWritten: { "src/a.ts": "export const a = 1;" },
      lastGreenFiles: { "src/a.ts": "export const a = 1;" },
    });

    const update = await finalizeNode(state);

    expect(update.outcome).toBe("approved");
    expect(update.filesWritten).toBeUndefined();
  });
});
