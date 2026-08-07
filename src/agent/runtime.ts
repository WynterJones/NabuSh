import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentTables, reports, runs, type Agent, type RunStep } from "@/db/schema";
import { getAnthropicKey } from "@/lib/settings";
import { SUBMIT_REPORT, executeTool, toolDefinitions, type ToolContext } from "./tools";

/**
 * Executes one run: a bounded tool-use loop that ends when the agent calls
 * submit_report, or when a cap is hit.
 *
 * Every exit path files a report. A failed run that left the inbox empty would
 * be indistinguishable from an agent that had nothing to say, and the whole
 * product rests on the inbox being trustworthy.
 */

export type RunOutcome = {
  status: "succeeded" | "failed";
  reportId: string;
};

function systemPrompt(agent: Agent, tableSummary: string): string {
  return [
    `You are "${agent.name}", an autonomous agent running on a schedule. You are not in a conversation — nobody is watching this run, and there is no one to ask.`,
    "",
    "## Your instructions",
    agent.instructions.trim() || "(No standing instructions were provided.)",
    "",
    "## Your database",
    tableSummary,
    "",
    "## How a run works",
    "- You were woken by a schedule and given one task.",
    "- Work the task using your tools. Store anything worth remembering between runs in your database.",
    `- When you are done, call \`${SUBMIT_REPORT}\` exactly once. That ends the run and files your report.`,
    `- If you cannot complete the task, still call \`${SUBMIT_REPORT}\` and explain what blocked you. Never finish silently.`,
    "- Your report is read by a person scanning an inbox. Lead with the finding, include real data, and keep process narration out of it.",
  ].join("\n");
}

async function describeTables(agentId: string): Promise<string> {
  const tables = await db.select().from(agentTables).where(eq(agentTables.agentId, agentId));

  if (!tables.length) {
    return "You have no tables yet. Create one with `create_table` when you first need to remember something.";
  }

  return tables
    .map((t) => `- ${t.name}: ${t.columns.map((c) => `${c.name}:${c.type}`).join(", ")}${t.description ? ` — ${t.description}` : ""}`)
    .join("\n");
}

async function fileReport(
  runId: string,
  agentId: string,
  subject: string,
  bodyMd: string,
  kind: "success" | "failure",
): Promise<string> {
  const [report] = await db
    .insert(reports)
    .values({ runId, agentId, subject, bodyMd, kind })
    .returning({ id: reports.id });
  return report.id;
}

export async function executeRun(runId: string): Promise<RunOutcome> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);

  const [agent] = await db.select().from(agents).where(eq(agents.id, run.agentId)).limit(1);
  if (!agent) throw new Error(`Agent ${run.agentId} not found`);

  const steps: RunStep[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  const persist = async (status?: "running") => {
    await db
      .update(runs)
      .set({ steps, tokensIn, tokensOut, heartbeatAt: new Date(), ...(status ? { status } : {}) })
      .where(eq(runs.id, runId));
  };

  const fail = async (message: string): Promise<RunOutcome> => {
    steps.push({ type: "error", message, at: new Date().toISOString() });
    const reportId = await fileReport(
      runId,
      agent.id,
      `Run failed: ${agent.name}`,
      `The scheduled run did not complete.\n\n**Reason:** ${message}\n\nOpen the run log for the full step-by-step detail.`,
      "failure",
    );
    await db
      .update(runs)
      .set({ status: "failed", error: message, steps, tokensIn, tokensOut, endedAt: new Date() })
      .where(eq(runs.id, runId));
    return { status: "failed", reportId };
  };

  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return fail("No Anthropic API key is configured. Add one in Settings to let agents run.");
  }

  const client = new Anthropic({ apiKey, maxRetries: 3 });
  const tools = toolDefinitions(agent.toolsEnabled);
  const ctx: ToolContext = { agentId: agent.id };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: run.taskPrompt },
  ];

  const deadline = Date.now() + agent.timeoutSeconds * 1000;
  const system = systemPrompt(agent, await describeTables(agent.id));

  await db.update(runs).set({ status: "running", startedAt: new Date() }).where(eq(runs.id, runId));

  try {
    for (let step = 0; step < agent.maxSteps; step++) {
      if (Date.now() > deadline) {
        return fail(`Run exceeded its ${agent.timeoutSeconds}s time limit at step ${step + 1}.`);
      }
      if (tokensIn + tokensOut > agent.maxTokens) {
        return fail(`Run exceeded its ${agent.maxTokens.toLocaleString()} token limit.`);
      }

      const response = await client.messages.create({
        model: agent.model,
        max_tokens: 8192,
        system,
        tools,
        messages,
      });

      tokensIn += response.usage.input_tokens;
      tokensOut += response.usage.output_tokens;

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          steps.push({ type: "thinking", text: block.text, at: new Date().toISOString() });
        }
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // No tool call means the model answered in prose instead of finishing
      // properly. Nudge it once rather than dropping the run on the floor.
      if (!toolUses.length) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: `You must finish by calling the \`${SUBMIT_REPORT}\` tool. Do that now with what you have.`,
        });
        await persist();
        continue;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        steps.push({ type: "tool_call", tool: toolUse.name, input, at: new Date().toISOString() });

        const result = await executeTool(toolUse.name, input, ctx);
        steps.push({
          type: "tool_result",
          tool: toolUse.name,
          ok: result.ok,
          output: result.output.slice(0, 4000),
          at: new Date().toISOString(),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.output,
          is_error: !result.ok,
        });
      }

      messages.push({ role: "user", content: toolResults });
      await persist();

      if (ctx.report) {
        const reportId = await fileReport(
          runId,
          agent.id,
          ctx.report.subject,
          ctx.report.bodyMd,
          "success",
        );
        await db
          .update(runs)
          .set({ status: "succeeded", steps, tokensIn, tokensOut, endedAt: new Date() })
          .where(eq(runs.id, runId));
        return { status: "succeeded", reportId };
      }
    }

    return fail(`Run hit its ${agent.maxSteps}-step limit without filing a report.`);
  } catch (err) {
    return fail(describeFailure(err));
  }
}

/**
 * Turns an SDK error into something a non-technical owner can act on. The raw
 * message is a JSON blob, and this report is the only thing most people will
 * ever read about the failure.
 */
function describeFailure(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Your Anthropic API key was rejected. Check it in Settings — it may have been revoked or rotated.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "Your Anthropic key doesn't have access to this model. Pick a different model on the agent, or check your Anthropic plan.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Anthropic rate-limited this run. It will be retried at the next scheduled time; if this keeps happening, slow the schedule down or raise your rate limits.";
  }
  if (err instanceof Anthropic.NotFoundError) {
    return "The model this agent uses wasn't recognised by Anthropic. Choose a different model in the agent's settings.";
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 400 && /credit|billing/i.test(err.message)) {
      return "Your Anthropic account is out of credit. Top it up and the next scheduled run will go through.";
    }
    if (err.status && err.status >= 500) {
      return "Anthropic had a server error. This is usually temporary — the next scheduled run should succeed.";
    }
    return `Anthropic returned an error (${err.status ?? "unknown"}). ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
