import type { AgentStateType } from "../state.js";

export const CODER_FAILURE_PREFIX = "Failed task";

const UNKNOWN_FAILURE =
  "Unknown failure — re-examine the generated files against the spec.";

interface FailureSection {
  label: string;
  body: string;
}

function primaryFailure(state: AgentStateType): FailureSection | undefined {
  if (
    state.validationResult &&
    !(state.validationResult.typecheckOk && state.validationResult.testOk)
  ) {
    return { label: "Validation output", body: state.validationResult.output };
  }
  if (state.reviewResult && !state.reviewResult.approved) {
    return { label: "Review notes", body: state.reviewResult.notes.join("\n") };
  }
  return undefined;
}

function coderFailureDetails(state: AgentStateType): string[] {
  const lastFixerIndex = state.history.reduce(
    (last, entry, index) => (entry.node === "fixer" ? index : last),
    -1
  );
  return state.history
    .slice(lastFixerIndex + 1)
    .filter(
      (entry) =>
        entry.node === "coder" && entry.detail.startsWith(CODER_FAILURE_PREFIX)
    )
    .map((entry) => entry.detail);
}

export function describeLastFailure(state: AgentStateType): string {
  return primaryFailure(state)?.body ?? "";
}

export function describeFailureForFixer(state: AgentStateType): string {
  const sections: string[] = [];
  const primary = primaryFailure(state);
  if (primary) {
    sections.push(`${primary.label}:\n${primary.body}`);
  }

  const coderFailures = coderFailureDetails(state);
  if (coderFailures.length > 0) {
    sections.push(
      `Code generation failures from the previous cycle:\n${coderFailures.join("\n")}`
    );
  }

  if (sections.length === 0) return UNKNOWN_FAILURE;
  return sections.join("\n\n");
}
