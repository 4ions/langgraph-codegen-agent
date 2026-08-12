import {
  CoderOutputSchema,
  type CoderOutput,
  type HistoryEntry,
  type Task,
} from "../schemas.js";
import type { AgentStateType } from "../state.js";
import {
  invokeStructured,
  type StructuredCapableModel,
} from "../tools/structuredInvoke.js";
import { truncateText } from "../tools/truncate.js";
import {
  readGeneratedFileIfExists,
  writeGeneratedFile,
} from "../tools/fs.js";
import {
  loadCoderExistingFileSection,
  loadCoderFailureSection,
  loadCoderMissingFileSection,
  loadCoderPromptTemplate,
  loadCoderSourcesSection,
  loadStyleGuidance,
  loadTestingGuidance,
  renderTemplate,
} from "../prompts/index.js";
import { PROMPT_LIMITS } from "../promptLimits.js";
import {
  CODER_FAILURE_PREFIX,
  describeLastFailure,
} from "./describeFailure.js";

export { CODER_FAILURE_PREFIX };

export function isTestFile(targetFile: string): boolean {
  return /\.test\.[jt]sx?$/.test(targetFile) || targetFile.includes("__tests__/");
}

function resolveDependencyContext(
  task: Task,
  allKnownTasks: Map<string, Task>,
  filesWritten: Record<string, string>
): string {
  return task.dependsOn
    .map((depId) => {
      const depTask = allKnownTasks.get(depId);
      const path = depTask?.targetFile;
      const content = path ? filesWritten[path] : undefined;
      return path && content
        ? `--- ${path} ---\n${truncateText(content, PROMPT_LIMITS.dependencyFileChars)}`
        : null;
    })
    .filter((chunk): chunk is string => chunk !== null)
    .join("\n\n");
}

function collectImplementationSources(filesWritten: Record<string, string>): string {
  return Object.entries(filesWritten)
    .filter(([path]) => !isTestFile(path))
    .map(([path, content]) => `--- ${path} ---\n${truncateText(content, PROMPT_LIMITS.implementationFileChars)}`)
    .join("\n\n");
}

async function buildCoderPrompt(
  task: Task,
  dependencyContext: string,
  referenceFiles: string,
  existingContent: string | undefined,
  lastFailure: string,
  implementationSources: string
): Promise<string> {
  const [template, styleGuidance] = await Promise.all([
    loadCoderPromptTemplate(),
    loadStyleGuidance(),
  ]);

  const testingGuidance = isTestFile(task.targetFile)
    ? await loadTestingGuidance()
    : "";

  const implementationSourcesSection = implementationSources
    ? renderTemplate(await loadCoderSourcesSection(), {
        implementationSources: truncateText(implementationSources, PROMPT_LIMITS.implementationSourcesChars),
      })
    : "";

  const existingContentSection = existingContent
    ? renderTemplate(await loadCoderExistingFileSection(), {
        existingContent: truncateText(existingContent, PROMPT_LIMITS.existingFileChars),
      })
    : await loadCoderMissingFileSection();

  const lastFailureSection = lastFailure
    ? renderTemplate(await loadCoderFailureSection(), {
        lastFailure: truncateText(lastFailure, PROMPT_LIMITS.lastFailureChars),
      })
    : "";

  return renderTemplate(template, {
    taskDescription: task.description,
    targetFile: task.targetFile,
    styleGuidance,
    testingGuidance,
    implementationSourcesSection,
    dependencyContext: dependencyContext || "(none)",
    referenceFiles: truncateText(referenceFiles, PROMPT_LIMITS.referenceFilesChars),
    existingContentSection,
    lastFailureSection,
  });
}

export function createCoderNode(model: StructuredCapableModel) {
  return async function coderNode(
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    const filesWritten: Record<string, string> = { ...state.filesWritten };
    const history: HistoryEntry[] = [];
    const allKnownTasks = new Map(
      [...state.plan, ...state.pendingTasks].map((t) => [t.id, t] as const)
    );
    const lastFailure = describeLastFailure(state);
    const completedTaskIds = new Set<string>();
    const priorCostUsd = state.history.reduce(
      (sum, entry) => sum + entry.costUsd,
      0
    );

    for (const task of state.pendingTasks) {
      const spentSoFar =
        priorCostUsd + history.reduce((sum, entry) => sum + entry.costUsd, 0);
      if (spentSoFar >= state.maxCostUsd) {
        history.push({
          node: "coder",
          detail: `Stopped before task ${task.id}: cost budget of $${state.maxCostUsd} reached`,
          costUsd: 0,
        });
        break;
      }
      try {
        const dependencyContext = resolveDependencyContext(
          task,
          allKnownTasks,
          filesWritten
        );
        const existingContent =
          filesWritten[task.targetFile] ??
          (await readGeneratedFileIfExists(state.outputDir, task.targetFile));
        const { parsed, costUsd } = await invokeStructured<CoderOutput>(
          model,
          CoderOutputSchema,
          await buildCoderPrompt(
            task,
            dependencyContext,
            state.referenceFiles,
            existingContent,
            lastFailure,
            collectImplementationSources(filesWritten)
          )
        );

        await writeGeneratedFile(
          state.outputDir,
          task.targetFile,
          parsed.content
        );
        filesWritten[task.targetFile] = parsed.content;
        completedTaskIds.add(task.id);
        history.push({
          node: "coder",
          detail: `Wrote ${task.targetFile} for task ${task.id}`,
          costUsd,
        });
      } catch (error) {
        history.push({
          node: "coder",
          detail: `${CODER_FAILURE_PREFIX} ${task.id} targeting ${task.targetFile}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          costUsd: 0,
        });
      }
    }

    return {
      filesWritten,
      pendingTasks: state.pendingTasks.filter(
        (task) => !completedTaskIds.has(task.id)
      ),
      history,
    };
  };
}
