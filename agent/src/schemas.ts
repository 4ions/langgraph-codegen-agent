import { z } from "zod/v4";

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  targetFile: z.string(),
  dependsOn: z.array(z.string()).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export const PlanSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const CoderOutputSchema = z.object({
  content: z.string(),
});
export type CoderOutput = z.infer<typeof CoderOutputSchema>;

export const ReviewOutputSchema = z.object({
  approved: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export const FixOutputSchema = z.object({
  rootCause: z
    .string()
    .describe(
      "Explain the actual root cause of the failure, citing specific evidence from the validation output (exact error text, file, line). Do not propose a fix here — only diagnose. If the visible error is a symptom of something deeper (e.g. a caught/swallowed error hiding the real cause), say so explicitly."
    ),
  tasks: z.array(TaskSchema),
});
export type FixOutput = z.infer<typeof FixOutputSchema>;

export const ValidationResultSchema = z.object({
  typecheckOk: z.boolean(),
  testOk: z.boolean(),
  output: z.string(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const NODE_NAMES = [
  "planner",
  "coder",
  "validator",
  "reviewer",
  "fixer",
  "finalize",
] as const;
export type NodeName = (typeof NODE_NAMES)[number];

export const HistoryEntrySchema = z.object({
  node: z.enum(NODE_NAMES),
  detail: z.string(),
  costUsd: z.number().default(0),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
