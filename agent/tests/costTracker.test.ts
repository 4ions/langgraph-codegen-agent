import { describe, it, expect } from "vitest";
import { extractCostUsd } from "../src/tools/costTracker.js";

describe("extractCostUsd", () => {
  it("reads cost from response_metadata.usage.cost", () => {
    const raw = { response_metadata: { usage: { cost: 0.0042 } } };
    expect(extractCostUsd(raw)).toBe(0.0042);
  });

  it("reads cost from response_metadata.tokenUsage.cost (llmOutput merged by @langchain/core)", () => {
    const raw = { response_metadata: { tokenUsage: { cost: 0.0031 } } };
    expect(extractCostUsd(raw)).toBe(0.0031);
  });

  it("reads cost from response_metadata.cost", () => {
    expect(extractCostUsd({ response_metadata: { cost: 0.007 } })).toBe(0.007);
  });

  it("reads cost from usage_metadata.cost", () => {
    expect(extractCostUsd({ usage_metadata: { cost: 0.009 } })).toBe(0.009);
  });

  it("prefers tokenUsage.cost over the other locations", () => {
    const raw = {
      response_metadata: {
        tokenUsage: { cost: 0.5 },
        usage: { cost: 0.4 },
        cost: 0.3,
      },
      usage_metadata: { cost: 0.2 },
    };
    expect(extractCostUsd(raw)).toBe(0.5);
  });

  it("falls through to a later location when an earlier one is not a number", () => {
    const raw = {
      response_metadata: { tokenUsage: { cost: null }, usage: { cost: 0.11 } },
    };
    expect(extractCostUsd(raw)).toBe(0.11);
  });

  it("returns 0 when the shape is missing", () => {
    expect(extractCostUsd({})).toBe(0);
    expect(extractCostUsd(null)).toBe(0);
    expect(extractCostUsd(undefined)).toBe(0);
  });

  it("returns 0 when cost is not a number", () => {
    const raw = { response_metadata: { usage: { cost: "n/a" } } };
    expect(extractCostUsd(raw)).toBe(0);
  });
});
