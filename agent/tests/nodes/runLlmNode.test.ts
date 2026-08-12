import { describe, it, expect } from "vitest";
import { runLlmNode } from "../../src/nodes/runLlmNode.js";
import { fakeStructuredModel, throwingModel } from "../helpers/fakeModel.js";

describe("runLlmNode", () => {
  it("passes the parsed output and cost to onSuccess", async () => {
    const update = await runLlmNode<{ approved: boolean }>({
      node: "reviewer",
      failureLabel: "Reviewer",
      model: fakeStructuredModel([
        { parsed: { approved: true }, costUsd: 0.03 },
      ]),
      schema: {},
      prompt: "p",
      onSuccess: (parsed, costUsd) => ({
        reviewResult: { approved: parsed.approved, notes: [] },
        history: [{ node: "reviewer", detail: "ok", costUsd }],
      }),
    });

    expect(update.reviewResult).toEqual({ approved: true, notes: [] });
    expect(update.history?.[0]?.costUsd).toBe(0.03);
  });

  it("turns a thrown call into a labelled zero-cost history entry plus the onFailure patch", async () => {
    const update = await runLlmNode({
      node: "fixer",
      failureLabel: "Fixer",
      model: throwingModel("rate limited"),
      schema: {},
      prompt: "p",
      onSuccess: () => ({}),
      onFailure: () => ({ pendingTasks: [], retryCount: 4 }),
    });

    expect(update.retryCount).toBe(4);
    expect(update.pendingTasks).toEqual([]);
    expect(update.history).toEqual([
      { node: "fixer", detail: "Fixer LLM call failed: rate limited", costUsd: 0 },
    ]);
  });

  it("routes an error thrown inside onSuccess through the same failure path", async () => {
    const update = await runLlmNode({
      node: "planner",
      failureLabel: "Planner",
      model: fakeStructuredModel([{ parsed: { tasks: [] } }]),
      schema: {},
      prompt: "p",
      onSuccess: () => {
        throw new Error("plan ordering failed: cycle");
      },
      onFailure: () => ({ plan: [], pendingTasks: [] }),
    });

    expect(update.history?.[0]?.detail).toBe(
      "Planner LLM call failed: plan ordering failed: cycle"
    );
    expect(update.plan).toEqual([]);
  });

  it("still records the failure entry when no onFailure patch is given", async () => {
    const update = await runLlmNode({
      node: "reviewer",
      failureLabel: "Reviewer",
      model: throwingModel("upstream 503"),
      schema: {},
      prompt: "p",
      onSuccess: () => ({}),
    });

    expect(update.history).toEqual([
      {
        node: "reviewer",
        detail: "Reviewer LLM call failed: upstream 503",
        costUsd: 0,
      },
    ]);
  });
});
