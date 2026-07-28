import * as Sentry from "@sentry/tanstackstart-react";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => {
  const dsn = process.env.SENTRY_DSN_BACKEND;

  if (dsn) {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
    });
  }

  return {
    requestMiddleware: dsn ? [sentryGlobalRequestMiddleware] : [],
    functionMiddleware: dsn ? [sentryGlobalFunctionMiddleware] : [],
  };
});
