import { getKV } from "~/server/kv";

/** How long a user must wait between OTP sends, in seconds. */
export const OTP_COOLDOWN_SECONDS = 60;

/** Normalize email for consistent KV key lookups. */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** KV key for the per-email OTP cooldown timer. */
export function otpCooldownKey(email: string): string {
  return `otp-cooldown:${normalizeEmail(email)}`;
}

/**
 * Check whether an OTP cooldown is active for the given email.
 * Returns the remaining seconds if active, or 0 if the cooldown has expired.
 */
export async function getOtpCooldownRemaining(email: string): Promise<number> {
  const kv = await getKV();
  const existing = await kv.get(otpCooldownKey(email));
  if (!existing) return 0;

  const expiresAt = parseInt(existing, 10);
  const remainingMs = expiresAt - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Start (or restart) the OTP cooldown for the given email.
 * Called after successfully sending an OTP.
 */
export async function setOtpCooldown(email: string): Promise<void> {
  const kv = await getKV();
  const expiresAt = Date.now() + OTP_COOLDOWN_SECONDS * 1000;
  await kv.set(otpCooldownKey(email), String(expiresAt), OTP_COOLDOWN_SECONDS);
}
