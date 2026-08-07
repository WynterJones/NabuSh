import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { agentTables, agentRows, type TableColumn } from "@/db/schema";

/**
 * The toolset an agent can call during a run.
 *
 * Database tools are always available — an agent's own storage is core to what
 * Nabu is. `web_fetch` is opt-in per agent. `submit_report` is terminal: calling
 * it ends the run, which makes "a run always produces a report" a property of
 * the loop rather than something we hope the model remembers to do.
 */

export const SUBMIT_REPORT = "submit_report";

export type ToolContext = {
  agentId: string;
  /** Set by submit_report to end the loop. */
  report?: { subject: string; bodyMd: string };
};

export type ToolResult = { ok: boolean; output: string };

const COLUMN_TYPES = ["text", "number", "boolean", "date", "json"] as const;

export function toolDefinitions(enabled: string[]): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    {
      name: "create_table",
      description:
        "Create a table in your private database to store data across runs. Use this the first time you need to remember something. Table names must be unique for you.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Table name, e.g. 'competitors'" },
          description: { type: "string", description: "What this table holds" },
          columns: {
            type: "array",
            description: "Column definitions",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: COLUMN_TYPES as unknown as string[] },
                required: { type: "boolean" },
              },
              required: ["name", "type"],
            },
          },
        },
        required: ["name", "columns"],
      },
    },
    {
      name: "list_tables",
      description: "List your tables and their columns. Call this to see what you already store.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "insert_rows",
      description: "Insert one or more rows into one of your tables.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string" },
          rows: { type: "array", items: { type: "object" }, description: "Row objects keyed by column name" },
        },
        required: ["table", "rows"],
      },
    },
    {
      name: "query_rows",
      description:
        "Read rows from one of your tables. `filter` matches columns exactly; omit it to read everything.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string" },
          filter: { type: "object", description: "Exact-match column filter" },
          limit: { type: "number", description: "Max rows to return (default 100)" },
        },
        required: ["table"],
      },
    },
    {
      name: "update_rows",
      description: "Update rows matching a filter, merging `patch` into each matched row.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string" },
          filter: { type: "object" },
          patch: { type: "object" },
        },
        required: ["table", "filter", "patch"],
      },
    },
    {
      name: "delete_rows",
      description: "Delete rows matching a filter. A filter is required — this cannot delete a whole table by accident.",
      input_schema: {
        type: "object",
        properties: {
          table: { type: "string" },
          filter: { type: "object" },
        },
        required: ["table", "filter"],
      },
    },
    {
      name: SUBMIT_REPORT,
      description:
        "Finish the run and file your report to the inbox. Call this exactly once, when the task is done. This ends the run — do not call any other tool afterwards.",
      input_schema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Short subject line, like an email subject" },
          body_md: {
            type: "string",
            description:
              "The report body in Markdown. Lead with what you found or did. Be specific and include the actual data, not a summary of your process.",
          },
        },
        required: ["subject", "body_md"],
      },
    },
  ];

  if (enabled.includes("web_fetch")) {
    tools.push({
      name: "web_fetch",
      description: "Fetch a URL and return its readable text content.",
      input_schema: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute http(s) URL" } },
        required: ["url"],
      },
    });
  }

  return tools;
}

async function findTable(agentId: string, name: string) {
  const [table] = await db
    .select()
    .from(agentTables)
    .where(and(eq(agentTables.agentId, agentId), eq(agentTables.name, name)))
    .limit(1);
  return table ?? null;
}

/** Coerces a value to the declared column type; agents send loosely-typed JSON. */
function coerce(value: unknown, type: TableColumn["type"]): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
    case "date": {
      const d = new Date(value as string);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case "text":
      return typeof value === "string" ? value : JSON.stringify(value);
    case "json":
    default:
      return value;
  }
}

