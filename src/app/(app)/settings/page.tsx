import { getCurrentUser } from "@/lib/auth";
import { getAnthropicKey, getSetting, SETTING_KEYS } from "@/lib/settings";
import { checkLicense, isLicensingEnabled } from "@/lib/license";
import { maskSecret } from "@/lib/crypto";
import { availableTimezones, systemTimezone } from "@/lib/cron";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, apiKey, timezone] = await Promise.all([
    getCurrentUser(),
    getAnthropicKey(),
    getSetting(SETTING_KEYS.timezone),
  ]);

  const licensingEnabled = isLicensingEnabled();
  const licenseState = licensingEnabled ? await checkLicense() : { valid: true };

  return (
    <>
      <PageHeader title="Settings" subtitle="Keys, license and account for this instance." />
      <SettingsView
        maskedKey={apiKey ? maskSecret(apiKey) : null}
        licenseState={licenseState}
        licensingEnabled={licensingEnabled}
        timezone={timezone ?? systemTimezone()}
        timezones={availableTimezones()}
        userEmail={user?.email ?? ""}
      />
    </>
  );
}
