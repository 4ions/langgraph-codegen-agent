import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runCommand,
  runValidation,
  buildChildEnv,
  summarizeValidationOutput,
} from "../src/tools/shell.js";

describe("runCommand", () => {
  it("resolves with exitCode 1 instead of throwing when the binary does not exist", async () => {
    const result = await runCommand("definitely-not-a-real-binary-xyz", [], process.cwd());
    expect(result.exitCode).toBe(1);
  }, 10_000);

  it("kills a command that never exits and resolves with a timeout message", async () => {
    const result = await runCommand(
      "node",
      ["-e", "setInterval(() => {}, 1000)"],
      process.cwd(),
      500
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("timed out");
  }, 10_000);

  it("does not leak secret-looking environment variables to the child process", async () => {
    process.env.FAKE_API_KEY = "super-secret-value";
    try {
      const result = await runCommand(
        "node",
        ["-e", "console.log(String(process.env.FAKE_API_KEY))"],
        process.cwd(),
        10_000
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("super-secret-value");
      expect(result.stdout.trim()).toBe("undefined");
    } finally {
      delete process.env.FAKE_API_KEY;
    }
  }, 15_000);
});

describe("buildChildEnv", () => {
  it("strips key/token/secret/password variables and keeps the rest", () => {
    const env = buildChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      NODE_ENV: "test",
      OPENROUTER_API_KEY: "sk-or-x",
      github_token: "ghp_x",
      MY_SECRET: "s",
      DB_PASSWORD: "p",
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/dev", NODE_ENV: "test" });
  });
});

describe("runValidation", () => {
  it("reports typecheckOk/testOk based on each script's exit code", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-shell-"));
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          scripts: {
            typecheck: "node -e \"process.exit(0)\"",
            test: "node -e \"console.error('boom'); process.exit(1)\"",
          },
        }),
        "utf8"
      );

      const result = await runValidation(dir);

      expect(result.typecheckOk).toBe(true);
      expect(result.testOk).toBe(false);
      expect(result.output).toContain("boom");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("summarizeValidationOutput", () => {
  it("keeps the error lines and their following context line while dropping bulk noise", () => {
    const noise = Array.from(
      { length: 2000 },
      (_, i) => `stdout noise line ${i} rendering component tree`
    );
    const lines = [...noise];
    lines.splice(500, 0, "src/components/CarCard.tsx(12,5): error TS2322: Type 'string' is not assignable.");
    lines.splice(900, 0, " FAIL  src/__tests__/CarList.test.tsx");
    lines.splice(1200, 0, "AssertionError: expected 3 to be 4");
    lines.splice(1201, 0, "  - Expected: 4");
    lines.splice(1600, 0, "TestingLibraryElementError: Unable to find an element with the text: Toyota");
    const raw = lines.join("\n");

    const summary = summarizeValidationOutput(raw);

    expect(raw.length).toBeGreaterThan(50_000);
    expect(summary.length).toBeLessThan(raw.length / 10);
    expect(summary).toContain("error TS2322");
    expect(summary).toContain("FAIL  src/__tests__/CarList.test.tsx");
    expect(summary).toContain("AssertionError: expected 3 to be 4");
    expect(summary).toContain("- Expected: 4");
    expect(summary).toContain("Unable to find an element with the text: Toyota");
    expect(summary).not.toContain("stdout noise line 42 ");
  });

  it("keeps library-level console errors that a generated component swallowed", () => {
    const noise = Array.from(
      { length: 2000 },
      (_, i) => `stdout noise line ${i} rendering component tree`
    );
    const lines = [...noise];
    lines.splice(
      700,
      0,
      "console.error: No more mocked responses for the query: query GetCars"
    );
    lines.splice(701, 0, "    at AddCarForm (src/components/AddCarForm.tsx:42:11)");
    const raw = lines.join("\n");

    const summary = summarizeValidationOutput(raw);

    expect(summary).toContain("No more mocked responses for the query");
    expect(summary).toContain("at AddCarForm (src/components/AddCarForm.tsx:42:11)");
    expect(summary).not.toContain("stdout noise line 42 ");
  });

  it("caps the summary at maxLines", () => {
    const raw = Array.from({ length: 300 }, (_, i) => `error TS100${i}: bad`).join("\n");

    expect(summarizeValidationOutput(raw, 10).split("\n")).toHaveLength(10);
  });

  it("returns the original output unchanged when there are no error-looking lines", () => {
    const raw = ["--- typecheck ---", "", "--- test ---", "all good", ""].join("\n");

    expect(summarizeValidationOutput(raw)).toBe(raw);
  });
});
