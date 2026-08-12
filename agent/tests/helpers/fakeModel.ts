import type { StructuredCapableModel } from "../../src/tools/structuredInvoke.js";

export interface FakeResponse {
  parsed: unknown;
  costUsd?: number;
}

export function fakeStructuredModel(
  responses: FakeResponse[],
  capturedPrompts?: string[]
): StructuredCapableModel {
  let call = 0;
  return {
    withStructuredOutput: () => ({
      invoke: async (input: unknown) => {
        capturedPrompts?.push(String(input));
        const response = responses[call] ?? responses[responses.length - 1];
        call += 1;
        return {
          raw: {
            response_metadata: { usage: { cost: response?.costUsd ?? 0 } },
          },
          parsed: response?.parsed,
        };
      },
    }),
  };
}

export function capturingModel(
  parsedResponse: unknown,
  capturedPrompts: string[]
): StructuredCapableModel {
  return fakeStructuredModel([{ parsed: parsedResponse }], capturedPrompts);
}

export function throwingModel(message: string): StructuredCapableModel {
  return {
    withStructuredOutput: () => ({
      invoke: async () => {
        throw new Error(message);
      },
    }),
  };
}

export function promptDependentModel(
  respond: (prompt: string) => unknown
): StructuredCapableModel {
  return {
    withStructuredOutput: () => ({
      invoke: async (input: unknown) => ({
        raw: {},
        parsed: respond(String(input)),
      }),
    }),
  };
}
