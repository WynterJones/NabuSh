import { and, eq, lt, sql as raw } from "drizzle-orm";
import { db, sql } from "@/db";
import { runs } from "@/db/schema";

/**
 * The job queue is the `runs` table itself, claimed with SKIP LOCKED. Using
 * Postgres rather than Redis or a hosted queue keeps the whole system to one
 * image plus one database, which is what makes the one-click install possible.
 */

/** A run whose worker died mid-execution is reclaimed after this long without a heartbeat. */
const ZOMBIE_TIMEOUT_MS = 15 * 60 * 1000;

export async function claimNextRun(workerId: string): Promise<string | null> {
  // Raw SQL: Drizzle has no expression for FOR UPDATE SKIP LOCKED inside a
  // subquery, and the atomic claim is the one thing this queue must get right.
  const claimed = await sql<{ id: string }[]>`
    UPDATE runs
    SET status = 'running',
        claimed_by = ${workerId},
        heartbeat_at = now(),
        started_at = COALESCE(started_at, now())
    WHERE id = (
      SELECT id FROM runs
      WHERE status = 'queued'
      ORDER BY queued_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;

  return claimed[0]?.id ?? null;
}

export async function enqueueRun(params: {
  agentId: string;
  scheduleId?: string | null;
  taskPrompt: string;
  trigger: "schedule" | "manual";
}): Promise<string> {
  const [run] = await db
    .insert(runs)
    .values({
      agentId: params.agentId,
      scheduleId: params.scheduleId ?? null,
      taskPrompt: params.taskPrompt,
      trigger: params.trigger,
      status: "queued",
    })
    .returning({ id: runs.id });

  return run.id;
}

/**
 * Recovers runs abandoned by a crashed worker. Without this a container restart
 * mid-run leaves rows stuck in `running` forever, and the agent looks hung.
 */
export async function reclaimZombieRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - ZOMBIE_TIMEOUT_MS);

  const reclaimed = await db
    .update(runs)
    .set({
      status: "failed",
      error: "The worker restarted while this run was in progress.",
      endedAt: new Date(),
    })
    .where(and(eq(runs.status, "running"), lt(runs.heartbeatAt, cutoff)))
    .returning({ id: runs.id });

  return reclaimed.length;
}

export async function queueDepth(): Promise<number> {
  const [{ count }] = await db
    .select({ count: raw<number>`count(*)::int` })
    .from(runs)
    .where(eq(runs.status, "queued"));
  return count;
}
