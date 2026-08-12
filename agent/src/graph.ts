import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "./state.js";
import { createPlannerNode } from "./nodes/planner.js";
import { createCoderNode } from "./nodes/coder.js";
import { createValidatorNode } from "./nodes/validator.js";
import { createReviewerNode } from "./nodes/reviewer.js";
import { createFixerNode } from "./nodes/fixer.js";
import { createFinalizeNode } from "./nodes/finalize.js";
import type { StructuredCapableModel } from "./tools/structuredInvoke.js";
import type { runValidation as RunValidationFn } from "./tools/shell.js";

export interface GraphModels {
  planner: StructuredCapableModel;
  coder: StructuredCapableModel;
  reviewer: StructuredCapableModel;
  fixer: StructuredCapableModel;
}

export interface GraphDeps {
  runValidation?: typeof RunValidationFn;
}

function totalCostUsd(state: AgentStateType): number {
  return state.history.reduce((sum, entry) => sum + entry.costUsd, 0);
}

function budgetExhausted(state: AgentStateType): boolean {
  return totalCostUsd(state) >= state.maxCostUsd;
}

function routeAfterValidation(
  state: AgentStateType
): "reviewer" | "fixer" | "finalize" {
  const ok = Boolean(
    state.validationResult?.typecheckOk && state.validationResult?.testOk
  );
  if (ok && state.pendingTasks.length === 0) return "reviewer";
  if (state.retryCount >= state.maxRetryCycles) return "finalize";
  if (budgetExhausted(state)) return "finalize";
  return "fixer";
}

function routeAfterReview(state: AgentStateType): "finalize" | "fixer" {
  if (state.reviewResult?.approved) return "finalize";
  if (state.retryCount >= state.maxRetryCycles) return "finalize";
  if (budgetExhausted(state)) return "finalize";
  return "fixer";
}

export function buildGraph(models: GraphModels, deps: GraphDeps = {}) {
  const validatorNode = createValidatorNode(deps.runValidation);

  const graph = new StateGraph(AgentState)
    .addNode("planner", createPlannerNode(models.planner))
    .addNode("coder", createCoderNode(models.coder))
    .addNode("validator", validatorNode)
    .addNode("reviewer", createReviewerNode(models.reviewer))
    .addNode("fixer", createFixerNode(models.fixer))
    .addNode("finalize", createFinalizeNode())
    .addEdge(START, "planner")
    .addEdge("planner", "coder")
    .addEdge("coder", "validator")
    .addConditionalEdges("validator", routeAfterValidation, {
      reviewer: "reviewer",
      fixer: "fixer",
      finalize: "finalize",
    })
    .addConditionalEdges("reviewer", routeAfterReview, {
      finalize: "finalize",
      fixer: "fixer",
    })
    .addEdge("fixer", "coder")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}
