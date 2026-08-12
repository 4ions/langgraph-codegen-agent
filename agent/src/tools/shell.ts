import { spawn, type ChildProcess } from "node:child_process";
import type { ValidationResult } from "../schemas.js";
import { PROMPT_LIMITS } from "../promptLimits.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const SENSITIVE_ENV_FRAGMENTS = ["KEY", "TOKEN", "SECRET", "PASSWORD"];

export function buildChildEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const filtered: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    const upper = name.toUpperCase();
    if (SENSITIVE_ENV_FRAGMENTS.some((fragment) => upper.includes(fragment))) {
      continue;
    }
    filtered[name] = value;
  }
  return filtered;
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 5 * 60_000;

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      return;
    }
  }
}

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      env: buildChildEnv(),
      shell: process.platform === "win32",
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child);
      resolvePromise({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms and was killed`,
      });
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: 1, stdout, stderr: `${stderr}\n${err.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

const VALIDATION_SIGNAL_PATTERNS = [
  "error TS",
  "FAIL",
  "AssertionError",
  "× ",
  "Unable to find",
  "Expected:",
  "Received:",
  "expected",
  "toBe",
  "console.error",
  "Warning:",
  "Invariant",
  "No more mocked responses",
  "Unhandled Rejection",
  "GraphQL error",
  "Network error",
  "Error:",
];

export function summarizeValidationOutput(
  rawOutput: string,
  maxLines: number = PROMPT_LIMITS.validationOutputMaxLines
): string {
  const lines = rawOutput.split("\n");
  const keptIndexes = new Set<number>();
  lines.forEach((line, index) => {
    if (VALIDATION_SIGNAL_PATTERNS.some((pattern) => line.includes(pattern))) {
      keptIndexes.add(index);
      if (index + 1 < lines.length) keptIndexes.add(index + 1);
    }
  });
  if (keptIndexes.size === 0) return rawOutput;
  return [...keptIndexes]
    .sort((a, b) => a - b)
    .slice(0, maxLines)
    .map((index) => lines[index])
    .join("\n");
}

export async function runValidation(
  projectDir: string
): Promise<ValidationResult> {
  const typecheck = await runCommand("npm", ["run", "typecheck"], projectDir);
  const test = await runCommand("npm", ["run", "test"], projectDir);
  return {
    typecheckOk: typecheck.exitCode === 0,
    testOk: test.exitCode === 0,
    output: summarizeValidationOutput(
      [
        "--- typecheck ---",
        typecheck.stdout,
        typecheck.stderr,
        "--- test ---",
        test.stdout,
        test.stderr,
      ].join("\n")
    ),
  };
}
