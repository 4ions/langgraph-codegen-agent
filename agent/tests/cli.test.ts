import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseArgs,
  buildBoilerplateTree,
  copyBoilerplate,
  ensureMuiFontLinks,
  runCli,
  loadReferenceFiles,
  formatRunReport,
} from "../src/cli.js";
import { resolveMaxRetryCycles, resolveMaxCostUsd } from "../src/env.js";
import { makeState } from "./helpers/makeState.js";

describe("resolveMaxRetryCycles", () => {
  it("parses a valid numeric value", () => {
    expect(resolveMaxRetryCycles("5")).toBe(5);
    expect(resolveMaxRetryCycles("0")).toBe(0);
  });

  it("falls back to 3 for undefined, empty, non-numeric, or negative values", () => {
    expect(resolveMaxRetryCycles(undefined)).toBe(3);
    expect(resolveMaxRetryCycles("")).toBe(3);
    expect(resolveMaxRetryCycles("many")).toBe(3);
    expect(resolveMaxRetryCycles("-1")).toBe(3);
    expect(resolveMaxRetryCycles("Infinity")).toBe(3);
  });
});

describe("resolveMaxCostUsd", () => {
  it("parses a valid numeric value and falls back to 2 otherwise", () => {
    expect(resolveMaxCostUsd("0.5")).toBe(0.5);
    expect(resolveMaxCostUsd(undefined)).toBe(2);
    expect(resolveMaxCostUsd("free")).toBe(2);
    expect(resolveMaxCostUsd("-3")).toBe(2);
  });
});

describe("parseArgs", () => {
  it("extracts and resolves --spec, --output, --boilerplate to absolute paths", () => {
    const result = parseArgs([
      "--spec",
      "./spec.txt",
      "--output",
      "./generated-app",
      "--boilerplate",
      "./boilerplate",
    ]);
    expect(result.specPath.endsWith("spec.txt")).toBe(true);
    expect(result.specPath.startsWith("/")).toBe(true);
    expect(result.outputDir.startsWith("/")).toBe(true);
  });

  it("throws when --spec is missing", () => {
    expect(() => parseArgs(["--output", "./out"])).toThrow("--spec");
  });

  it("throws when --output is missing", () => {
    expect(() => parseArgs(["--spec", "./spec.txt"])).toThrow("--output");
  });

  it("throws when a flag's value looks like another flag", () => {
    expect(() => parseArgs(["--spec", "--output", "./out"])).toThrow(
      "requires a value"
    );
  });
});

