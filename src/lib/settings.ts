import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";

export const SETTING_KEYS = {
  anthropicApiKey: "anthropic_api_key",
  licenseKey: "license_key",
  licenseStatus: "license_status",
  licenseCheckedAt: "license_checked_at",
  licenseActivated: "license_activated",
  timezone: "timezone",
  onboardedAt: "onboarded_at",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return null;

  if (!row.isEncrypted) return row.value;

  try {
    return decrypt(row.value);
  } catch {
    // Almost always means NABU_SECRET changed between deploys, which makes every
    // stored secret unreadable. Surfacing null lets the UI prompt for re-entry
    // instead of the whole app crashing on boot.
    console.error(`[nabu] could not decrypt setting "${key}" — was NABU_SECRET changed?`);
    return null;
  }
}

export async function setSetting(
  key: SettingKey,
  value: string,
  options: { encrypted?: boolean } = {},
): Promise<void> {
  const encrypted = options.encrypted ?? false;
  const stored = encrypted ? encrypt(value) : value;

  await db
    .insert(settings)
    .values({ key, value: stored, isEncrypted: encrypted })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: stored, isEncrypted: encrypted, updatedAt: new Date() },
    });
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/**
 * The customer's own Anthropic key. Deliberately stored in the database rather
 * than read from an env var so it can be rotated in the UI without a redeploy —
 * on Railway, changing an env var restarts the service.
 */
export async function getAnthropicKey(): Promise<string | null> {
  return getSetting(SETTING_KEYS.anthropicApiKey);
}

export async function setAnthropicKey(key: string): Promise<void> {
  await setSetting(SETTING_KEYS.anthropicApiKey, key, { encrypted: true });
}
