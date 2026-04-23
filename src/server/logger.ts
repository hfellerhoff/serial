import * as Sentry from "@sentry/tanstackstart-react";
import { env } from "~/env";

export function logMessage(...params: Parameters<typeof console.log>) {
  if (env.NODE_ENV !== "development") return;
  console.log(...params);
}
export function logWarning(...params: Parameters<typeof console.log>) {
  if (env.NODE_ENV !== "development") return;
  console.warn(...params);
}
export function logError(...params: Parameters<typeof console.log>) {
  if (env.NODE_ENV !== "development") return;
  console.error(...params);
}

export function captureException(
  error: unknown,
  tags?: Record<string, string | number | boolean | undefined>,
): void {
  if (!env.SENTRY_DSN_BACKEND) return;
  Sentry.captureException(error, tags ? { tags } : undefined);
}
