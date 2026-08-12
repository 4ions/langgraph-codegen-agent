function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function costAt(container: unknown): number | undefined {
  const record = asRecord(container);
  if (!record) return undefined;
  const cost = record.cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined;
}

export function extractCostUsd(raw: unknown): number {
  const message = asRecord(raw);
  if (!message) return 0;
  const metadata = asRecord(message.response_metadata);
  const candidates = [
    costAt(metadata?.tokenUsage),
    costAt(metadata?.usage),
    costAt(metadata),
    costAt(message.usage_metadata),
  ];
  return candidates.find((value) => value !== undefined) ?? 0;
}
