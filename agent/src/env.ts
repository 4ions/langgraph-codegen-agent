export function requireEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolvePositiveNumberEnv(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function resolveMaxRetryCycles(value: string | undefined): number {
  return resolvePositiveNumberEnv(value, 3);
}

export function resolveMaxCostUsd(value: string | undefined): number {
  return resolvePositiveNumberEnv(value, 2);
}
