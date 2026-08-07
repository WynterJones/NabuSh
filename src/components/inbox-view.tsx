"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCheck, Inbox as InboxIcon, Trash2, ScrollText, X, AlertTriangle } from "lucide-react";
import { markReportRead, markAllRead, deleteReport } from "@/app/actions";
import { cn, estimateCost, formatDateTime, formatDuration, relativeTime } from "@/lib/utils";

export type InboxItem = {
  id: string;
  runId: string;
  subject: string;
  bodyMd: string;
  kind: "success" | "failure";
  isRead: boolean;
  createdAt: string;
  agentName: string;
  agentAvatar: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  startedAt: string | null;
  endedAt: string | null;
};

/**
 * Two-pane reader on desktop; list-then-detail on mobile. The list is the
 * product's front door, so an unread report has to be obvious at a glance —
 * accent rail plus weight, not a subtle dot alone.
 */
export function InboxView({ items, scopedAgentId }: { items: InboxItem[]; scopedAgentId?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();

  const visible = filter === "unread" ? items.filter((i) => !i.isRead) : items;
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  // Opening a report marks it read, which is what makes the unread count mean
  // "things you haven't looked at" rather than "things that arrived".
  useEffect(() => {
    if (selected && !selected.isRead) {
      startTransition(() => void markReportRead(selected.id, true));
    }
    // Only re-fire when the selected report actually changes.
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = items.filter((i) => !i.isRead).length;

  if (!items.length) {
    return (
      <EmptyInbox scoped={Boolean(scopedAgentId)} />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <section
        className={cn(
          "flex min-w-0 flex-col border-r border-[var(--rule)] bg-[var(--surface)] lg:w-[380px] lg:shrink-0",
          selected ? "hidden lg:flex" : "flex w-full",
        )}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--rule)] px-3">
          <div className="flex items-center gap-1 rounded-[7px] bg-[var(--surface-2)] p-0.5">
            {(["all", "unread"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "h-7 rounded-[5px] px-2.5 text-[12.5px] font-medium capitalize transition-colors",
                  filter === key
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--ink-3)] hover:text-[var(--ink)]",
                )}
              >
                {key}
                {key === "unread" && unreadCount > 0 && ` (${unreadCount})`}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={pending || unreadCount === 0}
            onClick={() => startTransition(() => void markAllRead(scopedAgentId))}
            className="btn btn-ghost btn-sm ml-auto"
          >
            <CheckCheck size={14} />
            <span className="hidden sm:inline">Mark all read</span>
          </button>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "flex w-full gap-2.5 border-b border-[var(--rule)] px-3 py-3 text-left transition-colors",
                  selected?.id === item.id
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--surface-2)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 w-[3px] shrink-0 self-stretch rounded-full",
                    item.isRead ? "bg-transparent" : "bg-[var(--accent)]",
                  )}
                />
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-[var(--surface-3)] text-[15px] leading-none">
                  {item.agentAvatar}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink-3)]">
                      {item.agentName}
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-3)]">
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-[13.5px] leading-snug",
                      item.isRead ? "font-normal text-[var(--ink-2)]" : "font-semibold text-[var(--ink)]",
                    )}
                  >
                    {item.subject}
                  </span>
                  {item.kind === "failure" && (
                    <span className="pill pill-danger w-fit">
                      <AlertTriangle size={11} />
                      Failed
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {!visible.length && (
            <li className="px-4 py-10 text-center text-[13px] text-[var(--ink-3)]">
              Nothing unread. You&rsquo;re all caught&nbsp;up.
            </li>
          )}
        </ul>
      </section>

      {selected ? (
        <ReportPane
          item={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            const next = visible.find((i) => i.id !== selected.id);
            setSelectedId(next?.id ?? null);
            startTransition(() => void deleteReport(selected.id));
          }}
        />
      ) : (
        <section className="hidden flex-1 place-items-center lg:grid">
          <p className="text-[13.5px] text-[var(--ink-3)]">Select a report to read it.</p>
        </section>
      )}
    </div>
  );
}

function ReportPane({
  item,
  onClose,
  onDelete,
}: {
  item: InboxItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirming(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--rule)] bg-[var(--surface)] px-3">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-sm lg:hidden"
          aria-label="Back to list"
        >
          <X size={15} />
        </button>
        <Link href={`/runs/${item.runId}`} className="btn btn-secondary btn-sm ml-auto">
          <ScrollText size={14} />
          <span className="hidden sm:inline">Run log</span>
        </Link>
        <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost btn-sm">
          <Trash2 size={14} />
          <span className="sr-only">Delete report</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[760px] px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--surface-3)] text-[14px] leading-none">
              {item.agentAvatar}
            </span>
            <span className="text-[13px] font-semibold text-[var(--ink-2)]">{item.agentName}</span>
            <span className={`pill ${item.kind === "failure" ? "pill-danger" : "pill-ok"}`}>
              {item.kind === "failure" ? "Failed" : "Completed"}
            </span>
          </div>

          <h1 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-balance">
            {item.subject}
          </h1>

          <dl className="dl-grid mt-4 border-y border-[var(--rule)] py-3.5">
            <dt>Filed</dt>
            <dd className="tabular-nums">{formatDateTime(item.createdAt)}</dd>
            <dt>Duration</dt>
            <dd className="tabular-nums">
              {formatDuration(
                item.startedAt ? new Date(item.startedAt) : null,
                item.endedAt ? new Date(item.endedAt) : null,
              )}
            </dd>
            <dt>Tokens</dt>
            <dd className="tabular-nums">
              {(item.tokensIn + item.tokensOut).toLocaleString()} · approx{" "}
              {estimateCost(item.model, item.tokensIn, item.tokensOut)}
            </dd>
          </dl>

          <div className="prose-report mt-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.bodyMd}</ReactMarkdown>
          </div>
        </article>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete this report?"
          body={`"${item.subject}" will be removed from the inbox. The run log stays.`}
          confirmLabel="Delete report"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
        />
      )}
    </section>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="animate-fade absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-rise relative w-full max-w-[420px] rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-lg)]"
      >
        <h2 className="text-[16px] font-semibold leading-tight text-balance">{title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)] text-pretty">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyInbox({ scoped }: { scoped: boolean }) {
  return (
    <div className="grid h-full place-items-center px-6 py-12">
      <div className="max-w-[420px] text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] bg-[var(--surface-2)] text-[var(--ink-3)]">
          <InboxIcon size={22} />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight">No reports yet</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)] text-pretty">
          {scoped
            ? "This agent hasn't filed anything. Reports appear here the moment a scheduled run finishes."
            : "When one of your agents finishes a scheduled run, its report lands here. Give an agent a schedule to get started."}
        </p>
        <Link href="/schedules" className="btn btn-primary mt-5">
          Set up a schedule
        </Link>
      </div>
    </div>
  );
}
