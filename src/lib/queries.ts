import { and, desc, eq, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { agents, reports, runs, schedules } from "@/db/schema";
import type { ShellAgent } from "@/components/shell";

export async function listShellAgents(): Promise<ShellAgent[]> {
  const rows = await db.select().from(agents).orderBy(agents.createdAt);

  const unreadCounts = await db
    .select({ agentId: reports.agentId, count: raw<number>`count(*)::int` })
    .from(reports)
    .where(eq(reports.isRead, false))
    .groupBy(reports.agentId);

  const unreadByAgent = new Map(unreadCounts.map((r) => [r.agentId, r.count]));

  return rows.map((agent) => ({
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    status: agent.status,
    unread: unreadByAgent.get(agent.id) ?? 0,
  }));
}

export async function totalUnread(): Promise<number> {
  const [row] = await db
    .select({ count: raw<number>`count(*)::int` })
    .from(reports)
    .where(eq(reports.isRead, false));
  return row?.count ?? 0;
}

export async function listReports(agentId?: string, filter?: "unread") {
  const conditions = [
    agentId ? eq(reports.agentId, agentId) : undefined,
    filter === "unread" ? eq(reports.isRead, false) : undefined,
  ].filter(Boolean);

  return db
    .select({
      report: reports,
      agent: { name: agents.name, avatar: agents.avatar },
      run: { id: runs.id, model: agents.model, tokensIn: runs.tokensIn, tokensOut: runs.tokensOut, startedAt: runs.startedAt, endedAt: runs.endedAt },
    })
    .from(reports)
    .innerJoin(agents, eq(reports.agentId, agents.id))
    .innerJoin(runs, eq(reports.runId, runs.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function listSchedules(agentId?: string) {
  return db
    .select({ schedule: schedules, agent: { id: agents.id, name: agents.name, avatar: agents.avatar } })
    .from(schedules)
    .innerJoin(agents, eq(schedules.agentId, agents.id))
    .where(agentId ? eq(schedules.agentId, agentId) : undefined)
    .orderBy(desc(schedules.createdAt));
}

export async function listRuns(agentId?: string, limit = 50) {
  return db
    .select({ run: runs, agent: { name: agents.name, avatar: agents.avatar, model: agents.model } })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(agentId ? eq(runs.agentId, agentId) : undefined)
    .orderBy(desc(runs.queuedAt))
    .limit(limit);
}

export async function getAgent(id: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return agent ?? null;
}
