import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";

/**
 * Nabu accepts standard 5-field cron. cron-parser also supports a 6-field form
 * with seconds, which we reject: a per-second schedule would hammer the model
 * API and run up the customer's own token bill.
 */

export type CronValidation =
  | { valid: true; description: string; nextRun: Date }
  | { valid: false; error: string };

export function validateCron(expression: string, timezone = "UTC"): CronValidation {
  const trimmed = expression.trim();

  if (!trimmed) return { valid: false, error: "Enter a schedule" };

  if (trimmed.split(/\s+/).length === 6) {
    return {
      valid: false,
      error: "Six-field cron (with seconds) isn't supported. Use five fields, e.g. 0 9 * * *",
    };
  }

  try {
    const interval = CronExpressionParser.parse(trimmed, { tz: timezone });
    return {
      valid: true,
      description: cronstrue.toString(trimmed, { verbose: false }),
      nextRun: interval.next().toDate(),
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid cron expression" };
  }
}

export function nextRunAt(expression: string, timezone = "UTC", after = new Date()): Date | null {
  try {
    return CronExpressionParser.parse(expression, { tz: timezone, currentDate: after })
      .next()
      .toDate();
  } catch {
    return null;
  }
}

export function describeCron(expression: string): string {
  try {
    return cronstrue.toString(expression, { verbose: false });
  } catch {
    return expression;
  }
}

/** Starting points offered in the schedule builder, so nobody has to know cron. */
export const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every day at 6pm", value: "0 18 * * *" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "Every 1st of the month", value: "0 9 1 * *" },
] as const;

/**
 * IANA zones offered in the timezone picker. Intl exposes the full list in
 * modern Node, so fall back to a short list only if it's unavailable.
 */
export function availableTimezones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone") ?? [];

  if (!supported.length) {
    return ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London"];
  }

  // Intl's list omits "UTC" in some runtimes. Without it here, a stored default
  // of "UTC" matches no <option> and the select silently shows Africa/Abidjan.
  return supported.includes("UTC") ? supported : ["UTC", ...supported];
}

/** The host's own timezone — a far better default than UTC for a self-hoster. */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
