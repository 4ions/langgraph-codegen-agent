import { PROMPT_LIMITS } from "../promptLimits.js";

export function truncateText(
  text: string,
  maxChars: number = PROMPT_LIMITS.defaultTruncateChars
): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.floor(maxChars * 0.7);
  const tailLen = Math.floor(maxChars * 0.3);
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  return `${head}\n... [truncated ${text.length - maxChars} chars] ...\n${tail}`;
}
