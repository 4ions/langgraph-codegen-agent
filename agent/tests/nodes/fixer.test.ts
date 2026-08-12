import { describe, it, expect } from "vitest";
import { createFixerNode } from "../../src/nodes/fixer.js";
import type { Task } from "../../src/schemas.js";
import { makeState } from "../helpers/makeState.js";
import {
  capturingModel,
  fakeStructuredModel,
  throwingModel,
} from "../helpers/fakeModel.js";

function modelReturning(tasks: Task[], rootCause = "test root cause") {
  return fakeStructuredModel([{ parsed: { rootCause, tasks } }]);
}

const FAILING_VALIDATION = {
  typecheckOk: false,
  testOk: true,
  output: "type error",
};

describe("fixerNode", () => {
  it("sets pendingTasks from the model output and increments retryCount", async () => {
    const node = createFixerNode(
      fakeStructuredModel([
        {
          parsed: {
            rootCause: "Car.tsx declares props it never receives",
            tasks: [
              {
                id: "fix1",
                description: "fix type error in Car.tsx",
                targetFile: "src/components/Car.tsx",
                dependsOn: [],
              },
            ],
          },
          costUsd: 0.005,
        },
      ])
    );
    const state = makeState({
      specText: "build a car inventory app",
      filesWritten: { "src/components/Car.tsx": "export default function Car() {}" },
      validationResult: FAILING_VALIDATION,
      retryCount: 1,
    });

    const update = await node(state);

    expect(update.pendingTasks?.[0]?.id).toBe("fix1");
    expect(update.retryCount).toBe(2);
    expect(update.history).toEqual([
      {
        node: "fixer",
        detail:
          "Root cause: Car.tsx declares props it never receives — queued 1 fix task(s)",
        costUsd: 0.005,
      },
    ]);
  });

  it("topologically sorts fix tasks and tolerates dependencies on completed plan tasks", async () => {
    const node = createFixerNode(
      modelReturning(
        [
          {
            id: "fixB",
            description: "second",
            targetFile: "src/b.ts",
            dependsOn: ["fixA", "t1"],
          },
          {
            id: "fixA",
            description: "first",
            targetFile: "src/a.ts",
            dependsOn: ["t1"],
          },
        ],
        "b.ts imports a symbol a.ts does not export"
      )
    );
    const state = makeState({
      specText: "spec",
      plan: [
        { id: "t1", description: "base", targetFile: "src/base.ts", dependsOn: [] },
      ],
      validationResult: FAILING_VALIDATION,
    });

    const update = await node(state);

    expect(update.pendingTasks?.map((t) => t.id)).toEqual(["fixA", "fixB"]);
  });

  it("merges its own tasks into the accumulated plan so the next cycle knows their ids", async () => {
    const node = createFixerNode(
      modelReturning([
        {
          id: "fix1",
          description: "fix",
          targetFile: "src/a.ts",
          dependsOn: ["t1"],
        },
      ])
    );
    const state = makeState({
      specText: "spec",
      plan: [
        { id: "t1", description: "base", targetFile: "src/base.ts", dependsOn: [] },
      ],
      validationResult: { typecheckOk: false, testOk: true, output: "boom" },
    });

    const update = await node(state);

    expect(update.plan?.map((t) => t.id)).toEqual(["t1", "fix1"]);

    const secondCycle = await createFixerNode(
      modelReturning([
        {
          id: "fix2",
          description: "depends on the previous fix cycle",
          targetFile: "src/b.ts",
          dependsOn: ["fix1"],
        },
      ])
    )(makeState({ ...state, plan: update.plan, retryCount: 1 }));

    expect(secondCycle.pendingTasks?.map((t) => t.id)).toEqual(["fix2"]);
    expect(
      secondCycle.history?.some((entry) =>
        entry.detail.includes("Could not determine fix task order")
      )
    ).toBe(false);
  });

  it("falls back to unsorted tasks and logs the problem when the dependency graph cannot be sorted", async () => {
    const node = createFixerNode(
      modelReturning([
        {
          id: "fixB",
          description: "second",
          targetFile: "src/b.ts",
          dependsOn: ["ghost"],
        },
        {
          id: "fixA",
          description: "first",
          targetFile: "src/a.ts",
          dependsOn: [],
        },
      ])
    );
    const state = makeState({
      specText: "spec",
      validationResult: { typecheckOk: false, testOk: true, output: "boom" },
    });

    const update = await node(state);

    expect(update.pendingTasks?.map((t) => t.id)).toEqual(["fixB", "fixA"]);
    expect(update.retryCount).toBe(1);
    expect(update.history?.[0]?.detail).toContain(
      "Could not determine fix task order"
    );
    expect(update.history?.[0]?.detail).toContain("ghost");
    expect(update.history?.[1]?.detail).toBe(
      "Root cause: test root cause — queued 2 fix task(s)"
    );
  });

  it("includes coder failures recorded in history in the prompt sent to the model", async () => {
    const capturedPrompts: string[] = [];
    const node = createFixerNode(
      capturingModel({ rootCause: "test root cause", tasks: [] }, capturedPrompts)
    );
    const state = makeState({
      specText: "spec",
      validationResult: { typecheckOk: true, testOk: true, output: "ok" },
      reviewResult: { approved: false, notes: ["missing search"] },
      history: [
        { node: "planner", detail: "Planned 2 tasks", costUsd: 0 },
        {
          node: "coder",
          detail: "Failed task t2 targeting src/boom.ts: model exploded",
          costUsd: 0,
        },
        { node: "coder", detail: "Wrote src/ok.ts for task t1", costUsd: 0 },
      ],
    });

    await node(state);

    expect(capturedPrompts[0]).toContain("missing search");
    expect(capturedPrompts[0]).toContain(
      "Failed task t2 targeting src/boom.ts: model exploded"
    );
    expect(capturedPrompts[0]).not.toContain("Wrote src/ok.ts");
  });

  it("ignores coder failures from cycles that a previous fixer run already handled", async () => {
    const capturedPrompts: string[] = [];
    const node = createFixerNode(
      capturingModel({ rootCause: "test root cause", tasks: [] }, capturedPrompts)
    );
    const state = makeState({
      specText: "spec",
      validationResult: { typecheckOk: false, testOk: true, output: "boom" },
      history: [
        {
          node: "coder",
          detail: "Failed task old1 targeting src/old.ts: stale failure",
          costUsd: 0,
        },
        { node: "fixer", detail: "Queued 1 fix task(s)", costUsd: 0.001 },
        {
          node: "coder",
          detail: "Failed task new1 targeting src/new.ts: fresh failure",
          costUsd: 0,
        },
      ],
      retryCount: 1,
    });

    await node(state);

    expect(capturedPrompts[0]).toContain("fresh failure");
    expect(capturedPrompts[0]).not.toContain("stale failure");
  });

  it("deduplicates plan ids, keeping the newest version of a reused id", async () => {
    const node = createFixerNode(
      modelReturning([
        {
          id: "t1",
          description: "regenerate base differently",
          targetFile: "src/other.ts",
          dependsOn: [],
        },
      ])
    );
    const state = makeState({
      specText: "spec",
      plan: [
        { id: "t1", description: "base", targetFile: "src/base.ts", dependsOn: [] },
      ],
      validationResult: { typecheckOk: false, testOk: true, output: "boom" },
    });

    const update = await node(state);

    expect(update.plan?.filter((t) => t.id === "t1")).toHaveLength(1);
    expect(update.plan?.[0]?.targetFile).toBe("src/other.ts");
  });

  it("degrades gracefully instead of throwing when the LLM call fails", async () => {
    const node = createFixerNode(throwingModel("rate limited"));
    const state = makeState({
      specText: "spec",
      validationResult: { typecheckOk: false, testOk: true, output: "boom" },
      retryCount: 1,
    });

    const update = await node(state);

    expect(update.pendingTasks).toEqual([]);
    expect(update.retryCount).toBe(2);
    expect(update.history).toEqual([
      {
        node: "fixer",
        detail: "Fixer LLM call failed: rate limited",
        costUsd: 0,
      },
    ]);
  });

  it("keeps only the last task per targetFile so a fix cycle cannot overwrite itself", async () => {
    const node = createFixerNode(
      modelReturning([
        {
          id: "fixOld",
          description: "first attempt at CarCard",
          targetFile: "src/components/CarCard.tsx",
          dependsOn: [],
        },
        {
          id: "fixOther",
          description: "unrelated file",
          targetFile: "src/utils/format.ts",
          dependsOn: [],
        },
        {
          id: "fixNew",
          description: "refined attempt at CarCard",
          targetFile: "src/components/CarCard.tsx",
          dependsOn: [],
        },
      ])
    );
    const state = makeState({
      specText: "spec",
      validationResult: FAILING_VALIDATION,
    });

    const update = await node(state);

    const forCarCard = (update.pendingTasks ?? []).filter(
      (task) => task.targetFile === "src/components/CarCard.tsx"
    );
    expect(forCarCard).toHaveLength(1);
    expect(forCarCard[0]?.id).toBe("fixNew");
    expect(update.pendingTasks?.map((task) => task.id)).toEqual([
      "fixOther",
      "fixNew",
    ]);
    expect(update.plan?.map((task) => task.id)).toEqual([
      "fixOld",
      "fixOther",
      "fixNew",
    ]);
  });
});
