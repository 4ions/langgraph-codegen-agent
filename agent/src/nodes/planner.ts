import { PlanSchema, type Plan } from "../schemas.js";
import type { AgentStateType } from "../state.js";
import { topoSortTasks } from "../tools/topoSort.js";
import type { StructuredCapableModel } from "../tools/structuredInvoke.js";
import { runLlmNode } from "./runLlmNode.js";
import {
  loadPlannerPromptTemplate,
  renderTemplate,
} from "../prompts/index.js";

export function createPlannerNode(model: StructuredCapableModel) {
  return async function plannerNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const prompt = renderTemplate(await loadPlannerPromptTemplate(), {
      specText: state.specText,
      boilerplateTree: state.boilerplateTree,
      referenceFiles: state.referenceFiles,
    });

    return runLlmNode<Plan>({
      node: "planner",
      failureLabel: "Planner",
      model,
      schema: PlanSchema,
      prompt,
      onSuccess: (parsed, costUsd) => {
        let sorted: Plan["tasks"];
        try {
          sorted = topoSortTasks(parsed.tasks);
        } catch (sortError) {
          throw new Error(
            `plan ordering failed: ${
              sortError instanceof Error ? sortError.message : String(sortError)
            }`
          );
        }
        return {
          plan: sorted,
          pendingTasks: sorted,
          history: [
            {
              node: "planner",
              detail: `Planned ${sorted.length} tasks`,
              costUsd,
            },
          ],
        };
      },
      onFailure: () => ({ plan: [], pendingTasks: [] }),
    });
  };
}
