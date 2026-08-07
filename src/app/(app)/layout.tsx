import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound } from "lucide-react";
import { getCurrentUser, needsSetup } from "@/lib/auth";
import { getAnthropicKey } from "@/lib/settings";
import { checkLicense, isLicensingEnabled } from "@/lib/license";
import { listShellAgents, totalUnread } from "@/lib/queries";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (await needsSetup()) redirect("/setup");
  if (!(await getCurrentUser())) redirect("/login");

  const [agents, unread, apiKey] = await Promise.all([
    listShellAgents(),
    totalUnread(),
    getAnthropicKey(),
  ]);

  const license = isLicensingEnabled() ? await checkLicense() : { valid: true };

  const banner = !license.valid ? (
    <Banner
      tone="danger"
      icon={<AlertTriangle size={15} />}
      message={license.reason ?? "This instance isn't licensed."}
      detail="Schedules are paused. Your agents and their data are untouched."
      href="/settings"
      cta="Enter license key"
    />
  ) : !apiKey ? (
    <Banner
      tone="warn"
      icon={<KeyRound size={15} />}
      message="No Anthropic API key yet."
      detail="Agents can't run until you add one. It stays on this server."
      href="/settings"
      cta="Add key"
    />
  ) : license.stale ? (
    <Banner
      tone="warn"
      icon={<AlertTriangle size={15} />}
      message={license.reason ?? "Running on a cached license check."}
      detail="Everything keeps working normally."
    />
  ) : null;

  return (
    <Suspense fallback={null}>
      <Shell agents={agents} totalUnread={unread} banner={banner}>
        {children}
      </Shell>
    </Suspense>
  );
}

function Banner({
  tone,
  icon,
  message,
  detail,
  href,
  cta,
}: {
  tone: "warn" | "danger";
  icon: React.ReactNode;
  message: string;
  detail: string;
  href?: string;
  cta?: string;
}) {
  const palette =
    tone === "danger"
      ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : "border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)] text-[var(--warn)]";

  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 ${palette}`}>
      <span className="shrink-0">{icon}</span>
      <p className="min-w-0 text-[13px] font-semibold">{message}</p>
      <p className="min-w-0 flex-1 text-[12.5px] opacity-85">{detail}</p>
      {href && cta && (
        <Link href={href} className="btn btn-sm btn-secondary shrink-0">
          {cta}
        </Link>
      )}
    </div>
  );
}
