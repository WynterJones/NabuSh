import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRows, agentTables, agents } from "@/db/schema";
import { DatabaseView, type DbTable } from "@/components/database-view";

export const dynamic = "force-dynamic";

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentId } = await searchParams;

  const tableRows = await db
    .select({ table: agentTables, agent: { name: agents.name, avatar: agents.avatar } })
    .from(agentTables)
    .innerJoin(agents, eq(agentTables.agentId, agents.id))
    .where(agentId ? eq(agentTables.agentId, agentId) : undefined)
    .orderBy(asc(agentTables.name));

  const tables: DbTable[] = await Promise.all(
    tableRows.map(async ({ table, agent }) => {
      const rows = await db
        .select()
        .from(agentRows)
        .where(eq(agentRows.tableId, table.id))
        .orderBy(asc(agentRows.createdAt))
        .limit(500);

      return {
        id: table.id,
        agentId: table.agentId,
        agentName: agent.name,
        agentAvatar: agent.avatar,
        name: table.name,
        description: table.description,
        columns: table.columns,
        rows: rows.map((r) => ({
          id: r.id,
          data: r.data,
          updatedAt: r.updatedAt.toISOString(),
        })),
      };
    }),
  );

  return <DatabaseView tables={tables} scoped={Boolean(agentId)} />;
}
