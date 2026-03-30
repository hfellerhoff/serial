export const IS_MAIN_INSTANCE =
  String(import.meta.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true" ||
  String(process.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true";

export const BASE_SIGNED_OUT_URL = IS_MAIN_INSTANCE
  ? "/welcome"
  : "/auth/sign-in";

export function getBlogUrl(path = "") {
  if (IS_MAIN_INSTANCE) return `/blog${path}`;
  return `https://serial.tube/blog${path}`;
}

/**
 * Parse the public signup config value consistently.
 * Default: signups are ENABLED if not explicitly set to "true"
 */
export function isPublicSignupEnabled(
  configValue: string | undefined | null,
): boolean {
  return configValue === "true";
}
