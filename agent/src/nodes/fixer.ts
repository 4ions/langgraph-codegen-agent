import {
  FixOutputSchema,
  type FixOutput,
  type HistoryEntry,
} from "../schemas.js";
import type { AgentStateType } from "../state.js";
import type { StructuredCapableModel } from "../tools/structuredInvoke.js";
import { truncateText } from "../tools/truncate.js";
import { topoSortTasks } from "../tools/topoSort.js";
import { PROMPT_LIMITS } from "../promptLimits.js";
import { describeFailureForFixer } from "./describeFailure.js";
import { runLlmNode } from "./runLlmNode.js";
import { loadFixerPromptTemplate, renderTemplate } from "../prompts/index.js";

function formatGeneratedFiles(filesWritten: Record<string, string>): string {
  return truncateText(
    Object.entries(filesWritten)
      .map(
        ([path, content]) =>
          `--- ${path} ---\n${truncateText(content, PROMPT_LIMITS.fixerFileChars)}`
      )
      .join("\n\n"),
    PROMPT_LIMITS.generatedFilesChars
  );
}

export function createFixerNode(model: StructuredCapableModel) {
  return async function fixerNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const prompt = renderTemplate(await loadFixerPromptTemplate(), {
      specText: state.specText,
      generatedFiles: formatGeneratedFiles(state.filesWritten),
      failureDetail: truncateText(
        describeFailureForFixer(state),
        PROMPT_LIMITS.failureDetailChars
      ),
    });

    return runLlmNode<FixOutput>({
      node: "fixer",
      failureLabel: "Fixer",
      model,
      schema: FixOutputSchema,
      prompt,
      onSuccess: (parsed, costUsd) => {
        const history: HistoryEntry[] = [];
        let sortedTasks: typeof parsed.tasks;
        try {
          sortedTasks = topoSortTasks(
            parsed.tasks,
            new Set(state.plan.map((task) => task.id))
          );
        } catch (error) {
          sortedTasks = parsed.tasks;
          history.push({
            node: "fixer",
            detail: `Could not determine fix task order, running them as returned: ${
              error instanceof Error ? error.message : String(error)
            }`,
            costUsd: 0,
          });
        }

        const byTargetFile = new Map<string, (typeof sortedTasks)[number]>();
        for (const task of sortedTasks) {
          byTargetFile.delete(task.targetFile);
          byTargetFile.set(task.targetFile, task);
        }
        const dedupedTasks = [...byTargetFile.values()];

        history.push({
          node: "fixer",
          detail: `Root cause: ${truncateText(parsed.rootCause, PROMPT_LIMITS.rootCauseChars)} — queued ${dedupedTasks.length} fix task(s)`,
          costUsd,
        });

        const mergedPlan = new Map(
          [...state.plan, ...parsed.tasks].map(
            (task) => [task.id, task] as const
          )
        );

        return {
          plan: [...mergedPlan.values()],
          pendingTasks: dedupedTasks,
          retryCount: state.retryCount + 1,
          history,
        };
      },
      onFailure: () => ({
        pendingTasks: [],
        retryCount: state.retryCount + 1,
      }),
    });
  };
}
