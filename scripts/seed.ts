import { db } from "@/db";
import { agents, agentTables, agentRows, reports, runs, schedules, users } from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { refreshNextRun } from "@/worker/scheduler";

/**
 * Development seed. Creates a login plus three agents with plausible history so
 * every screen can be checked with real-shaped content rather than empty states.
 *
 *   npm run seed   (destructive — clears existing rows first)
 */

async function main() {
  console.log("clearing…");
  await db.delete(reports);
  await db.delete(runs);
  await db.delete(agentRows);
  await db.delete(agentTables);
  await db.delete(schedules);
  await db.delete(agents);
  await db.delete(users);

  await db.insert(users).values({
    email: "wynter@monetizedesign.com",
    passwordHash: hashPassword("password123"),
  });
  console.log("login: wynter@monetizedesign.com / password123");

  const [watcher] = await db
    .insert(agents)
    .values({
      name: "Competitor Watch",
      avatar: "🔍",
      instructions:
        "You track pricing and positioning for three competitors: Linear, Height and Shortcut. " +
        "Keep a `pricing` table with the current plan names and prices. When something changes, " +
        "note the old and new value. Always cite the URL you read it from, and never guess a number.",
      model: "claude-sonnet-5",
      toolsEnabled: ["web_fetch"],
    })
    .returning();

  const [briefing] = await db
    .insert(agents)
    .values({
      name: "Morning Briefing",
      avatar: "☀️",
      instructions:
        "You produce a short daily briefing on the AI tooling space. Keep a `sources` table of " +
        "feeds worth checking and a `seen` table of headlines already reported so you never repeat " +
        "yourself. Lead with what changed since yesterday.",
      model: "claude-haiku-4-5-20251001",
      toolsEnabled: ["web_fetch"],
    })
    .returning();

  const [churn] = await db
    .insert(agents)
    .values({
      name: "Churn Sentry",
      avatar: "📊",
      instructions:
        "You watch weekly signup and cancellation counts and flag anything outside the normal band. " +
        "Keep a `weekly` table. Be blunt when a number is bad — do not soften it.",
      model: "claude-sonnet-5",
      toolsEnabled: [],
      status: "paused",
    })
    .returning();

  const scheduleRows = await db
    .insert(schedules)
    .values([
      {
        agentId: watcher.id,
        name: "Weekday pricing check",
        cron: "0 9 * * 1-5",
        timezone: "America/New_York",
        taskPrompt:
          "Check each competitor's pricing page. Compare against what's in your pricing table. " +
          "Report only what changed, with the old and new values side by side. If nothing changed, say so in one line.",
        lastRunAt: new Date(Date.now() - 22 * 3600_000),
      },
      {
        agentId: briefing.id,
        name: "Daily at 8am",
        cron: "0 8 * * *",
        timezone: "America/New_York",
        taskPrompt:
          "Check your sources for anything new since your last run. Store new items, then report the " +
          "three or four things most worth knowing this morning.",
        lastRunAt: new Date(Date.now() - 5 * 3600_000),
      },
      {
        agentId: churn.id,
        name: "Monday rollup",
        cron: "0 10 * * 1",
        timezone: "UTC",
        taskPrompt: "Summarise last week's signups and cancellations against the prior four weeks.",
        enabled: false,
      },
    ])
    .returning();

  for (const s of scheduleRows) await refreshNextRun(s.id);

  const [pricingTable] = await db
    .insert(agentTables)
    .values({
      agentId: watcher.id,
      name: "pricing",
      description: "Current published prices per competitor",
      columns: [
        { name: "company", type: "text", required: true },
        { name: "plan", type: "text", required: true },
        { name: "price_usd", type: "number" },
        { name: "checked_at", type: "date" },
        { name: "source_url", type: "text" },
      ],
    })
    .returning();

  await db.insert(agentRows).values([
    {
      tableId: pricingTable.id,
      data: {
        company: "Linear",
        plan: "Business",
        price_usd: 14,
        checked_at: new Date(Date.now() - 22 * 3600_000).toISOString(),
        source_url: "https://linear.app/pricing",
      },
    },
    {
      tableId: pricingTable.id,
      data: {
        company: "Height",
        plan: "Pro",
        price_usd: 9.5,
        checked_at: new Date(Date.now() - 22 * 3600_000).toISOString(),
        source_url: "https://height.app/pricing",
      },
    },
    {
      tableId: pricingTable.id,
      data: {
        company: "Shortcut",
        plan: "Team",
        price_usd: 8.5,
        checked_at: new Date(Date.now() - 22 * 3600_000).toISOString(),
        source_url: "https://shortcut.com/pricing",
      },
    },
  ]);

  const [sourcesTable] = await db
    .insert(agentTables)
    .values({
      agentId: briefing.id,
      name: "sources",
      description: "Feeds checked each morning",
      columns: [
        { name: "name", type: "text", required: true },
        { name: "url", type: "text", required: true },
        { name: "active", type: "boolean" },
      ],
    })
    .returning();

  await db.insert(agentRows).values([
    { tableId: sourcesTable.id, data: { name: "Hacker News front page", url: "https://news.ycombinator.com", active: true } },
    { tableId: sourcesTable.id, data: { name: "Anthropic news", url: "https://www.anthropic.com/news", active: true } },
    { tableId: sourcesTable.id, data: { name: "Changelog", url: "https://changelog.com", active: false } },
  ]);

  // --- Runs and the reports they produced ---

  const [run1] = await db
    .insert(runs)
    .values({
      agentId: watcher.id,
      scheduleId: scheduleRows[0].id,
      status: "succeeded",
      taskPrompt: scheduleRows[0].taskPrompt,
      trigger: "schedule",
      tokensIn: 18_432,
      tokensOut: 1_247,
      queuedAt: new Date(Date.now() - 22 * 3600_000),
      startedAt: new Date(Date.now() - 22 * 3600_000),
      endedAt: new Date(Date.now() - 22 * 3600_000 + 47_000),
      steps: [
        { type: "tool_call", tool: "list_tables", input: {}, at: new Date(Date.now() - 22 * 3600_000).toISOString() },
        {
          type: "tool_result",
          tool: "list_tables",
          ok: true,
          output: "- pricing (3 rows): company:text, plan:text, price_usd:number, checked_at:date, source_url:text",
          at: new Date(Date.now() - 22 * 3600_000 + 1200).toISOString(),
        },
        {
          type: "tool_call",
          tool: "web_fetch",
          input: { url: "https://linear.app/pricing" },
          at: new Date(Date.now() - 22 * 3600_000 + 2000).toISOString(),
        },
        {
          type: "tool_result",
          tool: "web_fetch",
          ok: true,
          output: "Linear pricing — Free $0, Basic $8 per user/month, Business $14 per user/month, Enterprise custom…",
          at: new Date(Date.now() - 22 * 3600_000 + 6400).toISOString(),
        },
        {
          type: "tool_call",
          tool: "update_rows",
          input: { table: "pricing", filter: { company: "Height" }, patch: { price_usd: 9.5 } },
          at: new Date(Date.now() - 22 * 3600_000 + 30_000).toISOString(),
        },
        {
          type: "tool_result",
          tool: "update_rows",
          ok: true,
          output: "Updated 1 row(s).",
          at: new Date(Date.now() - 22 * 3600_000 + 30_500).toISOString(),
        },
        {
          type: "tool_call",
          tool: "submit_report",
          input: { subject: "Height raised Pro to $9.50", body_md: "…" },
          at: new Date(Date.now() - 22 * 3600_000 + 46_000).toISOString(),
        },
      ],
    })
    .returning();

  const [run2] = await db
    .insert(runs)
    .values({
      agentId: briefing.id,
      scheduleId: scheduleRows[1].id,
      status: "succeeded",
      taskPrompt: scheduleRows[1].taskPrompt,
      trigger: "schedule",
      tokensIn: 31_204,
      tokensOut: 2_113,
      queuedAt: new Date(Date.now() - 5 * 3600_000),
      startedAt: new Date(Date.now() - 5 * 3600_000),
      endedAt: new Date(Date.now() - 5 * 3600_000 + 71_000),
      steps: [],
    })
    .returning();

  const [run3] = await db
    .insert(runs)
    .values({
      agentId: watcher.id,
      scheduleId: scheduleRows[0].id,
      status: "failed",
      taskPrompt: scheduleRows[0].taskPrompt,
      trigger: "schedule",
      tokensIn: 4_102,
      tokensOut: 388,
      error: "Run hit its 30-step limit without filing a report.",
      queuedAt: new Date(Date.now() - 46 * 3600_000),
      startedAt: new Date(Date.now() - 46 * 3600_000),
      endedAt: new Date(Date.now() - 46 * 3600_000 + 240_000),
      steps: [
        {
          type: "error",
          message: "Run hit its 30-step limit without filing a report.",
          at: new Date(Date.now() - 46 * 3600_000 + 240_000).toISOString(),
        },
      ],
    })
    .returning();

  await db.insert(reports).values([
    {
      runId: run1.id,
      agentId: watcher.id,
      subject: "Height raised Pro from $8.00 to $9.50",
      kind: "success",
      isRead: false,
      createdAt: new Date(Date.now() - 22 * 3600_000 + 47_000),
      bodyMd: `One change since yesterday.

## Height — Pro plan

| | Was | Now |
| --- | --- | --- |
| Price | $8.00 / user / mo | **$9.50 / user / mo** |
| Annual | $80 / user / yr | $96 / user / yr |

An 18.75% increase. The page copy now lists unlimited guest seats on Pro, which was previously
Business-only — so this looks like a repackaging rather than a straight rise.

Source: <https://height.app/pricing>

## Unchanged

- **Linear** — Business still $14 / user / mo
- **Shortcut** — Team still $8.50 / user / mo

I updated the \`pricing\` table with Height's new number and left the other two rows alone.`,
    },
    {
      runId: run2.id,
      agentId: briefing.id,
      subject: "Three things this morning",
      kind: "success",
      isRead: false,
      createdAt: new Date(Date.now() - 5 * 3600_000 + 71_000),
      bodyMd: `Quiet night. Three items worth your time.

1. **Postgres 18 hit GA.** The headline is asynchronous I/O for sequential scans — early
   benchmarks show 2–3× on large table reads. Worth a look when you next touch the database layer.

2. **A widely-used npm package was compromised.** The maintainer's token leaked and two versions
   shipped a postinstall script. Both were pulled within four hours. You aren't affected — it isn't
   in your dependency tree.

3. **Railway shipped per-service scaling rules.** You can now scale on queue depth rather than CPU,
   which is closer to what a worker actually needs.

Nothing else cleared the bar. I added 14 headlines to \`seen\` so they won't come up again.`,
    },
    {
      runId: run3.id,
      agentId: watcher.id,
      subject: "Run failed: Competitor Watch",
      kind: "failure",
      isRead: true,
      createdAt: new Date(Date.now() - 46 * 3600_000 + 240_000),
      bodyMd: `The scheduled run did not complete.

**Reason:** Run hit its 30-step limit without filing a report.

Open the run log for the full step-by-step detail.`,
    },
  ]);

  console.log("seeded 3 agents, 3 schedules, 2 tables, 3 runs, 3 reports");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
