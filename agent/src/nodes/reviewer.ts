import { ReviewOutputSchema, type ReviewOutput } from "../schemas.js";
import type { AgentStateType } from "../state.js";
import type { StructuredCapableModel } from "../tools/structuredInvoke.js";
import { truncateText } from "../tools/truncate.js";
import { PROMPT_LIMITS } from "../promptLimits.js";
import { runLlmNode } from "./runLlmNode.js";
import {
  loadReviewerPromptTemplate,
  renderTemplate,
} from "../prompts/index.js";

function formatGeneratedFiles(filesWritten: Record<string, string>): string {
  return truncateText(
    Object.entries(filesWritten)
      .map(
        ([path, content]) =>
          `--- ${path} ---\n${truncateText(content, PROMPT_LIMITS.reviewerFileChars)}`
      )
      .join("\n\n"),
    PROMPT_LIMITS.generatedFilesChars
  );
}

export function createReviewerNode(model: StructuredCapableModel) {
  return async function reviewerNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const prompt = renderTemplate(await loadReviewerPromptTemplate(), {
      specText: state.specText,
      generatedFiles: formatGeneratedFiles(state.filesWritten),
    });

    return runLlmNode<ReviewOutput>({
      node: "reviewer",
      failureLabel: "Reviewer",
      model,
      schema: ReviewOutputSchema,
      prompt,
      onSuccess: (parsed, costUsd) => ({
        reviewResult: parsed,
        history: [
          { node: "reviewer", detail: `approved=${parsed.approved}`, costUsd },
        ],
      }),
      onFailure: (detail) => ({
        reviewResult: { approved: false, notes: [detail] },
      }),
    });
  };
}
