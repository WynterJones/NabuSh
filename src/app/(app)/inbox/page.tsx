import { listReports } from "@/lib/queries";
import { InboxView, type InboxItem } from "@/components/inbox-view";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentId } = await searchParams;
  const rows = await listReports(agentId);

  const items: InboxItem[] = rows.map(({ report, agent, run }) => ({
    id: report.id,
    runId: report.runId,
    subject: report.subject,
    bodyMd: report.bodyMd,
    kind: report.kind,
    isRead: report.isRead,
    createdAt: report.createdAt.toISOString(),
    agentName: agent.name,
    agentAvatar: agent.avatar,
    model: run.model,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
  }));

  return <InboxView items={items} scopedAgentId={agentId} />;
}
