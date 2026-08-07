"use client";

import { useState, useTransition } from "react";
import { Database, Plus, Trash2, Check, X, Eraser } from "lucide-react";
import type { TableColumn } from "@/db/schema";
import { insertAgentRow, updateAgentRow, deleteAgentRow, clearAgentTable } from "@/app/actions";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "./page-header";
import { ConfirmDialog } from "./inbox-view";

export type DbTable = {
  id: string;
  agentId: string;
  agentName: string;
  agentAvatar: string;
  name: string;
  description: string;
  columns: TableColumn[];
  rows: { id: string; data: Record<string, unknown>; updatedAt: string }[];
};

/**
 * The human window onto what agents have stored. Editable when a single agent is
 * selected; read-only across "All agents", where rows from different schemas
 * would otherwise be edited in one undifferentiated grid.
 */
export function DatabaseView({
  tables,
  scoped,
}: {
  tables: DbTable[];
  scoped: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(tables[0]?.id ?? null);
  const active = tables.find((t) => t.id === activeId) ?? tables[0] ?? null;

  if (!tables.length) {
    return (
      <>
        <PageHeader title="Database" subtitle="What your agents have stored." />
        <EmptyState
          icon={<Database size={22} />}
          title="No tables yet"
          body={
            scoped
              ? "This agent hasn't created any tables. Agents create their own tables the first time they need to remember something between runs."
              : "Your agents haven't stored anything yet. They create tables themselves during a run — you don't need to set anything up."
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Database"
        subtitle={
          scoped
            ? "Tables this agent created. You can edit rows directly."
            : "Tables across all agents. Select a single agent to edit."
        }
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav className="shrink-0 border-b border-[var(--rule)] bg-[var(--surface)] p-3 lg:w-[240px] lg:border-b-0 lg:border-r">
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {tables.map((table) => (
              <li key={table.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActiveId(table.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left transition-colors",
                    active?.id === table.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span className="text-[13px] leading-none">{table.agentAvatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">
                      {table.name}
                    </span>
                    {!scoped && (
                      <span className="block truncate text-[11px] leading-tight text-[var(--ink-3)]">
                        {table.agentName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-3)]">
                    {table.rows.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {active && <TableGrid key={active.id} table={active} editable={scoped} />}
      </div>
    </>
  );
}

function TableGrid({ table, editable }: { table: DbTable; editable: boolean }) {
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, startTransition] = useTransition();

  const startEdit = (rowId: string, data: Record<string, unknown>) => {
    setAdding(false);
    setEditingRow(rowId);
    setDraft(
      Object.fromEntries(
        table.columns.map((c) => [c.name, data[c.name] == null ? "" : String(data[c.name])]),
      ),
    );
  };

  const startAdd = () => {
    setEditingRow(null);
    setAdding(true);
    setDraft(Object.fromEntries(table.columns.map((c) => [c.name, ""])));
  };

  const cancel = () => {
    setEditingRow(null);
    setAdding(false);
    setDraft({});
  };

  const commit = () => {
    const data = coerceDraft(draft, table.columns);
    startTransition(async () => {
      if (adding) await insertAgentRow(table.id, data);
      else if (editingRow) await updateAgentRow(editingRow, data);
      cancel();
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold leading-tight">{table.name}</h2>
          <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
            {table.description || `${table.columns.length} columns`} · {table.rows.length} row
            {table.rows.length === 1 ? "" : "s"}
          </p>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmClear(true)}
              disabled={!table.rows.length || pending}
            >
              <Eraser size={13} />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={startAdd} disabled={pending}>
              <Plus size={13} />
              Add row
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!table.rows.length && !adding ? (
          <div className="grid place-items-center py-16">
            <div className="max-w-[360px] text-center">
              <p className="text-[14px] font-medium">This table is empty</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)] text-pretty">
                The agent created it but hasn&rsquo;t written any rows&nbsp;yet.
              </p>
            </div>
          </div>
        ) : (
          <div className="table-frame">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {table.columns.map((col) => (
                      <th key={col.name}>
                        {col.name}
                        <span className="ml-1.5 font-normal text-[var(--ink-3)]">{col.type}</span>
                      </th>
                    ))}
                    <th className="w-px">Updated</th>
                    {editable && <th className="w-px" />}
                  </tr>
                </thead>
                <tbody>
                  {adding && (
                    <tr>
                      {table.columns.map((col) => (
                        <td key={col.name}>
                          <input
                            className="input h-8 text-[13px]"
                            value={draft[col.name] ?? ""}
                            onChange={(e) => setDraft({ ...draft, [col.name]: e.target.value })}
                            placeholder={col.type}
                          />
                        </td>
                      ))}
                      <td />
                      <td>
                        <RowActions onCommit={commit} onCancel={cancel} pending={pending} />
                      </td>
                    </tr>
                  )}

                  {table.rows.map((row) => {
                    const isEditing = editingRow === row.id;
                    return (
                      <tr key={row.id}>
                        {table.columns.map((col) => (
                          <td key={col.name} className={col.type === "number" ? "num" : undefined}>
                            {isEditing ? (
                              <input
                                className="input h-8 text-[13px]"
                                value={draft[col.name] ?? ""}
                                onChange={(e) => setDraft({ ...draft, [col.name]: e.target.value })}
                              />
                            ) : (
                              <span className="truncate-cell block">
                                {renderCell(row.data[col.name], col.type)}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap text-[12px] tabular-nums text-[var(--ink-3)]">
                          {formatDateTime(row.updatedAt)}
                        </td>
                        {editable && (
                          <td>
                            {isEditing ? (
                              <RowActions onCommit={commit} onCancel={cancel} pending={pending} />
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => startEdit(row.id, row.data)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  title="Delete row"
                                  onClick={() =>
                                    startTransition(() => void deleteAgentRow(row.id))
                                  }
                                >
                                  <Trash2 size={13} />
                                  <span className="sr-only">Delete row</span>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog
          title={`Clear every row in "${table.name}"?`}
          body={`All ${table.rows.length} rows will be deleted. The table and its columns stay, so the agent can keep using it.`}
          confirmLabel="Delete all rows"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            startTransition(() => void clearAgentTable(table.id));
          }}
        />
      )}
    </section>
  );
}

function RowActions({
  onCommit,
  onCancel,
  pending,
}: {
  onCommit: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" className="btn btn-primary btn-sm" onClick={onCommit} disabled={pending}>
        <Check size={13} />
        <span className="sr-only">Save</span>
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={pending}>
        <X size={13} />
        <span className="sr-only">Cancel</span>
      </button>
    </div>
  );
}

function renderCell(value: unknown, type?: TableColumn["type"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  // Agents store dates as ISO strings; showing the raw string in a grid a human
  // reads is noise.
  if (type === "date") {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed);
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Mirrors the runtime's coercion so hand-edits produce the same shapes agents write. */
function coerceDraft(
  draft: Record<string, string>,
  columns: TableColumn[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    const raw = draft[col.name] ?? "";
    if (raw === "") {
      out[col.name] = null;
      continue;
    }
    switch (col.type) {
      case "number": {
        const n = Number(raw);
        out[col.name] = Number.isFinite(n) ? n : null;
        break;
      }
      case "boolean":
        out[col.name] = raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
        break;
      case "date": {
        const d = new Date(raw);
        out[col.name] = Number.isNaN(d.getTime()) ? null : d.toISOString();
        break;
      }
      case "json":
        try {
          out[col.name] = JSON.parse(raw);
        } catch {
          out[col.name] = raw;
        }
        break;
      default:
        out[col.name] = raw;
    }
  }
  return out;
}
