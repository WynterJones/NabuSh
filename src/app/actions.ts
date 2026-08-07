"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agentRows, agentTables, agents, reports, schedules, users } from "@/db/schema";
import { getCurrentUser, createSession, destroySession, authenticate, needsSetup } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { validateCron } from "@/lib/cron";
import { setAnthropicKey, setSetting, deleteSetting, SETTING_KEYS } from "@/lib/settings";
import { activateLicense } from "@/lib/license";
import { enqueueRun } from "@/worker/queue";
import { refreshNextRun } from "@/worker/scheduler";
import Anthropic from "@anthropic-ai/sdk";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Every mutation goes through this; there is no unauthenticated write path. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// --- Auth ---------------------------------------------------------------

export async function createFirstAccount(formData: FormData): Promise<ActionResult> {
  if (!(await needsSetup())) return { ok: false, error: "An account already exists on this instance." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password) })
    .returning();

  await createSession(user.id);
  redirect("/inbox");
}

export async function login(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticate(email, password);
  if (!user) return { ok: false, error: "That email and password don't match." };

  await createSession(user.id);
  redirect("/inbox");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// --- Agents -------------------------------------------------------------

export async function saveAgent(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the agent a name." };

  const toolsEnabled = formData.getAll("tools").map(String);

  const values = {
    name,
    avatar: String(formData.get("avatar") ?? "🤖").slice(0, 4) || "🤖",
    instructions: String(formData.get("instructions") ?? ""),
    model: String(formData.get("model") ?? "claude-sonnet-5"),
    toolsEnabled,
    maxSteps: Math.min(Math.max(Number(formData.get("maxSteps")) || 30, 1), 100),
    timeoutSeconds: Math.min(Math.max(Number(formData.get("timeoutSeconds")) || 600, 30), 3600),
  };

  if (id) {
    await db.update(agents).set(values).where(eq(agents.id, id));
  } else {
    const [created] = await db.insert(agents).values(values).returning({ id: agents.id });
    revalidatePath("/", "layout");
    redirect(`/agents/${created.id}`);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAgentStatus(agentId: string, status: "active" | "paused"): Promise<ActionResult> {
  await requireUser();
  await db.update(agents).set({ status }).where(eq(agents.id, agentId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAgent(agentId: string): Promise<ActionResult> {
  await requireUser();
  // Schedules, runs, reports, tables and rows all cascade from the agent row.
  await db.delete(agents).where(eq(agents.id, agentId));
  revalidatePath("/", "layout");
  redirect("/agents");
}

// --- Schedules ----------------------------------------------------------

export async function saveSchedule(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const cron = String(formData.get("cron") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC");
  const taskPrompt = String(formData.get("taskPrompt") ?? "").trim();

  if (!agentId) return { ok: false, error: "Pick an agent." };
  if (!name) return { ok: false, error: "Give the schedule a name." };
  if (!taskPrompt) return { ok: false, error: "Describe the task this schedule should run." };

  const validation = validateCron(cron, timezone);
  if (!validation.valid) return { ok: false, error: validation.error };

  if (id) {
    await db
      .update(schedules)
      .set({ name, cron, timezone, taskPrompt, agentId })
      .where(eq(schedules.id, id));
    await refreshNextRun(id);
  } else {
    const [created] = await db
      .insert(schedules)
      .values({ agentId, name, cron, timezone, taskPrompt })
      .returning({ id: schedules.id });
    await refreshNextRun(created.id);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleSchedule(scheduleId: string, enabled: boolean): Promise<ActionResult> {
  await requireUser();
  await db.update(schedules).set({ enabled }).where(eq(schedules.id, scheduleId));
  if (enabled) await refreshNextRun(scheduleId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSchedule(scheduleId: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(schedules).where(eq(schedules.id, scheduleId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Queues a schedule immediately without disturbing its next scheduled firing. */
export async function runScheduleNow(scheduleId: string): Promise<ActionResult> {
  await requireUser();

  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
  if (!schedule) return { ok: false, error: "That schedule no longer exists." };

  await enqueueRun({
    agentId: schedule.agentId,
    scheduleId: schedule.id,
    taskPrompt: schedule.taskPrompt,
    trigger: "manual",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Inbox --------------------------------------------------------------

export async function markReportRead(reportId: string, isRead = true): Promise<ActionResult> {
  await requireUser();
  await db.update(reports).set({ isRead }).where(eq(reports.id, reportId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllRead(agentId?: string): Promise<ActionResult> {
  await requireUser();
  await db
    .update(reports)
    .set({ isRead: true })
    .where(agentId ? eq(reports.agentId, agentId) : undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteReport(reportId: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(reports).where(eq(reports.id, reportId));
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Agent database (human edits) --------------------------------------

export async function updateAgentRow(rowId: string, data: Record<string, unknown>): Promise<ActionResult> {
  await requireUser();
  await db.update(agentRows).set({ data, updatedAt: new Date() }).where(eq(agentRows.id, rowId));
  revalidatePath("/database");
  return { ok: true };
}

export async function insertAgentRow(tableId: string, data: Record<string, unknown>): Promise<ActionResult> {
  await requireUser();
  await db.insert(agentRows).values({ tableId, data });
  revalidatePath("/database");
  return { ok: true };
}

export async function deleteAgentRow(rowId: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(agentRows).where(eq(agentRows.id, rowId));
  revalidatePath("/database");
  return { ok: true };
}

export async function deleteAgentTable(tableId: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(agentTables).where(eq(agentTables.id, tableId));
  revalidatePath("/database");
  return { ok: true };
}

export async function clearAgentTable(tableId: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(agentRows).where(eq(agentRows.tableId, tableId));
  revalidatePath("/database");
  return { ok: true };
}

// --- Settings -----------------------------------------------------------

export async function saveAnthropicKey(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) return { ok: false, error: "Paste your Anthropic API key." };

  // Validate before storing: a key that only fails at 3am inside a scheduled
  // run is far more expensive to diagnose than one rejected here.
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0 });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic rejected that key. Check you copied all of it." };
    }
    return {
      ok: false,
      error: `Could not verify the key: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  await setAnthropicKey(key);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAnthropicKey(): Promise<ActionResult> {
  await requireUser();
  await deleteSetting(SETTING_KEYS.anthropicApiKey);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveLicenseKey(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const key = String(formData.get("licenseKey") ?? "").trim();
  const verdict = await activateLicense(key);
  if (!verdict.valid) return { ok: false, error: verdict.reason ?? "That license key isn't valid." };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveTimezone(formData: FormData): Promise<ActionResult> {
  await requireUser();
  await setSetting(SETTING_KEYS.timezone, String(formData.get("timezone") ?? "UTC"));
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Onboarding ---------------------------------------------------------

/**
 * Seeds one working agent + schedule so a new install has something running
 * within a minute of first login, instead of an empty screen and a blank prompt.
 */
export async function createStarterAgent(): Promise<ActionResult> {
  await requireUser();

  const [agent] = await db
    .insert(agents)
    .values({
      name: "Morning Briefing",
      avatar: "☀️",
      instructions:
        "You produce a short daily briefing. Keep a `sources` table of URLs worth checking, " +
        "and a `seen` table of headlines you have already reported so you never repeat yourself. " +
        "Write plainly and lead with what changed since yesterday.",
      model: "claude-sonnet-5",
      toolsEnabled: ["web_fetch"],
    })
    .returning();

  const [schedule] = await db
    .insert(schedules)
    .values({
      agentId: agent.id,
      name: "Daily at 8am",
      cron: "0 8 * * *",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      taskPrompt:
        "Check your sources for anything new since your last run. Store new items in your tables, " +
        "then report the three or four things most worth knowing this morning. " +
        "If nothing meaningful changed, say so in one line.",
    })
    .returning();

  await refreshNextRun(schedule.id);
  await setSetting(SETTING_KEYS.onboardedAt, new Date().toISOString());

  revalidatePath("/", "layout");
  redirect(`/agents/${agent.id}`);
}

export async function dismissOnboarding(): Promise<ActionResult> {
  await requireUser();
  await setSetting(SETTING_KEYS.onboardedAt, new Date().toISOString());
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Manual run ---------------------------------------------------------

export async function runAgentNow(agentId: string, taskPrompt: string): Promise<ActionResult> {
  await requireUser();

  const prompt = taskPrompt.trim();
  if (!prompt) return { ok: false, error: "Describe what the agent should do." };

  await enqueueRun({ agentId, taskPrompt: prompt, trigger: "manual" });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRuns(runIds: string[]): Promise<ActionResult> {
  await requireUser();
  if (!runIds.length) return { ok: true };
  await db.delete(reports).where(inArray(reports.runId, runIds));
  revalidatePath("/", "layout");
  return { ok: true };
}
