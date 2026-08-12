import { ChatOpenRouter } from "@langchain/openrouter";
import { requireEnv } from "./env.js";

export type AgentRole = "planner" | "coder" | "reviewer" | "fixer";

const ENV_VAR_BY_ROLE: Record<AgentRole, string> = {
  planner: "PLANNER_MODEL",
  coder: "CODER_MODEL",
  reviewer: "REVIEWER_MODEL",
  fixer: "FIXER_MODEL",
};

const DEFAULT_MODEL_BY_ROLE: Record<AgentRole, string> = {
  planner: "anthropic/claude-sonnet-4.5",
  coder: "anthropic/claude-haiku-4.5",
  reviewer: "anthropic/claude-sonnet-4.5",
  fixer: "anthropic/claude-sonnet-4.5",
};

export function resolveModelName(
  role: AgentRole,
  env: NodeJS.ProcessEnv = process.env
): string {
  const envVar = ENV_VAR_BY_ROLE[role];
  return env[envVar] || DEFAULT_MODEL_BY_ROLE[role];
}

export function createModelForRole(
  role: AgentRole,
  env: NodeJS.ProcessEnv = process.env
): ChatOpenRouter {
  const apiKey = requireEnv("OPENROUTER_API_KEY", env);
  return new ChatOpenRouter({
    apiKey,
    model: resolveModelName(role, env),
    temperature: role === "coder" ? 0.2 : 0,
    maxRetries: 3,
    maxTokens: 8000,
    modelKwargs: {
      provider: {
        require_parameters: true,
        sort: "price",
        allow_fallbacks: true,
      },
      usage: { include: true },
    },
  });
}
