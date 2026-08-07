import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "3 minutes ago" / "in 2 hours" — compact, no dependency on locale files. */
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  const diffMs = value.getTime() - Date.now();
  const future = diffMs > 0;
  const abs = Math.abs(diffMs);

  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  if (abs < 45_000) return future ? "in a moment" : "just now";

  let text: string;
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)}m`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`;
  else text = `${Math.round(abs / DAY)}d`;

  return future ? `in ${text}` : `${text} ago`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(from: Date | null, to: Date | null): string {
  if (!from || !to) return "—";
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * Rough spend estimate shown next to a run. Rates are per million tokens and
 * are only accurate to the model tier — the customer's real bill is Anthropic's.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): string {
  const rate = RATES[model];
  if (!rate) return "—";
  const dollars = (tokensIn / 1_000_000) * rate.in + (tokensOut / 1_000_000) * rate.out;
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}

export const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5", hint: "Balanced — the right default for most agents" },
  { id: "claude-opus-5", label: "Opus 5", hint: "Most capable, highest cost. For hard reasoning." },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "Fastest and cheapest. Good for frequent, simple jobs." },
] as const;
