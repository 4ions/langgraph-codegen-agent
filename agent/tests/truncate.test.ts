import { describe, it, expect } from "vitest";
import { truncateText } from "../src/tools/truncate.js";

describe("truncateText", () => {
  it("returns short text unchanged", () => {
    expect(truncateText("hello", 100)).toBe("hello");
  });

  it("returns text of exactly maxChars unchanged", () => {
    const exact = "a".repeat(500);
    expect(truncateText(exact, 500)).toBe(exact);
  });

  it("keeps the real head and the real tail around the truncation marker", () => {
    const long = "HEAD".repeat(500) + "MIDDLE".repeat(3000) + "TAIL".repeat(500);
    const result = truncateText(long, 1000);

    expect(result.length).toBeLessThan(1200);
    expect(result).toContain(`[truncated ${long.length - 1000} chars]`);
    expect(result.startsWith("HEAD".repeat(100))).toBe(true);
    expect(result.endsWith("TAIL".repeat(75))).toBe(true);
    expect(result).not.toContain("MIDDLEMIDDLEMIDDLE");
  });
});
