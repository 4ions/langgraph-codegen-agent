import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, relative, isAbsolute, sep } from "node:path";

export class PathEscapeError extends Error {}
export class ForbiddenPathError extends Error {}

const FORBIDDEN_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".env",
]);
const FORBIDDEN_PATTERNS = [
  /\.config\.[cm]?[jt]s$/,
  /^tsconfig(\.[\w-]+)?\.json$/,
  /^\.env(\.|$)/,
];
const FORBIDDEN_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  ".vite",
]);

function escapesRoot(rel: string): boolean {
  return rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);
}

function assertAllowedSegments(targetPath: string): void {
  const segments = targetPath.split(/[\\/]/).map((part) => part.toLowerCase());
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    throw new ForbiddenPathError(
      `Generated code may not write inside protected directory in "${targetPath}"`
    );
  }
}

function assertAllowedResolvedPath(
  resolvedPath: string,
  targetPath: string
): void {
  assertAllowedSegments(targetPath);
  const base = basename(resolvedPath).toLowerCase();
  if (
    FORBIDDEN_BASENAMES.has(base) ||
    FORBIDDEN_PATTERNS.some((pattern) => pattern.test(base))
  ) {
    throw new ForbiddenPathError(
      `Generated code may not write to protected file "${targetPath}"`
    );
  }
}

async function findNearestExistingAncestor(
  startDir: string,
  resolvedRoot: string
): Promise<string | undefined> {
  let current = startDir;
  for (;;) {
    try {
      return await realpath(current);
    } catch {
      if (current === resolvedRoot) return undefined;
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

async function assertAncestorChainWithinRoot(
  resolvedRoot: string,
  fullPath: string,
  targetPath: string
): Promise<void> {
  const realAncestor = await findNearestExistingAncestor(
    dirname(fullPath),
    resolvedRoot
  );
  if (realAncestor === undefined) return;
  const realRoot = await realpath(resolvedRoot).catch(() => resolvedRoot);
  const rel = relative(realRoot, realAncestor);
  if (escapesRoot(rel)) {
    throw new PathEscapeError(
      `Path "${targetPath}" resolves outside output root "${resolvedRoot}" through a symlink`
    );
  }
}

async function assertTargetIsNotSymlink(
  fullPath: string,
  targetPath: string
): Promise<void> {
  let isSymlink = false;
  try {
    isSymlink = (await lstat(fullPath)).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return;
  }
  if (isSymlink) {
    throw new PathEscapeError(
      `Path "${targetPath}" already exists as a symlink and will not be followed`
    );
  }
}

export function resolveWithinRoot(root: string, targetPath: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, targetPath);
  const rel = relative(resolvedRoot, resolved);
  if (escapesRoot(rel)) {
    throw new PathEscapeError(
      `Path "${targetPath}" escapes output root "${root}"`
    );
  }
  return resolved;
}

export async function writeGeneratedFile(
  root: string,
  targetPath: string,
  content: string
): Promise<string> {
  const full = resolveWithinRoot(root, targetPath);
  assertAllowedResolvedPath(full, targetPath);
  const resolvedRoot = resolve(root);
  await assertAncestorChainWithinRoot(resolvedRoot, full, targetPath);
  await assertTargetIsNotSymlink(full, targetPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
  return full;
}

export async function readGeneratedFile(
  root: string,
  targetPath: string
): Promise<string> {
  const full = resolveWithinRoot(root, targetPath);
  return readFile(full, "utf8");
}

export async function readGeneratedFileIfExists(
  root: string,
  targetPath: string
): Promise<string | undefined> {
  try {
    return await readGeneratedFile(root, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}
