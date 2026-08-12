import "dotenv/config";
import { readdir, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildGraph, type GraphModels } from "./graph.js";
import {
  requireEnv,
  resolveMaxCostUsd,
  resolveMaxRetryCycles,
} from "./env.js";
import { createModelForRole } from "./llm.js";
import { runCommand } from "./tools/shell.js";
import type { AgentStateType } from "./state.js";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", ".vite"]);
const REFERENCE_FILES = [
  "src/types.ts",
  "src/graphql/queries.ts",
  "src/mocks/handlers.ts",
  "src/components/Example.tsx",
  "src/__tests__/Example.test.tsx",
];

export function parseArgs(argv: string[]): {
  specPath: string;
  outputDir: string;
  boilerplateDir: string;
} {
  function readFlag(name: string): string | undefined {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Flag ${name} requires a value`);
    }
    return value;
  }

  const specPath = readFlag("--spec");
  const outputDir = readFlag("--output");
  const boilerplateDir = readFlag("--boilerplate");

  if (!specPath) throw new Error("Missing required argument: --spec <path>");
  if (!outputDir) throw new Error("Missing required argument: --output <path>");

  return {
    specPath: resolve(process.cwd(), specPath),
    outputDir: resolve(process.cwd(), outputDir),
    boilerplateDir: resolve(
      process.cwd(),
      boilerplateDir ?? join(process.cwd(), "..", "Fullstack-Coding-Challenge-main")
    ),
  };
}

async function listFiles(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await listFiles(full, root, out);
    } else {
      out.push(relative(root, full));
    }
  }
}

export async function buildBoilerplateTree(dir: string): Promise<string> {
  const files: string[] = [];
  await listFiles(dir, dir, files);
  return files.sort().join("\n");
}

export async function copyBoilerplate(
  sourceDir: string,
  outputDir: string
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, {
    recursive: true,
    filter: (source: string) => {
      const base = source.split(/[\\/]/).pop() ?? "";
      return !SKIP_DIR_NAMES.has(base);
    },
  });
}

const MUI_FONT_LINKS = `    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
      rel="stylesheet"
    />
`;

export async function ensureMuiFontLinks(outputDir: string): Promise<void> {
  const indexPath = join(outputDir, "index.html");
  let html: string;
  try {
    html = await readFile(indexPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return;
  }
  if (html.includes("fonts.googleapis.com")) return;
  const patched = html.includes("</head>")
    ? html.replace("</head>", `${MUI_FONT_LINKS}  </head>`)
    : html;
  await writeFile(indexPath, patched, "utf8");
}

export async function loadReferenceFiles(outputDir: string): Promise<string> {
  const chunks: string[] = [];
  for (const relPath of REFERENCE_FILES) {
    try {
      const content = await readFile(join(outputDir, relPath), "utf8");
      chunks.push(`--- ${relPath} ---\n${content}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      continue;
    }
  }
  return chunks.join("\n\n");
}

export interface RunCliDeps {
  buildGraphFn?: typeof buildGraph;
  models?: GraphModels;
  installFn?: typeof runCommand;
}

export async function runCli(
  argv: string[],
  deps: RunCliDeps = {}
): Promise<AgentStateType> {
  const { specPath, outputDir, boilerplateDir } = parseArgs(argv);
  if (!deps.models) {
    requireEnv("OPENROUTER_API_KEY");
  }
  const specText = await readFile(specPath, "utf8");

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await copyBoilerplate(boilerplateDir, outputDir);
  await ensureMuiFontLinks(outputDir);
  const boilerplateTree = await buildBoilerplateTree(outputDir);
  const referenceFiles = await loadReferenceFiles(outputDir);

  const installFn = deps.installFn ?? runCommand;
  const install = await installFn("npm", ["install"], outputDir);
  if (install.exitCode !== 0) {
    throw new Error(
      `npm install failed in ${outputDir} (exit ${install.exitCode}):\n${install.stderr}`
    );
  }

  const maxRetryCycles = resolveMaxRetryCycles(process.env.MAX_RETRY_CYCLES);
  const maxCostUsd = resolveMaxCostUsd(process.env.MAX_COST_USD);
  const models: GraphModels =
    deps.models ?? {
      planner: createModelForRole("planner"),
      coder: createModelForRole("coder"),
      reviewer: createModelForRole("reviewer"),
      fixer: createModelForRole("fixer"),
    };
  const buildGraphFn = deps.buildGraphFn ?? buildGraph;
  const graph = buildGraphFn(models);

  const result = await graph.invoke(
    {
      specText,
      outputDir,
      boilerplateTree,
      referenceFiles,
      maxRetryCycles,
      maxCostUsd,
    },
    {
      recursionLimit: maxRetryCycles * 8 + 10,
      configurable: { thread_id: `run-${outputDir}` },
    }
  );
  return result as AgentStateType;
}

export function formatRunReport(result: AgentStateType): string {
  const totalCost = result.history.reduce((sum, entry) => sum + entry.costUsd, 0);
  const lines = [
    `Outcome: ${result.outcome}`,
    `Retry cycles used: ${result.retryCount}`,
    `Total cost: $${totalCost.toFixed(4)}`,
    "Node history:",
    ...result.history.map(
      (entry) => `[${entry.node}] ${entry.detail} ($${entry.costUsd.toFixed(4)})`
    ),
  ];
  if (result.outcome === "retries_exhausted") {
    lines.push(
      "Unresolved — last validation/review output:",
      result.validationResult?.output ?? result.reviewResult?.notes.join("\n") ?? ""
    );
  }
  return lines.join("\n");
}

async function main() {
  try {
    const result = await runCli(process.argv.slice(2));
    console.log(formatRunReport(result));
    process.exit(result.outcome === "approved" ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
