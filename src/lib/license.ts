import { SETTING_KEYS, getSetting, setSetting } from "./settings";

/**
 * Licensing runs directly against Gumroad's license API — there is no Nabu
 * license server to operate, and therefore none to go down.
 *
 * Two rules drive the design:
 *
 * 1. Fail open. If Gumroad is unreachable we keep running on the last known
 *    verdict for GRACE_DAYS. A customer's scheduled agents must not stop
 *    because a third party had an outage.
 * 2. Never destroy. An invalid licence pauses scheduling and shows a banner.
 *    Data stays intact and readable, always.
 */

const GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";
const GRACE_DAYS = 14;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Set at build time to the Gumroad product this image is sold under. */
const PRODUCT_ID = process.env.NABU_GUMROAD_PRODUCT_ID ?? "";

export type LicenseVerdict = {
  valid: boolean;
  reason?: string;
  /** True when we're running on a cached verdict because Gumroad was unreachable. */
  stale?: boolean;
  purchaseEmail?: string;
  uses?: number;
};

type GumroadResponse = {
  success: boolean;
  uses?: number;
  message?: string;
  purchase?: {
    email?: string;
    refunded?: boolean;
    disputed?: boolean;
    chargebacked?: boolean;
    subscription_cancelled_at?: string | null;
    subscription_failed_at?: string | null;
  };
};

/**
 * Calls Gumroad.
 *
 * `increment_uses_count` defaults to TRUE on Gumroad's side. Since we re-verify
 * every 24 hours, leaving the default would inflate the uses counter by one per
 * day per instance and make it useless for seat limits. We increment exactly
 * once — at activation — and pass false on every heartbeat thereafter.
 */
async function callGumroad(licenseKey: string, increment: boolean): Promise<GumroadResponse> {
  const body = new URLSearchParams({
    product_id: PRODUCT_ID,
    license_key: licenseKey,
    increment_uses_count: increment ? "true" : "false",
  });

  const response = await fetch(GUMROAD_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  // Gumroad returns 404 with {success:false} for an unknown key — a valid
  // answer, not a transport failure, so only throw on other error codes.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Gumroad responded ${response.status}`);
  }

  return (await response.json()) as GumroadResponse;
}

function evaluate(result: GumroadResponse): LicenseVerdict {
  if (!result.success) {
    return { valid: false, reason: result.message ?? "License key not recognised" };
  }

  const purchase = result.purchase ?? {};
  if (purchase.refunded) return { valid: false, reason: "This purchase was refunded" };
  if (purchase.disputed || purchase.chargebacked) {
    return { valid: false, reason: "This purchase is under dispute" };
  }
  if (purchase.subscription_cancelled_at) {
    return { valid: false, reason: "This subscription was cancelled" };
  }
  if (purchase.subscription_failed_at) {
    return { valid: false, reason: "The last subscription payment failed" };
  }

  return { valid: true, purchaseEmail: purchase.email, uses: result.uses };
}

/** Verifies and stores a key during setup. This is the one call that increments uses. */
export async function activateLicense(licenseKey: string): Promise<LicenseVerdict> {
  const trimmed = licenseKey.trim();
  if (!trimmed) return { valid: false, reason: "Enter a license key" };

  // No product configured means this is a dev or self-built image; don't gate it.
  if (!PRODUCT_ID) return { valid: true, reason: "Unlicensed build — checks disabled" };

  let verdict: LicenseVerdict;
  try {
    verdict = evaluate(await callGumroad(trimmed, true));
  } catch (err) {
    return {
      valid: false,
      reason: `Could not reach Gumroad to verify: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  if (verdict.valid) {
    await setSetting(SETTING_KEYS.licenseKey, trimmed, { encrypted: true });
    await setSetting(SETTING_KEYS.licenseStatus, "valid");
    await setSetting(SETTING_KEYS.licenseCheckedAt, new Date().toISOString());
    await setSetting(SETTING_KEYS.licenseActivated, "true");
  }

  return verdict;
}

/**
 * The periodic check. Re-verifies at most once per CHECK_INTERVAL_MS and falls
 * back to the cached verdict — within the grace window — whenever Gumroad
 * cannot be reached.
 */
export async function checkLicense(): Promise<LicenseVerdict> {
  if (!PRODUCT_ID) return { valid: true, reason: "Unlicensed build — checks disabled" };

  const licenseKey = await getSetting(SETTING_KEYS.licenseKey);
  if (!licenseKey) return { valid: false, reason: "No license key entered yet" };

  const lastChecked = await getSetting(SETTING_KEYS.licenseCheckedAt);
  const lastStatus = await getSetting(SETTING_KEYS.licenseStatus);
  const lastCheckedAt = lastChecked ? new Date(lastChecked).getTime() : 0;
  const age = Date.now() - lastCheckedAt;

  if (age < CHECK_INTERVAL_MS && lastStatus === "valid") {
    return { valid: true };
  }

  try {
    const verdict = evaluate(await callGumroad(licenseKey, false));
    await setSetting(SETTING_KEYS.licenseStatus, verdict.valid ? "valid" : "invalid");
    await setSetting(SETTING_KEYS.licenseCheckedAt, new Date().toISOString());
    return verdict;
  } catch (err) {
    const withinGrace = age < GRACE_DAYS * 24 * 60 * 60 * 1000;

    if (lastStatus === "valid" && withinGrace) {
      const daysLeft = Math.ceil(
        (GRACE_DAYS * 24 * 60 * 60 * 1000 - age) / (24 * 60 * 60 * 1000),
      );
      console.warn(`[nabu] license check failed, ${daysLeft}d of grace remaining:`, err);
      return { valid: true, stale: true, reason: `Could not reach Gumroad — ${daysLeft} days of grace remaining` };
    }

    return { valid: false, reason: "License could not be verified and the grace period has expired" };
  }
}

export function isLicensingEnabled(): boolean {
  return Boolean(PRODUCT_ID);
}
