import Link from "next/link";
import { desc, eq, sql as raw } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { db } from "@/db";
import { agents, reports, runs, schedules } from "@/db/schema";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { PageHeader, EmptyState } from "@/components/page-header";
import { OnboardingCard } from "@/components/onboarding-card";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [rows, onboardedAt] = await Promise.all([
    db.select().from(agents).orderBy(desc(agents.createdAt)),
    getSetting(SETTING_KEYS.onboardedAt),
  ]);

  const cards = await Promise.all(
    rows.map(async (agent) => {
      const [[scheduleCount], [unread], [lastRun], [failures]] = await Promise.all([
        db
          .select({ count: raw<number>`count(*)::int` })
          .from(schedules)
          .where(eq(schedules.agentId, agent.id)),
        db
          .select({ count: raw<number>`count(*)::int` })
          .from(reports)
          .where(raw`${reports.agentId} = ${agent.id} and ${reports.isRead} = false`),
        db
          .select({ endedAt: runs.endedAt, status: runs.status })
          .from(runs)
          .where(eq(runs.agentId, agent.id))
          .orderBy(desc(runs.queuedAt))
          .limit(1),
        db
          .select({ count: raw<number>`count(*)::int` })
          .from(runs)
          .where(
            raw`${runs.agentId} = ${agent.id} and ${runs.status} = 'failed' and ${runs.queuedAt} > now() - interval '7 days'`,
          ),
      ]);

      return {
        agent,
        scheduleCount: scheduleCount?.count ?? 0,
        unread: unread?.count ?? 0,
        lastRun: lastRun ?? null,
        failures: failures?.count ?? 0,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Each one has its own instructions, schedules, database and inbox."
        action={
          <Link href="/agents/new" className="btn btn-primary">
            <Plus size={15} />
            New agent
          </Link>
        }
      />

      <div className="p-4 sm:p-5">
        {!onboardedAt && rows.length === 0 && <OnboardingCard />}

        {rows.length === 0 ? (
          !onboardedAt ? null : (
            <EmptyState
              icon={<Bot size={22} />}
              title="No agents yet"
              body="An agent is a set of standing instructions plus a schedule. Create one, tell it what its job is, and it starts filing reports."
              action={
                <Link href="/agents/new" className="btn btn-primary">
                  <Plus size={15} />
                  New agent
                </Link>
              }
            />
          )
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ agent, scheduleCount, unread, lastRun, failures }) => (
              <li key={agent.id}>
                <Link
                  href={`/agents/${agent.id}`}
                  className="card flex h-full flex-col p-4 transition-colors hover:border-[var(--rule-strong)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[var(--surface-3)] text-[19px] leading-none">
                      {agent.avatar}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold leading-tight">
                        {agent.name}
                      </p>
                      <p className="mt-1 text-[12px] leading-tight text-[var(--ink-3)]">
                        {scheduleCount} schedule{scheduleCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {agent.status === "paused" ? (
                      <span className="pill pill-neutral shrink-0">Paused</span>
                    ) : failures > 0 ? (
                      <span className="pill pill-danger shrink-0">
                        {failures} failed
                      </span>
                    ) : (
                      <span className="pill pill-ok shrink-0">Active</span>
                    )}
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                    {agent.instructions.trim() || "No standing instructions yet."}
                  </p>

                  <dl className="dl-grid mt-3 border-t border-[var(--rule)] pt-3">
                    <dt>Last run</dt>
                    <dd className="tabular-nums">{relativeTime(lastRun?.endedAt ?? null)}</dd>
                    <dt>Unread</dt>
                    <dd className="tabular-nums">{unread || "None"}</dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
