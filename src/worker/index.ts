import { randomUUID } from "node:crypto";
import { executeRun } from "@/agent/runtime";
import { runMigrations } from "@/db/migrate";
import { checkLicense, isLicensingEnabled } from "@/lib/license";
import { claimNextRun, reclaimZombieRuns } from "./queue";
import { tickScheduler } from "./scheduler";

/**
 * The worker process: fires due schedules, claims queued runs, executes them.
 *
 * Deployed as a second Railway service from the same image with NABU_MODE=worker.
 * Splitting web from worker matters because an agent run can take minutes and
 * must not be tied to an HTTP request lifecycle.
 */

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const SCHEDULER_INTERVAL_MS = 30_000;
const QUEUE_POLL_MS = 2_000;
const LICENSE_INTERVAL_MS = 60 * 60 * 1000;
const MAX_CONCURRENT_RUNS = Number(process.env.NABU_MAX_CONCURRENT_RUNS ?? 3);

let running = true;
let activeRuns = 0;
let licenseValid = true;

async function drainQueue(): Promise<void> {
  while (running && activeRuns < MAX_CONCURRENT_RUNS) {
    // An invalid licence stops new work but never touches data, and any run
    // already in flight is allowed to finish and file its report.
    if (!licenseValid) return;

    const runId = await claimNextRun(WORKER_ID);
    if (!runId) return;

    activeRuns++;
    void executeRun(runId)
      .then((outcome) => {
        console.log(`[nabu] run ${runId} ${outcome.status}`);
      })
      .catch((err) => {
        // executeRun files its own failure report; anything reaching here is a
        // bug in the runtime itself rather than a failed agent task.
        console.error(`[nabu] run ${runId} threw unexpectedly:`, err);
      })
      .finally(() => {
        activeRuns--;
      });
  }
}

async function loop(name: string, intervalMs: number, fn: () => Promise<void>) {
  while (running) {
    try {
      await fn();
    } catch (err) {
      console.error(`[nabu] ${name} loop error:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  console.log(`[nabu] worker ${WORKER_ID} starting`);

  await runMigrations();

  const reclaimed = await reclaimZombieRuns();
  if (reclaimed > 0) console.log(`[nabu] reclaimed ${reclaimed} run(s) abandoned by a previous worker`);

  if (isLicensingEnabled()) {
    const verdict = await checkLicense();
    licenseValid = verdict.valid;
    if (!verdict.valid) console.warn(`[nabu] license invalid: ${verdict.reason} — scheduling paused`);
  }

  const shutdown = (signal: string) => {
    console.log(`[nabu] ${signal} received, finishing ${activeRuns} active run(s)`);
    running = false;
    const deadline = Date.now() + 30_000;
    const wait = setInterval(() => {
      if (activeRuns === 0 || Date.now() > deadline) {
        clearInterval(wait);
        process.exit(0);
      }
    }, 500);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await Promise.all([
    loop("scheduler", SCHEDULER_INTERVAL_MS, async () => {
      if (!licenseValid) return;
      const fired = await tickScheduler();
      if (fired > 0) console.log(`[nabu] fired ${fired} schedule(s)`);
      await reclaimZombieRuns();
    }),
    loop("queue", QUEUE_POLL_MS, drainQueue),
    loop("license", LICENSE_INTERVAL_MS, async () => {
      if (!isLicensingEnabled()) return;
      const verdict = await checkLicense();
      if (verdict.valid !== licenseValid) {
        console.log(`[nabu] license is now ${verdict.valid ? "valid — resuming" : "invalid — pausing"}`);
      }
      licenseValid = verdict.valid;
    }),
  ]);
}

main().catch((err) => {
  console.error("[nabu] worker failed to start:", err);
  process.exit(1);
});
