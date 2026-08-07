import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Database, Inbox } from "lucide-react";
import { db } from "@/db";
import { agentTables, runs, schedules } from "@/db/schema";
import { getAgent } from "@/lib/queries";
import { describeCron } from "@/lib/cron";
import { formatDateTime, formatDuration, relativeTime } from "@/lib/utils";
import { AgentForm } from "@/components/agent-form";
import { RunNowPanel } from "@/components/run-now-panel";
import { PageHeader } from "@/components/page-header";
import { RunStatusPill } from "@/components/run-status-pill";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) notFound();

  const [agentSchedules, recentRuns, tables] = await Promise.all([
    db.select().from(schedules).where(eq(schedules.agentId, id)).orderBy(desc(schedules.createdAt)),
    db.select().from(runs).where(eq(runs.agentId, id)).orderBy(desc(runs.queuedAt)).limit(8),
    db.select().from(agentTables).where(eq(agentTables.agentId, id)),
  ]);

  return (
    <>
      <PageHeader
        title={`${agent.avatar} ${agent.name}`}
        subtitle={`${agentSchedules.length} schedule${agentSchedules.length === 1 ? "" : "s"} · ${tables.length} table${tables.length === 1 ? "" : "s"}`}
        action={
          <>
            <Link href={`/inbox?agent=${agent.id}`} className="btn btn-secondary">
              <Inbox size={15} />
              <span className="hidden sm:inline">Inbox</span>
            </Link>
            <Link href="/agents" className="btn btn-secondary">
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">All agents</span>
            </Link>
          </>
        }
      />

      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0">
          <AgentForm agent={agent} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <RunNowPanel agentId={agent.id} />

          <section className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
              <CalendarClock size={15} className="text-[var(--ink-3)]" />
              <h2 className="flex-1 text-[13.5px] font-semibold">Schedules</h2>
              <Link href={`/schedules?agent=${agent.id}`} className="btn btn-ghost btn-sm">
                Manage
              </Link>
            </header>
            {agentSchedules.length ? (
              <ul>
                {agentSchedules.map((s) => (
                  <li key={s.id} className="border-b border-[var(--rule)] px-4 py-3 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</p>
                      <span className={`pill ${s.enabled ? "pill-ok" : "pill-neutral"}`}>
                        {s.enabled ? "On" : "Off"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-[var(--ink-3)]">
                      {describeCron(s.cron)} · next {formatDateTime(s.nextRunAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-center text-[12.5px] text-[var(--ink-3)]">
                No schedules. This agent only runs when you trigger it&nbsp;manually.
              </p>
            )}
          </section>

          <section className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
              <Database size={15} className="text-[var(--ink-3)]" />
              <h2 className="flex-1 text-[13.5px] font-semibold">Tables</h2>
              <Link href={`/database?agent=${agent.id}`} className="btn btn-ghost btn-sm">
                Open
              </Link>
            </header>
            {tables.length ? (
              <ul>
                {tables.map((t) => (
                  <li key={t.id} className="border-b border-[var(--rule)] px-4 py-2.5 last:border-b-0">
                    <p className="truncate text-[13px] font-medium">{t.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
                      {t.columns.map((c) => c.name).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-center text-[12.5px] text-[var(--ink-3)]">
                No tables yet. The agent creates its own when it needs&nbsp;them.
              </p>
            )}
          </section>

          <section className="card overflow-hidden">
            <header className="border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
              <h2 className="text-[13.5px] font-semibold">Recent runs</h2>
            </header>
            {recentRuns.length ? (
              <ul>
                {recentRuns.map((run) => (
                  <li key={run.id} className="border-b border-[var(--rule)] last:border-b-0">
                    <Link
                      href={`/runs/${run.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <RunStatusPill status={run.status} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-2)]">
                        {relativeTime(run.queuedAt)}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-3)]">
                        {formatDuration(run.startedAt, run.endedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-center text-[12.5px] text-[var(--ink-3)]">
                This agent hasn&rsquo;t run&nbsp;yet.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
