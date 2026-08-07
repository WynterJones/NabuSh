import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

/**
 * Nabu is single-tenant: one deployment serves one customer. There is
 * deliberately no `user_id` scoping on any table below — `users` exists only to
 * authenticate access to this instance, not to partition data within it.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Instance-wide key/value config. Values holding secrets (model API keys) are
 * written through `lib/crypto` and stored as ciphertext; `isEncrypted` records
 * which ones need decrypting on read.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Emoji shown in the agent switcher and inbox rows. */
  avatar: text("avatar").notNull().default("🤖"),
  /** The agent's standing identity — its job description. */
  instructions: text("instructions").notNull().default(""),
  model: text("model").notNull().default("claude-sonnet-5"),
  /** Tool names this agent may call, beyond the always-on database tools. */
  toolsEnabled: jsonb("tools_enabled").$type<string[]>().notNull().default(["web_fetch"]),
  status: text("status").$type<"active" | "paused">().notNull().default("active"),
  maxSteps: integer("max_steps").notNull().default(30),
  maxTokens: integer("max_tokens").notNull().default(200_000),
  /** Wall-clock cap for a single run. */
  timeoutSeconds: integer("timeout_seconds").notNull().default(600),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    /** The specific task prompt for this schedule, layered on the agent's instructions. */
    taskPrompt: text("task_prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("schedules_agent_idx").on(t.agentId),
    // The scheduler tick polls on (enabled, nextRunAt) every few seconds.
    index("schedules_due_idx").on(t.enabled, t.nextRunAt),
  ],
);

export type RunStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * A run is both the execution record and the job queue entry — the worker
 * claims rows here with SELECT ... FOR UPDATE SKIP LOCKED rather than needing a
 * separate queue table or an external broker.
 */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Null when a run was started manually rather than by a schedule. */
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    /** Denormalised so a run survives its schedule being edited or deleted. */
    taskPrompt: text("task_prompt").notNull(),
    trigger: text("trigger").$type<"schedule" | "manual">().notNull().default("schedule"),
    steps: jsonb("steps").$type<RunStep[]>().notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    error: text("error"),
    /** Identifies the worker holding the claim, so crash recovery can spot zombies. */
    claimedBy: text("claimed_by"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_agent_idx").on(t.agentId),
    index("runs_claim_idx").on(t.status, t.queuedAt),
  ],
);

export type RunStep =
  | { type: "thinking"; text: string; at: string }
  | { type: "tool_call"; tool: string; input: unknown; at: string }
  | { type: "tool_result"; tool: string; ok: boolean; output: string; at: string }
  | { type: "error"; message: string; at: string };

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    bodyMd: text("body_md").notNull(),
    /** Failed runs file a report too — a silent inbox must never mean "something broke". */
    kind: text("kind").$type<"success" | "failure">().notNull().default("success"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reports_agent_idx").on(t.agentId),
    index("reports_inbox_idx").on(t.createdAt),
  ],
);

export type ColumnType = "text" | "number" | "boolean" | "date" | "json";

export type TableColumn = {
  name: string;
  type: ColumnType;
  required?: boolean;
};

/**
 * Agents declare their own tables at runtime. Rather than issuing DDL per agent
 * (which would mean migrations we don't control and unbounded schema growth),
 * a "table" is a row here describing columns, and its rows live in
 * `agent_rows` as JSONB validated against that declaration.
 */
export const agentTables = pgTable(
  "agent_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    columns: jsonb("columns").$type<TableColumn[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_tables_agent_idx").on(t.agentId)],
);

export const agentRows = pgTable(
  "agent_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => agentTables.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_rows_table_idx").on(t.tableId)],
);

export type Agent = typeof agents.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type AgentTable = typeof agentTables.$inferSelect;
export type AgentRow = typeof agentRows.$inferSelect;
export type User = typeof users.$inferSelect;
