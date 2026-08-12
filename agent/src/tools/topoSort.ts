import type { Task } from "../schemas.js";

export function topoSortTasks(
  tasks: Task[],
  knownExternalIds: Set<string> = new Set()
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const sorted: Task[] = [];

  function visit(task: Task) {
    if (visited.has(task.id)) return;
    if (inProgress.has(task.id)) {
      throw new Error(`Circular dependency detected at task "${task.id}"`);
    }
    inProgress.add(task.id);
    for (const depId of task.dependsOn) {
      const dep = byId.get(depId);
      if (!dep) {
        if (knownExternalIds.has(depId)) continue;
        throw new Error(
          `Unknown dependency "${depId}" referenced by task "${task.id}"`
        );
      }
      visit(dep);
    }
    inProgress.delete(task.id);
    visited.add(task.id);
    sorted.push(task);
  }

  for (const task of tasks) visit(task);
  return sorted;
}