function validateRow(row: Record<string, unknown>, columns: TableColumn[]): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};

  for (const column of columns) {
    const value = row[column.name];
    if ((value === undefined || value === null) && column.required) {
      return { error: `Missing required column "${column.name}"` };
    }
    if (value !== undefined) data[column.name] = coerce(value, column.type);
  }

  const unknownKeys = Object.keys(row).filter((k) => !columns.some((c) => c.name === k));
  if (unknownKeys.length) {
    return {
      error: `Unknown column(s): ${unknownKeys.join(", ")}. This table has: ${columns.map((c) => c.name).join(", ")}`,
    };
  }

  return { data };
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case SUBMIT_REPORT: {
        const subject = String(input.subject ?? "").trim();
        const bodyMd = String(input.body_md ?? "").trim();
        if (!subject || !bodyMd) return { ok: false, output: "Both subject and body_md are required." };
        ctx.report = { subject, bodyMd };
        return { ok: true, output: "Report filed." };
      }

      case "create_table": {
        const tableName = String(input.name ?? "").trim();
        if (!tableName) return { ok: false, output: "A table name is required." };

        const rawColumns = Array.isArray(input.columns) ? input.columns : [];
        const columns: TableColumn[] = rawColumns
          .map((c) => c as Record<string, unknown>)
          .filter((c) => typeof c.name === "string" && c.name.trim())
          .map((c) => ({
            name: String(c.name).trim(),
            type: (COLUMN_TYPES as readonly string[]).includes(String(c.type))
              ? (c.type as TableColumn["type"])
              : "text",
            required: Boolean(c.required),
          }));

        if (!columns.length) return { ok: false, output: "At least one column is required." };

        if (await findTable(ctx.agentId, tableName)) {
          return { ok: false, output: `Table "${tableName}" already exists. Use list_tables to see its columns.` };
        }

        await db.insert(agentTables).values({
          agentId: ctx.agentId,
          name: tableName,
          description: String(input.description ?? ""),
          columns,
        });

        return { ok: true, output: `Created table "${tableName}" with columns: ${columns.map((c) => `${c.name} (${c.type})`).join(", ")}` };
      }

      case "list_tables": {
        const tables = await db.select().from(agentTables).where(eq(agentTables.agentId, ctx.agentId));
        if (!tables.length) return { ok: true, output: "You have no tables yet. Use create_table to make one." };

        const described = await Promise.all(
          tables.map(async (t) => {
            const [{ count }] = await db
              .select({ count: raw<number>`count(*)::int` })
              .from(agentRows)
              .where(eq(agentRows.tableId, t.id));
            return `- ${t.name} (${count} rows): ${t.columns.map((c) => `${c.name}:${c.type}`).join(", ")}${t.description ? ` — ${t.description}` : ""}`;
          }),
        );

        return { ok: true, output: described.join("\n") };
      }

      case "insert_rows": {
        const table = await findTable(ctx.agentId, String(input.table ?? ""));
        if (!table) return { ok: false, output: `No table named "${input.table}". Use list_tables to see yours.` };

        const rows = Array.isArray(input.rows) ? input.rows : [];
        if (!rows.length) return { ok: false, output: "No rows provided." };

        const values: { tableId: string; data: Record<string, unknown> }[] = [];
        for (const [i, row] of rows.entries()) {
          const result = validateRow(row as Record<string, unknown>, table.columns);
          if ("error" in result) return { ok: false, output: `Row ${i + 1}: ${result.error}` };
          values.push({ tableId: table.id, data: result.data });
        }

        await db.insert(agentRows).values(values);
        return { ok: true, output: `Inserted ${values.length} row(s) into "${table.name}".` };
      }

      case "query_rows": {
        const table = await findTable(ctx.agentId, String(input.table ?? ""));
        if (!table) return { ok: false, output: `No table named "${input.table}".` };

        const limit = Math.min(Number(input.limit) || 100, 500);
        const filter = (input.filter ?? {}) as Record<string, unknown>;

        let rows = await db
          .select()
          .from(agentRows)
          .where(eq(agentRows.tableId, table.id))
          .limit(Object.keys(filter).length ? 5000 : limit);

        // Filtering in JS rather than SQL: JSONB values are loosely typed here
        // (an agent may write "5" where it earlier wrote 5), so string-compare
        // matching is more forgiving than a JSONB containment query.
        if (Object.keys(filter).length) {
          rows = rows
            .filter((r) =>
              Object.entries(filter).every(([k, v]) => String(r.data[k] ?? "") === String(v ?? "")),
            )
            .slice(0, limit);
        }

        if (!rows.length) return { ok: true, output: "No matching rows." };

        return {
          ok: true,
          output: JSON.stringify(rows.map((r) => ({ _id: r.id, ...r.data })), null, 2),
        };
      }

      case "update_rows": {
        const table = await findTable(ctx.agentId, String(input.table ?? ""));
        if (!table) return { ok: false, output: `No table named "${input.table}".` };

        const filter = (input.filter ?? {}) as Record<string, unknown>;
        const patch = (input.patch ?? {}) as Record<string, unknown>;
        if (!Object.keys(patch).length) return { ok: false, output: "Nothing to update — patch is empty." };

        const rows = await db.select().from(agentRows).where(eq(agentRows.tableId, table.id));
        const matched = rows.filter((r) =>
          Object.entries(filter).every(([k, v]) => String(r.data[k] ?? "") === String(v ?? "")),
        );

        for (const row of matched) {
          const merged = { ...row.data };
          for (const [key, value] of Object.entries(patch)) {
            const column = table.columns.find((c) => c.name === key);
            if (!column) return { ok: false, output: `Unknown column "${key}" in patch.` };
            merged[key] = coerce(value, column.type);
          }
          await db
            .update(agentRows)
            .set({ data: merged, updatedAt: new Date() })
            .where(eq(agentRows.id, row.id));
        }

        return { ok: true, output: `Updated ${matched.length} row(s).` };
      }

      case "delete_rows": {
        const table = await findTable(ctx.agentId, String(input.table ?? ""));
        if (!table) return { ok: false, output: `No table named "${input.table}".` };

        const filter = (input.filter ?? {}) as Record<string, unknown>;
        if (!Object.keys(filter).length) {
          return { ok: false, output: "A filter is required. To clear a table, delete its rows explicitly." };
        }

        const rows = await db.select().from(agentRows).where(eq(agentRows.tableId, table.id));
        const matched = rows.filter((r) =>
          Object.entries(filter).every(([k, v]) => String(r.data[k] ?? "") === String(v ?? "")),
        );

        for (const row of matched) {
          await db.delete(agentRows).where(eq(agentRows.id, row.id));
        }

        return { ok: true, output: `Deleted ${matched.length} row(s).` };
      }

      case "web_fetch": {
        const url = String(input.url ?? "");
        if (!/^https?:\/\//i.test(url)) return { ok: false, output: "URL must start with http:// or https://" };

        const response = await fetch(url, {
          headers: { "User-Agent": "Nabu/1.0 (+https://nabu.sh)" },
          signal: AbortSignal.timeout(30_000),
          redirect: "follow",
        });

        if (!response.ok) return { ok: false, output: `Request failed: ${response.status} ${response.statusText}` };

        const contentType = response.headers.get("content-type") ?? "";
        const body = await response.text();

        if (contentType.includes("json")) return { ok: true, output: body.slice(0, 100_000) };

        // Crude but dependency-free readability pass: drop non-content elements,
        // strip tags, collapse whitespace.
        const text = body
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
          .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim();

        return { ok: true, output: text.slice(0, 100_000) };
      }

      default:
        return { ok: false, output: `Unknown tool "${name}".` };
    }
  } catch (err) {
    return { ok: false, output: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
