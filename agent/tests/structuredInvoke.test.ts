import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { invokeStructured } from "../src/tools/structuredInvoke.js";

const Schema = z.object({ ok: z.boolean() });

describe("invokeStructured", () => {
  it("returns the parsed value and extracted cost", async () => {
    const fakeModel = {
      withStructuredOutput: (_schema: unknown, opts: { includeRaw: true }) => {
        expect(opts).toEqual({ includeRaw: true });
        return {
          invoke: async (_input: unknown) => ({
            raw: { response_metadata: { usage: { cost: 0.01 } } },
            parsed: { ok: true },
          }),
        };
      },
    };

    const result = await invokeStructured(fakeModel, Schema, "prompt text");
    expect(result.parsed).toEqual({ ok: true });
    expect(result.costUsd).toBe(0.01);
  });

  it("throws when the model returns parsed: null instead of a schema-valid result", async () => {
    const fakeModel = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          raw: { response_metadata: { usage: { cost: 0.01 } } },
          parsed: null,
        }),
      }),
    };

    await expect(
      invokeStructured(fakeModel, Schema, "prompt text")
    ).rejects.toThrow("Structured output parsing failed");
  });
});
