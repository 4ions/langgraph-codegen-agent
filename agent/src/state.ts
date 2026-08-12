import { StateSchema, ReducedValue } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  TaskSchema,
  ValidationResultSchema,
  ReviewOutputSchema,
  HistoryEntrySchema,
} from "./schemas.js";

export const AgentState = new StateSchema({
  specText: z.string(),
  outputDir: z.string().default(""),
  boilerplateTree: z.string().default(""),
  referenceFiles: z.string().default(""),
  plan: z.array(TaskSchema).default([]),
  pendingTasks: z.array(TaskSchema).default([]),
  filesWritten: z.record(z.string(), z.string()).default({}),
  lastGreenFiles: z.record(z.string(), z.string()).default({}),
  validationResult: ValidationResultSchema.nullable().default(null),
  reviewResult: ReviewOutputSchema.nullable().default(null),
  retryCount: z.number().default(0),
  maxRetryCycles: z.number().default(3),
  maxCostUsd: z.number().default(2),
  outcome: z
    .enum(["in_progress", "approved", "retries_exhausted"])
    .default("in_progress"),
  history: new ReducedValue(z.array(HistoryEntrySchema).default(() => []), {
    inputSchema: z.array(HistoryEntrySchema),
    reducer: (current, incoming) => [...current, ...incoming],
  }),
});

export type AgentStateType = typeof AgentState.State;
