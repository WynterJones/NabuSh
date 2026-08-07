"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Play, Pencil, Trash2, Plus, X, AlertCircle } from "lucide-react";
import {
  saveSchedule,
  toggleSchedule,
  deleteSchedule,
  runScheduleNow,
} from "@/app/actions";
import { CRON_PRESETS, describeCron, validateCron } from "@/lib/cron";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "./page-header";
import { ConfirmDialog } from "./inbox-view";

export type ScheduleItem = {
  id: string;
  agentId: string;
  agentName: string;
  agentAvatar: string;
  name: string;
  cron: string;
  timezone: string;
  taskPrompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type AgentOption = { id: string; name: string; avatar: string };

export function SchedulesView({
  schedules,
  agents,
  scopedAgentId,
  timezones,
  defaultTimezone,
}: {
  schedules: ScheduleItem[];
  agents: AgentOption[];
  scopedAgentId?: string;
  timezones: string[];
  defaultTimezone: string;
}) {
  const [editing, setEditing] = useState<ScheduleItem | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScheduleItem | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = agents.length > 0;

  return (
    <>
      <PageHeader
        title="Schedules"
        subtitle="When each agent wakes up, and what it's asked to do."
        action={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canCreate}
            onClick={() => setEditing("new")}
          >
            <Plus size={15} />
            New schedule
          </button>
        }
      />

      {!schedules.length ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title={canCreate ? "No schedules yet" : "Create an agent first"}
          body={
            canCreate
              ? "A schedule is a cron time plus a task prompt. When it fires, the agent wakes up, does the work, and files a report to your inbox."
              : "Schedules belong to an agent. Create your first agent, then give it a schedule."
          }
          action={
            canCreate ? (
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus size={15} />
                New schedule
              </button>
            ) : (
              <Link href="/agents" className="btn btn-primary">
                Go to Agents
              </Link>
            )
          }
        />
      ) : (
        <div className="p-4 sm:p-5">
          {/* Desktop table */}
          <div className="table-frame hidden md:block">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Schedule</th>
                    <th>Runs</th>
                    <th>Next</th>
                    <th>Last</th>
                    <th className="w-px">Enabled</th>
                    <th className="w-px" />
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] bg-[var(--surface-3)] text-[13px] leading-none">
                            {s.agentAvatar}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate-cell font-medium">{s.name}</div>
                            <div className="truncate-cell text-[12px] text-[var(--ink-3)]">
                              {s.agentName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-[12.5px] text-[var(--ink-2)]">
                        <span className="truncate-cell block max-w-[220px]">
                          {describeCron(s.cron)}
                        </span>
                        <span className="text-[11.5px] text-[var(--ink-3)]">{s.timezone}</span>
                      </td>
                      <td className="tabular-nums text-[12.5px]">
                        {s.enabled ? formatDateTime(s.nextRunAt) : <span className="text-[var(--ink-3)]">Paused</span>}
                      </td>
                      <td className="tabular-nums text-[12.5px] text-[var(--ink-2)]">
                        {relativeTime(s.lastRunAt)}
                      </td>
                      <td>
                        <Toggle
                          checked={s.enabled}
                          label={`Enable ${s.name}`}
                          onChange={(next) =>
                            startTransition(() => void toggleSchedule(s.id, next))
                          }
                        />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pending}
                            title="Run now"
                            onClick={() => startTransition(() => void runScheduleNow(s.id))}
                          >
                            <Play size={14} />
                            <span className="sr-only">Run now</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => setEditing(s)}
                          >
                            <Pencil size={14} />
                            <span className="sr-only">Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Delete"
                            onClick={() => setConfirmDelete(s)}
                          >
                            <Trash2 size={14} />
                            <span className="sr-only">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards — the desktop table doesn't survive 360px. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {schedules.map((s) => (
              <li key={s.id} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--surface-3)] text-[16px] leading-none">
                    {s.agentAvatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold leading-tight">{s.name}</p>
                    <p className="mt-1 truncate text-[12px] text-[var(--ink-3)]">{s.agentName}</p>
                  </div>
                  <Toggle
                    checked={s.enabled}
                    label={`Enable ${s.name}`}
                    onChange={(next) => startTransition(() => void toggleSchedule(s.id, next))}
                  />
                </div>

                <dl className="dl-grid mt-3 border-t border-[var(--rule)] pt-3">
                  <dt>Runs</dt>
                  <dd>{describeCron(s.cron)}</dd>
                  <dt>Next</dt>
                  <dd className="tabular-nums">
                    {s.enabled ? formatDateTime(s.nextRunAt) : "Paused"}
                  </dd>
                </dl>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex-1"
                    disabled={pending}
                    onClick={() => startTransition(() => void runScheduleNow(s.id))}
                  >
                    <Play size={13} />
                    Run now
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={() => setEditing(s)}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmDelete(s)}
                  >
                    <Trash2 size={13} />
                    <span className="sr-only">Delete</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <ScheduleDrawer
          schedule={editing === "new" ? null : editing}
          agents={agents}
          defaultAgentId={scopedAgentId ?? agents[0]?.id}
          timezones={timezones}
          defaultTimezone={defaultTimezone}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this schedule?"
          body={`"${confirmDelete.name}" will stop running. Reports it already filed stay in your inbox.`}
          confirmLabel="Delete schedule"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            startTransition(() => void deleteSchedule(id));
          }}
        />
      )}
    </>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]",
        checked ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-150",
          checked ? "left-[19px]" : "left-[3px]",
        )}
      />
    </button>
  );
}

