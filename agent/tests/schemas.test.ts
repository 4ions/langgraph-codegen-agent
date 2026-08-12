import { describe, it, expect } from "vitest";
import {
  TaskSchema,
  PlanSchema,
  CoderOutputSchema,
  ReviewOutputSchema,
  FixOutputSchema,
  ValidationResultSchema,
  HistoryEntrySchema,
} from "../src/schemas.js";

describe("schemas", () => {
  it("TaskSchema accepts a valid task and defaults dependsOn to []", () => {
    const parsed = TaskSchema.parse({
      id: "t1",
      description: "create useCars hook",
      targetFile: "src/hooks/useCars.ts",
    });
    expect(parsed.dependsOn).toEqual([]);
  });

  it("TaskSchema rejects a task missing targetFile", () => {
    expect(() =>
      TaskSchema.parse({ id: "t1", description: "x" })
    ).toThrow();
  });

  it("PlanSchema accepts a list of tasks", () => {
    const parsed = PlanSchema.parse({
      tasks: [
        { id: "t1", description: "x", targetFile: "a.ts", dependsOn: [] },
      ],
    });
    expect(parsed.tasks).toHaveLength(1);
  });

  it("CoderOutputSchema requires only a content string (no path field)", () => {
    expect(() => CoderOutputSchema.parse({})).toThrow();
    expect(CoderOutputSchema.parse({ content: "export {}" })).toEqual({
      content: "export {}",
    });
  });

  it("ReviewOutputSchema defaults notes to [] and requires approved boolean", () => {
    const parsed = ReviewOutputSchema.parse({ approved: true });
    expect(parsed.notes).toEqual([]);
    expect(() => ReviewOutputSchema.parse({ notes: [] })).toThrow();
  });

  it("FixOutputSchema wraps a root cause and a task list", () => {
    const parsed = FixOutputSchema.parse({
      rootCause: "CarCard swallows the Apollo error in a catch block",
      tasks: [
        { id: "fix1", description: "fix x", targetFile: "a.ts", dependsOn: [] },
      ],
    });
    expect(parsed.rootCause).toBe(
      "CarCard swallows the Apollo error in a catch block"
    );
    expect(parsed.tasks[0]?.id).toBe("fix1");
  });

  it("FixOutputSchema requires rootCause", () => {
    expect(() =>
      FixOutputSchema.parse({
        tasks: [
          { id: "fix1", description: "fix x", targetFile: "a.ts", dependsOn: [] },
        ],
      })
    ).toThrow();
  });

  it("ValidationResultSchema requires typecheckOk, testOk, output", () => {
    expect(() =>
      ValidationResultSchema.parse({ typecheckOk: true, testOk: true })
    ).toThrow();
    expect(
      ValidationResultSchema.parse({ typecheckOk: true, testOk: false, output: "x" })
    ).toEqual({ typecheckOk: true, testOk: false, output: "x" });
  });

  it("HistoryEntrySchema defaults costUsd to 0", () => {
    const parsed = HistoryEntrySchema.parse({ node: "planner", detail: "ok" });
    expect(parsed.costUsd).toBe(0);
  });
});
