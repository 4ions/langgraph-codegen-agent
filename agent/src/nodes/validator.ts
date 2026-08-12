import type { AgentStateType } from "../state.js";
import { runValidation } from "../tools/shell.js";

export function createValidatorNode(
  runValidationFn: typeof runValidation = runValidation
) {
  return async function validatorNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const validationResult = await runValidationFn(state.outputDir);
    const isGreen = validationResult.typecheckOk && validationResult.testOk;
    return {
      validationResult,
      lastGreenFiles: isGreen ? state.filesWritten : state.lastGreenFiles,
      history: [
        {
          node: "validator",
          detail: `typecheck=${validationResult.typecheckOk} test=${validationResult.testOk}`,
          costUsd: 0,
        },
      ],
    };
  };
}
