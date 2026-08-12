import { describe, it, expect } from "vitest";
import { createReviewerNode } from "../../src/nodes/reviewer.js";
import { makeState } from "../helpers/makeState.js";
import { fakeStructuredModel, throwingModel } from "../helpers/fakeModel.js";

const STATE = makeState({
  specText: "build a car inventory app with search",
  filesWritten: {
    "src/App.tsx": "export default function App() { return <SearchBar />; }",
  },
});

describe("reviewerNode", () => {
  it("sets reviewResult and logs cost", async () => {
    const capturedPrompts: string[] = [];
    const node = createReviewerNode(
      fakeStructuredModel(
        [
          {
            parsed: { approved: false, notes: ["missing search bar"] },
            costUsd: 0.015,
          },
        ],
        capturedPrompts
      )
    );
    const update = await node(STATE);

    expect(update.reviewResult).toEqual({
      approved: false,
      notes: ["missing search bar"],
    });
    expect(update.history).toEqual([
      { node: "reviewer", detail: "approved=false", costUsd: 0.015 },
    ]);
    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain("build a car inventory app with search");
    expect(capturedPrompts[0]).toContain("--- src/App.tsx ---");
    expect(capturedPrompts[0]).toContain(
      "export default function App() { return <SearchBar />; }"
    );
  });

  it("rejects instead of throwing when the LLM call fails", async () => {
    const update = await createReviewerNode(throwingModel("upstream 503"))(STATE);

    expect(update.reviewResult).toEqual({
      approved: false,
      notes: ["Reviewer LLM call failed: upstream 503"],
    });
    expect(update.history).toEqual([
      {
        node: "reviewer",
        detail: "Reviewer LLM call failed: upstream 503",
        costUsd: 0,
      },
    ]);
  });
});
