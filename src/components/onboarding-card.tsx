"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { createStarterAgent, dismissOnboarding } from "@/app/actions";

/**
 * First-run nudge. A fresh install is an empty screen and a blank prompt, which
 * is the worst moment in a self-hosted product — this gives a working agent to
 * look at and edit rather than a page asking for inspiration.
 */
export function OnboardingCard() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-white"
          style={{ background: "linear-gradient(140deg, #6b62ef, #4338ca)" }}
        >
          <Sparkles size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold leading-tight tracking-tight text-balance">
            Start with a working agent
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)] text-pretty">
            We&rsquo;ll create a Morning Briefing agent with a daily schedule already set. Edit its
            instructions to point it at whatever you actually care&nbsp;about.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => startTransition(() => void dismissOnboarding())}
          >
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => startTransition(() => void createStarterAgent())}
          >
            {pending ? "Creating…" : "Create it"}
          </button>
        </div>
      </div>
    </div>
  );
}
