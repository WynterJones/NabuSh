import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Wrench, MessageSquare, AlertTriangle, CornerDownRight } from "lucide-react";
import { db } from "@/db";
import { agents, reports, runs } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { RunStatusPill } from "@/components/run-status-pill";
import { estimateCost, formatDateTime, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db
    .select({ run: runs, agent: agents })
    .from(runs)
    .innerJoin(agents, eq(runs.agentId, agents.id))
    .where(eq(runs.id, id))
    .limit(1);

  if (!row) notFound();
  const { run, agent } = row;

  const [report] = await db.select().from(reports).where(eq(reports.runId, run.id)).limit(1);

  return (
    <>
      <PageHeader
        title="Run log"
        subtitle={`${agent.avatar} ${agent.name}`}
        action={
          <Link href={`/agents/${agent.id}`} className="btn btn-secondary">
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Agent</span>
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-[860px] p-4 sm:p-5">
        <section className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusPill status={run.status} />
            <span className="pill pill-neutral">
              {run.trigger === "manual" ? "Manual" : "Scheduled"}
            </span>
            {report && (
              <Link href="/inbox" className="btn btn-ghost btn-sm ml-auto">
                View report
              </Link>
            )}
          </div>

          <dl className="dl-grid mt-4">
            <dt>Queued</dt>
            <dd className="tabular-nums">{formatDateTime(run.queuedAt)}</dd>
            <dt>Duration</dt>
            <dd className="tabular-nums">{formatDuration(run.startedAt, run.endedAt)}</dd>
            <dt>Tokens</dt>
            <dd className="tabular-nums">
              {run.tokensIn.toLocaleString()} in · {run.tokensOut.toLocaleString()} out · approx{" "}
              {estimateCost(agent.model, run.tokensIn, run.tokensOut)}
            </dd>
            <dt>Task</dt>
            <dd className="whitespace-pre-wrap">{run.taskPrompt}</dd>
          </dl>

          {run.error && (
            <div className="mt-4 flex items-start gap-2 rounded-[7px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5">
              <AlertTriangle size={15} className="mt-px shrink-0 text-[var(--danger)]" />
              <p className="text-[12.5px] leading-relaxed text-[var(--danger)]">{run.error}</p>
            </div>
          )}
        </section>

        <h2 className="mt-6 text-[14px] font-semibold tracking-tight">
          Steps
          <span className="ml-2 font-normal text-[var(--ink-3)]">{run.steps.length}</span>
        </h2>

        {run.steps.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {run.steps.map((step, index) => (
              <li key={index} className="card overflow-hidden p-3.5">
                {step.type === "thinking" && (
                  <>
                    <StepHeader
                      icon={<MessageSquare size={14} />}
                      label="Reasoning"
                      at={step.at}
                    />
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink-2)]">
                      {step.text}
                    </p>
                  </>
                )}

                {step.type === "tool_call" && (
                  <>
                    <StepHeader icon={<Wrench size={14} />} label={step.tool} at={step.at} />
                    <pre className="mt-2 overflow-x-auto rounded-[6px] border border-[var(--rule)] bg-[var(--surface-2)] p-2.5 text-[12px] leading-relaxed">
                      <code>{JSON.stringify(step.input, null, 2)}</code>
                    </pre>
                  </>
                )}

                {step.type === "tool_result" && (
                  <>
                    <StepHeader
                      icon={<CornerDownRight size={14} />}
                      label={`${step.tool} result`}
                      at={step.at}
                      tone={step.ok ? undefined : "danger"}
                    />
                    <pre className="mt-2 max-h-[280px] overflow-auto rounded-[6px] border border-[var(--rule)] bg-[var(--surface-2)] p-2.5 text-[12px] leading-relaxed">
                      <code>{step.output}</code>
                    </pre>
                  </>
                )}

                {step.type === "error" && (
                  <>
                    <StepHeader
                      icon={<AlertTriangle size={14} />}
                      label="Error"
                      at={step.at}
                      tone="danger"
                    />
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--danger)]">
                      {step.message}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="card mt-3 px-4 py-6 text-center text-[13px] text-[var(--ink-3)]">
            {run.status === "queued"
              ? "Waiting for a worker to pick this up."
              : "No steps were recorded."}
          </p>
        )}
      </div>
    </>
  );
}

function StepHeader({
  icon,
  label,
  at,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  at: string;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={tone === "danger" ? "text-[var(--danger)]" : "text-[var(--ink-3)]"}>
        {icon}
      </span>
      <span
        className={`flex-1 truncate text-[12.5px] font-semibold ${
          tone === "danger" ? "text-[var(--danger)]" : "text-[var(--ink)]"
        }`}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      >
        {label}
      </span>
      <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-3)]">
        {new Date(at).toLocaleTimeString()}
      </span>
    </div>
  );
}
