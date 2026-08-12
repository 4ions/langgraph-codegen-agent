import { describe, it, expect } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoderNode, isTestFile } from "../../src/nodes/coder.js";
import { makeState } from "../helpers/makeState.js";
import {
  capturingModel,
  fakeStructuredModel,
  promptDependentModel,
} from "../helpers/fakeModel.js";

describe("isTestFile", () => {
  it("recognizes .test.ts/.test.tsx files", () => {
    expect(isTestFile("src/utils/carFilters.test.ts")).toBe(true);
    expect(isTestFile("src/components/CarCard.test.tsx")).toBe(true);
  });

  it("recognizes files under a __tests__ directory", () => {
    expect(isTestFile("src/__tests__/CarInventory.test.tsx")).toBe(true);
  });

  it("does not match non-test files", () => {
    expect(isTestFile("src/components/CarCard.tsx")).toBe(false);
    expect(isTestFile("src/hooks/useCars.ts")).toBe(false);
  });
});

describe("coderNode", () => {
  it("writes each pending task to task.targetFile and records history + cost", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-"));
    try {
      const node = createCoderNode(
        fakeStructuredModel([
          { parsed: { content: "export const n = 1;" }, costUsd: 0.001 },
          { parsed: { content: "export const n = 2;" }, costUsd: 0.002 },
        ])
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "first", targetFile: "src/gen1.ts", dependsOn: [] },
          { id: "t2", description: "second", targetFile: "src/gen2.ts", dependsOn: ["t1"] },
        ],
      });

      const update = await node(state);

      expect(Object.keys(update.filesWritten ?? {})).toEqual([
        "src/gen1.ts",
        "src/gen2.ts",
      ]);
      expect(update.pendingTasks).toEqual([]);
      const written = await readFile(join(dir, "src/gen1.ts"), "utf8");
      expect(written).toBe("export const n = 1;");
      expect(update.history).toHaveLength(2);
      expect(update.history?.map((e) => e.costUsd)).toEqual([0.001, 0.002]);
      expect(update.history?.[0]?.detail).toBe("Wrote src/gen1.ts for task t1");
      expect(update.history?.[1]?.detail).toBe("Wrote src/gen2.ts for task t2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves dependency content from state.plan when the dependency is not in pendingTasks (post-fix-cycle case)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-fix-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export const fixed = true;" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        filesWritten: { "src/base.ts": "export const base = 1;" },
        plan: [{ id: "t1", description: "base", targetFile: "src/base.ts", dependsOn: [] }],
        validationResult: { typecheckOk: false, testOk: true, output: "type error in gen1" },
        maxCostUsd: 100,
        pendingTasks: [
          { id: "fix1", description: "fix", targetFile: "src/gen1.ts", dependsOn: ["t1"] },
        ],
      });

      await node(state);

      expect(capturedPrompts[0]).toContain("src/base.ts");
      expect(capturedPrompts[0]).toContain("export const base = 1;");
      expect(capturedPrompts[0]).toContain("type error in gen1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads preexisting boilerplate content from disk when the file is not in filesWritten", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-disk-"));
    try {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(
        join(dir, "src", "App.tsx"),
        "export const Existing = () => null;",
        "utf8"
      );

      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export const App = () => null;" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "wire app", targetFile: "src/App.tsx", dependsOn: [] },
        ],
      });

      await node(state);

      expect(capturedPrompts[0]).toContain("export const Existing = () => null;");
      expect(capturedPrompts[0]).toContain("This file already exists");
      expect(capturedPrompts[0]).not.toContain("This file does not exist yet");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("tells the model to create the file when it exists neither on disk nor in filesWritten", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-new-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export const brandNew = 1;" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "new file", targetFile: "src/New.tsx", dependsOn: [] },
        ],
      });

      await node(state);

      expect(capturedPrompts[0]).toContain("This file does not exist yet");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a failure instead of silently generating from scratch when the existing file cannot be read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-readfail-"));
    try {
      await mkdir(join(dir, "src", "App.tsx"), { recursive: true });

      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export {}" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "wire app", targetFile: "src/App.tsx", dependsOn: [] },
        ],
      });

      const update = await node(state);

      expect(capturedPrompts).toHaveLength(0);
      expect(update.history?.[0]?.detail).toContain("EISDIR");
      expect(update.pendingTasks?.map((t) => t.id)).toEqual(["t1"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes testing guidance only when the target file is a test file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-testguidance-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export {}" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "component", targetFile: "src/components/CarCard.tsx", dependsOn: [] },
          { id: "t2", description: "test", targetFile: "src/__tests__/CarCard.test.tsx", dependsOn: [] },
        ],
      });

      await node(state);

      expect(capturedPrompts[0]).not.toContain("getByLabelText");
      expect(capturedPrompts[1]).toContain("getByLabelText");
      expect(capturedPrompts[1]).toContain("MockedProvider");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gives a test-file task the real current source of already-generated implementation files, not just its declared dependency", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-implsources-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        fakeStructuredModel(
          [
            {
              parsed: {
                content:
                  "export const filterCarsByYear = (cars, year) => cars.filter((c) => c.year === year);",
              },
            },
            { parsed: { content: "export {}" } },
          ],
          capturedPrompts
        )
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "impl", description: "carFilters", targetFile: "src/utils/carFilters.ts", dependsOn: [] },
          {
            id: "test",
            description: "carFilters test",
            targetFile: "src/__tests__/carFilters.test.ts",
            dependsOn: [],
          },
        ],
      });

      await node(state);

      expect(capturedPrompts[1]).toContain("Currently generated source files");
      expect(capturedPrompts[1]).toContain(
        "export const filterCarsByYear = (cars, year) => cars.filter((c) => c.year === year);"
      );
      expect(capturedPrompts[1]).toContain("never guess");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gives a non-test component task the real current source of a child component it composes, not just its declared dependency", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-childprops-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        fakeStructuredModel(
          [
            {
              parsed: {
                content:
                  "export interface SearchBarProps { searchTerm: string; onSearchChange: (term: string) => void; }\nexport const SearchBar = (props: SearchBarProps) => null;",
              },
            },
            { parsed: { content: "export {}" } },
          ],
          capturedPrompts
        )
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "child", description: "search bar", targetFile: "src/components/SearchBar.tsx", dependsOn: [] },
          {
            id: "parent",
            description: "manager composing the search bar",
            targetFile: "src/components/CarInventoryManager.tsx",
            dependsOn: [],
          },
        ],
      });

      await node(state);

      expect(capturedPrompts[1]).toContain("Currently generated source files");
      expect(capturedPrompts[1]).toContain("searchTerm: string; onSearchChange: (term: string) => void");
      expect(capturedPrompts[1]).not.toContain("getByLabelText");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("isolates a failing task so the rest of the batch still gets written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-isolate-"));
    try {
      const node = createCoderNode(
        promptDependentModel((prompt) => {
          if (prompt.includes("src/boom.ts")) throw new Error("model exploded");
          return { content: "export const ok = true;" };
        })
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "boom", targetFile: "src/boom.ts", dependsOn: [] },
          { id: "t2", description: "fine", targetFile: "src/fine.ts", dependsOn: [] },
        ],
      });

      const update = await node(state);

      expect(Object.keys(update.filesWritten ?? {})).toEqual(["src/fine.ts"]);
      expect(update.history).toHaveLength(2);
      expect(update.history?.[0]?.detail).toContain("model exploded");
      expect(update.history?.[0]?.costUsd).toBe(0);
      const written = await readFile(join(dir, "src/fine.ts"), "utf8");
      expect(written).toBe("export const ok = true;");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a history entry instead of throwing when the target file is protected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-forbidden-"));
    try {
      const node = createCoderNode(
        fakeStructuredModel([{ parsed: { content: "{}" } }])
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "hijack", targetFile: "package.json", dependsOn: [] },
        ],
      });

      const update = await node(state);

      expect(update.filesWritten).toEqual({});
      expect(update.history?.[0]?.detail).toContain("protected file");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps failed tasks in pendingTasks and removes only the successful ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-pending-"));
    try {
      const node = createCoderNode(
        promptDependentModel((prompt) => {
          if (prompt.includes("src/boom.ts")) throw new Error("model exploded");
          return { content: "export const ok = true;" };
        })
      );
      const state = makeState({
        outputDir: dir,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "boom", targetFile: "src/boom.ts", dependsOn: [] },
          { id: "t2", description: "fine", targetFile: "src/fine.ts", dependsOn: [] },
        ],
      });

      const update = await node(state);

      expect(update.pendingTasks?.map((t) => t.id)).toEqual(["t1"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stops processing tasks once the accumulated cost reaches maxCostUsd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-budget-"));
    try {
      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        fakeStructuredModel(
          [{ parsed: { content: "export const n = 1;" }, costUsd: 0.4 }],
          capturedPrompts
        )
      );
      const state = makeState({
        outputDir: dir,
        history: [{ node: "planner", detail: "Planned 4 tasks", costUsd: 0.2 }],
        maxCostUsd: 1,
        pendingTasks: [
          { id: "t1", description: "1", targetFile: "src/a.ts", dependsOn: [] },
          { id: "t2", description: "2", targetFile: "src/b.ts", dependsOn: [] },
          { id: "t3", description: "3", targetFile: "src/c.ts", dependsOn: [] },
          { id: "t4", description: "4", targetFile: "src/d.ts", dependsOn: [] },
        ],
      });

      const update = await node(state);

      expect(capturedPrompts).toHaveLength(2);
      expect(update.pendingTasks?.map((t) => t.id)).toEqual(["t3", "t4"]);
      expect(
        update.history?.some((e) => e.detail.includes("cost budget"))
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes every already-generated source file in the prompt, even when their combined size is large", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-coder-sources-"));
    try {
      const filesWritten: Record<string, string> = {};
      for (let i = 0; i < 10; i += 1) {
        filesWritten[`src/mod${i}.ts`] =
          `export const mod${i} = () => null;\n` + `// padding\n`.repeat(120);
      }

      const capturedPrompts: string[] = [];
      const node = createCoderNode(
        capturingModel({ content: "export const next = 1;" }, capturedPrompts)
      );
      const state = makeState({
        outputDir: dir,
        filesWritten,
        maxCostUsd: 100,
        pendingTasks: [
          { id: "t1", description: "next", targetFile: "src/next.ts", dependsOn: [] },
        ],
      });

      await node(state);

      const prompt = capturedPrompts[0] ?? "";
      for (let i = 0; i < 10; i += 1) {
        expect(prompt).toContain(`export const mod${i} = () => null;`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
