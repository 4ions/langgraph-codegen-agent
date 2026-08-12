import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "../src/graph.js";
import {
  fakeStructuredModel,
  promptDependentModel,
} from "./helpers/fakeModel.js";

function plannerModel(tasks: Array<{ id: string; targetFile: string }>) {
  return fakeStructuredModel([
    {
      parsed: {
        tasks: tasks.map((t) => ({
          id: t.id,
          description: t.id,
          targetFile: t.targetFile,
          dependsOn: [],
        })),
      },
    },
  ]);
}

function coderModel() {
  let n = 0;
  return promptDependentModel(() => {
    n += 1;
    return { content: `export const n = ${n};` };
  });
}

function reviewerModel(approved: boolean) {
  return fakeStructuredModel([
    { parsed: { approved, notes: approved ? [] : ["nope"] } },
  ]);
}

function fixerModel() {
  return fakeStructuredModel([
    {
      parsed: {
        rootCause: "gen1.ts does not compile",
        tasks: [
          { id: "fix1", description: "fix", targetFile: "src/gen1.ts", dependsOn: [] },
        ],
      },
    },
  ]);
}

function expensiveModel(parsed: unknown) {
  return fakeStructuredModel([{ parsed, costUsd: 0.6 }]);
}

describe("buildGraph", () => {
  it("reaches outcome=approved when validation and review both pass", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-graph-"));
    try {
      const graph = buildGraph(
        {
          planner: plannerModel([{ id: "t1", targetFile: "src/gen1.ts" }]),
          coder: coderModel(),
          reviewer: reviewerModel(true),
          fixer: fixerModel(),
        },
        {
          runValidation: async () => ({ typecheckOk: true, testOk: true, output: "ok" }),
        }
      );

      const result = await graph.invoke(
        { specText: "spec", outputDir: dir, boilerplateTree: "", referenceFiles: "" },
        { recursionLimit: 25, configurable: { thread_id: "test-run-approved" } }
      );

      expect(result.outcome).toBe("approved");
      expect(result.retryCount).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not report approved when the coder leaves a failed task pending, even if validation and review pass", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-graph-pending-"));
    try {
      const partiallyFailingCoder = promptDependentModel((prompt) => {
        if (prompt.includes("src/boom.ts")) throw new Error("model exploded");
        return { content: "export const ok = true;" };
      });

      const graph = buildGraph(
        {
          planner: plannerModel([
            { id: "t1", targetFile: "src/boom.ts" },
            { id: "t2", targetFile: "src/fine.ts" },
          ]),
          coder: partiallyFailingCoder,
          reviewer: reviewerModel(true),
          fixer: fixerModel(),
        },
        {
          runValidation: async () => ({
            typecheckOk: true,
            testOk: true,
            output: "ok",
          }),
        }
      );

      const result = await graph.invoke(
        {
          specText: "spec",
          outputDir: dir,
          boilerplateTree: "",
          referenceFiles: "",
          maxRetryCycles: 0,
        },
        { recursionLimit: 25, configurable: { thread_id: "test-run-pending" } }
      );

      expect(result.outcome).not.toBe("approved");
      expect(result.outcome).toBe("retries_exhausted");
      expect(result.pendingTasks.map((t) => t.id)).toEqual(["t1"]);
      expect(result.validationResult?.typecheckOk).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reaches outcome=retries_exhausted after maxRetryCycles failed validations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-graph-fail-"));
    try {
      const graph = buildGraph(
        {
          planner: plannerModel([{ id: "t1", targetFile: "src/gen1.ts" }]),
          coder: coderModel(),
          reviewer: reviewerModel(true),
          fixer: fixerModel(),
        },
        {
          runValidation: async () => ({ typecheckOk: false, testOk: false, output: "always broken" }),
        }
      );

      const result = await graph.invoke(
        { specText: "spec", outputDir: dir, boilerplateTree: "", referenceFiles: "", maxRetryCycles: 2 },
        { recursionLimit: 25, configurable: { thread_id: "test-run-exhausted" } }
      );

      expect(result.outcome).toBe("retries_exhausted");
      expect(result.retryCount).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("stops at finalize once the accumulated cost reaches maxCostUsd, before retries run out", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-graph-budget-"));
    try {
      const graph = buildGraph(
        {
          planner: expensiveModel({
            tasks: [
              { id: "t1", description: "t1", targetFile: "src/gen1.ts", dependsOn: [] },
            ],
          }),
          coder: expensiveModel({ content: "export const n = 1;" }),
          reviewer: reviewerModel(true),
          fixer: fixerModel(),
        },
        {
          runValidation: async () => ({
            typecheckOk: false,
            testOk: false,
            output: "always broken",
          }),
        }
      );

      const result = await graph.invoke(
        {
          specText: "spec",
          outputDir: dir,
          boilerplateTree: "",
          referenceFiles: "",
          maxRetryCycles: 10,
          maxCostUsd: 1,
        },
        { recursionLimit: 25, configurable: { thread_id: "test-run-budget" } }
      );

      expect(result.outcome).toBe("retries_exhausted");
      expect(result.retryCount).toBe(0);
      expect(result.retryCount).toBeLessThan(10);
      expect(result.history.some((e) => e.node === "fixer")).toBe(false);
      expect(result.validationResult?.typecheckOk).toBe(false);
      const totalCost = result.history.reduce((sum, e) => sum + e.costUsd, 0);
      expect(totalCost).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("loops reviewer -> fixer -> coder -> validator while the reviewer rejects, then exhausts retries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-graph-review-reject-"));
    try {
      const graph = buildGraph(
        {
          planner: plannerModel([{ id: "t1", targetFile: "src/gen1.ts" }]),
          coder: coderModel(),
          reviewer: reviewerModel(false),
          fixer: fixerModel(),
        },
        {
          runValidation: async () => ({
            typecheckOk: true,
            testOk: true,
            output: "ok",
          }),
        }
      );

      const result = await graph.invoke(
        {
          specText: "spec",
          outputDir: dir,
          boilerplateTree: "",
          referenceFiles: "",
          maxRetryCycles: 2,
        },
        { recursionLimit: 30, configurable: { thread_id: "test-run-review-reject" } }
      );

      expect(result.outcome).toBe("retries_exhausted");
      expect(result.retryCount).toBe(2);
      expect(result.reviewResult).toEqual({ approved: false, notes: ["nope"] });
      expect(result.validationResult?.typecheckOk).toBe(true);
      expect(
        result.history.filter((e) => e.node === "fixer").length
      ).toBe(2);
      expect(
        result.history.filter((e) => e.node === "reviewer").length
      ).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
