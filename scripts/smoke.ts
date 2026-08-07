import { db } from "@/db";
import { agents, agentTables, agentRows, schedules } from "@/db/schema";
import { claimNextRun, enqueueRun, queueDepth } from "@/worker/queue";
import { executeTool, toolDefinitions, type ToolContext } from "@/agent/tools";
import { tickScheduler, refreshNextRun } from "@/worker/scheduler";
import { validateCron, nextRunAt } from "@/lib/cron";
import { encrypt, decrypt, hashPassword, verifyPassword, maskSecret } from "@/lib/crypto";
import { setSetting, getSetting, SETTING_KEYS } from "@/lib/settings";
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    console.log(`  FAIL  ${label} ${detail}`);
    failures++;
  }
}

async function main() {
  console.log("\n=== crypto ===");
  const secret = "sk-ant-api03-supersecretvalue";
  check("encrypt/decrypt roundtrip", decrypt(encrypt(secret)) === secret);
  check("ciphertext differs each call", encrypt(secret) !== encrypt(secret));
  const hash = hashPassword("hunter2");
  check("password verifies", verifyPassword("hunter2", hash));
  check("wrong password rejected", !verifyPassword("hunter3", hash));
  check("mask hides middle", maskSecret(secret).includes("••") && !maskSecret(secret).includes("supersecret"));

  console.log("\n=== settings (encrypted at rest) ===");
  await setSetting(SETTING_KEYS.anthropicApiKey, secret, { encrypted: true });
  check("decrypts on read", (await getSetting(SETTING_KEYS.anthropicApiKey)) === secret);
  const rawRow = await db.execute(
    `select value from settings where key = '${SETTING_KEYS.anthropicApiKey}'` as never,
  );
  const stored = (rawRow as unknown as { value: string }[])[0]?.value ?? "";
  check("stored value is ciphertext, not plaintext", !stored.includes("supersecret"), `got: ${stored.slice(0, 30)}`);

  console.log("\n=== cron ===");
  const ok = validateCron("0 9 * * 1-5", "America/New_York");
  check("valid 5-field cron accepted", ok.valid);
  if (ok.valid) console.log(`        -> "${ok.description}" next: ${ok.nextRun.toISOString()}`);
  check("6-field cron rejected", !validateCron("*/5 * * * * *").valid);
  check("garbage rejected", !validateCron("not a cron").valid);
  check("nextRunAt returns future date", (nextRunAt("0 9 * * *")?.getTime() ?? 0) > Date.now());

  console.log("\n=== agent + tools ===");
  const [agent] = await db
    .insert(agents)
    .values({ name: "Smoke Agent", instructions: "Test agent", toolsEnabled: ["web_fetch"] })
    .returning();
  const ctx: ToolContext = { agentId: agent.id };

  const tools = toolDefinitions(agent.toolsEnabled);
  check("submit_report is defined", tools.some((t) => t.name === "submit_report"));
  check("web_fetch included when enabled", tools.some((t) => t.name === "web_fetch"));
  check("web_fetch excluded when disabled", !toolDefinitions([]).some((t) => t.name === "web_fetch"));

  const created = await executeTool(
    "create_table",
    {
      name: "competitors",
      description: "Tracked rivals",
      columns: [
        { name: "company", type: "text", required: true },
        { name: "price", type: "number" },
        { name: "checked", type: "date" },
      ],
    },
    ctx,
  );
  check("create_table succeeds", created.ok, created.output);

  const dupe = await executeTool("create_table", { name: "competitors", columns: [{ name: "x", type: "text" }] }, ctx);
  check("duplicate table rejected", !dupe.ok);

  const inserted = await executeTool(
    "insert_rows",
    { table: "competitors", rows: [{ company: "Acme", price: "49" }, { company: "Globex", price: 99 }] },
    ctx,
  );
  check("insert_rows succeeds", inserted.ok, inserted.output);

  const badCol = await executeTool("insert_rows", { table: "competitors", rows: [{ nope: "x" }] }, ctx);
  check("unknown column rejected", !badCol.ok, badCol.output);

  const missingReq = await executeTool("insert_rows", { table: "competitors", rows: [{ price: 1 }] }, ctx);
  check("missing required column rejected", !missingReq.ok, missingReq.output);

  const queried = await executeTool("query_rows", { table: "competitors" }, ctx);
  check("query_rows returns both rows", queried.ok && queried.output.includes("Acme") && queried.output.includes("Globex"));

  const rows = await db.select().from(agentRows);
  const acme = rows.find((r) => r.data.company === "Acme");
  check("string '49' coerced to number 49", acme?.data.price === 49, `got ${JSON.stringify(acme?.data.price)} (${typeof acme?.data.price})`);

  const filtered = await executeTool("query_rows", { table: "competitors", filter: { company: "Acme" } }, ctx);
  check("filter narrows results", filtered.ok && filtered.output.includes("Acme") && !filtered.output.includes("Globex"));

  const updated = await executeTool("update_rows", { table: "competitors", filter: { company: "Acme" }, patch: { price: 59 } }, ctx);
  check("update_rows succeeds", updated.ok && updated.output.includes("1"), updated.output);

  const unfilteredDelete = await executeTool("delete_rows", { table: "competitors", filter: {} }, ctx);
  check("delete without filter refused", !unfilteredDelete.ok, unfilteredDelete.output);

  const deleted = await executeTool("delete_rows", { table: "competitors", filter: { company: "Globex" } }, ctx);
  check("filtered delete works", deleted.ok && deleted.output.includes("1"), deleted.output);

  const listed = await executeTool("list_tables", {}, ctx);
  check("list_tables shows row count", listed.ok && listed.output.includes("competitors"), listed.output);

  const report = await executeTool("submit_report", { subject: "Done", body_md: "All good" }, ctx);
  check("submit_report sets ctx.report", report.ok && ctx.report?.subject === "Done");

  const emptyReport = await executeTool("submit_report", { subject: "", body_md: "" }, { agentId: agent.id });
  check("empty report rejected", !emptyReport.ok);

  console.log("\n=== queue ===");
  const runId = await enqueueRun({ agentId: agent.id, taskPrompt: "do the thing", trigger: "manual" });
  check("enqueue returns id", Boolean(runId));
  check("queue depth is 1", (await queueDepth()) === 1);

  const claimed = await claimNextRun("worker-a");
  check("claim returns the run", claimed === runId);
  const secondClaim = await claimNextRun("worker-b");
  check("second worker gets nothing (no double-claim)", secondClaim === null);
  check("queue depth back to 0", (await queueDepth()) === 0);

  console.log("\n=== scheduler ===");
  const [sched] = await db
    .insert(schedules)
    .values({ agentId: agent.id, name: "Daily", cron: "0 9 * * *", taskPrompt: "daily task", timezone: "UTC" })
    .returning();
  check("new schedule has no nextRunAt yet", sched.nextRunAt === null);

  const firedFirst = await tickScheduler();
  check("first tick arms rather than fires", firedFirst === 0, `fired ${firedFirst}`);
  const [armed] = await db.select().from(schedules).where(eq(schedules.id, sched.id));
  check("nextRunAt now set", armed.nextRunAt !== null);

  await db.update(schedules).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(schedules.id, sched.id));
  const firedSecond = await tickScheduler();
  check("due schedule fires", firedSecond === 1, `fired ${firedSecond}`);
  check("run was enqueued", (await queueDepth()) === 1);

  const [advanced] = await db.select().from(schedules).where(eq(schedules.id, sched.id));
  check("nextRunAt advanced into the future", (advanced.nextRunAt?.getTime() ?? 0) > Date.now());

  await db.update(schedules).set({ cron: "bogus", nextRunAt: new Date(Date.now() - 1000) }).where(eq(schedules.id, sched.id));
  await tickScheduler();
  const [disabled] = await db.select().from(schedules).where(eq(schedules.id, sched.id));
  check("invalid cron disables schedule", !disabled.enabled);

  console.log("\n=== cascade delete ===");
  // Scoped to this agent's rows — a global "is empty" assertion would pass only
  // on a pristine database and fail the moment seed data exists.
  const tableIdsBefore = (
    await db.select().from(agentTables).where(eq(agentTables.agentId, agent.id))
  ).map((t) => t.id);
  check("agent had tables before delete", tableIdsBefore.length > 0);

  await db.delete(agents).where(eq(agents.id, agent.id));

  const tablesAfter = await db
    .select()
    .from(agentTables)
    .where(eq(agentTables.agentId, agent.id));
  check("agent tables cascade", tablesAfter.length === 0);

  const orphanRows = tableIdsBefore.length
    ? await db.select().from(agentRows).where(inArray(agentRows.tableId, tableIdsBefore))
    : [];
  check("agent rows cascade", orphanRows.length === 0);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