function ScheduleDrawer({
  schedule,
  agents,
  defaultAgentId,
  timezones,
  defaultTimezone,
  onClose,
}: {
  schedule: ScheduleItem | null;
  agents: AgentOption[];
  defaultAgentId?: string;
  timezones: string[];
  defaultTimezone: string;
  onClose: () => void;
}) {
  const [cron, setCron] = useState(schedule?.cron ?? "0 9 * * *");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? defaultTimezone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = validateCron(cron, timezone);

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  };

  useEffect(() => autoGrow(promptRef.current), []);

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await saveSchedule(formData);
      if (!result.ok) setError(result.error);
      else onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={schedule ? "Edit schedule" : "New schedule"}
        className="animate-fade relative flex h-full w-full max-w-[520px] flex-col border-l border-[var(--rule-strong)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--rule)] px-5">
          <h2 className="flex-1 text-[16px] font-semibold tracking-tight">
            {schedule ? "Edit schedule" : "New schedule"}
          </h2>
          <button type="button" onClick={onClose} className="btn btn-ghost h-9 w-9 !px-0" aria-label="Close">
            <X size={17} />
          </button>
        </header>

        <form action={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {schedule && <input type="hidden" name="id" value={schedule.id} />}

            <div className="field">
              <label className="label" htmlFor="agentId">
                Agent
              </label>
              <select
                id="agentId"
                name="agentId"
                className="select"
                defaultValue={schedule?.agentId ?? defaultAgentId}
                required
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.avatar} {a.name}
                  </option>
                ))}
              </select>
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
                defaultValue={schedule?.name ?? ""}
                placeholder="Daily competitor check"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="taskPrompt">
                Task
              </label>
              <textarea
                id="taskPrompt"
                name="taskPrompt"
                ref={promptRef}
                onInput={(e) => autoGrow(e.currentTarget)}
                className="textarea"
                required
                defaultValue={schedule?.taskPrompt ?? ""}
                placeholder="Check each competitor's pricing page. Store anything that changed, then report what moved and by how much."
              />
              <p className="hint">
                What this agent should do each time it wakes up. Its standing instructions apply on
                top of this.
              </p>
            </div>

            <div className="field">
              <span className="label">When</span>
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setCron(preset.value)}
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
                      cron === preset.value
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ alignItems: "start" }}>
              <div className="field">
                <label className="label" htmlFor="cron">
                  Cron expression
                </label>
                <input
                  id="cron"
                  name="cron"
                  className="input"
                  required
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="timezone">
                  Timezone
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  className="select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={cn(
                "rounded-[7px] border px-3 py-2.5",
                preview.valid
                  ? "border-[var(--rule)] bg-[var(--surface-2)]"
                  : "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)]",
              )}
            >
              {preview.valid ? (
                <>
                  <p className="text-[13px] font-medium">{preview.description}</p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-[var(--ink-3)]">
                    First run {formatDateTime(preview.nextRun)}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-[var(--danger)]">{preview.error}</p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[7px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5"
              >
                <AlertCircle size={15} className="mt-px shrink-0 text-[var(--danger)]" />
                <p className="text-[12.5px] leading-relaxed text-[var(--danger)]">{error}</p>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule)] px-5 py-3.5">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !preview.valid}>
              {pending ? "Saving…" : schedule ? "Save changes" : "Create schedule"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
