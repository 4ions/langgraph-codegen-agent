import { extractCostUsd } from "./costTracker.js";

export interface StructuredCapableModel {
  withStructuredOutput(
    schema: unknown,
    opts: { includeRaw: true }
  ): {
    invoke(input: unknown): Promise<{ raw: unknown; parsed: unknown }>;
  };
}

export async function invokeStructured<T>(
  model: StructuredCapableModel,
  schema: unknown,
  prompt: string
): Promise<{ parsed: T; costUsd: number }> {
  const runnable = model.withStructuredOutput(schema, { includeRaw: true });
  const { raw, parsed } = await runnable.invoke(prompt);
  if (parsed === null || parsed === undefined) {
    throw new Error(
      "Structured output parsing failed: the model returned no schema-valid result"
    );
  }
  return { parsed: parsed as T, costUsd: extractCostUsd(raw) };
}
