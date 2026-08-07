import type { RunStatus } from "@/db/schema";

const STYLES: Record<RunStatus, { className: string; label: string }> = {
  queued: { className: "pill-neutral", label: "Queued" },
  running: { className: "pill-accent", label: "Running" },
  succeeded: { className: "pill-ok", label: "Succeeded" },
  failed: { className: "pill-danger", label: "Failed" },
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  const style = STYLES[status] ?? STYLES.queued;
  return <span className={`pill ${style.className} shrink-0`}>{style.label}</span>;
}
