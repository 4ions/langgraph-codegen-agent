import { describe, it, expect } from "vitest";
import { topoSortTasks } from "../src/tools/topoSort.js";
import type { Task } from "../src/schemas.js";

function task(id: string, dependsOn: string[] = []): Task {
  return { id, description: id, targetFile: `${id}.ts`, dependsOn };
}

describe("topoSortTasks", () => {
  it("orders tasks after their dependencies", () => {
    const tasks = [task("c", ["b"]), task("a"), task("b", ["a"])];
    const sorted = topoSortTasks(tasks).map((t) => t.id);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
  });

  it("throws on a circular dependency", () => {
    const tasks = [task("a", ["b"]), task("b", ["a"])];
    expect(() => topoSortTasks(tasks)).toThrow("Circular dependency detected");
  });

  it("throws when a task depends on an id that does not exist", () => {
    const tasks = [task("a", ["ghost"])];
    expect(() => topoSortTasks(tasks)).toThrow("Unknown dependency");
  });

  it("treats dependencies listed in knownExternalIds as already satisfied", () => {
    const tasks = [task("fix2", ["fix1", "t1"]), task("fix1", ["t1"])];
    const sorted = topoSortTasks(tasks, new Set(["t1"])).map((t) => t.id);
    expect(sorted).toEqual(["fix1", "fix2"]);
  });

  it("still throws when a dependency is in neither the input nor knownExternalIds", () => {
    const tasks = [task("fix1", ["ghost"])];
    expect(() => topoSortTasks(tasks, new Set(["t1"]))).toThrow(
      "Unknown dependency"
    );
  });

  it("preserves independent tasks in input order", () => {
    const tasks = [task("x"), task("y")];
    expect(topoSortTasks(tasks).map((t) => t.id)).toEqual(["x", "y"]);
  });
});
