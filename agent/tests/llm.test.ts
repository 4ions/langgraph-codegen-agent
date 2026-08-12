import { describe, it, expect } from "vitest";
import { resolveModelName, createModelForRole } from "../src/llm.js";

describe("resolveModelName", () => {
  it("uses the role's default model when no env override is set", () => {
    expect(resolveModelName("planner", {})).toBe("anthropic/claude-sonnet-4.5");
    expect(resolveModelName("coder", {})).toBe("anthropic/claude-haiku-4.5");
    expect(resolveModelName("reviewer", {})).toBe("anthropic/claude-sonnet-4.5");
    expect(resolveModelName("fixer", {})).toBe("anthropic/claude-sonnet-4.5");
  });

  it("uses the env override when present", () => {
    expect(
      resolveModelName("planner", { PLANNER_MODEL: "openai/gpt-5" })
    ).toBe("openai/gpt-5");
  });
});

describe("createModelForRole", () => {
  it("throws when OPENROUTER_API_KEY is missing", () => {
    expect(() => createModelForRole("planner", {})).toThrow(
      "Missing required environment variable: OPENROUTER_API_KEY"
    );
  });

  it("constructs a model with the resolved model name and role temperature", () => {
    const model = createModelForRole("coder", {
      OPENROUTER_API_KEY: "sk-or-test",
    });
    expect(model.model).toBe("anthropic/claude-haiku-4.5");
    expect(model.temperature).toBe(0.2);

    const reviewer = createModelForRole("reviewer", {
      OPENROUTER_API_KEY: "sk-or-test",
      REVIEWER_MODEL: "openai/gpt-5",
    });
    expect(reviewer.model).toBe("openai/gpt-5");
    expect(reviewer.temperature).toBe(0);
  });

  it("requests provider preferences and cost usage accounting", () => {
    const model = createModelForRole("planner", {
      OPENROUTER_API_KEY: "sk-or-test",
    });
    expect(model.modelKwargs).toMatchObject({
      provider: { require_parameters: true, sort: "price", allow_fallbacks: true },
      usage: { include: true },
    });
  });
});
