import { describe, it, expect } from "vitest";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeGeneratedFile,
  readGeneratedFile,
  readGeneratedFileIfExists,
  resolveWithinRoot,
  PathEscapeError,
  ForbiddenPathError,
} from "../src/tools/fs.js";

describe("fs tool", () => {
  it("writes and reads a file within the root, creating directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-"));
    try {
      await writeGeneratedFile(root, "src/components/Car.tsx", "export {}");
      const content = await readGeneratedFile(root, "src/components/Car.tsx");
      expect(content).toBe("export {}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that escapes the root", () => {
    expect(() => resolveWithinRoot("/tmp/root", "../../etc/passwd")).toThrow(
      PathEscapeError
    );
  });

  it("rejects an absolute path outside the root", () => {
    expect(() => resolveWithinRoot("/tmp/root", "/etc/passwd")).toThrow(
      PathEscapeError
    );
  });

  it("rejects writes to protected files like package.json or a vite config", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-forbidden-"));
    try {
      await expect(
        writeGeneratedFile(root, "package.json", "{}")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, "vite.config.ts", "export default {}")
      ).rejects.toThrow(ForbiddenPathError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects protected files disguised by a trailing slash or different casing", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-bypass-"));
    try {
      await expect(
        writeGeneratedFile(root, "package.json/", "{}")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, "PACKAGE.JSON", "{}")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, "src/../package.json", "{}")
      ).rejects.toThrow(ForbiddenPathError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects writes into protected directories anywhere in the path", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-segments-"));
    try {
      await expect(
        writeGeneratedFile(root, "node_modules/react/index.js", "pwned")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, ".git/hooks/pre-commit", "pwned")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, "src/.github/workflows/ci.yml", "pwned")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(access(join(root, "node_modules"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows a legitimate directory whose name starts with two dots", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-dotdot-"));
    try {
      await writeGeneratedFile(root, "..config/file.ts", "export {}");
      expect(await readGeneratedFile(root, "..config/file.ts")).toBe(
        "export {}"
      );
      expect(() => resolveWithinRoot(root, "../file.ts")).toThrow(
        PathEscapeError
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects writes that reach outside the root through a symlinked directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "agent-fs-outside-"));
    try {
      await symlink(outside, join(root, "escape"), "dir");
      await expect(
        writeGeneratedFile(root, "escape/pwned.ts", "export {}")
      ).rejects.toThrow(PathEscapeError);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects writes whose non-immediate ancestor is a symlink out of the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-deep-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "agent-fs-deep-outside-"));
    try {
      await symlink(outside, join(root, "a"), "dir");
      await expect(
        writeGeneratedFile(root, "a/b/c.ts", "export {}")
      ).rejects.toThrow(PathEscapeError);
      await expect(access(join(outside, "b", "c.ts"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects writing through a target file that is already a symlink to an outside file", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-file-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "agent-fs-file-outside-"));
    try {
      const outsideFile = join(outside, "secret.ts");
      await writeFile(outsideFile, "original", "utf8");
      await mkdir(join(root, "src"), { recursive: true });
      await symlink(outsideFile, join(root, "src", "link.ts"), "file");

      await expect(
        writeGeneratedFile(root, "src/link.ts", "pwned")
      ).rejects.toThrow(PathEscapeError);
      expect(await readFile(outsideFile, "utf8")).toBe("original");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("returns undefined from readGeneratedFileIfExists when the file does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-ifexists-"));
    try {
      expect(await readGeneratedFileIfExists(root, "src/missing.ts")).toBe(
        undefined
      );
      await writeGeneratedFile(root, "src/here.ts", "export {}");
      expect(await readGeneratedFileIfExists(root, "src/here.ts")).toBe(
        "export {}"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rethrows non-ENOENT read errors from readGeneratedFileIfExists instead of treating them as missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-ifexists-eisdir-"));
    try {
      await mkdir(join(root, "src", "App.tsx"), { recursive: true });
      await expect(
        readGeneratedFileIfExists(root, "src/App.tsx")
      ).rejects.toThrow(/EISDIR/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rethrows a non-ENOENT lstat failure instead of skipping the symlink check", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-lstat-error-"));
    try {
      await writeFile(join(root, "src"), "not a directory", "utf8");
      await expect(
        writeGeneratedFile(root, "src/nested.ts", "export {}")
      ).rejects.toThrow(/ENOTDIR/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects .env variants and real tsconfig files without blocking lookalike source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-fs-denylist-"));
    try {
      await expect(writeGeneratedFile(root, ".env.local", "X=1")).rejects.toThrow(
        ForbiddenPathError
      );
      await expect(
        writeGeneratedFile(root, ".env.production", "X=1")
      ).rejects.toThrow(ForbiddenPathError);
      await expect(
        writeGeneratedFile(root, "tsconfig.build.json", "{}")
      ).rejects.toThrow(ForbiddenPathError);

      await writeGeneratedFile(
        root,
        "src/components/TsconfigViewer.tsx",
        "export {}"
      );
      expect(
        await readGeneratedFile(root, "src/components/TsconfigViewer.tsx")
      ).toBe("export {}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
