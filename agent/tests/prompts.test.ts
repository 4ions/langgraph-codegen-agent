import { describe, it, expect } from "vitest";
import {
  loadCoderPromptTemplate,
  loadFixerPromptTemplate,
  loadPlannerPromptTemplate,
  loadReviewerPromptTemplate,
  loadStyleGuidance,
  loadTestingGuidance,
  renderTemplate,
} from "../src/prompts/index.js";

describe("renderTemplate", () => {
  it("replaces every occurrence of each placeholder", () => {
    expect(
      renderTemplate("{{a}} and {{b}} and {{a}}", { a: "1", b: "2" })
    ).toBe("1 and 2 and 1");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("{{a}} {{c}}", { a: "1" })).toBe("1 {{c}}");
  });
});

describe("prompt templates", () => {
  it("loads each node template with the placeholders its node fills in", async () => {
    const coder = await loadCoderPromptTemplate();
    expect(coder).toContain("{{taskDescription}}");
    expect(coder).toContain("{{targetFile}}");
    expect(coder).toContain("{{styleGuidance}}");
    expect(coder).toContain("{{testingGuidance}}");
    expect(coder).toContain("{{dependencyContext}}");

    expect(await loadPlannerPromptTemplate()).toContain("{{boilerplateTree}}");
    expect(await loadReviewerPromptTemplate()).toContain("{{generatedFiles}}");
    expect(await loadFixerPromptTemplate()).toContain("{{failureDetail}}");
  });

  it("loads the style and testing guidance files", async () => {
    expect(await loadStyleGuidance()).toContain("Visual/library conventions");
    expect(await loadTestingGuidance()).toContain("getByLabelText");
  });

  it("serves repeated loads from the cache as the identical string", async () => {
    const first = await loadStyleGuidance();
    const second = await loadStyleGuidance();
    expect(second).toBe(first);
  });
});
