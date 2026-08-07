"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Trash2 } from "lucide-react";
import type { Agent } from "@/db/schema";
import { saveAgent, deleteAgent } from "@/app/actions";
import { MODELS, cn } from "@/lib/utils";
import { ConfirmDialog } from "./inbox-view";

const AVATARS = ["🤖", "☀️", "📊", "🔍", "📰", "💰", "🛰️", "📮", "🧭", "⚙️", "🌙", "🧪"];

const OPTIONAL_TOOLS = [
  {
    id: "web_fetch",
    label: "Web fetch",
    hint: "Read any public URL as text. Needed for anything that watches a website or API.",
  },
];

export function AgentForm({ agent }: { agent: Agent | null }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState(agent?.avatar ?? "🤖");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  };

  useEffect(() => autoGrow(instructionsRef.current), []);

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await saveAgent(formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <>
      <form action={onSubmit} className="flex flex-col gap-5">
        {agent && <input type="hidden" name="id" value={agent.id} />}
        <input type="hidden" name="avatar" value={avatar} />

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Identity</h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-3)]">
            Who this agent is, every time it wakes&nbsp;up.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            <div className="field">
              <span className="label">Avatar</span>
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    aria-label={`Use ${emoji}`}
                    aria-pressed={avatar === emoji}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-[8px] border text-[17px] leading-none transition-colors",
                      avatar === emoji
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--rule-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                className="input"
                required
                defaultValue={agent?.name ?? ""}
                placeholder="Competitor Watch"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="instructions">
                Standing instructions
              </label>
              <textarea
                id="instructions"
                name="instructions"
                ref={instructionsRef}
                onInput={(e) => autoGrow(e.currentTarget)}
                className="textarea"
                defaultValue={agent?.instructions ?? ""}
                placeholder="You track our three main competitors. Keep a table of their pricing and note when anything changes. Be precise about numbers and always cite the URL you read it from."
              />
              <p className="hint">
                The agent&rsquo;s job description. Each schedule adds its own task on top of this.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Model &amp; tools</h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-3)]">
            Billed to your own Anthropic key.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="model">
                Model
              </label>
              <select
                id="model"
                name="model"
                className="select"
                defaultValue={agent?.model ?? "claude-sonnet-5"}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="label">Tools</span>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2.5 rounded-[7px] border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2.5">
                  <span className="pill pill-neutral mt-px shrink-0">Always on</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">Database</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-3)] text-pretty">
                      Create tables and read, write, and delete its own rows.
                    </p>
                  </div>
                </div>

                {OPTIONAL_TOOLS.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-[7px] border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <input
                      type="checkbox"
                      name="tools"
                      value={tool.id}
                      defaultChecked={agent ? agent.toolsEnabled.includes(tool.id) : true}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{tool.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--ink-3)] text-pretty">
                        {tool.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Limits</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-3)] text-pretty">
            Safety rails against a runaway loop. A run that hits either limit stops and files a
            failure report.
          </p>

          <div
            className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            style={{ alignItems: "start" }}
          >
            <div className="field">
              <label className="label" htmlFor="maxSteps">
                Max steps
              </label>
              <input
                id="maxSteps"
                name="maxSteps"
                type="number"
                min={1}
                max={100}
                className="input"
                defaultValue={agent?.maxSteps ?? 30}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="timeoutSeconds">
                Timeout (seconds)
              </label>
              <input
                id="timeoutSeconds"
                name="timeoutSeconds"
                type="number"
                min={30}
                max={3600}
                className="input"
                defaultValue={agent?.timeoutSeconds ?? 600}
              />
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[7px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5"
          >
            <AlertCircle size={15} className="mt-px shrink-0 text-[var(--danger)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--danger)]">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : agent ? "Save changes" : "Create agent"}
          </button>
          {agent && (
            <button
              type="button"
              className="btn btn-danger ml-auto"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
              Delete agent
            </button>
          )}
        </div>
      </form>

      {confirmDelete && agent && (
        <ConfirmDialog
          title={`Delete "${agent.name}"?`}
          body="Its schedules, reports, tables and stored rows are all deleted with it. This cannot be undone."
          confirmLabel="Delete permanently"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            startTransition(() => void deleteAgent(agent.id));
          }}
        />
      )}
    </>
  );
}
