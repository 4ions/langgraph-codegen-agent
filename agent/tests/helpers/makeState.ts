import type { AgentStateType } from "../../src/state.js";

export function makeState(
  overrides: Partial<AgentStateType> = {}
): AgentStateType {
  return {
    specText: "",
    outputDir: "",
    boilerplateTree: "",
    referenceFiles: "",
    plan: [],
    pendingTasks: [],
    filesWritten: {},
    lastGreenFiles: {},
    validationResult: null,
    reviewResult: null,
    retryCount: 0,
    maxRetryCycles: 3,
    maxCostUsd: 2,
    outcome: "in_progress",
    history: [],
    ...overrides,
  };
}
