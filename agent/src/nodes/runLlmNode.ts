import type { AgentStateType } from "../state.js";
import type { NodeName } from "../schemas.js";
import {
  invokeStructured,
  type StructuredCapableModel,
} from "../tools/structuredInvoke.js";

export interface LlmNodeSpec<T> {
  node: NodeName;
  failureLabel: string;
  model: StructuredCapableModel;
  schema: unknown;
  prompt: string;
  onSuccess: (
    parsed: T,
    costUsd: number
  ) => Partial<AgentStateType> | Promise<Partial<AgentStateType>>;
  onFailure?: (detail: string) => Partial<AgentStateType>;
}

export async function runLlmNode<T>(
  spec: LlmNodeSpec<T>
): Promise<Partial<AgentStateType>> {
  try {
    const { parsed, costUsd } = await invokeStructured<T>(
      spec.model,
      spec.schema,
      spec.prompt
    );
    return await spec.onSuccess(parsed, costUsd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = `${spec.failureLabel} LLM call failed: ${message}`;
    return {
      ...spec.onFailure?.(detail),
      history: [{ node: spec.node, detail, costUsd: 0 }],
    };
  }
}
