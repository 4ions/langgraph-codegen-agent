import type { AgentStateType } from "../state.js";
import { writeGeneratedFile } from "../tools/fs.js";

export function createFinalizeNode() {
  return async function finalizeNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const validationOk = Boolean(
      state.validationResult?.typecheckOk && state.validationResult?.testOk
    );
    const reviewOk = state.reviewResult?.approved === true;
    const noPendingTasks = (state.pendingTasks?.length ?? 0) === 0;
    const outcome =
      validationOk && reviewOk && noPendingTasks
        ? "approved"
        : "retries_exhausted";

    const lastGreenFiles = state.lastGreenFiles ?? {};
    const greenEntries = Object.entries(lastGreenFiles);
    if (outcome === "retries_exhausted" && greenEntries.length > 0) {
      for (const [targetFile, content] of greenEntries) {
        await writeGeneratedFile(state.outputDir, targetFile, content);
      }
      return {
        outcome,
        filesWritten: lastGreenFiles,
        history: [
          {
            node: "finalize",
            detail: `Restored last known-good state (${greenEntries.length} files) after failing to improve on it`,
            costUsd: 0,
          },
          { node: "finalize", detail: `Outcome: ${outcome}`, costUsd: 0 },
        ],
      };
    }

    return {
      outcome,
      history: [{ node: "finalize", detail: `Outcome: ${outcome}`, costUsd: 0 }],
    };
  };
}
