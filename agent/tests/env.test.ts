import { describe, it, expect } from "vitest";
import { requireEnv } from "../src/env.js";

describe("requireEnv", () => {
  it("returns the value when the variable is set", () => {
    expect(requireEnv("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("throws when the variable is missing", () => {
    expect(() => requireEnv("MISSING", {})).toThrow(
      "Missing required environment variable: MISSING"
    );
  });

  it("throws when the variable is an empty string", () => {
    expect(() => requireEnv("EMPTY", { EMPTY: "" })).toThrow(
      "Missing required environment variable: EMPTY"
    );
  });
});
