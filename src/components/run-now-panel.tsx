"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, CheckCircle2 } from "lucide-react";
import { runAgentNow } from "@/app/actions";

/**
 * A one-off run outside any schedule. This is how someone tests an agent's
 * instructions without waiting until 9am tomorrow.
 */
export function RunNowPanel({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAgentNow(agentId, prompt);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQueued(true);
      setPrompt("");
      router.refresh();
      setTimeout(() => setQueued(false), 4000);
    });
  };

  return (
    <section className="card p-4">
      <h2 className="text-[13.5px] font-semibold">Run once now</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-3)] text-pretty">
        Test the agent without waiting for a schedule. The report lands in your inbox as usual.
      </p>

      <textarea
        className="textarea mt-3 text-[13px]"
        style={{ minHeight: "84px" }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Check the pricing pages and tell me what changed this week."
      />

      {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}

      <button
        type="button"
        className="btn btn-primary mt-3 w-full"
        disabled={pending || !prompt.trim()}
        onClick={submit}
      >
        {queued ? (
          <>
            <CheckCircle2 size={14} />
            Queued
          </>
        ) : (
          <>
            <Play size={14} />
            {pending ? "Queueing…" : "Run now"}
          </>
        )}
      </button>

      {queued && (
        <p className="mt-2 text-center text-[12px] text-[var(--ink-3)]">
          The worker picks it up within a few&nbsp;seconds.
        </p>
      )}
    </section>
  );
}
