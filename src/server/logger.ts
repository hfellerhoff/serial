import * as Sentry from "@sentry/tanstackstart-react";
import { env } from "~/env";

type LogLevel = "error" | "warning" | "info" | "debug";

const LOG_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warning: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level: LogLevel): boolean {
  const configuredLevel: LogLevel = env.LOG_LEVEL;
  return LOG_PRIORITY[level] <= LOG_PRIORITY[configuredLevel];
}

export function logDebug(...params: Parameters<typeof console.log>) {
  if (!shouldLog("debug")) return;
  console.log("[DEBUG]", ...params);
}

export function logMessage(...params: Parameters<typeof console.log>) {
  if (!shouldLog("info")) return;
  console.log("[INFO] ", ...params);
}

export function logWarning(...params: Parameters<typeof console.log>) {
  if (!shouldLog("warning")) return;
  console.warn("[WARN] ", ...params);
}

export function logError(...params: Parameters<typeof console.log>) {
  if (!shouldLog("error")) return;
  console.error("[ERROR]", ...params);
}

export function captureException(
  error: unknown,
  tags?: Record<string, string | number | boolean | undefined>,
): void {
  if (!env.SENTRY_DSN_BACKEND) return;
  Sentry.captureException(error, tags ? { tags } : undefined);
}
