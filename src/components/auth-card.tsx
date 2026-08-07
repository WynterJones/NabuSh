"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import type { ActionResult } from "@/app/actions";

/**
 * Shared chrome for the two pre-login screens. Both are single-purpose: one
 * field stack, one primary action, no nav — there is nowhere else to go yet.
 */
export function AuthCard({
  title,
  subtitle,
  submitLabel,
  action,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      // A successful action redirects, so only failures return here.
      const result = await action(formData);
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-[var(--bg)] px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-[9px] text-[16px] font-bold text-white"
            style={{ background: "linear-gradient(140deg, #6b62ef, #4338ca)" }}
          >
            N
          </span>
          <span className="text-[19px] font-semibold tracking-tight">Nabu</span>
        </div>

        <div className="card p-6">
          <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-balance">
            {title}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)] text-pretty">
            {subtitle}
          </p>

          <form action={onSubmit} className="mt-5 flex flex-col gap-4">
            {children}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[7px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5"
              >
                <AlertCircle size={15} className="mt-px shrink-0 text-[var(--danger)]" />
                <p className="text-[12.5px] leading-relaxed text-[var(--danger)]">{error}</p>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={pending}>
              {pending ? "Working…" : submitLabel}
            </button>
          </form>
        </div>

        {footer && <div className="mt-4 text-center text-[12.5px] text-[var(--ink-3)]">{footer}</div>}
      </div>
    </main>
  );
}
