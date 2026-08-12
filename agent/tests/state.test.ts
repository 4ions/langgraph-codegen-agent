import { describe, it, expect } from "vitest";
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "../src/state.js";

describe("AgentState", () => {
  it("applies schema defaults when a run is only given specText", async () => {
    const graph = new StateGraph(AgentState)
      .addNode("passthrough", (_state: AgentStateType) => ({}))
      .addEdge(START, "passthrough")
      .addEdge("passthrough", END)
      .compile();

    const initial = await graph.invoke({ specText: "build a car app" });

    expect(initial.outputDir).toBe("");
    expect(initial.referenceFiles).toBe("");
    expect(initial.plan).toEqual([]);
    expect(initial.pendingTasks).toEqual([]);
    expect(initial.filesWritten).toEqual({});
    expect(initial.validationResult).toBeNull();
    expect(initial.reviewResult).toBeNull();
    expect(initial.retryCount).toBe(0);
    expect(initial.maxRetryCycles).toBe(3);
    expect(initial.outcome).toBe("in_progress");
    expect(initial.history).toEqual([]);
  });

  it("history reducer concatenates an incoming batch instead of replacing", () => {
    const reduced = AgentState.fields.history.reducer(
      [{ node: "planner", detail: "planned 3 tasks", costUsd: 0.001 }],
      [{ node: "coder", detail: "wrote a.ts", costUsd: 0.002 }]
    );
    expect(reduced).toHaveLength(2);
    expect(reduced[1]?.node).toBe("coder");
  });
});