describe("buildBoilerplateTree", () => {
  it("lists files recursively, skipping node_modules and .git", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-tree-"));
    try {
      await mkdir(join(dir, "src"), { recursive: true });
      await mkdir(join(dir, "node_modules", "x"), { recursive: true });
      await writeFile(join(dir, "src", "App.tsx"), "", "utf8");
      await writeFile(join(dir, "node_modules", "x", "index.js"), "", "utf8");

      const tree = await buildBoilerplateTree(dir);

      expect(tree).toContain("src/App.tsx");
      expect(tree).not.toContain("node_modules");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("copyBoilerplate", () => {
  it("copies files from source to output, skipping node_modules", async () => {
    const source = await mkdtemp(join(tmpdir(), "agent-cli-src-"));
    const output = await mkdtemp(join(tmpdir(), "agent-cli-out-"));
    try {
      await mkdir(join(source, "src"), { recursive: true });
      await writeFile(join(source, "src", "App.tsx"), "export {}", "utf8");
      await mkdir(join(source, "node_modules"), { recursive: true });
      await writeFile(join(source, "node_modules", "junk.js"), "", "utf8");

      await copyBoilerplate(source, output);

      const copied = await readFile(join(output, "src", "App.tsx"), "utf8");
      expect(copied).toBe("export {}");
      const { access } = await import("node:fs/promises");
      await expect(access(join(output, "node_modules", "junk.js"))).rejects.toThrow();
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});

describe("runCli", () => {
  const savedEnv = {
    MAX_RETRY_CYCLES: process.env.MAX_RETRY_CYCLES,
    MAX_COST_USD: process.env.MAX_COST_USD,
  };

  beforeEach(() => {
    delete process.env.MAX_RETRY_CYCLES;
    delete process.env.MAX_COST_USD;
  });

  afterEach(() => {
    if (savedEnv.MAX_RETRY_CYCLES === undefined) {
      delete process.env.MAX_RETRY_CYCLES;
    } else {
      process.env.MAX_RETRY_CYCLES = savedEnv.MAX_RETRY_CYCLES;
    }
    if (savedEnv.MAX_COST_USD === undefined) {
      delete process.env.MAX_COST_USD;
    } else {
      process.env.MAX_COST_USD = savedEnv.MAX_COST_USD;
    }
  });

  it("copies the boilerplate, installs deps, and runs the graph with the loaded spec", async () => {
    const source = await mkdtemp(join(tmpdir(), "agent-cli-run-src-"));
    const output = await mkdtemp(join(tmpdir(), "agent-cli-run-out-"));
    try {
      await mkdir(join(source, "src"), { recursive: true });
      await writeFile(join(source, "package.json"), "{}", "utf8");
      await writeFile(join(source, "src", "App.tsx"), "export {}", "utf8");
      const specPath = join(source, "spec.txt");
      await writeFile(specPath, "build a car inventory app", "utf8");

      let capturedInput: Record<string, unknown> | undefined;
      let capturedConfig: Record<string, any> | undefined;
      let installCalled = false;
      const fakeGraph = {
        invoke: async (input: Record<string, unknown>, config: Record<string, any>) => {
          capturedInput = input;
          capturedConfig = config;
          return {
            outcome: "approved",
            retryCount: 0,
            history: [{ node: "planner", detail: "ok", costUsd: 0.01 }],
          };
        },
      };

      const result = await runCli(
        ["--spec", specPath, "--output", output, "--boilerplate", source],
        {
          buildGraphFn: () => fakeGraph as any,
          models: {} as any,
          installFn: async () => {
            installCalled = true;
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        }
      );

      expect(result.outcome).toBe("approved");
      expect(installCalled).toBe(true);
      expect(capturedInput?.specText).toBe("build a car inventory app");
      expect(capturedInput?.outputDir).toBe(output);
      expect(capturedInput?.boilerplateTree).toContain("src/App.tsx");
      expect(capturedInput?.referenceFiles).toBe("");
      expect(capturedInput?.maxRetryCycles).toBe(3);
      expect(capturedInput?.maxCostUsd).toBe(2);
      expect(capturedConfig?.configurable?.thread_id).toBe(`run-${output}`);
      expect(capturedConfig?.recursionLimit).toBe(34);
      const copied = await readFile(join(output, "src", "App.tsx"), "utf8");
      expect(copied).toBe("export {}");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it("wipes files left over from a previous run in an existing output directory", async () => {
    const source = await mkdtemp(join(tmpdir(), "agent-cli-clean-src-"));
    const output = await mkdtemp(join(tmpdir(), "agent-cli-clean-out-"));
    try {
      await mkdir(join(source, "src"), { recursive: true });
      await writeFile(join(source, "package.json"), "{}", "utf8");
      await writeFile(join(source, "src", "App.tsx"), "export {}", "utf8");
      const specPath = join(source, "spec.txt");
      await writeFile(specPath, "spec", "utf8");

      await mkdir(join(output, "src"), { recursive: true });
      await writeFile(join(output, "src", "Stale.tsx"), "stale", "utf8");

      await runCli(
        ["--spec", specPath, "--output", output, "--boilerplate", source],
        {
          buildGraphFn: () => ({ invoke: async () => ({}) }) as any,
          models: {} as any,
          installFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        }
      );

      const { access } = await import("node:fs/promises");
      await expect(access(join(output, "src", "Stale.tsx"))).rejects.toThrow();
      expect(await readFile(join(output, "src", "App.tsx"), "utf8")).toBe(
        "export {}"
      );
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it("fails fast when OPENROUTER_API_KEY is missing and no models are injected", async () => {
    const source = await mkdtemp(join(tmpdir(), "agent-cli-nokey-src-"));
    const output = join(tmpdir(), "agent-cli-nokey-out");
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await writeFile(join(source, "package.json"), "{}", "utf8");
      const specPath = join(source, "spec.txt");
      await writeFile(specPath, "spec", "utf8");

      let installCalled = false;
      await expect(
        runCli(["--spec", specPath, "--output", output, "--boilerplate", source], {
          buildGraphFn: () => ({ invoke: async () => ({}) }) as any,
          installFn: async () => {
            installCalled = true;
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        })
      ).rejects.toThrow("OPENROUTER_API_KEY");
      expect(installCalled).toBe(false);
      const { access } = await import("node:fs/promises");
      await expect(access(output)).rejects.toThrow();
    } finally {
      if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it("throws a clear error when npm install fails, without invoking the graph", async () => {
    const source = await mkdtemp(join(tmpdir(), "agent-cli-fail-src-"));
    const output = await mkdtemp(join(tmpdir(), "agent-cli-fail-out-"));
    try {
      await writeFile(join(source, "package.json"), "{}", "utf8");
      const specPath = join(source, "spec.txt");
      await writeFile(specPath, "spec", "utf8");

      let graphInvoked = false;
      await expect(
        runCli(["--spec", specPath, "--output", output, "--boilerplate", source], {
          buildGraphFn: () =>
            ({
              invoke: async () => {
                graphInvoked = true;
                return {};
              },
            }) as any,
          models: {} as any,
          installFn: async () => ({ exitCode: 1, stdout: "", stderr: "network error" }),
        })
      ).rejects.toThrow("npm install failed");
      expect(graphInvoked).toBe(false);
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});

describe("ensureMuiFontLinks", () => {
  it("injects the Roboto font links before </head>", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-font-"));
    try {
      await writeFile(
        join(dir, "index.html"),
        "<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>",
        "utf8"
      );

      await ensureMuiFontLinks(dir);

      const patched = await readFile(join(dir, "index.html"), "utf8");
      expect(patched).toContain("fonts.googleapis.com");
      expect(patched).toContain("Roboto");
      expect(patched.indexOf("fonts.googleapis.com")).toBeLessThan(patched.indexOf("</head>"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate the font links if already present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-font-dup-"));
    try {
      const html =
        '<!doctype html>\n<html>\n  <head>\n    <link href="https://fonts.googleapis.com/x" rel="stylesheet" />\n  </head>\n  <body></body>\n</html>';
      await writeFile(join(dir, "index.html"), html, "utf8");

      await ensureMuiFontLinks(dir);

      const patched = await readFile(join(dir, "index.html"), "utf8");
      expect(patched).toBe(html);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does nothing if index.html does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-font-missing-"));
    try {
      await ensureMuiFontLinks(dir);

      const { access } = await import("node:fs/promises");
      await expect(access(join(dir, "index.html"))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rethrows a non-ENOENT read failure instead of silently skipping the patch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-font-eisdir-"));
    try {
      await mkdir(join(dir, "index.html"), { recursive: true });

      await expect(ensureMuiFontLinks(dir)).rejects.toThrow(/EISDIR/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadReferenceFiles", () => {
  it("includes files that exist and skips the ones that do not", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-refs-"));
    try {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(
        join(dir, "src", "types.ts"),
        "export interface Car { id: string }",
        "utf8"
      );

      const refs = await loadReferenceFiles(dir);

      expect(refs).toContain("--- src/types.ts ---");
      expect(refs).toContain("export interface Car { id: string }");
      expect(refs).not.toContain("src/graphql/queries.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rethrows a non-ENOENT read failure instead of skipping the reference file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-cli-refs-eisdir-"));
    try {
      await mkdir(join(dir, "src", "types.ts"), { recursive: true });

      await expect(loadReferenceFiles(dir)).rejects.toThrow(/EISDIR/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("formatRunReport", () => {
  const baseState = makeState({
    outcome: "approved",
    retryCount: 2,
    history: [
      { node: "planner", detail: "Planned 3 tasks", costUsd: 0.01 },
      { node: "coder", detail: "Wrote src/a.ts for task t1", costUsd: 0.02 },
    ],
  });

  it("reports outcome, retry count, total cost, and per-node history", () => {
    const report = formatRunReport(baseState);
    expect(report).toContain("Outcome: approved");
    expect(report).toContain("Retry cycles used: 2");
    expect(report).toContain("Total cost: $0.0300");
    expect(report).toContain("[planner] Planned 3 tasks ($0.0100)");
    expect(report).toContain("[coder] Wrote src/a.ts for task t1 ($0.0200)");
  });

  it("omits the unresolved section when approved", () => {
    const report = formatRunReport(baseState);
    expect(report).not.toContain("Unresolved");
  });

  it("includes the last validation output when retries are exhausted", () => {
    const failedState = makeState({
      ...baseState,
      outcome: "retries_exhausted",
      validationResult: { typecheckOk: false, testOk: true, output: "type error in App.tsx" },
    });

    const report = formatRunReport(failedState);
    expect(report).toContain("Unresolved — last validation/review output:");
    expect(report).toContain("type error in App.tsx");
  });

  it("falls back to review notes when there is no validation output", () => {
    const failedState = makeState({
      ...baseState,
      outcome: "retries_exhausted",
      reviewResult: { approved: false, notes: ["missing search bar"] },
    });

    const report = formatRunReport(failedState);
    expect(report).toContain("missing search bar");
  });
});
