import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string>();

async function loadPromptFile(relativePath: string): Promise<string> {
  const cached = cache.get(relativePath);
  if (cached !== undefined) return cached;
  const content = (await readFile(join(PROMPTS_DIR, relativePath), "utf8"))
    .trimEnd();
  cache.set(relativePath, content);
  return content;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  );
}

export function loadStyleGuidance(): Promise<string> {
  return loadPromptFile("guidance/style.md");
}

export function loadTestingGuidance(): Promise<string> {
  return loadPromptFile("guidance/testing.md");
}

export function loadCoderPromptTemplate(): Promise<string> {
  return loadPromptFile("coder.md");
}

export function loadCoderSourcesSection(): Promise<string> {
  return loadPromptFile("coder/sources.md");
}

export function loadCoderExistingFileSection(): Promise<string> {
  return loadPromptFile("coder/existing.md");
}

export function loadCoderMissingFileSection(): Promise<string> {
  return loadPromptFile("coder/missing.md");
}

export function loadCoderFailureSection(): Promise<string> {
  return loadPromptFile("coder/failure.md");
}

export function loadPlannerPromptTemplate(): Promise<string> {
  return loadPromptFile("planner.md");
}

export function loadReviewerPromptTemplate(): Promise<string> {
  return loadPromptFile("reviewer.md");
}

export function loadFixerPromptTemplate(): Promise<string> {
  return loadPromptFile("fixer.md");
}
