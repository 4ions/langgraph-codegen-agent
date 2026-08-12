import { describe, it, expect } from "vitest";
import { createPlannerNode } from "../../src/nodes/planner.js";
import { makeState } from "../helpers/makeState.js";
import {
  capturingModel,
  fakeStructuredModel,
  throwingModel,
} from "../helpers/fakeModel.js";

const STATE = makeState({
  specText: "build a car inventory app",
  boilerplateTree: "src/App.tsx\nsrc/types.ts",
  referenceFiles: "--- src/types.ts ---\nexport interface Car { id: string }",
});

describe("plannerNode", () => {
  it("sets plan and pendingTasks to the same dependency-sorted order, logs cost", async () => {
    const capturedPrompts: string[] = [];
    const node = createPlannerNode(
      fakeStructuredModel(
        [
          {
            parsed: {
              tasks: [
                { id: "b", description: "b", targetFile: "b.ts", dependsOn: ["a"] },
                { id: "a", description: "a", targetFile: "a.ts", dependsOn: [] },
              ],
            },
            costUsd: 0.02,
          },
        ],
        capturedPrompts
      )
    );
    const update = await node(STATE);

    expect(update.plan?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(update.pendingTasks?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(update.history).toEqual([
      { node: "planner", detail: "Planned 2 tasks", costUsd: 0.02 },
    ]);
    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain("build a car inventory app");
    expect(capturedPrompts[0]).toContain("src/App.tsx\nsrc/types.ts");
    expect(capturedPrompts[0]).toContain(
      "export interface Car { id: string }"
    );
  });

  it("returns an empty plan instead of throwing when the LLM call fails", async () => {
    const update = await createPlannerNode(
      throwingModel("rate limit exceeded")
    )(STATE);

    expect(update.plan).toEqual([]);
    expect(update.pendingTasks).toEqual([]);
    expect(update.history).toEqual([
      {
        node: "planner",
        detail: "Planner LLM call failed: rate limit exceeded",
        costUsd: 0,
      },
    ]);
  });

  it("degrades to an empty plan instead of crashing when the tasks cannot be ordered", async () => {
    const update = await createPlannerNode(
      capturingModel(
        {
          tasks: [
            { id: "a", description: "a", targetFile: "a.ts", dependsOn: ["b"] },
            { id: "b", description: "b", targetFile: "b.ts", dependsOn: ["a"] },
          ],
        },
        []
      )
    )(STATE);

    expect(update.plan).toEqual([]);
    expect(update.pendingTasks).toEqual([]);
    expect(update.history?.[0]?.detail).toContain("plan ordering failed");
    expect(update.history?.[0]?.costUsd).toBe(0);
  });

  it("degrades to an empty plan when a task depends on an unknown id", async () => {
    const update = await createPlannerNode(
      capturingModel(
        {
          tasks: [
            {
              id: "a",
              description: "a",
              targetFile: "a.ts",
              dependsOn: ["ghost"],
            },
          ],
        },
        []
      )
    )(STATE);

    expect(update.plan).toEqual([]);
    expect(update.history?.[0]?.detail).toContain("plan ordering failed");
    expect(update.history?.[0]?.detail).toContain("ghost");
  });
});
