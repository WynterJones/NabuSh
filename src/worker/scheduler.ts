import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { agents, schedules } from "@/db/schema";
import { nextRunAt } from "@/lib/cron";
import { enqueueRun } from "./queue";

/**
 * Fires due schedules. Runs in-process on a tick rather than via system cron so
 * the whole app stays inside one container.
 */

export async function tickScheduler(): Promise<number> {
  const now = new Date();

  const due = await db
    .select({ schedule: schedules, agent: agents })
    .from(schedules)
    .innerJoin(agents, eq(schedules.agentId, agents.id))
    .where(
      and(
        eq(schedules.enabled, true),
        eq(agents.status, "active"),
        or(isNull(schedules.nextRunAt), lte(schedules.nextRunAt, now)),
      ),
    );

  let fired = 0;

  for (const { schedule } of due) {
    const upcoming = nextRunAt(schedule.cron, schedule.timezone, now);

    if (!upcoming) {
      // An unparseable expression would otherwise be retried on every tick
      // forever, so disable it and let the UI surface the problem.
      console.error(`[nabu] disabling schedule ${schedule.id} — invalid cron "${schedule.cron}"`);
      await db.update(schedules).set({ enabled: false }).where(eq(schedules.id, schedule.id));
      continue;
    }

    // A schedule with no nextRunAt has never been scheduled — it was just
    // created. Set its first firing time rather than running it immediately,
    // otherwise saving a schedule always triggers an unexpected run.
    if (!schedule.nextRunAt) {
      await db.update(schedules).set({ nextRunAt: upcoming }).where(eq(schedules.id, schedule.id));
      continue;
    }

    await enqueueRun({
      agentId: schedule.agentId,
      scheduleId: schedule.id,
      taskPrompt: schedule.taskPrompt,
      trigger: "schedule",
    });

    await db
      .update(schedules)
      .set({ lastRunAt: now, nextRunAt: upcoming })
      .where(eq(schedules.id, schedule.id));

    fired++;
  }

  return fired;
}

/**
 * Recomputes nextRunAt after a schedule is created or edited, so the UI can show
 * the next firing time immediately instead of waiting for the next tick.
 */
export async function refreshNextRun(scheduleId: string): Promise<Date | null> {
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
  if (!schedule) return null;

  const upcoming = nextRunAt(schedule.cron, schedule.timezone);
  await db.update(schedules).set({ nextRunAt: upcoming }).where(eq(schedules.id, scheduleId));
  return upcoming;
}
