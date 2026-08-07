"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, KeyRound, LogOut, ExternalLink } from "lucide-react";
import {
  saveAnthropicKey,
  removeAnthropicKey,
  saveLicenseKey,
  saveTimezone,
  logout,
} from "@/app/actions";
import type { ActionResult } from "@/app/actions";

export function SettingsView({
  maskedKey,
  licenseState,
  licensingEnabled,
  timezone,
  timezones,
  userEmail,
}: {
  maskedKey: string | null;
  licenseState: { valid: boolean; reason?: string; stale?: boolean };
  licensingEnabled: boolean;
  timezone: string;
  timezones: string[];
  userEmail: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 p-4 sm:p-5">
      <Panel
        title="Anthropic API key"
        description="Your agents run on your own key. It's encrypted before it's stored and never leaves this server."
      >
        {maskedKey ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[7px] border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-[var(--ok)]" />
            <code className="min-w-0 flex-1 truncate text-[12.5px]">{maskedKey}</code>
            <RemoveKeyButton />
          </div>
        ) : (
          <p className="rounded-[7px] border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--warn)]">
            No key yet. Agents can&rsquo;t run until you add&nbsp;one.
          </p>
        )}

        <KeyForm hasKey={Boolean(maskedKey)} />

        <p className="hint mt-1">
          Get one from{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] underline underline-offset-2"
          >
            console.anthropic.com
            <ExternalLink size={11} />
          </a>
          . Anthropic bills you directly — Nabu never touches your&nbsp;usage.
        </p>
      </Panel>

      {licensingEnabled && (
        <Panel
          title="License"
          description="Verified with Gumroad once a day. If Gumroad is unreachable your agents keep running."
        >
          <div
            className={`flex flex-wrap items-center gap-3 rounded-[7px] border px-3 py-2.5 ${
              licenseState.valid
                ? "border-[var(--rule)] bg-[var(--surface-2)]"
                : "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)]"
            }`}
          >
            {licenseState.valid ? (
              <CheckCircle2 size={16} className="shrink-0 text-[var(--ok)]" />
            ) : (
              <AlertCircle size={16} className="shrink-0 text-[var(--danger)]" />
            )}
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
              {licenseState.valid
                ? licenseState.stale
                  ? licenseState.reason
                  : "Licensed and active."
                : (licenseState.reason ?? "Not licensed.")}
            </p>
          </div>

          <LicenseForm />
        </Panel>
      )}

      <Panel
        title="Default timezone"
        description="Used as the starting timezone for new schedules. Each schedule keeps its own."
      >
        <TimezoneForm timezone={timezone} timezones={timezones} />
      </Panel>

      <Panel title="Account" description="Signed in to this instance.">
        <dl className="dl-grid">
          <dt>Email</dt>
          <dd className="truncate">{userEmail}</dd>
        </dl>
        <form action={logout} className="mt-4">
          <button type="submit" className="btn btn-secondary">
            <LogOut size={14} />
            Sign out
          </button>
        </form>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-3)] text-pretty">
        {description}
      </p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Shared submit/result plumbing for the small forms on this page. */
function useAction(action: (formData: FormData) => Promise<ActionResult>) {
  const [state, setState] = useState<{ ok?: boolean; message?: string }>({});
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    setState({});
    startTransition(async () => {
      const result = await action(formData);
      setState(result.ok ? { ok: true, message: "Saved." } : { ok: false, message: result.error });
    });
  };

  return { state, pending, submit };
}

function Result({ state }: { state: { ok?: boolean; message?: string } }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`text-[12.5px] leading-relaxed ${state.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}
    >
      {state.message}
    </p>
  );
}

function KeyForm({ hasKey }: { hasKey: boolean }) {
  const { state, pending, submit } = useAction(saveAnthropicKey);

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor="apiKey">
          {hasKey ? "Replace key" : "API key"}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="apiKey"
            name="apiKey"
            type="password"
            className="input min-w-[200px] flex-1"
            placeholder="sk-ant-api03-…"
            autoComplete="off"
            required
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <KeyRound size={14} />
            {pending ? "Verifying…" : "Save key"}
          </button>
        </div>
      </div>
      <Result state={state} />
    </form>
  );
}

function RemoveKeyButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm shrink-0"
      disabled={pending}
      onClick={() => startTransition(() => void removeAnthropicKey())}
    >
      Remove
    </button>
  );
}

function LicenseForm() {
  const { state, pending, submit } = useAction(saveLicenseKey);

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor="licenseKey">
          License key
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="licenseKey"
            name="licenseKey"
            className="input min-w-[200px] flex-1"
            placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
            autoComplete="off"
            required
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Checking…" : "Activate"}
          </button>
        </div>
        <p className="hint">From your Gumroad purchase receipt.</p>
      </div>
      <Result state={state} />
    </form>
  );
}

function TimezoneForm({ timezone, timezones }: { timezone: string; timezones: string[] }) {
  const { state, pending, submit } = useAction(saveTimezone);

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="timezone"
          className="select min-w-[200px] flex-1"
          defaultValue={timezone}
          aria-label="Default timezone"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
